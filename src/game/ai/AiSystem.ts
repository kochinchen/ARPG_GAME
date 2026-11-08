import type { Rng } from '../../core/Rng';
import { add, distance, dot, length, normalize, rotate, scale, sub, vec2 } from '../../core/math/Vec2';
import type { DataTable } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { SkillDef } from '../../data/schema/skill';
import type { EnemyDef } from '../../data/schema/enemy';
import type { Actor } from '../entities/Actor';
import type { Projectile } from '../entities/Projectile';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import { nearestDevice } from '../skills/DeviceSystem';
import type { AiStateName } from './AiBrain';
import type { AiContext, AiSurroundings, IAiState } from './IAiState';
import { CallState } from './states/CallState';
import { ChaseState } from './states/ChaseState';
import { ErrandState } from './states/ErrandState';
import { FleeState } from './states/FleeState';
import { IdleState } from './states/IdleState';
import { ReturnState } from './states/ReturnState';
import { updatePace } from './Pace';
import { SquadTactics } from './SquadTactics';

/** 被打中後持續追擊的秒數（超過 Leash 也不回家） */
const ANGER_SECONDS = 4;
/** 離地上的範圍傷害邊緣這麼近（Tile）就算在猶豫，累積到 patience 就硬闖 */
const HESITATE_DISTANCE = 1;
/** 鑽地閃避：放出鑽地技能之前，追擊狀態不改意圖的秒數 */
const BURROW_HOLD = 0.3;
const NO_SURROUNDINGS: AiSurroundings = { groundItems: [], corpses: [] };
/** 戰鬥中的狀態：會閃投射物以外，也會走出地上的範圍傷害 */
const ACTIVE_STATES: ReadonlySet<AiStateName> = new Set(['chase', 'call', 'flee', 'errand']);

/**
 * 對每個有 AiBrain 的 Actor 執行狀態機。怪物與（未來的）召喚物共用，只是敵對陣營不同。
 */
export class AiSystem {
  private readonly states: Record<AiStateName, IAiState> = {
    idle: new IdleState(),
    chase: new ChaseState(),
    return: new ReturnState(),
    call: new CallState(),
    flee: new FleeState(),
    errand: new ErrandState(),
  };
  /** 目前樓層（閃避機率隨樓層提高；GameWorld 進樓層時設定） */
  floor = 1;

  private readonly squad: SquadTactics;
  /** 這個 Tick 之前死掉的怪（召喚物潰散用） */
  private readonly fallen = new Set<number>();

  constructor(
    private readonly targeting: TargetingService,
    private readonly nav: NavGrid,
    private readonly pathfinder: Pathfinder,
    private readonly skills: DataTable<SkillDef>,
    private readonly rng: Rng,
    /** 怪物何時改打機關（aggroRange、attraction、retargetMargin） */
    private readonly devices: Balance['devices'],
    private readonly tactics: Balance['enemyTactics'],
    private readonly events: GameEventBus,
    private readonly enemies: DataTable<EnemyDef>,
  ) {
    this.squad = new SquadTactics(tactics, nav, rng, skills);
    // 召喚者死掉：牠的召喚物（rout）下一個 Tick 潰散
    events.on('ActorDied', (e) => {
      if (e.faction === 'enemy') this.fallen.add(e.actorId);
    });
    // 被攻擊時記錄仇恨來源
    events.on('ActorDamaged', (e) => {
      const target = targeting.getActor(e.targetId);
      if (target?.ai && e.sourceId !== null) {
        target.ai.provokedBy = e.sourceId;
        target.ai.angerTimer = ANGER_SECONDS;
      }
    });
  }

