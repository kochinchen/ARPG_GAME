import { add, distance, normalize, scale, sub, vec2, type Vec2 } from '../../../core/math/Vec2';
import type { ProjectileEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

export class ProjectileEffect implements IEffect<'projectile'> {
  readonly type = 'projectile' as const;

  apply(def: ProjectileEffectDef, ctx: EffectContext): void {
    const mods = ctx.mods;
    const base = def.aimAssistDeg > 0 ? this.assist(def, ctx) : ctx.direction;
    const ring = def.spreadDeg >= 360;
    const count = def.count + mods.projectileCount;
    // 單發時 Combo 增加的投射物以小角度散開
    const spreadDeg = def.count === 1 && count > 1 ? 15 * (count - 1) : def.spreadDeg;
    const spread = (Math.min(spreadDeg, 360) * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      // 扇形：平均分布在 spread 內；環狀：360° 等分
      const offset = count === 1 ? 0 : ring ? (spread * i) / count : -spread / 2 + (spread * i) / (count - 1);
      const direction = rotate(base, offset);
      // 從施放者身體邊緣發射
      const start = add(ctx.origin, scale(direction, ctx.caster.radius));
      ctx.services.spawnProjectile({
        caster: ctx.caster,
        skill: ctx.skill,
        rank: ctx.rank,
        position: start,
        prevPosition: start,
        direction,
        speed: def.speed * (1 + mods.projectileSpeed),
        radius: def.radius * (1 + mods.projectileSize),
        remaining: def.range,
        pierceLeft: def.pierce + mods.pierce,
        hitIds: new Set(),
        onHit: def.onHit,
        alive: true,
        mods,
      });
    }
  }

  /** 自動修正：在允許角度內找最近的敵人，改朝它發射 */
  private assist(def: ProjectileEffectDef, ctx: EffectContext): Vec2 {
    const maxCos = Math.cos((def.aimAssistDeg * Math.PI) / 180);
    let best: { dir: Vec2; d: number } | null = null;
    for (const enemy of ctx.services.targeting.hostilesWithin(ctx.caster, ctx.origin, def.range)) {
      const d = distance(enemy.position, ctx.origin);
      if (d < 1e-6) continue;
      const dir = normalize(sub(enemy.position, ctx.origin));
      if (dir.x * ctx.direction.x + dir.y * ctx.direction.y < maxCos) continue;
      if (!best || d < best.d) best = { dir, d };
    }
    return best?.dir ?? ctx.direction;
  }
}

function rotate(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}
