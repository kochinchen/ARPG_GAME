import { distance, normalize, sub } from '../../../core/math/Vec2';
import type { Element } from '../../../data/schema/common';
import type { AreaEffectDef, EffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

export class AreaEffect implements IEffect<'area'> {
  readonly type = 'area' as const;

  apply(def: AreaEffectDef, ctx: EffectContext): void {
    const { targeting, events } = ctx.services;
    const center = def.at === 'target' && ctx.target ? ctx.target.position : ctx.origin;
    const radius = def.radius * (1 + ctx.mods.aoeRadius);
    events.emit('AreaTriggered', {
      skillId: ctx.skill.id,
      position: center,
      radius,
      element: firstElement(def.effects),
      direction: ctx.direction,
      angleDeg: def.angleDeg ?? 360,
    });
    // 先收集再執行，避免執行途中有角色死亡被移除而影響迭代
    let victims = targeting.hostilesWithin(ctx.caster, center, radius);
    if (def.angleDeg !== undefined && def.angleDeg < 360) {
      const halfCos = Math.cos(((def.angleDeg / 2) * Math.PI) / 180);
      victims = victims.filter((v) => {
        if (distance(v.position, center) < 1e-6) return true;
        const d = normalize(sub(v.position, center));
        return d.x * ctx.direction.x + d.y * ctx.direction.y >= halfCos;
      });
    }
    // 主要目標一定命中（近戰揮砍：目標在出招途中稍微移動也不會落空）
    if (def.includeTarget && ctx.target?.alive && !victims.includes(ctx.target)) victims.unshift(ctx.target);
    for (const target of victims) ctx.run(def.effects, { ...ctx, target, origin: center });
  }
}

export function firstElement(effects: readonly EffectDef[]): Element | null {
  for (const e of effects) {
    if (e.type === 'damage') return e.element;
    const nested =
      e.type === 'projectile' ? firstElement(e.onHit) : 'effects' in e ? firstElement(e.effects) : null;
    if (nested) return nested;
  }
  return null;
}