  update(actors: readonly Actor[], dt: number, projectiles: readonly Projectile[] = [], surroundings: AiSurroundings = NO_SURROUNDINGS): void {
    this.squad.update(actors, dt);
    const lead = this.floorRatio(this.tactics.leadShot.maxFloor);
    const leadShot = this.tactics.leadShot.lead[0] + (this.tactics.leadShot.lead[1] - this.tactics.leadShot.lead[0]) * lead;
    for (const self of actors) {
      const brain = self.ai;
      if (!brain || !self.alive || self.isDisabled) continue;
      brain.angerTimer = Math.max(0, brain.angerTimer - dt);
      brain.dodgeTimer = Math.max(0, brain.dodgeTimer - dt);
      brain.dodgeCooldown = Math.max(0, brain.dodgeCooldown - dt);
      brain.braveTimer = Math.max(0, brain.braveTimer - dt);
      brain.raiseCooldown = Math.max(0, brain.raiseCooldown - dt);
      brain.scanTimer = Math.max(0, brain.scanTimer - dt);
      brain.huntHold = Math.max(0, brain.huntHold - dt);
      const ctx: AiContext = {
        self,
        brain,
        actors,
        targeting: this.targeting,
        nav: this.nav,
        pathfinder: this.pathfinder,
        skills: this.skills,
        rng: this.rng,
        events: this.events,
        tactics: this.tactics,
        enemies: this.enemies,
        surroundings,
        lead: self.isBoss ? 0 : leadShot,
        dt,
      };
      if (self.faction === 'enemy' && self.summonedBy !== null && this.fallen.has(self.summonedBy)) this.rout(ctx);
      if (self.faction === 'enemy' && brain.state === 'chase') this.kamikaze(ctx);
      if (self.faction === 'enemy' && (brain.state === 'idle' || brain.state === 'chase' || brain.state === 'return')) this.lureToDevice(ctx);
      if (self.faction === 'enemy' && brain.state === 'chase') this.dodge(self, brain, projectiles);
      if (self.faction === 'enemy' && ACTIVE_STATES.has(brain.state)) this.avoidZones(self, brain, dt);
      const next = this.states[brain.state].update(ctx);
      if (next !== null && next !== brain.state) {
        const from = brain.state;
        brain.state = next;
        this.states[next].enter(ctx);
        // 自己發現或被打而開始追擊：招呼附近的同伴（被叫來的不再往外叫）
        if (from === 'idle' && next === 'chase' && !brain.rallied && brain.targetId !== null && self.faction === 'enemy' && !self.isBoss) {
          const called = this.squad.rally(self, brain.targetId, actors);
          this.events.emit('EnemyAlerted', { actorId: self.id, allies: called });
        }
      }
      // 狀況速度、靈活派這一箭的速度與射程（放在狀態之後：用這一幀決定的意圖）
      if (self.faction === 'enemy') updatePace(ctx);
    }
    this.fallen.clear();
  }

  /**
   * 潰散（rout）：召喚者死了，往遠離目標的方向逃 rout.distance 格（FleeState，最多 rout.duration 秒），之後回頭打。
   */
  private rout(ctx: AiContext): void {
    const { self, brain, targeting } = ctx;
    if (!brain.tactics.includes('rout') || brain.state === 'flee') return;
    const { distance: far, duration } = this.tactics.rout;
    const target = brain.targetId === null ? null : targeting.getActor(brain.targetId);
    const away = target ? sub(self.position, target.position) : self.facing;
    const base = length(away) > 1e-6 ? normalize(away) : self.facing;
    for (const deg of [0, 30, -30, 60, -60, 90, -90]) {
      const spot = add(self.position, scale(rotate(base, deg), far));
      if (!this.nav.isClearAt(spot, self.radius)) continue;
      self.intent = null;
      brain.fleeTo = spot;
      brain.fleeFor = duration;
      brain.state = 'flee';
      this.states.flee.enter(ctx);
      this.events.emit('EnemyRouted', { actorId: self.id });
      return;
    }
  }

  /**
   * 自爆（kamikaze）：血量低於 hpBelow 就改用自爆技能當主要攻擊衝上去（不再保持距離、不再用其他特殊技能）。
   */
  private kamikaze({ self, brain }: AiContext): void {
    const config = this.tactics.kamikaze;
    if (brain.kamikaze || !brain.tactics.includes('kamikaze') || self.cast || self.hp / self.maxHp >= config.hpBelow) return;
    brain.kamikaze = true;
    brain.skillId = config.skill;
    brain.specialSkills = [];
    brain.keepDistance = 0;
    brain.retreating = false;
    self.skillRanks.set(config.skill, 1);
    self.intent = null;
    this.events.emit('EnemyKamikaze', { actorId: self.id });
  }

