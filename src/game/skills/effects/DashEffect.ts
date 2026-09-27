import { add, distance, scale, sub, type Vec2 } from '../../../core/math/Vec2';
import type { DashEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';
import { directionBetween, slide } from './movement';

/** 路徑命中的寬度（從施放者邊緣算起） */
const PATH_REACH = 0.8;

/** 施放者位移；對敵技能向前衝時停在目標前方。之後的效果從新位置發出。 */
export class DashEffect implements IEffect<'dash'> {
  readonly type = 'dash' as const;

  apply(def: DashEffectDef, ctx: EffectContext): void {
    const caster = ctx.caster;
    const target = ctx.target;
    const forward = target ? directionBetween(caster.position, target.position, ctx.direction) : ctx.direction;
    const direction = def.direction === 'forward' ? forward : scale(forward, -1);
    const stop =
      def.direction === 'forward' && target
        ? () => distance(caster.position, target.position) <= caster.radius + target.radius + 0.3
        : undefined;
    const start = caster.position;
    slide(caster, direction, def.distance * (1 + ctx.mods.movementSpeed), ctx.services.nav, stop);
    caster.path = [];
    ctx.origin = caster.position;
    if (def.onPath.length > 0) this.hitPath(def, ctx, start);
  }

  /** 突進斬：對起點到終點之間的敵人執行 onPath */
  private hitPath(def: DashEffectDef, ctx: EffectContext, start: Vec2): void {
    const caster = ctx.caster;
    const end = caster.position;
    const reach = caster.radius + PATH_REACH;
    const center = scale(add(start, end), 0.5);
    const victims = ctx.services.targeting
      .hostilesWithin(caster, center, distance(start, end) / 2 + reach)
      .filter((v) => distanceToSegment(v.position, start, end) <= reach + v.radius);
    ctx.services.events.emit('AreaTriggered', {
      skillId: ctx.skill.id,
      position: end,
      radius: reach,
      element: 'physical',
      direction: ctx.direction,
      angleDeg: 120,
      special: ctx.mods.combo?.success ?? false,
    });
    for (const target of victims) ctx.run(def.onPath, { ...ctx, target, origin: end });
  }
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const len2 = ab.x * ab.x + ab.y * ab.y;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / len2));
  return distance(p, add(a, scale(ab, t)));
}
