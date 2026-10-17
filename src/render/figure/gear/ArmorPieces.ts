import { facetize, loft, tone, type Ring } from '../Facets';
import { box, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { BLACK_STEEL, chain, gem, taper, type Tones } from '../weapons/WeaponParts';

/**
 * 防具的多面體零件：頭盔（整頂）、胸甲、腹甲、肩甲、垂甲、靴子（靴口 / 靴筒 / 靴子）。
 * 座標依女主角各關節的空間設計（見 Heroine.ts）；造型參數由 ArmorLooks 依階級與詞綴決定。
 */

export const HIDE: Tones = [0x8a5c3c, 0x7a4f33, 0x64402a, 0x845838];
export const HIDE_DARK: Tones = [0x5a3a28, 0x4c3122, 0x3c271b, 0x553726];
export const CLOTH: Tones = [0x9c8a66, 0x8a7a5a, 0x6e6046, 0x958462];
const SOLE: Tones = [0x2a201a, 0x221a15];
const SLIT = 0x0c0a0a;

const F = (m: Mesh, seed = 0, bump = 0.1) => facetize(m, bump, seed);
const t = (m: Mesh, c: Tones, s = 0) => tone(m, c, s);
const spike = (a: V3, dir: V3, len: number, r: number, colors: Tones, seed = 0) =>
  taper(a, [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len], [r, r], [0.04, 0.04], colors, 5, seed, 0.3);
const glowBox = (w: number, h: number, d: number, color: number, c: V3) => t(box(w, h, d, color, c), [color, 0xffffff]);

// ─────────────────────────── 頭盔 ───────────────────────────

export interface HelmetSpec {
  mat: Tones;
  trim: Tones;
  /** cap = 帽子、open = 開放式（露臉）、closed = 全罩面甲 */
  style: 'cap' | 'open' | 'closed';
  height?: number;
  nasal?: boolean;
  cheeks?: boolean;
  crest?: Tones | null;
  plume?: Tones;
  horns?: { kind: 'up' | 'ram'; size: number; colors: Tones };
  crown?: Tones;
  wings?: Tones;
  gem?: number | null;
  runes?: number;
  eyes?: number;
  spikes?: number;
  spikeColors?: Tones;
}

/** 整頂頭盔（原點 = 頭帶中心，半徑約 5.5） */
export function helmetMeshes(s: HelmetSpec): Mesh[] {
  const out: Mesh[] = [];
  const h = s.height ?? 1;
  const top: Ring[] =
    s.style === 'cap'
      ? [{ y: 0, rx: 5.3, rz: 5.6 }, { y: 2.4 * h, rx: 4.9, rz: 5.2 }, { y: 4 * h, rx: 3.6, rz: 3.9 }, { y: 4.9 * h, rx: 1.4, rz: 1.5 }]
      : [{ y: 0, rx: 5.2, rz: 5.5 }, { y: 2.6 * h, rx: 5, rz: 5.3 }, { y: 4.6 * h, rx: 4, rz: 4.3 }, { y: 6 * h, rx: 2.3, rz: 2.5 }, { y: 6.6 * h, rx: 0.5, rz: 0.6 }];
  const rings = s.style === 'closed' ? [{ y: -5.4, rx: 4.3, rz: 4.7 }, { y: -2.6, rx: 5, rz: 5.4 }, ...top] : top;
  out.push(loft(rings, 14, s.mat, 1));
  out.push(F(t(prism(16, -0.5, 0.9, [5.55, 5.85], [5.5, 5.8], s.trim[0]!), s.trim, 2), 2, 0.05));
  if (s.style === 'closed') {
    out.push(box(7.2, 0.75, 1.2, SLIT, [0, -1.2, 5]));
    for (const x of [-1.6, -0.5, 0.6, 1.7]) out.push(box(0.35, 1.1, 1, SLIT, [x, -3.6, 4.5]));
    out.push(F(t(box(1, 5.4, 0.8, s.trim[0]!, [0, -2.6, 5.25]), s.trim, 3), 3));
    if (s.eyes) for (const x of [-1.8, 1.8]) out.push(glowBox(1.4, 0.55, 0.6, s.eyes, [x, -1.2, 5.3]));
  }
  if (s.style === 'open' && s.nasal) out.push(F(t(box(0.9, 4, 0.8, s.mat[0]!, [0, -1.6, 5.5]), s.mat, 4), 4));
  if (s.style === 'open' && s.cheeks) for (const x of [-1, 1]) out.push(F(t(placeMesh(box(1, 4.4, 3.6, s.mat[0]!), [0, x * 0.35, 0], [x * 4.6, -2.2, 2.2]), s.mat, 5), 5));
  if (s.crest) out.push(...chain([[0, 6.2 * h, -2.4], [0, 7.6 * h, 0], [0, 7 * h, 3]], [0.9, 0.5], [0.3, 0.2], s.crest));
  if (s.plume) out.push(...chain([[0, 6.4 * h, 0], [0, 9, -2.2], [0, 9.6, -5.6], [0, 8, -8]], [0.9, 1.4], [0.2, 0.4], s.plume));
  if (s.horns) {
    const k = s.horns.size;
    for (const x of [-1, 1]) {
      const pts: V3[] =
        s.horns.kind === 'ram'
          ? [[x * 4.6, 2.4, 0], [x * 6.4, 3.4, -1], [x * 7.4, 1.6, -2.4], [x * 6.6, -0.6, -1.6], [x * 5.6, -1, 0]]
          : [[x * 4.4, 3.2, 0], [x * 6.2 * k, 4.6 * k, 0], [x * 7.2 * k, 7.4 * k, -0.6], [x * 6.8 * k, 10 * k, -1.2]];
      out.push(...chain(pts, [1.1 * k, 1.1 * k], [0.12, 0.12], s.horns.colors, false));
    }
  }
  if (s.crown) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.08 + (i / 8) * Math.PI * 0.84;
      const x = -Math.cos(a) * 5.6;
      const z = Math.sin(a) * 5.9;
      out.push(taper([x, 0.6, z], [x * 1.04, i % 2 ? 3 : 4.4, z * 1.04], [0.55, 0.3], [0.05, 0.05], s.crown, 4, i, 0.3));
    }
  }
  if (s.wings) {
    for (const x of [-1, 1]) {
      out.push(taper([x * 5.2, 1.8, -0.5], [x * 7.6, 5.4, -3.4], [0.25, 1.6], [0.05, 0.2], s.wings, 4, 1, 0));
      out.push(taper([x * 5.2, 1, -0.8], [x * 8, 3, -4], [0.25, 1.2], [0.05, 0.15], s.wings, 4, 2, 0));
    }
  }
  if (s.gem) out.push(gem(1, [0, 1.6, 5.7], s.gem));
  if (s.runes) for (const x of [-3.4, 3.4]) out.push(glowBox(0.7, 0.7, 0.5, s.runes, [x, 0.2, 4.6]));
  const n = s.spikes ?? 0;
  for (let i = 0; i < n; i++) {
    const a = -0.9 + (i / Math.max(1, n - 1)) * 1.8;
    out.push(spike([Math.sin(a) * 3.6, 5 * h, Math.cos(a) * 2.6], [Math.sin(a) * 0.4, 1, Math.cos(a) * 0.4], 2.4, 0.55, s.spikeColors ?? BLACK_STEEL, i));
  }
  return out;
}

