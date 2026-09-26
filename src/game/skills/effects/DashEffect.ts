import { distance, scale } from '../../../core/math/Vec2';
import type { DashEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';
import { directionBetween, slide } from './movement';

/** 施放者位移；對敵技能向前衝時停在目標前方。之後的效果從新位置發出。 */
export class DashEffect implements IEffect<'dash'> {
  readonly type = 'dash' as const;

  apply(def: DashEffectDef, ctx: EffectContext): void {
    const caster = ctx.caster;
    const target = ctx.target;
    const forward = target ? directionBetween(caster.position, target.position, ctx.direction) : ctx.direction;
    const direction = def.direction === 'forward' ? forward : scale(forward, -1);
    const stop =
      def.direction === 'forward' && target
        ? () => distance(caster.position, target.position) <= caster.radius + target.radius + 0.3
        : undefined;
    slide(caster, direction, def.distance * (1 + ctx.mods.movementSpeed), ctx.services.nav, stop);
    caster.path = [];
    ctx.origin = caster.position;
  }
}
