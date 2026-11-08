import { add, distance, normalize, scale, sub } from '../../core/math/Vec2';
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
        if (p.returning) this.homeIn(p);
        if (!p.alive) break;
        p.position = add(p.position, scale(p.direction, step));
        if (p.returns && !p.returning) p.traveled = (p.traveled ?? 0) + step;
        this.checkHit(p);
        if (p.alive && p.remaining <= 0) {
          if (p.returns && !p.returning) this.turnBack(p);
          else {
            if (p.hitAtEnd) this.hit(p, null);
            p.alive = false;
          }
        }
      }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (!projectiles[i]!.alive) projectiles.splice(i, 1);
    }
  }

  private checkHit(p: Projectile): void {
    // 迴旋的投射物：去程撞牆就掉頭，回程穿過牆（飛回發射者手上）
    if (p.returning) {
      // 回程不檢查牆
    } else if (!this.nav.isWalkableAt(p.position.x, p.position.y)) {
      if (p.returns) {
        this.turnBack(p);
      } else {
        this.hit(p, null);
        p.alive = false;
        return;
      }
    }
    for (const target of this.targeting.hostilesWithin(p.caster, p.position, p.radius)) {
      if (p.hitIds.has(target.id)) continue;
      p.hitIds.add(target.id);
      this.hit(p, target);
      if (p.returns) continue;
      if (p.pierceLeft > 0) p.pierceLeft--;
      else {
        p.alive = false;
        return;
      }
    }
  }

  /** 迴旋：掉頭（回程可以再擊中去程中過的目標），回程最多飛去程的距離再多一點 */
  private turnBack(p: Projectile): void {
    p.returning = true;
    p.hitIds = new Set();
    p.direction = scale(p.direction, -1);
    p.remaining = (p.traveled ?? 0) + 3;
  }

  /** 回程朝發射者飛（發射者站著不動時就是原路飛回）；碰到發射者就接住消失，發射者死了就沿原方向飛完 */
  private homeIn(p: Projectile): void {
    if (!p.caster.alive) return;
    const d = distance(p.position, p.caster.position);
    if (d <= p.caster.radius + p.radius) {
      p.alive = false;
      return;
    }
    p.direction = normalize(sub(p.caster.position, p.position));
  }

  private hit(p: Projectile, target: Actor | null): void {
    const ctx = this.executor.createContext(p.caster, p.skill, p.rank, target, p.position, p.direction, p.mods);
    this.executor.run(p.onHit, ctx);
  }
}