/** 頭盔戴在頭上（head 關節）：縮放與位置 */
export const placeHelmet = (meshes: Mesh[]): Mesh[] => scaleMeshes(meshes, 0.88, [0, 6.1, -0.5]);

// ─────────────────────────── 盔甲 ───────────────────────────

export interface ArmorSpec {
  mat: Tones;
  trim: Tones;
  style: 'cloth' | 'chain' | 'plate';
  pauldron: number;
  pauldronMat?: Tones;
  trimPauldron?: Tones;
  carapace?: boolean;
  ribs?: Tones;
  spikes?: boolean;
  spikeColors?: Tones;
  tassets?: boolean;
  emblem?: number | null;
  runes?: number;
}

/** 胸甲（chest 關節）：包住胸口的外殼、領口、中央稜線、甲殼、肋條、紋章、符文 */
export function chestPiece(s: ArmorSpec): Mesh[] {
  const out: Mesh[] = [];
  out.push(
    loft(
      [
        { y: -0.4, rx: 4.5, rz: 3.5 },
        { y: 2.5, rx: 5.4, rz: 4.3, cz: 0.3 },
        { y: 5.3, rx: 5.95, rz: 5, cz: 0.75 },
        { y: 8.2, rx: 6.25, rz: 4.2, cz: 0.1 },
        { y: 10, rx: 4.6, rz: 3.3, cz: -0.3 },
        { y: 10.8, rx: 3.4, rz: 2.7, cz: -0.3 },
      ],
      s.style === 'chain' ? 16 : 12,
      s.mat,
      1,
    ),
  );
  out.push(F(t(prism(10, 9.4, 11.2, [3.5, 3], [3.8, 3.2], s.trim[0]!, [0, 0, -0.3]), s.trim, 2), 2, 0.06));
  if (s.style === 'plate' && !s.carapace) out.push(...chain([[0, 0.4, 4], [0, 5.4, 5.8], [0, 9.2, 3.4]], [0.45, 0.35], [0.35, 0.3], s.trim, false));
  if (s.carapace) {
    [0.6, 3.2, 5.8].forEach((y, i) => out.push(F(t(prism(12, y, y + 2.2, [4.9 + i * 0.5, 3.9 + i * 0.4], [5.4 + i * 0.4, 4.4 + i * 0.3], s.mat[1]!, [0, 0, 0.4 + i * 0.15]), s.mat, 7 + i), 7 + i, 0.14)));
  }
  if (s.ribs) for (const y of [2.6, 4.6, 6.6]) for (const x of [-1, 1]) out.push(...chain([[x * 0.4, y + 0.5, 5.4], [x * 3, y, 4.9], [x * 5.3, y - 1, 2.6]], [0.5, 0.45], [0.3, 0.25], s.ribs, false));
  if (s.emblem) out.push(gem(1.1, [0, 6.2, 5.9], s.emblem, [1, 1.2, 0.6]));
  if (s.runes) for (const [x, y, z] of [[-2.8, 8, 4.7], [2.8, 8, 4.7], [-2.7, 2.6, 4.4], [2.7, 2.6, 4.4]] as V3[]) out.push(glowBox(0.6, 0.6, 0.5, s.runes, [x, y, z]));
  return out;
}

