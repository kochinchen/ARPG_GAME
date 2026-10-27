import type { ArmorModel } from './ArmorAI';
import { detail, facetize, loft, refine, tone, type Ring } from '../Facets';
import { box, lowSphere, mapVerts, orient, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { BLACK_STEEL, chain, gem, taper, type Tones } from '../weapons/WeaponParts';

/**
 * 防具的多面體零件：頭盔（整頂）、胸甲、腹甲、肩甲、垂甲、靴子（靴口 / 靴筒 / 靴子）。
 * 座標依女主角各關節的空間設計（見 Heroine.ts）；造型參數由 ArmorLooks 依階級與詞綴決定。
 */

export const HIDE: Tones = [0x8a5c3c, 0x7a4f33, 0x64402a, 0x845838];
export const HIDE_DARK: Tones = [0x5a3a28, 0x4c3122, 0x3c271b, 0x553726];
export const CLOTH: Tones = [0x9c8a66, 0x8a7a5a, 0x6e6046, 0x958462];
const SLIT = 0x0c0a0a;

/** 加密成小三角面（與 AI 版女主角相同的構面感）：邊長、起伏、亮度差異 */
const FACETS = { size: 1.2, bump: 0.18, vary: 0.06 };
const dense = (m: Mesh, seed = 0): Mesh => refine(m, { ...FACETS, seed });
/** 切面的零件：放大時是加密的小三角面，沒有放大時維持原本的切面（facetize） */
const F = (m: Mesh, seed = 0, bump = 0.1) => refine(m, { ...FACETS, seed, coarse: facetize(m, bump, seed) });
const t = (m: Mesh, c: Tones, s = 0) => tone(m, c, s);
const spike = (a: V3, dir: V3, len: number, r: number, colors: Tones, seed = 0) =>
  dense(taper(a, [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len], [r, r], [0.04, 0.04], colors, 5, seed, 0.3), seed);
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
  out.push(dense(loft(rings, 14, s.mat, 1)));
  out.push(F(t(prism(16, -0.5, 0.9, [5.55, 5.85], [5.5, 5.8], s.trim[0]!), s.trim, 2), 2, 0.05));
  if (s.style === 'closed') {
    out.push(box(7.2, 0.75, 1.2, SLIT, [0, -1.2, 5]));
    for (const x of [-1.6, -0.5, 0.6, 1.7]) out.push(box(0.35, 1.1, 1, SLIT, [x, -3.6, 4.5]));
    out.push(F(t(box(1, 5.4, 0.8, s.trim[0]!, [0, -2.6, 5.25]), s.trim, 3), 3));
    if (s.eyes) for (const x of [-1.8, 1.8]) out.push(glowBox(1.4, 0.55, 0.6, s.eyes, [x, -1.2, 5.3]));
  }
  if (s.style === 'open' && s.nasal) out.push(F(t(box(0.9, 4, 0.8, s.mat[0]!, [0, -1.6, 5.5]), s.mat, 4), 4));
  if (s.style === 'open' && s.cheeks) for (const x of [-1, 1]) out.push(F(t(placeMesh(box(1, 4.4, 3.6, s.mat[0]!), [0, x * 0.35, 0], [x * 4.6, -2.2, 2.2]), s.mat, 5), 5));
  if (s.crest) out.push(...chain([[0, 6.2 * h, -2.4], [0, 7.6 * h, 0], [0, 7 * h, 3]], [0.9, 0.5], [0.3, 0.2], s.crest).map((m) => dense(m)));
  if (s.plume) out.push(...chain([[0, 6.4 * h, 0], [0, 9, -2.2], [0, 9.6, -5.6], [0, 8, -8]], [0.9, 1.4], [0.2, 0.4], s.plume).map((m) => dense(m)));
  if (s.horns) {
    const k = s.horns.size;
    for (const x of [-1, 1]) {
      const pts: V3[] =
        s.horns.kind === 'ram'
          ? [[x * 4.6, 2.4, 0], [x * 6.4, 3.4, -1], [x * 7.4, 1.6, -2.4], [x * 6.6, -0.6, -1.6], [x * 5.6, -1, 0]]
          : [[x * 4.4, 3.2, 0], [x * 6.2 * k, 4.6 * k, 0], [x * 7.2 * k, 7.4 * k, -0.6], [x * 6.8 * k, 10 * k, -1.2]];
      out.push(...chain(pts, [1.1 * k, 1.1 * k], [0.12, 0.12], s.horns.colors, false).map((m) => dense(m)));
    }
  }
  if (s.crown) {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.08 + (i / 8) * Math.PI * 0.84;
      const x = -Math.cos(a) * 5.6;
      const z = Math.sin(a) * 5.9;
      out.push(dense(taper([x, 0.6, z], [x * 1.04, i % 2 ? 3 : 4.4, z * 1.04], [0.55, 0.3], [0.05, 0.05], s.crown, 4, i, 0.3), i));
    }
  }
  if (s.wings) {
    for (const x of [-1, 1]) {
      out.push(dense(taper([x * 5.2, 1.8, -0.5], [x * 7.6, 5.4, -3.4], [0.25, 1.6], [0.05, 0.2], s.wings, 4, 1, 0)));
      out.push(dense(taper([x * 5.2, 1, -0.8], [x * 8, 3, -4], [0.25, 1.2], [0.05, 0.15], s.wings, 4, 2, 0)));
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
  /** AI 生成的盔甲（ArmorAI.ts）：穿在 AI 版女主角身上時取代程式產生的胸甲、腰甲與護肩 */
  model?: ArmorModel;
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
  out[0] = dense(out[0]!);
  out.push(F(t(prism(10, 9.4, 11.2, [3.5, 3], [3.8, 3.2], s.trim[0]!, [0, 0, -0.3]), s.trim, 2), 2, 0.06));
  if (s.style === 'plate' && !s.carapace) out.push(...chain([[0, 0.4, 4], [0, 5.4, 5.8], [0, 9.2, 3.4]], [0.45, 0.35], [0.35, 0.3], s.trim, false).map((m) => dense(m)));
  if (s.carapace) {
    [0.6, 3.2, 5.8].forEach((y, i) => out.push(F(t(prism(12, y, y + 2.2, [4.9 + i * 0.5, 3.9 + i * 0.4], [5.4 + i * 0.4, 4.4 + i * 0.3], s.mat[1]!, [0, 0, 0.4 + i * 0.15]), s.mat, 7 + i), 7 + i, 0.14)));
  }
  if (s.ribs) for (const y of [2.6, 4.6, 6.6]) for (const x of [-1, 1]) out.push(...chain([[x * 0.4, y + 0.5, 5.4], [x * 3, y, 4.9], [x * 5.3, y - 1, 2.6]], [0.5, 0.45], [0.3, 0.25], s.ribs, false).map((m) => dense(m)));
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
  return [dense(loft([lower, mid], 10, s.mat, 2)), dense(loft([mid, upper], 10, s.mat, 3))];
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
  if (s.trimPauldron) out.push(dense(t(placeMesh(prism(8, 0, -0.45, [3.25 * k, 2.95 * k], [3.3 * k, 3 * k], s.trimPauldron[0]!, [0, 0, 0], 0.3), [0, 0, -0.35 * side], [0.7 * side, 1.6 - 2.2 * k, 0]), s.trimPauldron)));
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

/**
 * 靴子的裝飾（shin 關節），貼在 AI 版女主角的靴子表面上（靴子本身是身體的一部分，穿上時換成裝備的顏色）：
 * 尖刺、腳踝的翅膀、寶石、符文。shape(y)：高度 y（膝蓋 = 0，往下為負）處靴子正面的 z 與左右半寬。
 */
export function bootShinExtras(s: BootSpec, shinLength: number, shape: (y: number) => { front: number; half: number }): Mesh[] {
  const out: Mesh[] = [];
  const k = shinLength / 12.6;
  for (let i = 0; i < (s.spikes ?? 0); i++) {
    const y = (-3.2 - i * 2.6) * k;
    out.push(spike([0, y, shape(y).front - 0.3], [0, 0.25, 1], 1.5, 0.38, s.spikeColors ?? BLACK_STEEL, i));
  }
  if (s.wings) {
    const y = -10.6 * k;
    const { half } = shape(y);
    for (const x of [-1, 1]) {
      out.push(dense(taper([x * (half - 0.3), y + 0.4, -0.8], [x * (half + 1.6), y + 5, -5.2], [0.2, 1.3], [0.05, 0.2], s.wings, 4, 1, 0)));
      out.push(dense(taper([x * (half - 0.3), y - 0.4, -0.8], [x * (half + 1.8), y + 2.2, -5.8], [0.2, 1], [0.05, 0.15], s.wings, 4, 2, 0)));
    }
  }
  if (s.gem) out.push(gem(0.6, [0, -2.2 * k, shape(-2.2 * k).front + 0.2], s.gem));
  if (s.runes) for (const y of [-5 * k, -7.5 * k]) out.push(glowBox(0.5, 0.6, 0.5, s.runes, [0, y, shape(y).front + 0.05]));
  return out;
}

// ─────────────────────────── 手套 ───────────────────────────

export interface GloveSpec {
  cuff: Tones;
  hand: Tones;
  fingers: Tones;
  knuckle?: Tones;
  plate?: Tones;
  /** 袖口外擴 */
  flare?: number;
  trim?: Tones;
  claws?: { len: number; colors: Tones } | null;
  spikes?: number;
  spikeColors?: Tones;
  gem?: number | null;
  runes?: number;
}

/** 護手（forearm 關節）：手腕到前臂的護甲（取代原本的皮護腕）；小零件只在放大時畫 */
export function gauntletPiece(s: GloveSpec): Mesh[] {
  const flare = (s.flare ?? 0) * 0.35;
  const out: Mesh[] = [dense(loft([{ y: -3.4, rx: 1.95 + flare, rz: 1.9 + flare }, { y: -6.4, rx: 1.75, rz: 1.7 }, { y: -9, rx: 1.45, rz: 1.4 }], 9, s.cuff, 1))];
  if (s.trim) out.push(dense(t(prism(9, -3.3, -3.9, [2.05 + flare, 2 + flare], [2.05 + flare, 2 + flare], s.trim[0]!), s.trim, 2)));
  if (s.plate) out.push(...detail(1, [F(t(box(0.6, 4.4, 1.8, s.plate[0]!, [1.6, -6.4, 0]), s.plate, 3), 3, 0.12)]));
  if (s.gem) out.push(...detail(2, [gem(0.45, [0, -7.4, 1.5], s.gem)]));
  if (s.runes) out.push(...detail(2, [glowBox(0.4, 0.5, 0.4, s.runes, [0, -5.2, 1.75])]));
  return out;
}

/** 手（hand 關節）的指節甲、爪、尖刺：只在放大時畫（遊戲地圖上太小） */
export function gloveHandDetails(s: GloveSpec): Mesh[] {
  const out: Mesh[] = [];
  if (s.knuckle) out.push(F(t(box(2.7, 0.8, 1.7, s.knuckle[0]!, [0, -2.7, 0.25]), s.knuckle, 4), 4, 0.1));
  if (s.claws) for (const [i, x] of [-0.75, 0, 0.75].entries()) out.push(dense(taper([x, -3.4, 1.2], [x * 1.1, -3.6 - s.claws.len * 0.5, 2.2], [0.25, 0.25], [0.03, 0.03], s.claws.colors, 4, i, 0.3), i));
  for (let i = 0; i < Math.min(3, s.spikes ?? 0); i++) out.push(spike([-0.8 + i * 0.8, -2.6, 1], [0, 0, 1], 0.9, 0.22, s.spikeColors ?? BLACK_STEEL, i));
  return detail(2, out);
}

// ─────────────────────────── 盾牌 ───────────────────────────

export interface ShieldSpec {
  /** round = 圓盾、kite = 鳶盾（上寬下尖）、tower = 塔盾、heater = 騎士盾 */
  shape: 'round' | 'kite' | 'tower' | 'heater';
  size: number;
  mat: Tones;
  rim: Tones;
  boss?: Tones;
  /** 正面的十字紋章 */
  cross?: Tones;
  /** 盾緣的放射尖刺（日輪、深淵牙） */
  rays?: Tones;
  gem?: number | null;
  runes?: number;
  spikes?: number;
  spikeColors?: Tones;
  /** 鏡面（正面一層亮色） */
  face?: Tones;
}

/** 盾面的輪廓（Y = 高、Z = 寬；盾面朝 +X） */
function shieldOutline(shape: ShieldSpec['shape'], k: number): [number, number][] {
  const scaled = (pts: [number, number][]) => pts.map(([y, z]) => [y * k, z * k] as [number, number]);
  const ring = (n: number, ry: number, rz: number) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * ry, Math.sin((i / n) * Math.PI * 2) * rz] as [number, number]);
  switch (shape) {
    case 'round':
      return ring(16, 3.4 * k, 3.4 * k);
    case 'kite':
      return scaled([[4.4, 0], [4, 2.5], [2.4, 3.2], [-0.5, 2.8], [-3.4, 1.4], [-5.6, 0], [-3.4, -1.4], [-0.5, -2.8], [2.4, -3.2], [4, -2.5]]);
    case 'tower':
      return scaled([[5, 2.2], [4.4, 3], [-4.4, 3], [-5, 2.2], [-5, -2.2], [-4.4, -3], [4.4, -3], [5, -2.2]]);
    case 'heater':
      return scaled([[3.8, 3.2], [-0.4, 3.1], [-2.8, 2.2], [-4.6, 0], [-2.8, -2.2], [-0.4, -3.1], [3.8, -3.2]]);
  }
}

