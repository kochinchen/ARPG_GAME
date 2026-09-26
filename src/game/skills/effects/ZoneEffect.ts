import type { ZoneEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

/** 在地面留下持續區域（火牆、隕星的火焰區） */
export class ZoneEffect implements IEffect<'zone'> {
  readonly type = 'zone' as const;

  apply(def: ZoneEffectDef, ctx: EffectContext): void {
    ctx.services.scheduler.spawnZone(def, ctx);
  }
}
