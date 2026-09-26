import type { Rng } from '../../core/Rng';
import { distance } from '../../core/math/Vec2';
import type { Balance } from '../../data/schema/balance';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { DamageDealer, DamageRequest, DamageResult } from './DamageRequest';
import type { StatusEffectSystem } from './StatusEffectSystem';

export type { DamageRequest, DamageResult } from './DamageRequest';

/** 防禦減傷比例：defense / (defense + K)，永遠小於 100% */
export function defenseMitigation(defense: number, constant: number): number {
  return defense <= 0 ? 0 : defense / (defense + constant);
}

/** 反擊的觸發距離：攻擊者在近戰範圍內（雙方邊緣距離） */
const COUNTER_REACH = 1.2;
const MAX_DAMAGE_REDUCTION = 0.9;

/**
 * 所有傷害的唯一入口。
 *   基礎傷害 → 傷害加成 → 暴擊 → 防禦（物理）→ 減傷 → 防禦姿態 → 取整 → 扣血
 *   → 吸血 / 吸魔 / 命中回魔 → 事件 → 反擊
 * 死亡判定由 DeathSystem 在同一 Tick 稍後處理。
 */
export class DamagePipeline implements DamageDealer {
  constructor(
    private readonly balance: Balance,
    private readonly rng: Rng,
    private readonly events: GameEventBus,
    private readonly statuses: StatusEffectSystem,
  ) {}

  apply(request: DamageRequest): DamageResult | null {
    const { source, target } = request;
    if (!target.alive || target.hp <= 0) return null;
    const isDot = request.isDot === true;

    let amount = this.rng.range(request.min, request.max);
    if (source) amount *= 1 + source.stats.get('damageBonus');

    const critChance =
      request.canCrit === false || isDot || !source ? 0 : source.stats.get('critChance') + (request.extraCritChance ?? 0);
    const isCrit = this.rng.chance(critChance);
    if (isCrit) amount *= this.balance.combat.critMultiplier + target.stats.get('critDamageTaken');

    if (request.element === 'physical') {
      const defense = target.stats.get('defense') * (1 - Math.min(1, Math.max(0, request.armorPenetration ?? 0)));
      amount *= 1 - defenseMitigation(defense, this.balance.combat.defenseConstant);
    }
    amount *= 1 - Math.min(MAX_DAMAGE_REDUCTION, Math.max(0, target.stats.get('damageReduction')));
    if (!isDot) {
      const guard = this.statuses.consume(target, 'guard');
      if (guard) amount *= 1 - guard.magnitude;
    }

    // 有傷害時至少 1 點
    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
    if (amount === 0) return { amount: 0, isCrit, killed: false };

    target.hp = Math.max(0, target.hp - amount);
    target.lastDamagedBy = source?.id ?? null;

    if (source?.alive) {
      source.hp = Math.min(source.maxHp, source.hp + amount * source.stats.get('lifeSteal'));
      source.mana = Math.min(source.maxMana, source.mana + amount * source.stats.get('manaSteal'));
      if (!isDot) source.mana = Math.min(source.maxMana, source.mana + source.stats.get('manaOnHit'));
    }

    this.events.emit('ActorDamaged', {
      targetId: target.id,
      sourceId: source?.id ?? null,
      amount,
      isCrit,
      element: request.element,
      position: target.position,
    });

    if (source && !isDot && !request.noCounter) this.tryCounter(source, target);
    return { amount, isCrit, killed: target.hp === 0 };
  }

  /** 目標身上有「反擊」且攻擊者在近戰範圍內：以目標的武器傷害 × 倍率反擊 */
  private tryCounter(attacker: Actor, defender: Actor): void {
    if (!attacker.alive || defender.hp <= 0 || !defender.hasStatus('counter')) return;
    if (distance(attacker.position, defender.position) > attacker.radius + defender.radius + COUNTER_REACH) return;
    const counter = this.statuses.consume(defender, 'counter');
    if (!counter) return;
    this.apply({
      source: defender,
      target: attacker,
      min: defender.stats.get('damageMin') * counter.magnitude,
      max: defender.stats.get('damageMax') * counter.magnitude,
      element: 'physical',
      noCounter: true,
    });
  }
}
