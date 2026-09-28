import { box, lowSphere, placeMesh, type Mesh, type V3 } from './Poly3D';

/**
 * 多切面（faceted low-poly）零件的共用工具：各面輕微色差、兩點之間的方條、
 * 多層截面的放樣體（大腿、小腿、手臂、軀幹），以及細節層級（LOD）標記。
 */

/** 0～1 的固定雜湊（同一個面每次都得到同一個值） */
const hash = (i: number, seed: number) => {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const mix = (a: number, b: number, t: number, k: number) => {
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round((((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * 同一材質的各面只做輕微的色差（往第二個色階混一點、亮度 ±3%），
 * 明暗交給光線（面朝左上方較亮）；不再在亮 / 暗色階之間跳動，避免出現與光線無關的條紋。
 */
export function tone(mesh: Mesh, colors: readonly number[], seed = 0): Mesh {
  const base = colors[0]!;
  const alt = colors[1] ?? base;
  mesh.faces.forEach((f, i) => {
    f.color = mix(base, alt, hash(i, seed) * 0.4, 0.97 + hash(i + 101, seed) * 0.06);
  });
  return mesh;
}

/** 兩點之間的一段方條 */
export function bar(a: V3, b: V3, w: number, h: number, colors: readonly number[], seed = 0): Mesh {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const m = placeMesh(box(w, h, len, colors[0]!), [Math.asin(-d[1] / len), Math.atan2(d[0], d[2]), 0], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  return tone(m, colors, seed);
}

/** 關節頭（低面數球） */
export const knob = (r: number, c: V3, colors: readonly number[], seed = 0, scale: V3 = [1, 1, 1]): Mesh => tone(lowSphere(r, colors[0]!, c, 5, 3, scale), colors, seed);

/** 放樣截面：高度 y、X / Z 半徑、截面中心的 X / Z 偏移 */
export interface Ring {
  y: number;
  rx: number;
  rz: number;
  cx?: number;
  cz?: number;
}

/**
 * 放樣體：多層 n 邊形截面連成一個凸多面體（輪廓需為外凸，例如大腿 → 膝 → 小腿肚 → 腳踝）。
 * 相鄰截面之間再插一層，每個四邊形切成兩個三角形（對角線交錯），頂點半徑有 ±3% 的固定起伏：
 * 表面由許多小三角面組成，明暗隨面的朝向自然變化（low-poly 的切面感）。
 */
export function loft(rings: readonly Ring[], sides: number, colors: readonly number[], seed = 0, phase = Math.PI / sides): Mesh {
  const all: Ring[] = [];
  rings.forEach((r, k) => {
    const next = rings[k + 1];
    all.push(r);
    if (next) {
      const lerp = (a: number | undefined, b: number | undefined) => ((a ?? 0) + (b ?? 0)) / 2;
      all.push({ y: (r.y + next.y) / 2, rx: (r.rx + next.rx) / 2, rz: (r.rz + next.rz) / 2, cx: lerp(r.cx, next.cx), cz: lerp(r.cz, next.cz) });
    }
  });
  const verts: V3[] = [];
  all.forEach((r, k) => {
    // 頭尾兩層不起伏，接縫才對得起來
    const edge = k === 0 || k === all.length - 1;
    for (let i = 0; i < sides; i++) {
      const a = phase + (i / sides) * Math.PI * 2 + (k % 2 ? Math.PI / sides / 2 : 0);
      const j = edge ? 1 : 0.97 + hash(k * 31 + i, seed + 7) * 0.06;
      verts.push([(r.cx ?? 0) + Math.cos(a) * r.rx * j, r.y, (r.cz ?? 0) + Math.sin(a) * r.rz * j]);
    }
  });
  const faces: Mesh['faces'] = [];
  for (let k = 0; k < all.length - 1; k++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const [a, b, c, d] = [k * sides + i, k * sides + j, (k + 1) * sides + j, (k + 1) * sides + i];
      if ((i + k) % 2) faces.push({ idx: [a, b, c], color: colors[0]! }, { idx: [a, c, d], color: colors[0]! });
      else faces.push({ idx: [a, b, d], color: colors[0]! }, { idx: [b, c, d], color: colors[0]! });
    }
  }
  faces.push({ idx: Array.from({ length: sides }, (_, i) => i), color: colors[0]! });
  faces.push({ idx: Array.from({ length: sides }, (_, i) => (all.length - 1) * sides + i), color: colors[0]! });
  // 與 prism 相同：讓每個面的頂點順序朝外
  const c = verts.reduce<V3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map((x) => x / verts.length) as V3;
  for (const f of faces) {
    const [a, b, d] = [verts[f.idx[0]!]!, verts[f.idx[1]!]!, verts[f.idx[2]!]!];
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const fc = f.idx.reduce<V3>((s, i) => [s[0] + verts[i]![0], s[1] + verts[i]![1], s[2] + verts[i]![2]], [0, 0, 0]).map((x) => x / f.idx.length) as V3;
    if (n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2]) < 0) f.idx.reverse();
  }
  return tone({ verts, faces }, colors, seed);
}

/**
 * 細分成小三角面：每個面從中心往外微微隆起（bump × 面的大小），切成扇形三角形，
 * 各三角形保留原本的顏色、亮度再有 ±3% 的差異。用在方塊、稜柱、低面數球（臉、肩甲、靴子）。
 */
export function facetize(mesh: Mesh, bump = 0.12, seed = 0): Mesh {
  const verts: V3[] = mesh.verts.map((v) => [v[0], v[1], v[2]]);
  const faces: Mesh['faces'] = [];
  mesh.faces.forEach((f, fi) => {
    const pts = f.idx.map((i) => mesh.verts[i]!);
    const c = pts.reduce<V3>((s, v) => [s[0] + v[0] / pts.length, s[1] + v[1] / pts.length, s[2] + v[2] / pts.length], [0, 0, 0]);
    if (pts.length < 3) return;
    const [a, b, d] = [pts[0]!, pts[1]!, pts[2]!];
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const size = pts.reduce((s, p) => s + Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]), 0) / pts.length;
    const h = size * bump * (0.7 + hash(fi, seed) * 0.6);
    const apex = verts.push([c[0] + (n[0] / nl) * h, c[1] + (n[1] / nl) * h, c[2] + (n[2] / nl) * h]) - 1;
    f.idx.forEach((i, k) => {
      const j = f.idx[(k + 1) % f.idx.length]!;
      faces.push({ idx: [i, j, apex], color: mix(f.color, f.color, 0, 0.97 + hash(fi * 13 + k, seed + 3) * 0.06) });
    });
  });
  const out: Mesh = { verts, faces };
  if (mesh.lod) out.lod = mesh.lod;
  return out;
}

/** 標記細節層級：1 = 中距離以上才畫、2 = 放大時才畫 */
export function detail(level: 1 | 2, meshes: Mesh[]): Mesh[] {
  for (const m of meshes) m.lod = level;
  return meshes;
}
