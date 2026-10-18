import { rankValue } from '../../../data/schema/common';
import type { KnockbackEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';
import { directionBetween, slide } from './movement';

/** 被拉到距離施放者邊緣多近時停下（Tile） */
const PULL_STOP_GAP = 0.3;

/** 把目標推離效果中心（負距離：拉向施放者）；不會移動的角色（木樁）與鋼鐵意志 / 不動狀態不受影響；擊退抗性縮短距離 */
export class KnockbackEffect implements IEffect<'knockback'> {
  readonly type = 'knockback' as const;

  apply(def: KnockbackEffectDef, ctx: EffectContext): void {
    const target = ctx.target;
    if (!target || target.hp <= 0 || target.moveSpeed <= 0 || target.hasStatus('ironWill') || target.hasStatus('unstoppable')) return;
    const from = ctx.origin === target.position ? ctx.caster.position : ctx.origin;
    const resist = ctx.services.statuses.controlResist(target, 'knockbackResist');
    const distance = rankValue(def.distance, ctx.rank) * (1 + ctx.mods.knockback) * (1 - resist);
    if (distance < 0) {
      // 拉：朝施放者移動，停在施放者面前（不重疊、不穿牆）
      const caster = ctx.caster;
      const gap = () => Math.hypot(caster.position.x - target.position.x, caster.position.y - target.position.y) - caster.radius - target.radius;
      slide(target, directionBetween(target.position, caster.position, ctx.direction), -distance, ctx.services.nav, () => gap() <= PULL_STOP_GAP);
      return;
    }
    if (distance === 0) return;
    slide(target, directionBetween(from, target.position, ctx.direction), distance, ctx.services.nav);
  }
}
