import { distance, normalize, rotate, sub } from '../../../core/math/Vec2';
import { rankValue, type Element } from '../../../data/schema/common';
import type { AreaEffectDef, EffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

export class AreaEffect implements IEffect<'area'> {
  readonly type = 'area' as const;

  apply(def: AreaEffectDef, ctx: EffectContext): void {
    const { targeting, events } = ctx.services;
    const center = def.at === 'target' && ctx.target ? ctx.target.position : ctx.origin;
    const radius = rankValue(def.radius, ctx.rank) * (1 + ctx.mods.aoeRadius);
    const direction = def.offsetDeg ? rotate(ctx.direction, def.offsetDeg) : ctx.direction;
    events.emit('AreaTriggered', {
      skillId: ctx.skill.id,
      position: center,
      radius,
      element: firstElement(def.effects),
      direction,
      angleDeg: def.angleDeg ?? 360,
      special: ctx.mods.combo?.success ?? false,
    });
    // 先收集再執行，避免執行途中有角色死亡被移除而影響迭代
    let victims = def.line ? targeting.hostilesWithin(ctx.caster, center, Math.hypot(def.line.length, def.line.width / 2)) : targeting.hostilesWithin(ctx.caster, center, radius);
    if (def.line) {
      // 直線：沿方向 0～length、左右各 width / 2（加上目標半徑）
      const { length, width } = def.line;
      victims = victims.filter((v) => {
        const rel = sub(v.position, center);
        const along = rel.x * direction.x + rel.y * direction.y;
        const across = Math.abs(-rel.x * direction.y + rel.y * direction.x);
        return along >= -v.radius && along <= length + v.radius && across <= width / 2 + v.radius;
      });
    } else if (def.angleDeg !== undefined && def.angleDeg < 360) {
      const halfCos = Math.cos(((def.angleDeg / 2) * Math.PI) / 180);
      victims = victims.filter((v) => {
        if (distance(v.position, center) < 1e-6) return true;
        const d = normalize(sub(v.position, center));
        return d.x * direction.x + d.y * direction.y >= halfCos;
      });
    }
    // 主要目標一定命中（近戰揮砍：目標在出招途中稍微移動也不會落空）
    if (def.includeTarget && !def.offsetDeg && ctx.target?.alive && !victims.includes(ctx.target)) victims.unshift(ctx.target);
    for (const target of victims) ctx.run(def.effects, { ...ctx, target, origin: center });
  }
}

export function firstElement(effects: readonly EffectDef[]): Element | null {
  for (const e of effects) {
    if (e.type === 'damage') return e.element;
    const nested =
      e.type === 'projectile' ? firstElement(e.onHit) : e.type === 'dash' ? firstElement(e.onPath) : 'effects' in e ? firstElement(e.effects) : null;
    if (nested) return nested;
  }
  return null;
}
