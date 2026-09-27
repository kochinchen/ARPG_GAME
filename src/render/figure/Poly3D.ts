/**
 * 角色用的迷你 3D：以多面體（稜柱、方塊、低面數球）組成，逐幀投影成 45° 等角視角。
 * 只做平面著色（每個面一個顏色，依光線明暗），不畫邊線。所有網格都是凸多面體，
 * 用「背面剔除 + 由遠到近排序」即可正確遮擋。
 */
export type V3 = [number, number, number];

export interface Face {
  /** 頂點索引（逆時針朝外） */
  idx: number[];
  color: number;
}

export interface Mesh {
  verts: V3[];
  faces: Face[];
}

// ─────────────────────────── 向量 / 矩陣 ───────────────────────────

export type M3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: M3, b: M3): M3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function apply(m: M3, v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

export const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
export const rotY = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
export const rotZ = (a: number): M3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];

/** 關節旋轉：先轉身（Y）、再前後（X）、最後左右（Z） */
export function jointRotation([x, y, z]: V3): M3 {
  return mul(mul(rotY(y), rotX(x)), rotZ(z));
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const normalize = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export function faceNormal(verts: readonly V3[], idx: readonly number[]): V3 {
  const a = verts[idx[0]!]!;
  return cross(sub(verts[idx[1]!]!, a), sub(verts[idx[2]!]!, a));
}

// ─────────────────────────── 網格 ───────────────────────────

/** 讓每個面的頂點順序朝外（凸多面體：法線與「面中心 − 網格中心」同向） */
function orient(mesh: Mesh): Mesh {
  const c = mesh.verts.reduce<V3>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map((x) => x / mesh.verts.length) as V3;
  for (const f of mesh.faces) {
    const fc = f.idx.reduce<V3>((s, i) => [s[0] + mesh.verts[i]![0], s[1] + mesh.verts[i]![1], s[2] + mesh.verts[i]![2]], [0, 0, 0]);
    const center: V3 = [fc[0] / f.idx.length, fc[1] / f.idx.length, fc[2] / f.idx.length];
    if (dot(faceNormal(mesh.verts, f.idx), sub(center, c)) < 0) f.idx.reverse();
  }
  return mesh;
}

/**
 * 稜柱 / 平截頭體：n 邊形截面，從 y0（半徑 r0）到 y1（半徑 r1），可沿 X、Z 不同半徑（橢圓截面）。
 */
export function prism(n: number, y0: number, y1: number, r0: [number, number], r1: [number, number], color: number, offset: V3 = [0, 0, 0], phase = Math.PI / n): Mesh {
  const verts: V3[] = [];
  for (const [y, [rx, rz]] of [
    [y0, r0],
    [y1, r1],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      verts.push([offset[0] + Math.cos(a) * rx, offset[1] + y, offset[2] + Math.sin(a) * rz]);
    }
  }
  const faces: Face[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({ idx: [i, j, n + j, n + i], color });
  }
  faces.push({ idx: Array.from({ length: n }, (_, i) => i), color });
  faces.push({ idx: Array.from({ length: n }, (_, i) => n + i), color });
  return orient({ verts, faces });
}

/** 方塊：中心 c、寬 w（X）高 h（Y）深 d（Z） */
export function box(w: number, h: number, d: number, color: number, c: V3 = [0, 0, 0]): Mesh {
  const [x, y, z] = c;
  const verts: V3[] = [];
  for (const dy of [-h / 2, h / 2]) for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const) verts.push([x + dx, y + dy, z + dz]);
  const faces: Face[] = [
    { idx: [0, 1, 2, 3], color },
    { idx: [4, 5, 6, 7], color },
    { idx: [0, 1, 5, 4], color },
    { idx: [1, 2, 6, 5], color },
    { idx: [2, 3, 7, 6], color },
    { idx: [3, 0, 4, 7], color },
  ];
  return orient({ verts, faces });
}

/**
 * 低面數球（經緯切割）：lon 條經線、lat 層緯度；scale 可以把球壓扁或拉長。
 * keep：只保留部分面（例如頭髮只要頭頂與後腦）。
 */
export function lowSphere(r: number, color: number, c: V3 = [0, 0, 0], lon = 8, lat = 5, scale: V3 = [1, 1, 1], keep?: (center: V3) => boolean): Mesh {
  const verts: V3[] = [[c[0], c[1] + r * scale[1], c[2]]];
  for (let j = 1; j < lat; j++) {
    const t = (j / lat) * Math.PI;
    for (let i = 0; i < lon; i++) {
      const a = (i / lon) * Math.PI * 2;
      verts.push([c[0] + Math.sin(t) * Math.cos(a) * r * scale[0], c[1] + Math.cos(t) * r * scale[1], c[2] + Math.sin(t) * Math.sin(a) * r * scale[2]]);
    }
  }
  const bottom = verts.length;
  verts.push([c[0], c[1] - r * scale[1], c[2]]);
  const ring = (j: number, i: number) => 1 + (j - 1) * lon + (i % lon);
  const faces: Face[] = [];
  for (let i = 0; i < lon; i++) {
    faces.push({ idx: [0, ring(1, i), ring(1, i + 1)], color });
    for (let j = 1; j < lat - 1; j++) faces.push({ idx: [ring(j, i), ring(j + 1, i), ring(j + 1, i + 1), ring(j, i + 1)], color });
    faces.push({ idx: [bottom, ring(lat - 1, i + 1), ring(lat - 1, i)], color });
  }
  const mesh = orient({ verts, faces });
  if (keep) {
    mesh.faces = mesh.faces.filter((f) => {
      const s = f.idx.reduce<V3>((a, i) => [a[0] + verts[i]![0], a[1] + verts[i]![1], a[2] + verts[i]![2]], [0, 0, 0]);
      return keep([s[0] / f.idx.length - c[0], s[1] / f.idx.length - c[1], s[2] / f.idx.length - c[2]]);
    });
  }
  return mesh;
}

/** 旋轉（先 X 再 Z）並平移一個網格：用來擺放傾斜的零件（弓臂、斧頭、王冠的尖刺） */
export function placeMesh(mesh: Mesh, rotation: V3, offset: V3): Mesh {
  const m = jointRotation(rotation);
  return {
    verts: mesh.verts.map((v) => {
      const r = apply(m, v);
      return [r[0] + offset[0], r[1] + offset[1], r[2] + offset[2]] as V3;
    }),
    faces: mesh.faces.map((f) => ({ idx: [...f.idx], color: f.color })),
  };
}
