import { rankValue } from '../../../data/schema/common';
import type { KnockbackEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';
import { directionBetween, slide } from './movement';

/** 把目標推離效果中心；不會移動的角色（木樁）與鋼鐵意志 / 不動狀態不受影響 */
export class KnockbackEffect implements IEffect<'knockback'> {
  readonly type = 'knockback' as const;

  apply(def: KnockbackEffectDef, ctx: EffectContext): void {
    const target = ctx.target;
    if (!target || target.hp <= 0 || target.moveSpeed <= 0 || target.hasStatus('ironWill') || target.hasStatus('unstoppable')) return;
    const from = ctx.origin === target.position ? ctx.caster.position : ctx.origin;
    slide(target, directionBetween(from, target.position, ctx.direction), rankValue(def.distance, ctx.rank) * (1 + ctx.mods.knockback), ctx.services.nav);
  }
}
