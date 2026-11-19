import type { CommandQueue } from '../../../src/core/CommandQueue';
import { vec2, type Vec2 } from '../../../src/core/math/Vec2';
import type { Rng } from '../../../src/core/Rng';
import type { SkillDef } from '../../../src/data/schema/skill';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { Pathfinder } from '../../../src/game/movement/Pathfinder';
import type { ComboKey } from '../../../src/game/player/PlayerLoadout';
import type { Build } from './character';

/**
 * 機器人玩家：跟真人一樣只送 Command，不直接改遊戲狀態。每 0.1 秒做一次決定。
 * - rusher（莽撞型）：直衝最近的怪、一直打，血剩 20% 才喝水，不躲
 * - normal（正常型）：血剩 45% 喝水；看到大招前搖 0.3 秒後才反應、有 20% 沒躲掉；遠程流派會拉開距離；危險時後退
 * - kiter（風箏型，只對弓 / 法杖有意義；近戰流派等同正常型）：在射程邊緣開打，怪靠近到 3.5 格內就沿著來時路退 5 格再回頭打；
 *   移動用「點地面」（會中斷連段，和滑鼠玩家一樣），其餘同正常型。用來量「會拉開距離的遠程玩家」有多安全
 * - idle（站樁）：走到怪群旁邊後完全不動，用來量「站著不動多久會倒」
 */
export type Persona = 'rusher' | 'normal' | 'kiter' | 'idle';

export const PERSONA_LABELS: Record<Persona, string> = { rusher: '莽撞型', normal: '正常型', kiter: '風箏型', idle: '站樁' };

interface PersonaParams {
  potionAt: number;
  dodge: boolean;
  reaction: number;
  dodgeMiss: number;
  kite: boolean;
  retreat: boolean;
  /** 風箏型：保持距離（取代 kite / retreat 那兩種短暫的後退） */
  keepAway: boolean;
}

const PARAMS: Record<Exclude<Persona, 'idle'>, PersonaParams> = {
  rusher: { potionAt: 0.2, dodge: false, reaction: 0, dodgeMiss: 1, kite: false, retreat: false, keepAway: false },
  normal: { potionAt: 0.45, dodge: true, reaction: 0.3, dodgeMiss: 0.2, kite: true, retreat: true, keepAway: false },
  kiter: { potionAt: 0.45, dodge: true, reaction: 0.3, dodgeMiss: 0.2, kite: false, retreat: false, keepAway: true },
};

const DECIDE_EVERY = 6;
/** 遠程流派與近戰怪保持的距離 */
const KITE_DISTANCE = 3;
/** 開打的距離（要看得到目標） */
const ENGAGE_DISTANCE = 7;
/** 最近的怪比這個距離遠時，繼續走向原本的目標（不改追另一隻） */
const STICKY_DISTANCE = 12;
/** 風箏型：開打的距離（法術與弓的射程 9～12 格，怪物的偵測距離 6～9 格） */
const KITER_ENGAGE_DISTANCE = 9;
/** 風箏型：會走動的怪靠近到這個距離內（到牠身體邊緣）就退 */
const KEEP_AWAY = 3.5;
/** 風箏型：每次沿著來時路退幾格、最多退幾秒；拉開到 SAFE_DISTANCE 就提早回頭 */
const RETREAT_TILES = 5;
const RETREAT_TIME = 1.2;
const SAFE_DISTANCE = 6;
/** 風箏型：怪的身體邊緣在這個距離內算貼身 */
const ADJACENT = 1.5;
/** 風箏型：退完之後至少打這麼久才會再退（不然只會跑、不出手） */
const RETREAT_REST = 0.6;

export class Bot {
  private tick = 0;
  /** 正在做的閃避 / 後退：方向與剩餘秒數 */
  private evade: { dir: Vec2; remaining: number } | null = null;
  /** 每個前搖只擲一次「有沒有躲掉」 */
  private readonly judgedCasts = new WeakMap<object, boolean>();
  private attacking = false;
  private moving = false;
  private lastMoveOrder = -Infinity;
  private lastKite = -Infinity;
  private lastRetreat = -Infinity;
  private readonly planner: Pathfinder;
  private chase: { id: number; from: Vec2; since: number } | null = null;
  private readonly skipped = new Map<number, number>();
  /** 站樁：已經貼到怪了 */
  private planted = false;
  private readonly params: PersonaParams;
  private readonly engageDistance: number;
  /** 風箏型：走過的路（每格一個腳印），退的時候沿著它往回走——那一段已經清過怪 */
  private readonly trail: Vec2[] = [];
  /** 風箏型：正在走開（閃大招或拉開距離）的剩餘秒數與目的地 */
  private walking: { to: Vec2; remaining: number; retreat: boolean } | null = null;
  private lastWalkEnd = -Infinity;
  /** 風箏型：上次退完時的出手次數 */
  private castsAtRetreat = -1;
  /** 除錯用（tests/balance/debug/savetrace）：風箏型最近一次決定做什麼 */
  decision = '';

