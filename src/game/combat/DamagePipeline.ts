import type { Rng } from '../../core/Rng';
import type { Balance } from '../../data/schema/balance';
import type { Element } from '../../data/schema/common';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

export interface DamageRequest {
  /** null = 環境傷害（陷阱等） */
  source: Actor | null;
  target: Actor;
  min: number;
  max: number;
  element: Element;
  /** 預設 true；持續傷害（燃燒、中毒）通常不暴擊 */
  canCrit?: boolean;
}

export interface DamageResult {
  amount: number;
  isCrit: boolean;
  killed: boolean;
}

/** 防禦減傷比例：defense / (defense + K)，永遠小於 100% */
export function defenseMitigation(defense: number, constant: number): number {
  return defense <= 0 ? 0 : defense / (defense + constant);
}

/**
 * 所有傷害的唯一入口。
 *   基礎傷害 → 暴擊 → 防禦（物理）→ 取整 → 扣血 → 事件
 * 命中判定（閃避）與元素抗性於後續 Milestone 加入同一流程。
 * 死亡判定由 DeathSystem 在同一 Tick 稍後處理。
 */
export class DamagePipeline {
  constructor(
    private readonly balance: Balance,
    private readonly rng: Rng,
    private readonly events: GameEventBus,
  ) {}

  apply(request: DamageRequest): DamageResult | null {
    const { source, target } = request;
    if (!target.alive) return null;

    let amount = this.rng.range(request.min, request.max);

    const critChance = request.canCrit === false || !source ? 0 : source.stats.get('critChance');
    const isCrit = this.rng.chance(critChance);
    if (isCrit) amount *= this.balance.combat.critMultiplier;

    if (request.element === 'physical') {
      amount *= 1 - defenseMitigation(target.stats.get('defense'), this.balance.combat.defenseConstant);
    }

    // 有傷害時至少 1 點
    amount = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
    if (amount === 0) return { amount: 0, isCrit, killed: false };

    target.hp = Math.max(0, target.hp - amount);
    target.lastDamagedBy = source?.id ?? null;

    this.events.emit('ActorDamaged', {
      targetId: target.id,
      sourceId: source?.id ?? null,
      amount,
      isCrit,
      element: request.element,
      position: target.position,
    });

    return { amount, isCrit, killed: target.hp === 0 };
  }
}
