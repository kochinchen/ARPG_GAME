import type { EffectDef, EffectType } from '../../data/schema/effects';
import { AreaEffect } from './effects/AreaEffect';
import { ChainEffect } from './effects/ChainEffect';
import { DamageEffect } from './effects/DamageEffect';
import { DashEffect } from './effects/DashEffect';
import { DelayedEffect } from './effects/DelayedEffect';
import type { EffectContext, IEffect } from './effects/IEffect';
import { KnockbackEffect } from './effects/KnockbackEffect';
import { ProjectileEffect } from './effects/ProjectileEffect';
import { StatusEffect } from './effects/StatusEffect';
import { SummonEffect } from './effects/SummonEffect';
import { ZoneEffect } from './effects/ZoneEffect';

/**
 * effect.type → 執行邏輯。新增一種 Effect：
 *   1. data/schema/effects.ts 加 Schema
 *   2. effects/ 加實作
 *   3. 在這裡註冊（漏掉時 TypeScript 會報錯）
 */
export class EffectRegistry {
  private readonly effects: { [T in EffectType]: IEffect<T> } = {
    damage: new DamageEffect(),
    status: new StatusEffect(),
    knockback: new KnockbackEffect(),
    dash: new DashEffect(),
    projectile: new ProjectileEffect(),
    area: new AreaEffect(),
    chain: new ChainEffect(),
    zone: new ZoneEffect(),
    delayed: new DelayedEffect(),
    summon: new SummonEffect(),
  };

  apply(def: EffectDef, ctx: EffectContext): void {
    (this.effects[def.type] as IEffect).apply(def as never, ctx);
  }
}
