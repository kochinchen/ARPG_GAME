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
    f.base = base;
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
      faces.push({ idx: [i, j, apex], color: mix(f.color, f.color, 0, 0.97 + hash(fi * 13 + k, seed + 3) * 0.06), base: f.base ?? f.color });
    });
  });
  const out: Mesh = { verts, faces };
  if (mesh.lod) out.lod = mesh.lod;
  return out;
}

export interface RefineOptions {
  /** 三角形的最長邊上限（模型單位） */
  size: number;
  /** 平面上新頂點的起伏：± bump × 邊長 */
  bump?: number;
  /** 起伏的絕對上限（薄的零件，例如劍身，不能穿到另一面） */
  maxBump?: number;
  /** 每個小三角形的亮度差異：±vary（預設 3%） */
  vary?: number;
  seed?: number;
  /** 沒有放大時畫的粗網格（省略 = 加密前的網格） */
  coarse?: Mesh;
}

/**
 * 加密成小三角面（與 AI 版女主角相同的密集構面）：每個面各自切成網格——四邊形切成 nu × nv 格（細長的面只沿長邊切），
 * 三角形切成 n 層的三角網，其他多邊形從中心切成扇形再細分；面內沒有點可以起伏時（太小或太細長）不切。邊上的新頂點留在原來的直線上（相鄰的面即使切法不同也不會裂開，
 * 輪廓保持銳利）；面內的新頂點沿法線微微起伏，明暗隨面的朝向細碎變化。每個小三角形的亮度再有 ±vary 的差異。
 */
export function refine(mesh: Mesh, o: RefineOptions): Mesh {
  const bump = o.bump ?? 0.1;
  const maxBump = o.maxBump ?? Infinity;
  const seed = o.seed ?? 0;
  const vary = o.vary ?? 0.03;
  const verts: V3[] = mesh.verts.map((v) => [v[0], v[1], v[2]]);
  const faces: Mesh['faces'] = [];
  const len = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let tri = 0;
  /** 一格網格：grid[i][j] 的點（i、j 在邊上的點不起伏），切成兩個三角形 */
  const emitGrid = (grid: V3[][], interior: (i: number, j: number) => boolean, n: V3, color: number, base: number, triangular: boolean) => {
    const id = grid.map((row, i) =>
      row.map((p, j) => {
        if (!interior(i, j)) return verts.push(p) - 1;
        const h = Math.max(-maxBump, Math.min(maxBump, (hash(verts.length, seed + 17) * 2 - 1) * bump * o.size));
        return verts.push([p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h]) - 1;
      }),
    );
    const push = (a: number, b: number, c: number) => faces.push({ idx: [a, b, c], color: mix(color, color, 0, 1 - vary + hash(tri++, seed + 29) * vary * 2), base });
    for (let i = 0; i < grid.length - 1; i++) {
      const r0 = id[i]!;
      const r1 = id[i + 1]!;
      if (triangular) {
        // 第 i 層有 i + 1 個點、第 i + 1 層有 i + 2 個點
        for (let j = 0; j <= i; j++) {
          push(r0[j]!, r1[j]!, r1[j + 1]!);
          if (j < i) push(r0[j]!, r1[j + 1]!, r0[j + 1]!);
        }
      } else {
        // 列沿 p0 → p3、行沿 p0 → p1：與原本的面同樣朝外的順序是 (列, 行) 逆著走
        for (let j = 0; j < r0.length - 1; j++) {
          if ((i + j) % 2) push(r0[j]!, r1[j + 1]!, r1[j]!), push(r0[j]!, r0[j + 1]!, r1[j + 1]!);
          else push(r0[j]!, r0[j + 1]!, r1[j]!), push(r0[j + 1]!, r1[j + 1]!, r1[j]!);
        }
      }
    }
  };
  const subdivideTri = (a: V3, b: V3, c: V3, n: V3, color: number, base: number) => {
    // 少於 3 層時面內沒有點可以起伏，不切（省下看不出差別的三角形）
    const layers = Math.ceil(Math.max(len(a, b), len(b, c), len(c, a)) / o.size);
    const k = layers < 3 ? 1 : layers;
    // 頂點 a 在第 0 層；第 i 層從 ab 上的點走到 ac 上的點
    const grid: V3[][] = [];
    for (let i = 0; i <= k; i++) {
      const p = lerp(a, b, i / k);
      const q = lerp(a, c, i / k);
      grid.push(Array.from({ length: i + 1 }, (_, j) => (i === 0 ? a : lerp(p, q, j / i))));
    }
    // 三條邊上的點不起伏
    emitGrid(grid, (i, j) => i > 0 && i < k && j > 0 && j < i, n, color, base, true);
  };
  for (const f of mesh.faces) {
    const pts = f.idx.map((i) => mesh.verts[i]!);
    if (pts.length < 3) continue;
    const base = f.base ?? f.color;
    const u: V3 = [pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1], pts[1]![2] - pts[0]![2]];
    const v: V3 = [pts[2]![0] - pts[0]![0], pts[2]![1] - pts[0]![1], pts[2]![2] - pts[0]![2]];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const cl = Math.hypot(c[0]!, c[1]!, c[2]!) || 1;
    const n: V3 = [c[0]! / cl, c[1]! / cl, c[2]! / cl];
    if (pts.length === 3) subdivideTri(pts[0]!, pts[1]!, pts[2]!, n, f.color, base);
    else if (pts.length === 4) {
      const [p0, p1, p2, p3] = pts as [V3, V3, V3, V3];
      let nu = Math.max(1, Math.ceil(Math.max(len(p0, p1), len(p3, p2)) / o.size));
      let nv = Math.max(1, Math.ceil(Math.max(len(p0, p3), len(p1, p2)) / o.size));
      // 細長的面（某個方向只有 1 格）面內沒有點可以起伏，不切
      if (nu < 2 || nv < 2) nu = nv = 1;
      const grid = Array.from({ length: nv + 1 }, (_, i) => Array.from({ length: nu + 1 }, (_, j) => lerp(lerp(p0, p3, i / nv), lerp(p1, p2, i / nv), j / nu)));
      emitGrid(grid, (i, j) => i > 0 && i < nv && j > 0 && j < nu, n, f.color, base, false);
    } else {
      // 多邊形：從中心切成扇形（相鄰兩片共用的線上的點也不起伏，才不會裂開）
      const ctr = pts.reduce<V3>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
      pts.forEach((p, k) => subdivideTri(ctr, p, pts[(k + 1) % pts.length]!, n, f.color, base));
    }
  }
  const out: Mesh = { verts, faces, coarse: o.coarse ?? mesh.coarse ?? mesh };
  if (mesh.lod) out.lod = mesh.lod;
  return out;
}

