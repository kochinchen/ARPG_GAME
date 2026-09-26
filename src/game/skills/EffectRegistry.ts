import type { EffectDef, EffectType } from '../../data/schema/effects';
import { AreaEffect } from './effects/AreaEffect';
import { DamageEffect } from './effects/DamageEffect';
import type { EffectContext, IEffect } from './effects/IEffect';
import { ProjectileEffect } from './effects/ProjectileEffect';

/**
 * effect.type → 執行邏輯。新增一種 Effect：
 *   1. data/schema/effects.ts 加 Schema
 *   2. effects/ 加實作
 *   3. 在這裡註冊（漏掉時 TypeScript 會報錯）
 */
export class EffectRegistry {
  private readonly effects: { [T in EffectType]: IEffect<T> } = {
    damage: new DamageEffect(),
    projectile: new ProjectileEffect(),
    area: new AreaEffect(),
  };

  apply(def: EffectDef, ctx: EffectContext): void {
    (this.effects[def.type] as IEffect).apply(def as never, ctx);
  }
}
