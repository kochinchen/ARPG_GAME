/** 2D 向量（World 座標，單位 = Tile）。一律不可變，運算回傳新物件。 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const ZERO: Vec2 = vec2(0, 0);

export const add = (a: Vec2, b: Vec2): Vec2 => vec2(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, s: number): Vec2 => vec2(a.x * s, a.y * s);
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
/** 旋轉 deg 度（World 座標，順時針為正 y 方向） */
export const rotate = (a: Vec2, deg: number): Vec2 => {
  const r = (deg * Math.PI) / 180;
  return vec2(a.x * Math.cos(r) - a.y * Math.sin(r), a.x * Math.sin(r) + a.y * Math.cos(r));
};
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const distanceSq = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  return len === 0 ? ZERO : vec2(a.x / len, a.y / len);
};

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

/** 從 from 朝 to 前進最多 maxStep，不會超過 to */
export const moveTowards = (from: Vec2, to: Vec2, maxStep: number): Vec2 => {
  const d = distance(from, to);
  if (d <= maxStep || d === 0) return to;
  return lerp(from, to, maxStep / d);
};