/** 腹部（torso 關節）：蓋住露出的腰；板甲是三片橫向甲片 */
export function waistPiece(s: ArmorSpec): Mesh[] {
  if (s.style === 'plate') {
    return [0.2, 2.2, 4.2].map((y, i) =>
      F(t(prism(12, y, y + 2.1, [4.9 - i * 0.45, 3.75 - i * 0.25], [4.6 - i * 0.2, 3.55 - i * 0.1], s.mat[0]!, [0, 0, 0.15]), s.mat, 30 + i), 30 + i, 0.06),
    );
  }
  const lower: Ring = { y: -0.2, rx: 5.25, rz: 3.95 };
  const mid: Ring = { y: 3, rx: 4.1, rz: 3.3, cz: 0.1 };
  const upper: Ring = { y: 6.6, rx: 4.6, rz: 3.5 };
  return [loft([lower, mid], 10, s.mat, 2), loft([mid, upper], 10, s.mat, 3)];
}

/** 肩甲（upperArm 關節）：沿用原本三片疊甲的位置，大小、材質、金邊、尖刺依階級 */
export function shoulderPiece(s: ArmorSpec, side: 1 | -1): Mesh[] {
  const p = s.pauldron;
  if (!p) return [];
  const pm = s.pauldronMat ?? s.mat;
  const plate = (r0: number, r1: number, hh: number, x: number, y: number, tilt: number, seed: number) =>
    F(t(placeMesh(prism(8, 0, -hh, [r0, r0 * 0.9], [r1, r1 * 0.9], pm[0]!, [0, 0, 0], 0.3), [0, 0, -tilt * side], [x * side, y, 0]), pm, seed), seed, 0.16);
  const k = 0.75 + p * 0.3;
  const out = [plate(2.5 * k, 3.2 * k, 2.2 * k, 0.7, 1.6, 0.35, 1), plate(2.6 * k, 3 * k, 1.8 * k, 1.2, -0.3, 0.5, 2)];
  if (p > 0.9) out.push(plate(2.3 * k, 2.6 * k, 1.6 * k, 1.6, -2, 0.62, 3));
  if (s.trimPauldron) out.push(t(placeMesh(prism(8, 0, -0.45, [3.25 * k, 2.95 * k], [3.3 * k, 3 * k], s.trimPauldron[0]!, [0, 0, 0], 0.3), [0, 0, -0.35 * side], [0.7 * side, 1.6 - 2.2 * k, 0]), s.trimPauldron));
  if (s.spikes) for (let i = 0; i < 3; i++) out.push(spike([side * (1 + i * 0.9), 2.4 * k - i * 0.4, -0.8 + i * 0.8], [side * 0.45, 1, 0], 1.6 + p * 0.7, 0.42, s.spikeColors ?? BLACK_STEEL, i));
  return out;
}

/** 垂甲（root 關節）：大腿前方兩片 */
export const tassetPiece = (s: ArmorSpec): Mesh[] =>
  s.tassets ? ([-1, 1] as const).map((x) => F(t(placeMesh(box(3, 4.6, 0.7, s.mat[0]!), [-0.12, 0, x * 0.12], [x * 2.9, -1.6, 4.6]), s.mat, 40), 40, 0.12)) : [];