  constructor(
    private readonly world: GameWorld,
    private readonly commands: CommandQueue<GameCommand>,
    private readonly build: Build,
    readonly persona: Persona,
    private readonly rng: Rng,
  ) {
    this.planner = new Pathfinder(world.nav, Number.MAX_SAFE_INTEGER);
    // 近戰流派沒有風箏可言：當成正常型
    this.params = PARAMS[persona === 'idle' || (persona === 'kiter' && !build.ranged) ? 'normal' : persona];
    this.engageDistance = this.params.keepAway ? KITER_ENGAGE_DISTANCE : ENGAGE_DISTANCE;
  }

  update(dt: number): void {
    if (this.evade) this.evade.remaining -= dt;
    if (this.walking) this.walking.remaining -= dt;
    if (this.tick++ % DECIDE_EVERY !== 0) return;
    const player = this.world.player;
    if (!player.alive) {
      this.attacking = false;
      this.evade = null;
      return;
    }
    if (this.persona === 'idle') return this.idle();
    const p = this.params;
    const hpPct = player.hp / player.maxHp;
    // 魔力見底也會喝（藥水同時回魔），但留 5 瓶給生命用
    const lowMana = player.mana / player.maxMana < 0.15 && this.world.potions.count > 5;
    if (hpPct < p.potionAt || lowMana) this.send({ type: 'UsePotion' });
    if (p.keepAway) return this.keepAway(p);

    if (this.evade && this.evade.remaining > 0) return this.move(this.evade.dir);
    this.evade = null;

    const enemies = this.enemies();
    const target = this.pickTarget(enemies);
    if (!target) return this.stop();

    // 閃避、後退、拉開距離：要有路可走才做（被逼到牆角就只能硬打）
    if (p.dodge) {
      const threat = this.threat(enemies, p);
      const dir = threat && this.openDirection(away(threat, player.position));
      if (dir) return this.startEvade(dir, 0.6);
    }
    const now = this.world.playTime;
    if (p.retreat && hpPct < 0.3 && now - this.lastRetreat > 4) {
      const close = enemies.filter((e) => dist(e.position, player.position) < 4);
      const dir = close.length >= 2 && this.openDirection(away(centroid(close), player.position));
      if (dir) {
        this.lastRetreat = now;
        return this.startEvade(dir, 1.2);
      }
    }
    if (p.kite && this.build.ranged && now - this.lastKite > 2) {
      const melee = enemies.find((e) => dist(e.position, player.position) < KITE_DISTANCE && attackRange(e) < 2);
      const dir = melee && this.openDirection(away(melee.position, player.position));
      if (dir) {
        this.lastKite = now;
        return this.startEvade(dir, 0.5);
      }
    }
    this.fight(target);
  }

