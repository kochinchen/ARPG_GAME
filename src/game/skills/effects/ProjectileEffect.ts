import { add, scale, vec2, type Vec2 } from '../../../core/math/Vec2';
import type { ProjectileEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

export class ProjectileEffect implements IEffect<'projectile'> {
  readonly type = 'projectile' as const;

  apply(def: ProjectileEffectDef, ctx: EffectContext): void {
    const spread = (def.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < def.count; i++) {
      // 多發時平均分布在 spread 角度內
      const offset = def.count === 1 ? 0 : -spread / 2 + (spread * i) / (def.count - 1);
      const direction = rotate(ctx.direction, offset);
      // 從施放者身體邊緣發射
      const start = add(ctx.origin, scale(direction, ctx.caster.radius));
      ctx.services.spawnProjectile({
        caster: ctx.caster,
        skill: ctx.skill,
        rank: ctx.rank,
        position: start,
        prevPosition: start,
        direction,
        speed: def.speed,
        radius: def.radius,
        remaining: def.range,
        pierceLeft: def.pierce,
        hitIds: new Set(),
        onHit: def.onHit,
        alive: true,
      });
    }
  }
}

function rotate(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}
