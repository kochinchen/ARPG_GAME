import type { DelayedEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

/** 延遲後執行（雷擊、隕星、箭雨、雷暴、連射、殘影） */
export class DelayedEffect implements IEffect<'delayed'> {
  readonly type = 'delayed' as const;

  apply(def: DelayedEffectDef, ctx: EffectContext): void {
    ctx.services.scheduler.schedule(def, ctx);
  }
}