  /**
   * 風箏型：閃大招 → 怪太近就沿著來時路退 → 其餘時間在射程邊緣打。
   * 走位都用「點地面」：會中斷連段（搖桿不會），和滑鼠玩家的操作一樣。
   */
  private keepAway(p: PersonaParams): void {
    const player = this.world.player;
    const now = this.world.playTime;
    const enemies = this.enemies();
    // 要躲的只有會追過來的近戰怪；遠程怪（會自己保持距離的）躲不掉，要先殺
    const chaser = (e: Actor) => e.moveSpeed > 0 && !isShooter(e);
    const close = enemies.filter((e) => chaser(e) && dist(e.position, player.position) - e.radius < KEEP_AWAY);
    if (this.walking) {
      const arrived = dist(player.position, this.walking.to) < 0.4 || player.path.length === 0;
      const safe = this.walking.retreat && !enemies.some((e) => chaser(e) && dist(e.position, player.position) - e.radius < SAFE_DISTANCE);
      if (this.walking.remaining > 0 && !arrived && !safe) return void (this.decision = 'walking');
      if (this.walking.retreat) this.castsAtRetreat = player.castCount;
      this.walking = null;
      this.lastWalkEnd = now;
    } else if (this.trail.length === 0 || dist(this.trail[this.trail.length - 1]!, player.position) >= 1) {
      this.trail.push(player.position);
      if (this.trail.length > 600) this.trail.shift();
    }
    const nearestFoe = this.pickTarget(enemies);
    if (!nearestFoe) return void ((this.decision = 'no target'), this.stop());
    // 看得到的遠程怪優先打（牠們血少、傷害高，放著不管會一直被射）
    const reach = this.engageDistance + 1;
    const shooters = enemies.filter((e) => isShooter(e) && dist(e.position, player.position) < reach && this.world.nav.hasLineOfSight(player.position, e.position, 0.1));
    const target = nearest(player.position, shooters) ?? nearestFoe;

    // 站在怪物放的地面範圍（毒網、火牆、冰霧…）裡：先走出去
    const zone = this.world.scheduler.zones.find((z) => z.ctx.caster.faction === 'enemy' && dist(z.position, player.position) < z.radius + player.radius + 0.3);
    const out = zone && this.openDirection(away(zone.position, player.position));
    if (zone && out) {
      const step = zone.radius + player.radius + 1 - dist(zone.position, player.position);
      this.decision = 'leave zone';
      return this.walkTo(vec2(player.position.x + out.x * step, player.position.y + out.y * step), 0.8, false);
    }
    const threat = this.threat(enemies, p);
    const dodge = threat && this.openDirection(away(threat, player.position));
    if (dodge) return void ((this.decision = 'dodge'), this.walkTo(vec2(player.position.x + dodge.x * 2.5, player.position.y + dodge.y * 2.5), 0.6, false));
    // 上次退完之後至少出手一次才再退（不然退到轉角看不到怪、走回去又太近，會一直來回走）
    if (close.length > 0 && now - this.lastWalkEnd > RETREAT_REST && player.castCount > this.castsAtRetreat) {
      const spot = this.retreatSpot(close);
      if (spot) return void ((this.decision = 'retreat'), this.walkTo(spot, RETREAT_TIME, true));
    }
    // 怪貼在身邊卻隔著柱子或牆角看不到（牠打得到我、我的投射物打不到牠）：退開換個位置。
    // 只管貼身的：隔著一道牆的怪要繞路走過去，不能一靠近就退
    if (dist(target.position, player.position) - target.radius < ADJACENT && !this.world.nav.hasLineOfSight(player.position, target.position, 0.1) && now - this.lastWalkEnd > RETREAT_REST) {
      const spot = this.retreatSpot([target]);
      if (spot) return void ((this.decision = 'reposition'), this.walkTo(spot, RETREAT_TIME, false));
    }
    this.decision = `fight ${target.name} d=${dist(target.position, player.position).toFixed(1)}`;
    this.fight(target);
  }