/** 標記細節層級：1 = 中距離以上才畫、2 = 放大時才畫 */
export function detail(level: 1 | 2, meshes: Mesh[]): Mesh[] {
  for (const m of meshes) m.lod = level;
  return meshes;
}

/**
 * 加密：每個面先切成三角形，再把每個三角形從三邊中點切成四個（levels 次）。
 * rough：新頂點沿隨機方向偏移（× 邊長）的比例，石頭、粗木頭的鑿痕感；0 = 保持平面。
 * 之後通常再 facetize，表面就是許多小三角面（加密後的面數 × 4^levels）。
 */
export function subdivide(mesh: Mesh, levels = 1, rough = 0, seed = 0): Mesh {
  const verts: V3[] = mesh.verts.map((v) => [v[0], v[1], v[2]]);
  let faces: Mesh['faces'] = [];
  for (const f of mesh.faces) for (let i = 1; i < f.idx.length - 1; i++) faces.push({ ...f, idx: [f.idx[0]!, f.idx[i]!, f.idx[i + 1]!] });
  for (let level = 0; level < levels; level++) {
    const mid = new Map<string, number>();
    const at = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let i = mid.get(key);
      if (i === undefined) {
        const [p, q] = [verts[a]!, verts[b]!];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        const n = verts.length;
        const j = (k: number) => (hash(n * 3 + k, seed + level * 17) - 0.5) * 2 * rough * len;
        i = verts.push([(p[0] + q[0]) / 2 + j(0), (p[1] + q[1]) / 2 + j(1), (p[2] + q[2]) / 2 + j(2)]) - 1;
        mid.set(key, i);
      }
      return i;
    };
    const next: Mesh['faces'] = [];
    for (const f of faces) {
      const [a, b, c] = f.idx as [number, number, number];
      const [ab, bc, ca] = [at(a, b), at(b, c), at(c, a)];
      for (const idx of [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ])
        next.push({ ...f, idx });
    }
    faces = next;
  }
  const out: Mesh = { verts, faces };
  if (mesh.lod) out.lod = mesh.lod;
  return out;
}
