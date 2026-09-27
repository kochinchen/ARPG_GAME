import { box, lowSphere, placeMesh, type Mesh, type V3 } from './Poly3D';

/**
 * 多切面（faceted low-poly）零件的共用工具：各面在色階之間交錯上色、兩點之間的方條、
 * 多層截面的放樣體（大腿、小腿、手臂、軀幹），以及細節層級（LOD）標記。
 */

/** 各面顏色在色階之間交錯（相鄰面不同色，看得出切面） */
export function tone(mesh: Mesh, colors: readonly number[], seed = 0): Mesh {
  mesh.faces.forEach((f, i) => {
    f.color = colors[(i * 7 + seed * 3 + (i >> 2)) % colors.length]!;
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
 * 每個面依色階交錯上色：正面、側面、陰影面自然分開。
 */
export function loft(rings: readonly Ring[], sides: number, colors: readonly number[], seed = 0, phase = Math.PI / sides): Mesh {
  const verts: V3[] = [];
  for (const r of rings) {
    for (let i = 0; i < sides; i++) {
      const a = phase + (i / sides) * Math.PI * 2;
      verts.push([(r.cx ?? 0) + Math.cos(a) * r.rx, r.y, (r.cz ?? 0) + Math.sin(a) * r.rz]);
    }
  }
  const faces: Mesh['faces'] = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      faces.push({ idx: [k * sides + i, k * sides + j, (k + 1) * sides + j, (k + 1) * sides + i], color: colors[0]! });
    }
  }
  faces.push({ idx: Array.from({ length: sides }, (_, i) => i), color: colors[0]! });
  faces.push({ idx: Array.from({ length: sides }, (_, i) => (rings.length - 1) * sides + i), color: colors[0]! });
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

/** 標記細節層級：1 = 中距離以上才畫、2 = 放大時才畫 */
export function detail(level: 1 | 2, meshes: Mesh[]): Mesh[] {
  for (const m of meshes) m.lod = level;
  return meshes;
}
