import { distance, moveTowards, normalize, sub, type Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { NavGrid } from './NavGrid';
import type { Pathfinder } from './Pathfinder';

/**
 * 讓 Actor 沿著 path 移動。本 Tick 走到一個 Waypoint 後，剩餘距離會繼續走向下一個。
 *
 * 路徑是出發時算的；途中被推開（怪物推擠、擊退、鉤擊拉扯）後，從新位置直線走向舊的 Waypoint
 * 可能斜切過牆角。下一步的中心會踩進牆時，改從目前位置重新找路到原本的終點；還是不行就停下。
 */
export class MovementSystem {
  constructor(
    private readonly nav: NavGrid,
    private readonly pathfinder: Pathfinder,
  ) {}

  update(actors: readonly Actor[], dt: number): void {
    for (const actor of actors) {
      // 施放技能中、冰凍 / 暈眩時不能移動（路徑保留，之後繼續走）
      // 站在宿主背上的同伴（EnemyDef.riders）由宿主帶著走
      if (actor.isCasting || actor.isDisabled || actor.riding) continue;
      let remaining = actor.moveSpeed * dt;
      let rerouted = false;
      while (remaining > 0 && actor.path.length > 0) {
        const target = actor.path[0]!;
        const d = distance(actor.position, target);
        const next = d <= remaining ? target : moveTowards(actor.position, target, remaining);
        if (this.entersWall(actor.position, next)) {
          actor.path = rerouted ? [] : this.pathfinder.findPath(actor.position, actor.path[actor.path.length - 1]!, actor.radius);
          rerouted = true;
          continue;
        }
        if (d > 0) actor.facing = normalize(sub(target, actor.position));
        actor.position = next;
        if (d <= remaining) {
          actor.path.shift();
          remaining -= d;
        } else {
          remaining = 0;
        }
      }
    }
  }

  /** 站在地板上，下一步的中心卻在牆裡（已經在牆裡的不擋：要讓它走出來） */
  private entersWall(from: Vec2, to: Vec2): boolean {
    return !this.nav.isWalkableAt(to.x, to.y) && this.nav.isWalkableAt(from.x, from.y);
  }
}
