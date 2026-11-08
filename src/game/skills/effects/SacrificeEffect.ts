import type { EffectContext, IEffect } from './IEffect';

/** 施放者自己死亡（DeathSystem 照 lastDamagedBy 算擊殺者，經驗與掉寶照常） */
export class SacrificeEffect implements IEffect<'sacrifice'> {
  readonly type = 'sacrifice' as const;

  apply(_def: unknown, ctx: EffectContext): void {
    ctx.caster.hp = 0;
  }
}