  /** 鑽地閃避（burrow）：改用鑽地技能（不受移動速度限制，冷卻看技能）。回傳有沒有鑽 */
  private burrow(self: Actor, brain: NonNullable<Actor['ai']>): boolean {
    const config = this.tactics.burrow;
    if (brain.targetId === null || (self.cooldowns.get(config.skill) ?? 0) > 0) return false;
    const target = this.targeting.getValidTarget(self, brain.targetId);
    if (!target || !this.rng.chance(config.chance)) return false;
    self.skillRanks.set(config.skill, 1);
    self.path = [];
    self.intent = { skillId: config.skill, targetId: target.id, point: target.position, hold: false };
    // 這段時間 ChaseState 不改意圖，讓 SkillSystem 先把鑽地放出來
    brain.dodgeTimer = BURROW_HOLD;
    this.events.emit('EnemyDodged', { actorId: self.id });
    return true;
  }

  /**
   * 閃避投射物：追擊中、沒在出招的怪看到 lookahead 秒內會打中自己的投射物，擲一次機率往旁邊閃開。
   * 閃不閃得掉看移動速度：來不及在投射物到之前閃出它的寬度就不閃（慢的怪、近距離射擊閃不掉）。
   * 魔王不閃；每次反應後 cooldown 秒內不再反應（連射時只閃得掉第一發）。
   */
  private dodge(self: Actor, brain: NonNullable<Actor['ai']>, projectiles: readonly Projectile[]): void {
    const config = this.tactics.dodge;
    if (self.isBoss || self.cast || self.moveSpeed <= 0 || brain.dodgeTimer > 0 || brain.dodgeCooldown > 0) return;
    for (const p of projectiles) {
      if (!p.alive || p.hitIds.has(self.id) || !this.targeting.isHostile(p.caster.faction, self.faction)) continue;
      const rel = sub(self.position, p.position);
      const along = dot(rel, p.direction);
      if (along <= 0 || along > p.remaining + self.radius) continue;
      const time = along / p.speed;
      if (time > config.lookahead) continue;
      // 投射物飛行線的左側法線；lateral > 0 表示怪在左側
      const normal = vec2(-p.direction.y, p.direction.x);
      const lateral = dot(rel, normal);
      const reach = self.radius + p.radius;
      if (Math.abs(lateral) >= reach) continue;
      brain.dodgeCooldown = config.cooldown;
      if (brain.tactics.includes('burrow') && this.burrow(self, brain)) return;
      const t = this.floorRatio(config.maxFloor);
      const chance = config.chance[0] + (config.chance[1] - config.chance[0]) * t;
      if (!this.rng.chance(chance)) return;
      const side = lateral === 0 ? (this.rng.chance(0.5) ? 1 : -1) : Math.sign(lateral);
      // 往原本偏的那一側閃；那一側是牆就往另一側（要閃得更遠）
      for (const dir of [side, -side]) {
        const step = (dir === side ? reach - Math.abs(lateral) : reach + Math.abs(lateral)) + config.margin;
        if (step / self.moveSpeed > time) continue;
        const destination = add(self.position, scale(normal, dir * step));
        if (!this.nav.isClearAt(destination, self.radius) || !this.nav.hasLineOfSight(self.position, destination, self.radius)) continue;
        self.intent = null;
        self.path = [destination];
        brain.dodgeTimer = step / self.moveSpeed + 0.05;
        this.events.emit('EnemyDodged', { actorId: self.id });
        return;
      }
      return;
    }
  }

  /** 第 1 層 = 0、第 maxFloor 層起 = 1 */
  private floorRatio(maxFloor: number): number {
    return Math.min(1, Math.max(0, (this.floor - 1) / Math.max(1, maxFloor - 1)));
  }