  /** 退到哪裡：沿著來時路往回 RETREAT_TILES 格；來時路反而靠近怪（怪從後面來）或剛進樓層，就往反方向找空地；都不行回傳 null（硬打） */
  private retreatSpot(close: readonly Actor[]): Vec2 | null {
    const player = this.world.player;
    const from = centroid(close);
    let walked = 0;
    let prev = player.position;
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const crumb = this.trail[i]!;
      walked += dist(prev, crumb);
      prev = crumb;
      if (walked < RETREAT_TILES) continue;
      if (dist(crumb, from) > dist(player.position, from) + 1) {
        this.trail.length = i + 1;
        return crumb;
      }
      break;
    }
    const dir = this.openDirection(away(from, player.position));
    return dir ? vec2(player.position.x + dir.x * 3, player.position.y + dir.y * 3) : null;
  }

  /** 點地面走過去（中斷手上的攻擊與連段） */
  private walkTo(to: Vec2, seconds: number, retreat: boolean): void {
    this.release();
    this.moving = false;
    this.walking = { to, remaining: seconds, retreat };
    this.send({ type: 'PrimaryAction', worldPos: to, targetId: null, held: false });
  }

  private fight(target: Actor): void {
    const player = this.world.player;
    const d = dist(target.position, player.position);
    // 太遠或隔著牆：先走過去（真人也是先走近再出手，不會對著牆射）
    if (d > this.engageDistance || !this.world.nav.hasLineOfSight(player.position, target.position, 0.1)) {
      this.release();
      // 已經在走就不要每 0.1 秒重算路徑（大地圖的尋路很貴）：路走完或過了 1 秒才重點一次
      const now = this.world.playTime;
      if (!this.moving || player.path.length === 0 || now - this.lastMoveOrder > 1) {
        this.send({ type: 'PrimaryAction', worldPos: this.nextStop(target), targetId: null, held: false });
        this.lastMoveOrder = now;
      }
      this.moving = true;
      return;
    }
    this.moving = false;
    const key = this.readyCombo();
    if (key !== null) {
      this.release();
      this.send({ type: 'SelectRightSlot', slot: key });
      this.send({ type: 'CastRight', worldPos: target.position, targetId: target.id });
      return;
    }
    this.send({ type: 'PrimaryAction', worldPos: target.position, targetId: target.id, held: this.attacking });
    this.attacking = true;
  }

  /**
   * 目標：出口只差首領 / 魔王時直接找它，否則打最近的怪。
   * 追同一隻 5 秒都沒移動（牆後、走不到）就先跳過 20 秒。
   */
  private pickTarget(enemies: readonly Actor[]): Actor | null {
    const player = this.world.player;
    const now = this.world.playTime;
    for (const [id, until] of this.skipped) if (until <= now) this.skipped.delete(id);
    const usable = enemies.filter((e) => !this.skipped.has(e.id));
    const floors = this.world.floors;
    // 出口的關鍵：一般層清到門檻後找首領；Boss 層（remainingToOpen 在 Boss 死前都是 1）清掉同樣比例的怪後找 Boss
    const boss = usable.find((e) => e.isBoss);
    const cleared = floors.killed >= Math.ceil(floors.total * (floors.def?.clearRatio ?? 0));
    const key = boss && cleared ? boss : floors.remainingToOpen === 0 ? usable.find((e) => e.name.startsWith('首領')) : undefined;
    let target = key ?? nearest(player.position, usable);
    if (!target) return null;
    // 遠處的目標不要換來換去：隔著牆時「直線最近」的怪會隨著繞路一直變，每次改追另一隻就會在原地來回走
    const current = this.chase ? usable.find((e) => e.id === this.chase!.id) : undefined;
    if (!key && current && current !== target && dist(target.position, player.position) > STICKY_DISTANCE) target = current;
    const d = dist(target.position, player.position);
    // 卡住：5 秒內幾乎沒移動、也還沒打到 → 先跳過這隻（繞路時直線距離會變遠，所以看自己有沒有在動）
    if (this.chase?.id !== target.id || dist(player.position, this.chase.from) > 1 || d < 3) this.chase = { id: target.id, from: player.position, since: now };
    else if (now - this.chase.since > 5) {
      this.skipped.set(target.id, now + 20);
      this.chase = null;
    }
    return target;
  }

  private idle(): void {
    if (this.planted) return;
    const player = this.world.player;
    const target = nearest(player.position, this.enemies());
    if (!target) return;
    if (player.hp < player.maxHp) {
      this.planted = true;
      this.release();
      this.send({ type: 'MoveDirection', dir: null });
      // 量測用：直接停下手上的攻擊（站樁不出手，看怪要打多久才倒）
      player.path = [];
      player.intent = null;
      return;
    }
    // 先打一下把怪叫醒，被打到之後就站著不動
    if (dist(target.position, player.position) > this.engageDistance) {
      this.send({ type: 'PrimaryAction', worldPos: this.nextStop(target), targetId: null, held: false });
    } else {
      this.send({ type: 'PrimaryAction', worldPos: target.position, targetId: target.id, held: false });
    }
  }

  /**
   * 下一個要點的地方：真人看得到整張地圖，會沿著走廊繞過去；遊戲的點擊尋路有搜尋上限，
   * 遠的目標可能會停在死路。所以先用不限搜尋量的尋路規劃整條路，只點第一個轉角。
   */
  private nextStop(target: Actor): Vec2 {
    const player = this.world.player;
    const goal = this.groundNear(target);
    const route = this.planner.findPath(player.position, goal, player.radius);
    return this.walkable(route[0] ?? goal);
  }

  /**
   * 點了會變成「走過去」的位置：點在怪的身體輪廓上會變成攻擊（大型怪的輪廓比碰撞圓大很多），
   * 遠程的左鍵技能就會站在原地朝牠射、永遠不靠近。所以往自己這邊退一點，退到點不到怪為止。
   */
  private walkable(point: Vec2): Vec2 {
    const player = this.world.player;
    const back = away(point, player.position);
    let spot = point;
    for (let i = 0; i < 6 && this.world.targeting.pickAt(player, spot); i++) spot = vec2(spot.x + back.x, spot.y + back.y);
    return spot;
  }

  /** 目標旁邊、走得到的地面（點在怪身上會變成攻擊；點進牆裡會算不出路） */
  private groundNear(target: Actor): Vec2 {
    const nav = this.world.nav;
    const player = this.world.player;
    const toward = away(target.position, player.position);
    const base = Math.atan2(toward.y, toward.x);
    const r = target.radius + 1;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const spot = vec2(target.position.x + Math.cos(base + turn) * r, target.position.y + Math.sin(base + turn) * r);
      if (nav.isClearAt(spot, player.radius)) return spot;
    }
    return target.position;
  }

  /** 第一組已解鎖、技能都學了、沒在冷卻、魔力夠的連段（存檔角色：依實際使用次數由多到少挑） */
  private readyCombo(): ComboKey | null {
    const world = this.world;
    const player = world.player;
    const order = this.build.comboOrder ?? Array.from({ length: world.comboKeysUnlocked }, (_, k) => k);
    for (const k of order) {
      if (k >= world.comboKeysUnlocked) continue;
      const steps = world.loadout.combos[k]!.slice(0, world.comboSlotsUnlocked).filter((s): s is string => s !== null);
      if (steps.length === 0) continue;
      if (steps.some((s) => (player.cooldowns.get(s) ?? 0) > 0)) continue;
      if (player.mana < player.maxMana * 0.25) continue;
      return k as ComboKey;
    }
    return null;
  }

  /** 會打到自己的大招前搖（只看有地面預警的） */
  private threat(enemies: readonly Actor[], p: PersonaParams): Vec2 | null {
    const player = this.world.player;
    for (const e of enemies) {
      const cast = e.cast;
      if (!cast || cast.fired || !cast.skill.telegraph) continue;
      if (cast.elapsed < p.reaction) continue;
      const reach = skillReach(cast.skill) * (1 + cast.mods.aoeRadius) + player.radius + 0.4;
      const fromCaster = dist(e.position, player.position);
      const fromPoint = dist(cast.point, player.position);
      if (Math.min(fromCaster, fromPoint) > reach) continue;
      let dodged = this.judgedCasts.get(cast);
      if (dodged === undefined) {
        dodged = !this.rng.chance(p.dodgeMiss);
        this.judgedCasts.set(cast, dodged);
      }
      if (dodged) return fromPoint < fromCaster ? cast.point : e.position;
    }
    return null;
  }

  private enemies(): Actor[] {
    return this.world.actors.filter((a) => a.alive && a.faction === 'enemy' && !a.device);
  }

  /** 往 dir 附近（最多偏 90°）找一個 2 格內走得通的方向；都被擋住回傳 null */
  private openDirection(dir: Vec2): Vec2 | null {
    const nav = this.world.nav;
    const player = this.world.player;
    const base = Math.atan2(dir.y, dir.x);
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.57, -1.57]) {
      const d = vec2(Math.cos(base + turn), Math.sin(base + turn));
      const to = vec2(player.position.x + d.x * 2, player.position.y + d.y * 2);
      if (nav.isClearAt(to, player.radius) && nav.hasLineOfSight(player.position, to, player.radius)) return d;
    }
    return null;
  }

  private startEvade(dir: Vec2, seconds: number): void {
    this.evade = { dir, remaining: seconds };
    this.move(dir);
  }

  private move(dir: Vec2): void {
    this.release();
    this.moving = false;
    this.send({ type: 'MoveDirection', dir });
  }

  private stop(): void {
    this.release();
    this.send({ type: 'MoveDirection', dir: null });
  }

  private release(): void {
    if (!this.attacking) return;
    this.attacking = false;
    this.send({ type: 'PrimaryRelease' });
  }

  private send(command: GameCommand): void {
    this.commands.push(command);
  }
}

function skillReach(skill: SkillDef): number {
  let reach = skill.range ?? 1;
  for (const effect of skill.effects) {
    if ('radius' in effect && typeof effect.radius === 'number') reach = Math.max(reach, effect.radius);
    if ('length' in effect && typeof effect.length === 'number') reach = Math.max(reach, effect.length);
  }
  return reach;
}

/** 遠程怪：會自己和目標保持距離的（弓手、法師、噴吐者…） */
function isShooter(actor: Actor): boolean {
  return (actor.ai?.keepDistance ?? 0) > 0;
}

function attackRange(actor: Actor): number {
  return actor.stats.get('attackRange');
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearest(from: Vec2, actors: readonly Actor[]): Actor | null {
  let best: Actor | null = null;
  let bestD = Infinity;
  for (const a of actors) {
    const d = dist(a.position, from);
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

function centroid(actors: readonly Actor[]): Vec2 {
  const x = actors.reduce((s, a) => s + a.position.x, 0) / actors.length;
  const y = actors.reduce((s, a) => s + a.position.y, 0) / actors.length;
  return vec2(x, y);
}

/** 從 from 往 to 的反方向（單位向量） */
function away(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return vec2(dx / len, dy / len);
}
