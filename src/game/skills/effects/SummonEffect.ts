import type { SummonEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

export class SummonEffect implements IEffect<'summon'> {
  readonly type = 'summon' as const;

  apply(def: SummonEffectDef, ctx: EffectContext): void {
    ctx.services.summon(ctx.caster, def.enemyId, def.count, def.maxAlive);
  }
}
