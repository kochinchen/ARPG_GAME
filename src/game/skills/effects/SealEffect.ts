import { rankValue } from '../../../data/schema/common';
import type { SealEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

/** 奪取：目標裝備的技能隨機一個在這段時間內不能用（只對主角有效） */
export class SealEffect implements IEffect<'seal'> {
  readonly type = 'seal' as const;

  apply(def: SealEffectDef, ctx: EffectContext): void {
    if (ctx.target) ctx.services.sealSkill(ctx.target, rankValue(def.duration, ctx.rank));
  }
}
