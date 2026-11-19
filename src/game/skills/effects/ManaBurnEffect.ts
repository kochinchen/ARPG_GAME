import { rankValue } from '../../../data/schema/common';
import type { ManaBurnEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

/** 燃魔：燒掉目標最大魔力的一部分（沒有魔力的目標沒有作用） */
export class ManaBurnEffect implements IEffect<'manaBurn'> {
  readonly type = 'manaBurn' as const;

  apply(def: ManaBurnEffectDef, ctx: EffectContext): void {
    const target = ctx.target;
    if (!target || !target.alive || target.untouchable || target.mana <= 0) return;
    const burned = Math.min(target.mana, target.maxMana * rankValue(def.percent, ctx.rank));
    if (burned <= 0) return;
    target.mana -= burned;
    ctx.services.events.emit('ManaBurned', { targetId: target.id, sourceId: ctx.caster.id, amount: burned, position: target.position });
  }
}