/** 輪廓擠出成盾牌（正面略為隆起） */
function slab(outline: [number, number][], x0: number, x1: number, bulge: number, color: number): Mesh {
  const n = outline.length;
  const verts: V3[] = [...outline.map(([y, z]) => [x0, y, z] as V3), ...outline.map(([y, z]) => [x1, y, z] as V3), [x1 + bulge, 0, 0]];
  const faces: Mesh['faces'] = [{ idx: Array.from({ length: n }, (_, i) => i), color }];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({ idx: [i, j, n + j, n + i], color });
    faces.push({ idx: [n + i, n + j, 2 * n], color });
  }
  return orient({ verts, faces });
}

/** 盾牌（盾面朝 +X，原點 = 握把）；尖刺從盾面往外 */
export function shieldMeshes(s: ShieldSpec): Mesh[] {
  const outline = shieldOutline(s.shape, s.size);
  const out: Mesh[] = [];
  out.push(F(t(slab(outline.map(([y, z]) => [y * 1.07, z * 1.07]), -0.1, 0.45, 0, s.rim[0]!), s.rim, 1), 1, 0.06));
  out.push(F(t(slab(outline, 0.3, 0.75, 0.6 * s.size, s.mat[0]!), s.mat, 2), 2, 0.08));
  if (s.face) out.push(dense(t(slab(outline.map(([y, z]) => [y * 0.78, z * 0.78]), 0.7, 0.95, 0.45 * s.size, s.face[0]!), s.face, 3)));
  const front = 1.35 + 0.6 * s.size;
  if (s.cross) {
    out.push(F(t(box(0.35, 6 * s.size, 0.9, s.cross[0]!, [front - 0.3, 0.3 * s.size, 0]), s.cross, 4), 4, 0.1));
    out.push(F(t(box(0.35, 0.9, 4.4 * s.size, s.cross[0]!, [front - 0.3, 1.4 * s.size, 0]), s.cross, 5), 5, 0.1));
  }
  if (s.boss) out.push(F(t(lowSphere(1.1 * s.size, s.boss[0]!, [front - 0.2, 0, 0], 8, 5, [0.6, 1, 1]), s.boss, 6), 6, 0.08));
  if (s.rays) {
    const r = s.shape === 'round' ? 3.4 * s.size : 3 * s.size;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      out.push(dense(taper([0.3, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95], [0.3, Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35], [0.4, 0.5], [0.05, 0.05], s.rays, 4, i, 0.3), i));
    }
  }
  for (let i = 0; i < (s.spikes ?? 0); i++) {
    const a = (i / Math.max(1, s.spikes!)) * Math.PI * 2 + 0.4;
    const p: V3 = [front - 0.4, i === 0 ? 0 : Math.cos(a) * 1.9 * s.size, i === 0 ? 0 : Math.sin(a) * 1.9 * s.size];
    out.push(spike(p, [1, 0, 0], 1.6 * s.size, 0.5, s.spikeColors ?? BLACK_STEEL, i));
  }
  if (s.gem) out.push(gem(0.8 * s.size, [front + 0.1, s.boss ? 2 * s.size : 0, 0], s.gem));
  if (s.runes) for (const [y, z] of [[-2.2, 1.6], [-2.2, -1.6], [2.4, 1.8], [2.4, -1.8]] as [number, number][]) out.push(glowBox(0.5, 0.6, 0.6, s.runes, [front - 0.5, y * s.size, z * s.size]));
  return out;
}

/** 盾牌拿在左手（weaponL 關節）：盾面朝外側偏前、在前臂旁；放大 1.9 × 1.7 倍（設計者 2026-10-22 加大到 1.7 倍） */
export const placeShield = (meshes: Mesh[]): Mesh[] => scaleMeshes(meshes, 1.9 * 1.7, [0, 0, 0]).map((m) => placeMesh(m, [0, -1, 0], [2, 4.6, 1.3]));

export function scaleMeshes(meshes: readonly Mesh[], s: number, [ox, oy, oz]: V3): Mesh[] {
  return meshes.map((m) => mapVerts(m, ([x, y, z]) => [x * s + ox, y * s + oy, z * s + oz]));
}
