import type { Element, StatId } from '../../data/schema/common';
import type { StatusKind } from '../../data/schema/effects';
import type { Actor, StatusInstance } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { StatModifier } from '../stats/StatBlock';
import type { DamageDealer } from './DamageRequest';

/** Boss 被冰凍時改為這個比例的緩速 */
const BOSS_FREEZE_SLOW = 0.6;
/** 中毒最多同時幾層（每層各自計時、各自結算） */
const POISON_MAX_STACKS = 3;
/** 60 Hz 累加的浮點誤差：剛好到期的那一幀仍結算最後一跳 */
const TICK_EPSILON = 1e-6;

/** 持續傷害：結算間隔（秒）、元素、每跳能否暴擊。所有持續傷害都不吸血、不吸魔（DamagePipeline 依 isDot 處理） */
const DOTS: Partial<Record<StatusKind, { tick: number; element: Element; canCrit: boolean }>> = {
  burn: { tick: 0.5, element: 'fire', canCrit: false },
  poison: { tick: 1, element: 'poison', canCrit: false },
  bleed: { tick: 1, element: 'physical', canCrit: true },
};

type ModifierSpec = Omit<StatModifier, 'source'>;
/** 會影響屬性的狀態：以 StatModifier 實作，過期時移除 */
const STAT_EFFECTS: Partial<Record<StatusKind, (status: StatusInstance) => ModifierSpec[]>> = {
  slow: (s) => [{ stat: 'moveSpeed', kind: 'more', value: -s.magnitude }],
  armorBreak: (s) => [{ stat: 'defense', kind: 'more', value: -s.magnitude }],
  weakPoint: (s) => [{ stat: 'critDamageTaken', kind: 'flat', value: s.magnitude }],
  ironWill: (s) => [{ stat: 'damageReduction', kind: 'flat', value: s.magnitude }],
  // 弱化不改屬性：DamagePipeline 從有效抗性直接減掉（可以變成負數）
};

/**
 * Buff / Debuff：緩速、冰凍、暈眩、浮空、燃燒、中毒、流血、弱化、破甲、弱點、標記、防禦姿態、反擊、鋼鐵意志、下一招強化。
 * 同種狀態重複施加時取較長的時間與較強的效果；中毒例外，最多疊 3 層（滿層時刷新最快到期的一層）。
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

  apply(target: Actor, kind: StatusKind, duration: number, magnitude: number, source: Actor | null, physicalMagnitude = 0): void {
    if (!target.alive || duration <= 0) return;
    if (kind === 'freeze' && target.isBoss) {
      kind = 'slow';
      magnitude = BOSS_FREEZE_SLOW;
    }
    // 控制抗性：緩速變弱、暈眩變短（在 Boss 冰凍轉緩速之後計算，所以 Boss 的緩速抗性也有效）
    if (kind === 'slow') magnitude *= 1 - this.controlResist(target, 'slowResist');
    if (kind === 'stun') duration *= 1 - this.controlResist(target, 'stunResist');
    if (duration <= 0) return;
    const dps = dotDps(kind, source, duration, magnitude);
    const instance: StatusInstance = { kind, remaining: duration, magnitude, source, dps, tickTimer: DOTS[kind]?.tick ?? 0, physicalMagnitude };
    const existing = target.statuses.find((s) => s.kind === kind);
    if (kind === 'poison') {
      const stacks = target.statuses.filter((s) => s.kind === 'poison');
      if (stacks.length < POISON_MAX_STACKS) target.statuses.push(instance);
      else {
        // 滿層：刷新最快到期的一層（保留它的結算進度；若直接取代，連續施放時每層都撐不到第一跳）
        const oldest = stacks.reduce((a, b) => (b.remaining < a.remaining ? b : a));
        oldest.remaining = Math.max(oldest.remaining, duration);
        oldest.dps = Math.max(oldest.dps, dps);
        oldest.source = source ?? oldest.source;
      }
    } else if (existing) {
      existing.remaining = Math.max(existing.remaining, duration);
      existing.magnitude = Math.max(existing.magnitude, magnitude);
      existing.physicalMagnitude = Math.max(existing.physicalMagnitude ?? 0, physicalMagnitude);
      existing.dps = Math.max(existing.dps, dps);
      existing.source = source ?? existing.source;
    } else {
      target.statuses.push(instance);
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
        const dot = DOTS[status.kind];
        if (dot && status.dps > 0) {
          status.tickTimer -= dt;
          while (status.tickTimer <= TICK_EPSILON) {
            status.tickTimer += dot.tick;
            const amount = status.dps * dot.tick;
            pipeline.apply({ source: status.source, target: actor, min: amount, max: amount, element: dot.element, isDot: true, canCrit: dot.canCrit });
          }
        }
        status.remaining -= dt;
        if (status.remaining <= TICK_EPSILON) {
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
    if (status) for (const modifier of make(status)) actor.stats.addModifier({ ...modifier, source });
  }
}

/**
 * 持續傷害的每秒傷害（施加當下依施放者屬性計算）：
 * 燃燒 = Spell Power × magnitude；中毒 / 流血 = 武器平均傷害 × magnitude 的總量平均分到持續時間（中毒另乘附加毒素傷害）
 */
function dotDps(kind: StatusKind, source: Actor | null, duration: number, magnitude: number): number {
  if (!source) return 0;
  if (kind === 'burn') return source.stats.get('spellPower') * magnitude;
  if (kind !== 'poison' && kind !== 'bleed') return 0;
  const weapon = (source.stats.get('damageMin') + source.stats.get('damageMax')) / 2;
  const bonus = kind === 'poison' ? 1 + source.stats.get('poisonDamagePct') : 1;
  return (weapon * magnitude * bonus) / duration;
}
