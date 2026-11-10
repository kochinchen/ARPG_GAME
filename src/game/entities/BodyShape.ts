import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { Actor, BodyPoint } from './Actor';

export type { BodyPoint };

/**
 * 身體的地面範圍（設計者 2026-11-10）：模型從正上方投影到地面的輪廓（凸多邊形，細長的尖角、尾巴尖不算），
 * 跟著面向旋轉。碰撞、索敵、命中與接近距離都算到這個輪廓的邊緣；沒有輪廓的角色（主角）照舊用圓。
 * 點的座標是 [右手邊, 前方]（格），逆時針；資料由 tests/data/BodyShapes.test.ts 從模型量出來（src/data/bodyShapes.json）。
 */

/** 輪廓在世界座標的頂點：右手邊 = (facing.y, -facing.x)，和畫面上模型的 +X 一致 */
function corners(actor: Actor): Vec2[] {
  const f = actor.facing;
  const len = Math.hypot(f.x, f.y) || 1;
  const fx = f.x / len;
  const fy = f.y / len;
  return actor.body!.map(([right, front]) => vec2(actor.position.x + right * fy + front * fx, actor.position.y - right * fx + front * fy));
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return vec2(a.x + dx * t, a.y + dy * t);
}

/** 輪廓邊緣上離 p 最近的點，以及 p 是否在輪廓裡面 */
function closestEdge(actor: Actor, p: Vec2): { point: Vec2; inside: boolean } {
  const pts = corners(actor);
  let inside = true;
  let best = pts[0]!;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0) inside = false;
    const q = closestOnSegment(p, a, b);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return { point: best, inside };
}

/** p 到角色身體邊緣的距離（在身體裡面是負的）：沒有輪廓 = 到圓心的距離 − 半徑 */
export function edgeGap(actor: Actor, p: Vec2): number {
  if (!actor.body) return Math.hypot(p.x - actor.position.x, p.y - actor.position.y) - actor.radius;
  const { point, inside } = closestEdge(actor, p);
  const d = Math.hypot(p.x - point.x, p.y - point.y);
  return inside ? -d : d;
}

/** 角色身體上離 p 最近的點（p 在身體裡面就是 p 自己） */
export function nearestBodyPoint(actor: Actor, p: Vec2): Vec2 {
  if (!actor.body) {
    const dx = p.x - actor.position.x;
    const dy = p.y - actor.position.y;
    const d = Math.hypot(dx, dy);
    return d <= actor.radius || d < 1e-9 ? p : vec2(actor.position.x + (dx / d) * actor.radius, actor.position.y + (dy / d) * actor.radius);
  }
  const { point, inside } = closestEdge(actor, p);
  return inside ? p : point;
}

/** 兩個角色身體表面之間的距離（重疊時是負的） */
export function surfaceGap(a: Actor, b: Actor): number {
  if (b.body && !a.body) return edgeGap(b, a.position) - a.radius;
  if (a.body && !b.body) return edgeGap(a, b.position) - b.radius;
  if (a.body && b.body) return edgeGap(a, nearestBodyPoint(b, a.position));
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) - a.radius - b.radius;
}

/**
 * 把沒有輪廓的角色 circle 推出有輪廓的角色 body：回傳推出去的方向與距離（沒有重疊回傳 null）
 */
export function pushOut(body: Actor, circle: Actor): { dir: Vec2; overlap: number } | null {
  const { point, inside } = closestEdge(body, circle.position);
  const dx = circle.position.x - point.x;
  const dy = circle.position.y - point.y;
  const d = Math.hypot(dx, dy);
  const overlap = inside ? d + circle.radius : circle.radius - d;
  if (overlap <= 0) return null;
  if (d < 1e-9) {
    const cx = circle.position.x - body.position.x;
    const cy = circle.position.y - body.position.y;
    const c = Math.hypot(cx, cy) || 1;
    return { dir: vec2(cx / c, cy / c), overlap };
  }
  return { dir: inside ? vec2(-dx / d, -dy / d) : vec2(dx / d, dy / d), overlap };
}
