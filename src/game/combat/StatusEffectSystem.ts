import type { StatId } from '../../data/schema/common';
import type { StatusKind } from '../../data/schema/effects';
import type { Actor, StatusInstance } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { StatModifier } from '../stats/StatBlock';
import type { DamageDealer } from './DamageRequest';

/** 燃燒每隔多久結算一次（秒） */
const BURN_TICK = 0.5;
/** Boss 被冰凍時改為這個比例的緩速 */
const BOSS_FREEZE_SLOW = 0.6;

/** 會影響屬性的狀態：以 StatModifier 實作，過期時移除 */
const STAT_EFFECTS: Partial<Record<StatusKind, (magnitude: number) => Omit<StatModifier, 'source'>>> = {
  slow: (m) => ({ stat: 'moveSpeed', kind: 'more', value: -m }),
  armorBreak: (m) => ({ stat: 'defense', kind: 'more', value: -m }),
  weakPoint: (m) => ({ stat: 'critDamageTaken', kind: 'flat', value: m }),
  ironWill: (m) => ({ stat: 'damageReduction', kind: 'flat', value: m }),
};

/**
 * Buff / Debuff：緩速、冰凍、暈眩、浮空、燃燒、破甲、弱點、標記、防禦姿態、反擊、鋼鐵意志、下一招強化。
 * 同種狀態重複施加時取較長的時間與較強的效果。
 */
export class StatusEffectSystem {
  constructor(
    private readonly events: GameEventBus,
    /** 控制抗性上限（balance.combat.maxControlResist） */
    private readonly maxControlResist: number,
  ) {}

  /** 控制抗性（0～上限）：緩速抗性、擊退抗性、暈眩時間減少 */
  controlResist(actor: Actor, stat: Extract<StatId, 'slowResist' | 'knockbackResist' | 'stunResist'>): number {
    return Math.min(this.maxControlResist, Math.max(0, actor.stats.get(stat)));
  }

  apply(target: Actor, kind: StatusKind, duration: number, magnitude: number, source: Actor | null): void {
    if (!target.alive || duration <= 0) return;
    if (kind === 'freeze' && target.isBoss) {
      kind = 'slow';
      magnitude = BOSS_FREEZE_SLOW;
    }
    // 控制抗性：緩速變弱、暈眩變短（在 Boss 冰凍轉緩速之後計算，所以 Boss 的緩速抗性也有效）
    if (kind === 'slow') magnitude *= 1 - this.controlResist(target, 'slowResist');
    if (kind === 'stun') duration *= 1 - this.controlResist(target, 'stunResist');
    if (duration <= 0) return;
    const dps = kind === 'burn' && source ? source.stats.get('spellPower') * magnitude : 0;
    const existing = target.statuses.find((s) => s.kind === kind);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, duration);
      existing.magnitude = Math.max(existing.magnitude, magnitude);
      existing.dps = Math.max(existing.dps, dps);
      existing.source = source ?? existing.source;
    } else {
      target.statuses.push({ kind, remaining: duration, magnitude, source, dps, tickTimer: BURN_TICK });
    }
    this.syncModifier(target, kind);
    // 冰凍 / 暈眩 / 浮空打斷施放
    if (kind === 'freeze' || kind === 'stun' || kind === 'airborne') target.cast = null;
    this.events.emit('StatusApplied', { actorId: target.id, kind });
  }

  /** 直接移除某狀態（不發事件） */
  remove(target: Actor, kind: StatusKind): void {
    const index = target.statuses.findIndex((s) => s.kind === kind);
    if (index < 0) return;
    target.statuses.splice(index, 1);
    this.syncModifier(target, kind);
  }

  /** 取出並移除某狀態（防禦姿態、反擊、下一招強化觸發時使用） */
  consume(target: Actor, kind: StatusKind): StatusInstance | null {
    const index = target.statuses.findIndex((s) => s.kind === kind);
    if (index < 0) return null;
    const [instance] = target.statuses.splice(index, 1);
    this.syncModifier(target, kind);
    this.events.emit('StatusTriggered', { actorId: target.id, kind });
    return instance!;
  }

  update(actors: readonly Actor[], dt: number, pipeline: DamageDealer): void {
    for (const actor of actors) {
      if (actor.statuses.length === 0) continue;
      if (!actor.alive) {
        this.clear(actor);
        continue;
      }
      for (const status of [...actor.statuses]) {
        if (status.kind === 'burn' && status.dps > 0) {
          status.tickTimer -= dt;
          while (status.tickTimer <= 0) {
            status.tickTimer += BURN_TICK;
            const amount = status.dps * BURN_TICK;
            pipeline.apply({ source: status.source, target: actor, min: amount, max: amount, element: 'fire', isDot: true });
          }
        }
        status.remaining -= dt;
        if (status.remaining <= 0) {
          actor.statuses.splice(actor.statuses.indexOf(status), 1);
          this.syncModifier(actor, status.kind);
        }
      }
    }
  }

  clear(actor: Actor): void {
    const kinds = actor.statuses.map((s) => s.kind);
    actor.statuses = [];
    for (const kind of kinds) this.syncModifier(actor, kind);
  }

  private syncModifier(actor: Actor, kind: StatusKind): void {
    const make = STAT_EFFECTS[kind];
    if (!make) return;
    const source = `status:${kind}`;
    actor.stats.removeBySource(source);
    const status = actor.statuses.find((s) => s.kind === kind);
    if (status) actor.stats.addModifier({ ...make(status.magnitude), source });
  }
}
