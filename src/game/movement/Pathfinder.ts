import { BinaryHeap } from '../../core/BinaryHeap';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { NavGrid } from './NavGrid';

const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** 要繞開的地面區域（主角的火海、毒池） */
export type Hazard = { readonly position: Vec2; readonly radius: number };

/** 點到牆時，最多往外找幾格可走的位置 */
const NEAREST_WALKABLE_RADIUS = 8;

/**
 * 網格 A*（8 方向，不切牆角）+ 路徑平滑。
 * 目標不可達時，走到可到達範圍內最接近目標的位置。
 */
export class Pathfinder {
  /** 怪物要繞開的地面區域（GameWorld 每個 Tick 更新）；findPath 的 avoid = true 才看 */
  hazards: readonly Hazard[] = [];
  /** 每經過一格區域多算的距離（balance.enemyTactics.avoidZones.pathCost） */
  hazardCost = 0;

  constructor(
    private readonly nav: NavGrid,
    private readonly maxExpandedNodes = 24000,
  ) {}

  /**
   * 回傳從 from 出發要依序經過的 Waypoint（不含 from）。
   * 空陣列代表不需移動或無法前進。
   */
  findPath(from: Vec2, to: Vec2, radius: number, avoid = false): Vec2[] {
    const nav = this.nav;
    // 起點或終點本來就在區域裡：那一塊不算（要走出來 / 目標就站在裡面）
    const hazards = avoid && this.hazardCost > 0 ? this.hazards.filter((h) => !inside(from, h, radius) && !inside(to, h, radius)) : [];
    const clear = (a: Vec2, b: Vec2) => nav.hasLineOfSight(a, b, radius) && hazards.every((h) => segmentDistance(h.position, a, b) >= h.radius + radius);
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
    if (clear(from, goalPoint)) return [goalPoint];

    const tiles = this.search(startTile, goalTile, this.hazardMask(hazards, radius));
    if (tiles.length === 0) return [];

    const reachedGoal = tiles[tiles.length - 1]!.x === goalTile.x && tiles[tiles.length - 1]!.y === goalTile.y;
    const points = tiles.map((t) => nav.cellCenter(t));
    if (reachedGoal) points[points.length - 1] = goalPoint;

    return this.smooth(from, points, clear);
  }

  /** 區域蓋到的格子（格子中心在區域內，含自己的半徑）；沒有區域回傳 null */
  private hazardMask(hazards: readonly Hazard[], radius: number): Uint8Array | null {
    if (hazards.length === 0) return null;
    const { width, height } = this.nav;
    const mask = new Uint8Array(width * height);
    for (const h of hazards) {
      const r = h.radius + radius;
      const min = this.nav.cellOf(vec2(h.position.x - r, h.position.y - r));
      const max = this.nav.cellOf(vec2(h.position.x + r, h.position.y + r));
      for (let y = Math.max(0, min.y); y <= Math.min(height - 1, max.y); y++) {
        for (let x = Math.max(0, min.x); x <= Math.min(width - 1, max.x); x++) {
          const c = this.nav.cellCenter(vec2(x, y));
          if (Math.hypot(c.x - h.position.x, c.y - h.position.y) < r) mask[y * width + x] = 1;
        }
      }
    }
    return mask;
  }

  /** A*：回傳 start 之後到 goal（或最接近 goal）的 Tile 序列，不含 start */
  private search(start: Vec2, goal: Vec2, hazard: Uint8Array | null): Vec2[] {
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
        const tentative = g[i]! + cost + (hazard?.[ni] ? this.hazardCost : 0);
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
  private smooth(from: Vec2, points: Vec2[], clear: (a: Vec2, b: Vec2) => boolean): Vec2[] {
    const result: Vec2[] = [];
    let anchor = from;
    let i = 0;
    while (i < points.length) {
      let furthest = i;
      for (let j = points.length - 1; j > i; j--) {
        if (clear(anchor, points[j]!)) {
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

const inside = (p: Vec2, h: Hazard, radius: number): boolean => Math.hypot(p.x - h.position.x, p.y - h.position.y) < h.radius + radius;

/** 點到線段的距離 */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
