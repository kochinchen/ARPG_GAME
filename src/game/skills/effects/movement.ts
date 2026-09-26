import { distance, normalize, sub, vec2, type Vec2 } from '../../../core/math/Vec2';
import type { Actor } from '../../entities/Actor';
import type { NavGrid } from '../../movement/NavGrid';

const STEP = 0.1;

/**
 * 沿 direction 移動 actor 最多 distance，碰牆就停；stop 回傳 true 時提前停止。
 * 回傳實際移動距離。
 */
export function slide(actor: Actor, direction: Vec2, maxDistance: number, nav: NavGrid, stop?: () => boolean): number {
  const dir = normalize(direction);
  if (dir.x === 0 && dir.y === 0) return 0;
  let moved = 0;
  while (moved < maxDistance) {
    if (stop?.()) break;
    const step = Math.min(STEP, maxDistance - moved);
    const next = vec2(actor.position.x + dir.x * step, actor.position.y + dir.y * step);
    if (!nav.isClearAt(next, actor.radius)) break;
    actor.position = next;
    moved += step;
  }
  return moved;
}

/** 從 from 指向 to 的方向；兩點重合時用 fallback */
export function directionBetween(from: Vec2, to: Vec2, fallback: Vec2): Vec2 {
  return distance(from, to) < 1e-6 ? fallback : normalize(sub(to, from));
}