// ─────────────────────────── 靴子 ───────────────────────────

export interface BootSpec {
  mat: Tones;
  toe?: Tones;
  shin?: Tones;
  knee?: Tones;
  cuff?: Tones;
  straps?: boolean;
  spikes?: number;
  spikeColors?: Tones;
  wings?: Tones;
  gem?: number | null;
  runes?: number;
}

/** 靴口（thigh 關節，膝上） */
export const bootCuffPiece = (s: BootSpec): Mesh[] => [
  loft([{ y: -9.4, rx: 2.6, rz: 2.7, cz: 0.2 }, { y: -13.2, rx: 2.2, rz: 2.35 }], 9, s.mat, 1),
  F(t(prism(9, -9.2, -10.1, [2.75, 2.85], [2.7, 2.8], (s.cuff ?? HIDE_DARK)[0]!, [0, 0, 0.2]), s.cuff ?? HIDE_DARK, 2), 2, 0.12),
];

/** 靴筒（shin 關節）：護膝、脛甲、綁帶、尖刺、腳踝的翅膀 */
export function bootShinPiece(s: BootSpec): Mesh[] {
  const out = [loft([{ y: 0.6, rx: 2.2, rz: 2.35 }, { y: -4, rx: 2.35, rz: 2.45, cz: -0.15 }, { y: -10.4, rx: 1.75, rz: 1.85 }, { y: -12.6, rx: 1.85, rz: 2 }], 9, s.mat, 3)];
  if (s.knee) out.push(F(t(placeMesh(prism(5, 0.8, -2.8, [2.1, 1.1], [1.5, 0.9], s.knee[0]!), [-0.12, 0, 0], [0, 0, 1.9]), s.knee, 4), 4, 0.14));
  if (s.shin) out.push(F(t(placeMesh(prism(4, -3, -10, [1.4, 0.6], [1, 0.5], s.shin[0]!, [0, 0, 0], 0), [0.06, 0, 0], [0, 0, 2.2]), s.shin, 5), 5, 0.14));
  if (s.straps) for (const y of [-5.6, -8.6]) out.push(F(t(prism(9, y, y - 0.6, [2.4, 2.5], [2.35, 2.45], HIDE_DARK[0]!, [0, 0, -0.1]), HIDE_DARK, 6), 6, 0.1));
  for (let i = 0; i < (s.spikes ?? 0); i++) out.push(spike([0, -2.6 - i * 2.6, 2.3], [0, 0.25, 1], 1.5, 0.38, s.spikeColors ?? BLACK_STEEL, i));
  if (s.wings) {
    for (const x of [-1, 1]) {
      out.push(taper([x * 1.8, -10.2, -0.8], [x * 3.4, -5.6, -5.2], [0.2, 1.3], [0.05, 0.2], s.wings, 4, 1, 0));
      out.push(taper([x * 1.8, -11, -0.8], [x * 3.6, -8.4, -5.8], [0.2, 1], [0.05, 0.15], s.wings, 4, 2, 0));
    }
  }
  if (s.gem) out.push(gem(0.6, [0, -1.2, 2.9], s.gem));
  if (s.runes) for (const y of [-4.5, -7]) out.push(glowBox(0.5, 0.6, 0.5, s.runes, [0, y, 2.75]));
  return out;
}

/** 靴子（foot 關節）：靴跟、腳背、鞋頭、靴底 */
export function bootFootPiece(s: BootSpec): Mesh[] {
  const toe = s.toe ?? s.mat;
  return [
    F(t(box(3.2, 2.3, 2.8, s.mat[0]!, [0, -1.3, -0.6]), s.mat, 1), 1, 0.14),
    F(t(placeMesh(box(3.3, 1.9, 4, s.mat[1]!), [0.12, 0, 0], [0, -1.35, 2]), s.mat, 2), 2, 0.14),
    F(t(placeMesh(prism(5, 0, 2.2, [1.6, 1], [0.9, 0.6], toe[0]!, [0, 0, 0], 0.3), [Math.PI / 2, 0, 0], [0, -1.7, 3.9]), toe, 3), 3, 0.14),
    t(box(3.5, 0.7, 7.6, SOLE[0]!, [0, -2.55, 1.4]), SOLE),
  ];
}

export function scaleMeshes(meshes: readonly Mesh[], s: number, [ox, oy, oz]: V3): Mesh[] {
  return meshes.map((m) => ({ ...m, verts: m.verts.map(([x, y, z]) => [x * s + ox, y * s + oy, z * s + oz] as V3) }));
}
