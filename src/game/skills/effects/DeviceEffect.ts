import type { DeviceEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

/** 佈置機關（絆索網、霜凍地雷、雷電圖騰、火藥桶）；行為由 DeviceSystem 負責 */
export class DeviceEffect implements IEffect<'device'> {
  readonly type = 'device' as const;

  apply(def: DeviceEffectDef, ctx: EffectContext): void {
    ctx.services.placeDevice(def, ctx);
  }
}
