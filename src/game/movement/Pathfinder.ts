import { BinaryHeap } from '../../core/BinaryHeap';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { NavGrid } from './NavGrid';

const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** 點到牆時，最多往外找幾格可走的位置 */
const NEAREST_WALKABLE_RADIUS = 8;

/**
 * 網格 A*（8 方向，不切牆角）+ 路徑平滑。
 * 目標不可達時，走到可到達範圍內最接近目標的位置。
 */
export class Pathfinder {
  constructor(
    private readonly nav: NavGrid,
    private readonly maxExpandedNodes = 24000,
  ) {}

  /**
   * 回傳從 from 出發要依序經過的 Waypoint（不含 from）。
   * 空陣列代表不需移動或無法前進。
   */
  findPath(from: Vec2, to: Vec2, radius: number): Vec2[] {
    const nav = this.nav;
    const startTile = nav.cellOf(from);
    if (!nav.isWalkable(startTile.x, startTile.y)) return [];

    let goalTile = nav.cellOf(to);
    let goalPoint: Vec2;
    if (nav.isWalkable(goalTile.x, goalTile.y)) {
      goalPoint = nav.clampInside(to, radius);
    } else {
      const nearest = nav.nearestWalkable(goalTile, NEAREST_WALKABLE_RADIUS, from);
      if (!nearest) return [];
      goalTile = nearest;
      goalPoint = nav.cellCenter(nearest);
    }

    // 直線可達就不跑 A*
    if (nav.hasLineOfSight(from, goalPoint, radius)) return [goalPoint];

    const tiles = this.search(startTile, goalTile);
    if (tiles.length === 0) return [];

    const reachedGoal = tiles[tiles.length - 1]!.x === goalTile.x && tiles[tiles.length - 1]!.y === goalTile.y;
    const points = tiles.map((t) => nav.cellCenter(t));
    if (reachedGoal) points[points.length - 1] = goalPoint;

    return this.smooth(from, points, radius);
  }

  /** A*：回傳 start 之後到 goal（或最接近 goal）的 Tile 序列，不含 start */
  private search(start: Vec2, goal: Vec2): Vec2[] {
    const { width, height } = this.nav;
    const size = width * height;
    const g = new Float64Array(size).fill(Infinity);
    const cameFrom = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const index = (x: number, y: number) => y * width + x;
    const heuristic = (x: number, y: number) => {
      const dx = Math.abs(x - goal.x);
      const dy = Math.abs(y - goal.y);
      return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    };

    const open = new BinaryHeap<{ i: number; f: number }>((n) => n.f);
    const startIndex = index(start.x, start.y);
    const goalIndex = index(goal.x, goal.y);
    g[startIndex] = 0;
    open.push({ i: startIndex, f: heuristic(start.x, start.y) });

    let best = startIndex;
    let bestH = heuristic(start.x, start.y);
    let expanded = 0;

    while (open.size > 0 && expanded < this.maxExpandedNodes) {
      const { i } = open.pop()!;
      if (closed[i]) continue;
      closed[i] = 1;
      expanded++;
      if (i === goalIndex) {
        best = i;
        break;
      }

      const x = i % width;
      const y = (i - x) / width;
      const h = heuristic(x, y);
      if (h < bestH) {
        bestH = h;
        best = i;
      }

      for (const [dx, dy, cost] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.nav.isWalkable(nx, ny)) continue;
        // 斜走時兩側都要可走，避免切過牆角
        if (dx !== 0 && dy !== 0 && (!this.nav.isWalkable(x + dx, y) || !this.nav.isWalkable(x, y + dy))) continue;
        const ni = index(nx, ny);
        if (closed[ni]) continue;
        const tentative = g[i]! + cost;
        if (tentative < g[ni]!) {
          g[ni] = tentative;
          cameFrom[ni] = i;
          open.push({ i: ni, f: tentative + heuristic(nx, ny) });
        }
      }
    }

    const path: Vec2[] = [];
    for (let i = best; i !== startIndex && i !== -1; i = cameFrom[i]!) {
      const x = i % width;
      path.push(vec2(x, (i - x) / width));
    }
    return path.reverse();
  }

  /** 拉直路徑：從目前位置盡量直接走到最遠的可視 Waypoint */
  private smooth(from: Vec2, points: Vec2[], radius: number): Vec2[] {
    const result: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < points.length) {
      let furthest = i;
      for (let j = points.length - 1; j > i; j--) {
        if (this.nav.hasLineOfSight(anchor, points[j]!, radius)) {
          furthest = j;
          break;
        }
      }
      anchor = points[furthest]!;
      result.push(anchor);
      i = furthest + 1;
    }
    return result;
  }
}
