import { distance, moveTowards, normalize, sub } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';

/**
 * 讓 Actor 沿著 path 移動。本 Tick 走到一個 Waypoint 後，剩餘距離會繼續走向下一個。
 */
export class MovementSystem {
  update(actors: readonly Actor[], dt: number): void {
    for (const actor of actors) {
      let remaining = actor.moveSpeed * dt;
      while (remaining > 0 && actor.path.length > 0) {
        const target = actor.path[0]!;
        const d = distance(actor.position, target);
        if (d > 0) actor.facing = normalize(sub(target, actor.position));
        if (d <= remaining) {
          actor.position = target;
          actor.path.shift();
          remaining -= d;
        } else {
          actor.position = moveTowards(actor.position, target, remaining);
          remaining = 0;
        }
      }
    }
  }
}