  /**
   * 躲開地上的範圍傷害（主角的火海、毒池；Pathfinder.hazards）：站在裡面就往最近的邊緣走出去。
   * 路線本身由 Pathfinder 繞開；目標站在區域裡時會在邊緣徘徊，累積 patience 秒就硬闖 brave 秒。魔王不躲。
   */
  private avoidZones(self: Actor, brain: NonNullable<Actor['ai']>, dt: number): void {
    const config = this.tactics.avoidZones;
    const hazards = this.pathfinder.hazards;
    if (self.isBoss || self.moveSpeed <= 0 || brain.braveTimer > 0 || hazards.length === 0) {
      brain.hazardTime = 0;
      return;
    }
    const near = hazards.some((h) => distance(self.position, h.position) < h.radius + self.radius + HESITATE_DISTANCE);
    brain.hazardTime = near ? brain.hazardTime + dt : Math.max(0, brain.hazardTime - dt);
    if (brain.hazardTime >= config.patience) {
      brain.hazardTime = 0;
      brain.braveTimer = config.brave;
      return;
    }
    if (self.cast || brain.dodgeTimer > 0) return;
    const zone = hazards.find((h) => distance(self.position, h.position) < h.radius);
    if (!zone) return;
    const away = sub(self.position, zone.position);
    const base = length(away) > 1e-6 ? normalize(away) : self.facing;
    // 往最近的邊緣走；那邊是牆或另一塊區域就換個方向
    for (const deg of [0, 45, -45, 90, -90, 135, -135, 180]) {
      const dir = rotate(base, deg);
      const destination = add(zone.position, scale(dir, zone.radius + self.radius + config.margin));
      if (!this.nav.isClearAt(destination, self.radius)) continue;
      if (hazards.some((h) => h !== zone && distance(destination, h.position) < h.radius + self.radius)) continue;
      if (!this.nav.hasLineOfSight(self.position, destination, self.radius)) continue;
      self.intent = null;
      self.path = [destination];
      brain.dodgeTimer = distance(self.position, destination) / self.moveSpeed + 0.05;
      return;
    }
  }

  /**
   * 機關在附近（aggroRange 內）且比主角「更有吸引力」時改打機關；打壞後由 DeviceSystem 把目標改回玩家。
   * 機關的有效距離 = 實際距離 ÷ attraction（< 1），同樣距離一定先打主角；
   * 在兩者之間換目標，新目標的有效距離要短 retargetMargin 以上。
   */
  private lureToDevice(ctx: AiContext): void {
    const { self, brain, actors, targeting } = ctx;
    const { aggroRange, attraction, retargetMargin } = this.devices;
    const current = brain.targetId === null ? null : targeting.getActor(brain.targetId);
    const onDevice = !!current?.device && current.alive;
    const device = onDevice ? current : nearestDevice(self, actors, aggroRange);
    if (!device) return;
    const hostile = nearestHostile(self, actors, targeting);
    const deviceScore = gap(self, device) / attraction;
    const hostileScore = hostile ? gap(self, hostile) : Infinity;
    if (onDevice) {
      // 主角明顯更近（或機關已在範圍外）：改回打主角
      if (hostile && (gap(self, device) > aggroRange || hostileScore * (1 + retargetMargin) < deviceScore)) {
        brain.targetId = hostile.id;
        self.intent = null;
      }
      return;
    }
    if (deviceScore * (1 + retargetMargin) >= hostileScore) return;
    brain.targetId = device.id;
    self.intent = null;
    if (brain.state !== 'chase') {
      brain.state = 'chase';
      this.states.chase.enter(ctx);
    }
  }
}

/** 兩者邊緣之間的距離 */
const gap = (self: Actor, other: Actor): number => distance(self.position, other.position) - other.radius;

/** 最近的敵對目標（不含機關）：主角、召喚物 */
function nearestHostile(self: Actor, actors: readonly Actor[], targeting: TargetingService): Actor | null {
  let best: Actor | null = null;
  let bestGap = Infinity;
  for (const other of actors) {
    if (!other.alive || other.device || !targeting.isHostile(self.faction, other.faction)) continue;
    const g = gap(self, other);
    if (g < bestGap) {
      best = other;
      bestGap = g;
    }
  }
  return best;
}
