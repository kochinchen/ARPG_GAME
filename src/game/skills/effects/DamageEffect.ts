import type { EffectContext, IEffect } from './IEffect';
import { rankMultiplier } from './IEffect';
import type { DamageEffectDef } from '../../../data/schema/effects';

export class DamageEffect implements IEffect<'damage'> {
  readonly type = 'damage' as const;

  apply(def: DamageEffectDef, ctx: EffectContext): void {
    if (!ctx.target) return;
    const [baseMin, baseMax] =
      def.source === 'weapon'
        ? [ctx.caster.stats.get('damageMin'), ctx.caster.stats.get('damageMax')]
        : (def.base ?? [0, 0]);
    const scale = def.multiplier * rankMultiplier(ctx.rank, def.perRankPct);
    ctx.services.pipeline.apply({
      source: ctx.caster,
      target: ctx.target,
      min: baseMin * scale,
      max: baseMax * scale,
      element: def.element,
    });
  }
}
