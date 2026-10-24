/**
 * 構面幾何：把「體積」切成大型平面。
 * - loft：沿一根骨頭排幾圈截面（每圈 4～12 個頂點），相鄰兩圈連成大面；頭身四肢、頭髮、劍刃、布片都用它。
 * - hull：一小組點的凸包；鼻子、膝蓋、肩甲、手、靴子等小體積用它。
 * 所有點都在 World 靜止姿勢座標（公尺，Y 朝上，角色面向 +Z，角色的左邊是 +X）。
 */
export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
export const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));

/** 三角形收集器：依材質分組 */
export class Tris {
  readonly byMat = new Map<string, number[]>();
  tri(mat: string, a: V3, b: V3, c: V3, inside: V3): void {
    // 依「體積內部的參考點」決定朝向：法線一律朝外
    const n = cross(sub(b, a), sub(c, a));
    const centroid = mul(add(add(a, b), c), 1 / 3);
    const flip = dot(n, sub(centroid, inside)) < 0;
    let arr = this.byMat.get(mat);
    if (!arr) this.byMat.set(mat, (arr = []));
    if (flip) arr.push(...a, ...c, ...b);
    else arr.push(...a, ...b, ...c);
  }
}

/** 骨頭座標系：u = 骨頭方向，f = 正面，s = 側面（預設偏向角色左方 +X） */
export interface Frame {
  o: V3;
  u: V3;
  f: V3;
  s: V3;
}
export function frame(a: V3, b: V3, frontHint: V3 = [0, 0, 1], sideHint: V3 = [1, 0, 0]): Frame {
  const u = norm(sub(b, a));
  let f = sub(frontHint, mul(u, dot(frontHint, u)));
  if (len(f) < 1e-4) f = sub(sideHint, mul(u, dot(sideHint, u)));
  f = norm(f);
  let s = cross(f, u);
  if (dot(s, sideHint) < 0) s = mul(s, -1);
  return { o: a, u, f, s };
}
/** 座標系內的點：x 沿側面、y 沿骨頭、z 沿正面 */
export const at = (fr: Frame, x: number, y: number, z: number): V3 =>
  add(add(add(fr.o, mul(fr.s, x)), mul(fr.u, y)), mul(fr.f, z));

/** 截面：一圈 [x, z, dy?]，dy 讓截面可以傾斜（例如髮際線前高後低） */
export type Ring2 = [number, number, number?][];
export interface Section {
  y: number;
  pts: Ring2;
}

/** 多邊形截面：n 邊，起始角 start（度，0 = +x 側面，90 = 正面），k = 每個頂點的半徑倍率 */
export function poly(n: number, w: number, d: number, o: { start?: number; ox?: number; oz?: number; k?: number[] } = {}): Ring2 {
  const start = ((o.start ?? 0) * Math.PI) / 180;
  const out: Ring2 = [];
  for (let i = 0; i < n; i++) {
    const t = start + (i * Math.PI * 2) / n;
    const k = o.k?.[i] ?? 1;
    out.push([(o.ox ?? 0) + Math.cos(t) * w * k, (o.oz ?? 0) + Math.sin(t) * d * k]);
  }
  return out;
}
/** 左右對稱的截面：給右半邊（x ≥ 0，從正前方 [0, z] 到正後方 [0, z]）自動補左半 */
export function mirrorRing(half: [number, number][]): Ring2 {
  const out: Ring2 = half.map(([x, z]) => [x, z]);
  for (let i = half.length - 2; i >= 1; i--) {
    const p = half[i]!;
    out.push([-p[0], p[1]]);
  }
  return out;
}

export type Cap = 'open' | 'flat' | { apex: [number, number, number] } | { bulge: number };

export interface LoftOpts {
  /** 每一段（相鄰兩圈之間）的材質；長度 = sections.length - 1，不足時沿用最後一個 */
  mats: string[];
  start?: Cap;
  end?: Cap;
  /** 鏡像：x 乘上這個值（右側肢體 = -1） */
  mirror?: number;
  /** 依每個面的中心點（World）決定材質，回傳 null 表示這個面不要（例如開口）；有給時覆蓋 mats */
  matAt?: (c: V3, seg: number) => string | null;
}

/** 沿骨頭的構面體積 */
export function loft(out: Tris, fr: Frame, secs: Section[], o: LoftOpts): void {
  const m = o.mirror ?? 1;
  const rings = secs.map((s) => s.pts.map(([x, z, dy]) => at(fr, x * m, s.y + (dy ?? 0), z)));
  const centers = rings.map((r) => mul(r.reduce((acc, p) => add(acc, p), [0, 0, 0] as V3), 1 / r.length));
  const matOf = (i: number) => o.mats[Math.min(i, o.mats.length - 1)]!;
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i]!;
    const r1 = rings[i + 1]!;
    const inside = lerp(centers[i]!, centers[i + 1]!, 0.5);
    const n = r0.length;
    for (let j = 0; j < n; j++) {
      const a = r0[j]!;
      const b = r0[(j + 1) % n]!;
      const c = r1[(j + 1) % n]!;
      const d = r1[j]!;
      const mat = o.matAt ? o.matAt(mul(add(add(a, b), add(c, d)), 0.25), i) : matOf(i);
      if (mat === null) continue;
      out.tri(mat, a, b, c, inside);
      out.tri(mat, a, c, d, inside);
    }
  }
  const cap = (cap: Cap | undefined, idx: number, toward: number, mat: string) => {
    if (!cap || cap === 'open') return;
    const r = rings[idx]!;
    const c = centers[idx]!;
    const inside = lerp(c, centers[toward]!, 0.5);
    let tip: V3 = c;
    if (cap !== 'flat') {
      if ('apex' in cap) tip = at(fr, cap.apex[0] * m, cap.apex[1], cap.apex[2]);
      else tip = add(c, mul(norm(sub(c, centers[toward]!)), cap.bulge));
    }
    for (let j = 0; j < r.length; j++) out.tri(mat, r[j]!, r[(j + 1) % r.length]!, tip, inside);
  };
  cap(o.start, 0, 1, matOf(0));
  cap(o.end, rings.length - 1, rings.length - 2, matOf(rings.length - 2));
}

/** 凸包（點數少，用暴力法即可）。點先做極小的固定擾動，避免四點共面造成重疊三角形 */
export function hull(out: Tris, mat: string, pts: V3[]): void {
  const p = pts.map((v, i): V3 => [v[0] + Math.sin(i * 12.9898) * 1e-5, v[1] + Math.sin(i * 78.233) * 1e-5, v[2] + Math.sin(i * 37.719) * 1e-5]);
  const c = mul(p.reduce((acc, v) => add(acc, v), [0, 0, 0] as V3), 1 / p.length);
  const n = p.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const a = p[i]!, b = p[j]!, d = p[k]!;
        const nn = cross(sub(b, a), sub(d, a));
        let pos = 0, neg = 0;
        for (let q = 0; q < n && !(pos && neg); q++) {
          if (q === i || q === j || q === k) continue;
          const s = dot(nn, sub(p[q]!, a));
          if (s > 1e-12) pos++;
          else if (s < -1e-12) neg++;
        }
        if (!(pos && neg)) out.tri(mat, a, b, d, c);
      }
}

/** 以一個座標系描述的凸包點 */
export const hullIn = (out: Tris, mat: string, fr: Frame, pts: [number, number, number][], mirror = 1): void =>
  hull(out, mat, pts.map(([x, y, z]) => at(fr, x * mirror, y, z)));
