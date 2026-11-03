import type { LeapEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

export class LeapEffect implements IEffect<'leap'> {
  readonly type = 'leap' as const;

  apply(def: LeapEffectDef, ctx: EffectContext): void {
    ctx.services.scheduler.leap(def, ctx);
  }
}
