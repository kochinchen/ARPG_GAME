import { add, scale } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { Projectile } from '../entities/Projectile';
import type { NavGrid } from '../movement/NavGrid';
import type { TargetingService } from '../targeting/TargetingService';
import type { SkillExecutor } from './SkillExecutor';

/** 每次移動的最大步長，避免高速投射物穿過牆壁或小目標 */
const MAX_STEP = 0.1;

/**
 * 移動投射物，處理擊中敵人與撞牆。擊中時執行 onHit（例如火球爆炸）。
 */
export class ProjectileSystem {
  constructor(
    private readonly nav: NavGrid,
    private readonly targeting: TargetingService,
    private readonly executor: SkillExecutor,
  ) {}

  update(projectiles: Projectile[], dt: number): void {
    for (const p of projectiles) {
      p.prevPosition = p.position;
      if (!p.alive) continue;
      let travel = Math.min(p.speed * dt, p.remaining);
      while (travel > 0 && p.alive) {
        const step = Math.min(MAX_STEP, travel);
        travel -= step;
        p.remaining -= step;
        p.position = add(p.position, scale(p.direction, step));
        this.checkHit(p);
        if (p.alive && p.remaining <= 0) p.alive = false;
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (!projectiles[i]!.alive) projectiles.splice(i, 1);
    }
  }

  private checkHit(p: Projectile): void {
    if (!this.nav.isWalkableAt(p.position.x, p.position.y)) {
      this.hit(p, null);
      p.alive = false;
      return;
    }
    for (const target of this.targeting.hostilesWithin(p.caster, p.position, p.radius)) {
      if (p.hitIds.has(target.id)) continue;
      p.hitIds.add(target.id);
      this.hit(p, target);
      if (p.pierceLeft > 0) p.pierceLeft--;
      else {
        p.alive = false;
        return;
      }
    }
  }

  private hit(p: Projectile, target: Actor | null): void {
    const ctx = this.executor.createContext(p.caster, p.skill, p.rank, target, p.position, p.direction, p.mods);
    this.executor.run(p.onHit, ctx);
  }
}

