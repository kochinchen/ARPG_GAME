import { distance, normalize, rotate, sub, vec2, type Vec2 } from '../../../core/math/Vec2';
import { nearestBodyPoint } from '../../entities/BodyShape';
import { rankValue, type Element } from '../../../data/schema/common';
import { nestedEffects, type AreaEffectDef, type EffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

const BASIC_ATTACK = 'basic.attack';
/** 魔王普通攻擊的「主要目標一定命中」：目標離範圍外緣這麼近（格）才算 */
const BOSS_TARGET_SLACK = 0.8;

export class AreaEffect implements IEffect<'area'> {
  readonly type = 'area' as const;

  apply(def: AreaEffectDef, ctx: EffectContext): void {
    const { targeting, events } = ctx.services;
    const center = def.at === 'target' && ctx.target ? ctx.target.position : ctx.origin;
    const radius = rankValue(def.radius, ctx.rank) * (1 + ctx.mods.aoeRadius);
    const direction = def.offsetDeg ? rotate(ctx.direction, def.offsetDeg) : ctx.direction;
    events.emit('AreaTriggered', {
      ...(def.offsetDeg ? { offsetDeg: def.offsetDeg } : {}),
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
        // 有身體輪廓的目標：取輪廓上最靠近直線中線的點來判定
        const pad = v.body ? 0 : v.radius;
        const t = Math.max(0, Math.min(length, (v.position.x - center.x) * direction.x + (v.position.y - center.y) * direction.y));
        const p = v.body ? nearestBodyPoint(v, vec2(center.x + direction.x * t, center.y + direction.y * t)) : v.position;
        const rel = sub(p, center);
        const along = rel.x * direction.x + rel.y * direction.y;
        const across = Math.abs(-rel.x * direction.y + rel.y * direction.x);
        return along >= -pad && along <= length + pad && across <= width / 2 + pad;
      });
    } else if (def.angleDeg !== undefined && def.angleDeg < 360) {
      const halfCos = Math.cos(((def.angleDeg / 2) * Math.PI) / 180);
      const inside = (p: Vec2) => {
        if (distance(p, center) < 1e-6) return true;
        const d = normalize(sub(p, center));
        return d.x * direction.x + d.y * direction.y >= halfCos;
      };
      // 有身體輪廓的目標：中心或輪廓上最靠近施放點的地方在扇形裡就算
      victims = victims.filter((v) => inside(v.position) || (v.body !== null && inside(nearestBodyPoint(v, center))));
    }
    // 主要目標一定命中（近戰揮砍：目標在出招途中稍微移動也不會落空）
    // 怪物的招式跑開就躲得掉，只有普通攻擊保留（魔王的普通攻擊要目標還在範圍外一點點才算）；主角的技能不受影響（設計者 2026-11-03）
    const forced = ctx.target;
    const canForce =
      forced?.alive &&
      (ctx.caster.faction !== 'enemy' || (ctx.skill.id === BASIC_ATTACK && (!ctx.caster.isBoss || distance(forced.position, center) <= radius + BOSS_TARGET_SLACK)));
    if (def.includeTarget && !def.offsetDeg && forced && canForce && !victims.includes(forced)) victims.unshift(forced);
    for (const target of victims) ctx.run(def.effects, { ...ctx, target, origin: center });
  }
}

export function firstElement(effects: readonly EffectDef[]): Element | null {
  for (const e of effects) {
    if (e.type === 'damage') return e.element;
    const nested = firstElement(nestedEffects(e));
    if (nested) return nested;
  }
  return null;
}
