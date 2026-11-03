import type { Rng } from '../../core/Rng';
import { distance, normalize, scale, sub, vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { Barrage } from '../../data/schema/enemy';
import type { Actor, ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { SkillExecutor } from '../skills/SkillExecutor';

/**
 * 怪物的被動技能（EnemyDef.passives）：戰鬥中（AI 有目標時）自動發動，不經過施法、不打斷動作。
 * every：每隔幾秒（每次隨機 ±30%）；trail：每移動幾格。效果在施放者腳下、以等級 1 執行，
 * 方向朝向目前的面向（例如熔岩巨獸走過留下的岩漿、身上不定時噴出的岩漿）。
 */
export class PassiveSkillSystem {
  /** 怪物 → 每個被動技能的計時（秒）或累積的移動距離（格） */
  private readonly progress = new Map<ActorId, number[]>();
  private readonly lastPosition = new Map<ActorId, { x: number; y: number }>();
  /** 等待發動的死亡技能（EnemyDef.onDeath） */
  private readonly deathBursts: { actor: Actor; skillId: string; timer: number }[] = [];
  /** 怪物 → 連發的計時與下一招（EnemyDef.barrage、Actor.barrage） */
  private readonly barrages = new Map<ActorId, { timer: number; next: number }>();

  constructor(
    private readonly data: Pick<DataRegistry, 'enemies' | 'skills'>,
    private readonly executor: SkillExecutor,
    private readonly rng: Rng,
    private readonly events: GameEventBus,
  ) {}

  /** 怪物死亡時呼叫：有死亡技能的排進等待（施放者已死亡，技能照常以牠的數值結算） */
  onActorDied(actor: Actor): void {
    if (actor.defId === null || !this.data.enemies.has(actor.defId)) return;
    const onDeath = this.data.enemies.get(actor.defId).onDeath;
    if (onDeath) this.deathBursts.push({ actor, skillId: onDeath.skill, timer: onDeath.delay });
  }

  update(actors: readonly Actor[], dt: number): void {
    for (let i = this.deathBursts.length - 1; i >= 0; i--) {
      const burst = this.deathBursts[i]!;
      burst.timer -= dt;
      if (burst.timer > 0) continue;
      this.deathBursts.splice(i, 1);
      this.cast(burst.actor, burst.skillId);
    }
    for (const actor of actors) {
      if (actor.defId === null || !this.data.enemies.has(actor.defId)) continue;
      const def = this.data.enemies.get(actor.defId);
      const barrage = actor.barrage ?? def.barrage;
      if (barrage) this.updateBarrage(actor, barrage, actors, dt);
      const passives = def.passives;
      if (passives.length === 0) continue;
      if (!actor.alive) {
        this.progress.delete(actor.id);
        this.lastPosition.delete(actor.id);
        continue;
      }
      const last = this.lastPosition.get(actor.id) ?? actor.position;
      const moved = Math.hypot(actor.position.x - last.x, actor.position.y - last.y);
      this.lastPosition.set(actor.id, { x: actor.position.x, y: actor.position.y });
      // 只在戰鬥中發動（閒置走動、走回出生點時不留岩漿）
      if (!actor.ai?.targetId) continue;
      let state = this.progress.get(actor.id);
      if (!state) {
        state = passives.map((p) => (p.every ? this.interval(p.every) : 0));
        this.progress.set(actor.id, state);
      }
      passives.forEach((p, i) => {
        if (p.every) {
          state[i]! -= dt;
          if (state[i]! > 0) return;
          state[i] = this.interval(p.every);
        } else if (p.trail) {
          state[i]! += moved;
          if (state[i]! < p.trail) return;
          state[i] = 0;
        }
        this.cast(actor, p.skill);
      });
    }
  }

  /** 換樓層時清空 */
  clear(): void {
    this.progress.clear();
    this.lastPosition.clear();
    this.barrages.clear();
    this.deathBursts.length = 0;
  }

  /** 連發：每隔 barrage.every 秒輪流丟一招；被定住（凍結、暈眩）或跳在空中時不丟 */
  private updateBarrage(actor: Actor, barrage: Barrage, actors: readonly Actor[], dt: number): void {
    if (!actor.alive || actor.vanished || actor.hasStatus('freeze') || actor.hasStatus('stun') || actor.hasStatus('airborne')) return;
    // 收合爪子時 AI 停著，不一定有目標：改找範圍內最近的敵人
    const current = actors.find((a) => a.id === actor.ai?.targetId && a.alive);
    const target = current ?? actors.filter((a) => a.alive && a.faction !== actor.faction).sort((a, b) => distance(a.position, actor.position) - distance(b.position, actor.position))[0];
    if (!target) return;
    let state = this.barrages.get(actor.id);
    if (!state) this.barrages.set(actor.id, (state = { timer: 0, next: 0 }));
    state.timer -= dt;
    if (state.timer > 0 || distance(actor.position, target.position) > barrage.range) return;
    state.timer = barrage.every;
    const skill = this.data.skills.get(barrage.skills[state.next % barrage.skills.length]!);
    state.next++;
    const from = sub(actor.position, scale(normalize(actor.facing), barrage.originBack));
    const point = vec2(target.position.x, target.position.y);
    const direction = normalize(sub(point, from));
    this.executor.execute(actor, skill, 1, target, skill.targeting === 'ground' ? point : from, direction);
    const delayed = skill.effects[0];
    this.events.emit('BarrageFired', { actorId: actor.id, skillId: skill.id, origin: from, point, direction, impactIn: delayed?.type === 'delayed' ? delayed.delay : 0 });
  }

  private interval(every: number): number {
    return every * (0.7 + this.rng.next() * 0.6);
  }

  private cast(actor: Actor, skillId: string): void {
    const skill = this.data.skills.get(skillId);
    this.executor.execute(actor, skill, 1, null, vec2(actor.position.x, actor.position.y), actor.facing);
  }
}
