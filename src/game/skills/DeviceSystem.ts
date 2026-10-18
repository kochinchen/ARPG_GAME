import { add, distance, normalize, scale, sub, vec2, type Vec2 } from '../../core/math/Vec2';
import type { Balance } from '../../data/schema/balance';
import { rankValue } from '../../data/schema/common';
import type { DeviceEffectDef, EffectDef } from '../../data/schema/effects';
import { Actor, type ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';
import { StatBlock } from '../stats/StatBlock';
import type { TargetingService } from '../targeting/TargetingService';
import type { EffectContext } from './effects/IEffect';

/** 機關的碰撞半徑（Tile）：怪物攻擊它時站的距離 */
const DEVICE_RADIUS = 0.4;

/**
 * 機關（戰術 B 路線）：佈置、上限、血量與防禦跟隨玩家、四種行為、到期與被打壞。
 * 機關是玩家陣營的 Actor（faction 'summon'）：玩家的技能打不到、怪物可以攻擊；
 * 子效果以玩家為施放者（吃玩家的武器傷害 / 法術強度、擊殺算玩家的），從機關的位置發出。
 */
export class DeviceSystem {
  private placed = 0;
  /** 佈置時的效果情境（技能、等級、Combo 加成），觸發時沿用 */
  private readonly contexts = new Map<ActorId, EffectContext>();

  constructor(
    private readonly actors: Actor[],
    private readonly targeting: TargetingService,
    private readonly nav: NavGrid,
    events: GameEventBus,
    private readonly config: Balance['devices'],
    private readonly nextId: () => ActorId,
  ) {
    // 被怪物打壞：DeathSystem 發出 ActorDied 時實體還在，觸發 onDestroy（地雷引爆、火藥桶爆炸）
    events.on('ActorDied', (e) => {
      const actor = targeting.getActor(e.actorId);
      if (!actor?.device) return;
      this.fire(actor, actor.device.def.onDestroy, null);
      this.release(actor);
    });
  }

  place(def: DeviceEffectDef, ctx: EffectContext): void {
    const owner = ctx.caster;
    const rank = ctx.rank;
    // 同技能上限、全身上限：最舊的先消失（不觸發 onDestroy）
    this.evict((a) => a.device!.skillId === ctx.skill.id, Math.round(rankValue(def.maxAlive, rank)));
    this.evict(() => true, this.config.maxAlive);
    const hpPct = rankValue(def.hpPct, rank);
    const actor = new Actor({
      id: this.nextId(),
      faction: 'summon',
      name: ctx.skill.name,
      defId: ctx.skill.id,
      position: this.spot(def, ctx),
      radius: DEVICE_RADIUS,
      stats: new StatBlock({ maxHp: Math.max(1, owner.maxHp * hpPct), defense: owner.stats.get('defense'), moveSpeed: 0 }),
      summonedBy: owner.id,
      device: {
        def,
        ownerId: owner.id,
        skillId: ctx.skill.id,
        rank,
        direction: ctx.direction,
        order: this.placed++,
        remaining: rankValue(def.duration, rank),
        armTimer: def.armDelay,
        shotTimer: def.interval,
        shotsLeft: Math.round(rankValue(def.shots, rank)),
        triggersLeft: Math.round(rankValue(def.triggers, rank)),
        tripped: new Set(),
      },
    });
    actor.facing = ctx.direction;
    this.contexts.set(actor.id, { ...ctx, target: null });
    this.actors.push(actor);
  }

  update(dt: number): void {
    for (const actor of [...this.actors]) {
      const device = actor.device;
      if (!device || !actor.alive || actor.hp <= 0) continue;
      const owner = this.targeting.getActor(device.ownerId);
      if (!owner?.alive) {
        this.vanish(actor);
        continue;
      }
      this.follow(actor, owner, rankValue(device.def.hpPct, device.rank));
      device.remaining -= dt;
      if (device.remaining <= 0) {
        this.fire(actor, device.def.onExpire, null);
        this.vanish(actor);
        continue;
      }
      switch (device.def.behavior) {
        case 'trip':
          this.trip(actor, owner);
          break;
        case 'proximity':
          device.armTimer -= dt;
          if (device.armTimer <= 0 && this.targeting.hostilesWithin(owner, actor.position, device.def.triggerRadius).length > 0) {
            this.fire(actor, device.def.onTrigger, null);
            this.vanish(actor);
          }
          break;
        case 'turret':
          this.shoot(actor, dt);
          break;
        case 'none':
          break;
      }
    }
  }

  /** 位置：絆索網放在面前；其他放在指定位置。被牆擋住時放在施放者腳下 */
  private spot(def: DeviceEffectDef, ctx: EffectContext): Vec2 {
    const wanted = def.forward ? add(ctx.caster.position, scale(ctx.direction, def.forward)) : ctx.origin;
    return this.nav.isClearAt(wanted, DEVICE_RADIUS) ? wanted : ctx.caster.position;
  }

  /** 最大血量與防禦即時跟隨玩家；最大血量變動時維持血量比例（P0-8） */
  private follow(actor: Actor, owner: Actor, hpPct: number): void {
    const max = Math.max(1, owner.maxHp * hpPct);
    if (Math.abs(max - actor.maxHp) > 1e-6) {
      const ratio = actor.hp / actor.maxHp;
      actor.stats.setBase('maxHp', max);
      actor.hp = ratio * max;
    }
    const defense = owner.stats.get('defense');
    if (actor.stats.get('defense') !== defense) actor.stats.setBase('defense', defense);
  }

  /** 絆索網：碰到網的敵人各觸發一次，次數用完就消失 */
  private trip(actor: Actor, owner: Actor): void {
    const device = actor.device!;
    const line = device.def.line;
    if (!line) return;
    const dir = normalize(device.direction);
    const axis = vec2(-dir.y, dir.x);
    const half = line.length / 2;
    for (const enemy of this.targeting.hostilesWithin(owner, actor.position, half + line.width)) {
      if (device.tripped.has(enemy.id)) continue;
      const local = sub(enemy.position, actor.position);
      const along = Math.abs(local.x * axis.x + local.y * axis.y);
      const across = Math.abs(local.x * dir.x + local.y * dir.y);
      if (along > half + enemy.radius || across > line.width / 2 + enemy.radius) continue;
      device.tripped.add(enemy.id);
      this.fire(actor, device.def.onTrigger, enemy);
      if (--device.triggersLeft <= 0) {
        this.vanish(actor);
        return;
      }
    }
  }

  /** 圖騰：每 interval 秒朝最近的敵人射一發；沒有目標時等待，不消耗次數 */
  private shoot(actor: Actor, dt: number): void {
    const device = actor.device!;
    device.shotTimer -= dt;
    if (device.shotTimer > 0) return;
    const target = this.targeting.nearestHostile(actor, device.def.range);
    if (!target) {
      device.shotTimer = 0;
      return;
    }
    device.shotTimer += device.def.interval;
    this.fire(actor, device.def.onShot, target, normalize(sub(target.position, actor.position)));
    if (--device.shotsLeft <= 0) {
      this.fire(actor, device.def.onExpire, null);
      this.vanish(actor);
    }
  }

  private fire(actor: Actor, effects: readonly EffectDef[], target: Actor | null, direction?: Vec2): void {
    const ctx = this.contexts.get(actor.id);
    if (!ctx || effects.length === 0) return;
    ctx.run(effects, { ...ctx, target, origin: actor.position, direction: direction ?? actor.device!.direction, spawnFrom: actor });
  }

  /** 超過上限：最舊的先消失 */
  private evict(match: (actor: Actor) => boolean, limit: number): void {
    const devices = this.actors.filter((a) => a.alive && a.device && match(a)).sort((a, b) => a.device!.order - b.device!.order);
    while (devices.length >= limit) this.vanish(devices.shift()!);
  }

  /** 直接消失（到期、觸發完、被取代、玩家倒地）：不發 ActorDied，GameWorld 在 Tick 結尾移除 */
  private vanish(actor: Actor): void {
    actor.alive = false;
    this.release(actor);
  }

  /** 正在打這個機關的怪物改回追玩家（不會因為目標消失就走回家） */
  private release(actor: Actor): void {
    const ownerId = actor.device!.ownerId;
    this.contexts.delete(actor.id);
    for (const other of this.actors) {
      if (other.ai?.targetId !== actor.id) continue;
      other.ai.targetId = ownerId;
      other.intent = null;
    }
  }
}

/** 怪物要不要改打機關：距離 aggroRange 內最近的機關（AiSystem 使用） */
export function nearestDevice(self: Actor, actors: readonly Actor[], aggroRange: number): Actor | null {
  let best: Actor | null = null;
  let bestDistance = aggroRange;
  for (const other of actors) {
    if (!other.device || !other.alive) continue;
    const d = distance(self.position, other.position) - other.radius;
    if (d <= bestDistance) {
      best = other;
      bestDistance = d;
    }
  }
  return best;
}
