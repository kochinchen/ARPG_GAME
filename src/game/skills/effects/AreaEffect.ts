
import type { AreaEffectDef, EffectDef } from '../../../data/schema/effects';
import type { Element } from '../../../data/schema/common';
import type { EffectContext, IEffect } from './IEffect';

export class AreaEffect implements IEffect<'area'> {
  readonly type = 'area' as const;

  apply(def: AreaEffectDef, ctx: EffectContext): void {
    const { targeting, events } = ctx.services;
    events.emit('AreaTriggered', {
      skillId: ctx.skill.id,
      position: ctx.origin,
      radius: def.radius,
      element: firstElement(def.effects),
    });
    // 先收集再執行，避免執行途中有角色死亡被移除而影響迭代
    const victims = targeting.hostilesWithin(ctx.caster, ctx.origin, def.radius);
    for (const target of victims) ctx.run(def.effects, { ...ctx, target });
  }
}

function firstElement(effects: readonly EffectDef[]): Element | null {
  for (const e of effects) {
    if (e.type === 'damage') return e.element;
    const nested = e.type === 'area' ? firstElement(e.effects) : e.type === 'projectile' ? firstElement(e.onHit) : null;
    if (nested) return nested;
  }
  return null;
}

