import type { Mesh, V3 } from '../Poly3D';
import { depthFor, glowTones, ring, rod, type Badge } from './StyledWeapons';
import { chain, darken, edge, gem, GOLD, lighten, taper, type Tones } from './WeaponParts';
import type { SwordSpec, SwordStyle } from './WeaponSpec';

/**
 * 橘 / 紅劍的造型：設計稿 art/gear/swords_unique/concept（橘劍四種基本款.png、紅劍六把.png）。
 * 橘四種基本款：crescent 月弧曲刀、knight 騎士聖劍、bone 骨節獸刃、parasite 異變寄生刃；
 * 紅六把各一種：rift 世界裂痕、eternal 永恆之刃、tomb 墓守巨劍、saint 墮聖之劍、fallen 墮騎之劍、abyss 深淵魔劍。
 * 座標同原本的劍：劍身從 y = -2.4 沿 -Y，刃朝 ±Z，X 是厚度；護手在 y = -1.8，握柄到 y = 2.7。
 * 代表物件一律鑲在護手中央。
 */
export type StyledSwordSpec = SwordSpec & { style: SwordStyle };

interface Ctx {
  s: StyledSwordSpec;
  L: number;
  w: number;
  trim: Tones;
  spikes: Tones;
  glow: number;
  grip: Tones;
  meshes: Mesh[];
}
interface Built {
  tip: V3;
  badge: Badge;
}

const Y0 = -2.4;
const GUARD = -1.8;

/** 劍身的一個截面：y、中心線的 z、半寬 h、半厚 t */
interface Sec {
  y: number;
  c?: number;
  h: number;
  t: number;
}
/** 依截面串起劍身（菱形截面，看得出刃） */
const blade = (secs: Sec[], colors: Tones): Mesh[] =>
  secs.slice(0, -1).map((a, i) => {
    const b = secs[i + 1]!;
    return edge([0, a.y, a.c ?? 0], [0, b.y, b.c ?? 0], [a.t, a.h], [b.t, b.h], colors);
  });
/** 方形截面的一段（墓碑石板、凸起的框）；h、t 是半寬、半厚 */
export const slab = (a: V3, b: V3, t: number, h: number, colors: Tones, t1 = t, h1 = h, seed = 0): Mesh =>
  taper(a, b, [t * 1.41, h * 1.41], [t1 * 1.41, h1 * 1.41], colors, 4, seed, Math.PI / 4);
/** 貼在劍身上的一條凸起的平帶（光溝、鑲邊、寄生組織）：方形截面，半厚 t 要比劍身厚一點才蓋得住，半寬從 h0 漸變到 h1 */
export const groove = (pts: readonly V3[], t: number, h0: number, h1: number, colors: Tones): Mesh[] => {
  const n = pts.length - 1;
  return pts.slice(0, -1).map((p, i) => slab(p, pts[i + 1]!, t, h0 + ((h1 - h0) * i) / n, colors, t, h0 + ((h1 - h0) * (i + 1)) / n, i));
};
/** Z 鏡射（面的頂點順序也要反過來，法線才會朝外） */
const mirrorZ = (m: Mesh): Mesh => ({ ...m, verts: m.verts.map(([x, y, z]) => [x, y, -z] as V3), faces: m.faces.map((f) => ({ ...f, idx: [...f.idx].reverse() })) });
const badge = (size: number, half: number): Badge => ({ at: [0, GUARD, 0], size, depth: depthFor(half), rot: 0 });
/** 一般的握柄與幾圈箍 */
function hilt(c: Ctx, r = 0.6, rings: number[] = [0, 1.9]): void {
  c.meshes.push(rod(2.7, -1.3, r, r * 1.04, c.grip));
  rings.forEach((y, i) => c.meshes.push(ring(y, r + 0.14, 0.4, c.trim, i + 1)));
}

// ─────────────────────────── 橘：四種基本款 ───────────────────────────

/** A 月弧曲刀：單刃往後彎的細長刀身，刀背一道元素光與金邊、背上幾個缺口；護手是一前一後的新月鉤 */
function crescent(c: Ctx): Built {
  const { L, glow, trim } = c;
  const first = c.meshes.length;
  const w = c.w * 1.7;
  const t = 0.24 * Math.max(1, w / 1.8);
  const bend = (c.s.curve ?? 3.4) * 1.5;
  const ks = [0, 0.18, 0.38, 0.58, 0.76, 0.9, 1];
  const hs = [0.62, 0.82, 0.95, 1, 0.92, 0.7, 0.4];
  const at = (k: number) => -bend * k * k + w * 0.1;
  const secs: Sec[] = ks.map((k, i) => ({ y: Y0 - L * k, c: at(k), h: w * hs[i]!, t }));
  c.meshes.push(...blade(secs, c.s.colors));
  const tip: V3 = [0, Y0 - L - 3, at(1) - bend * 0.55];
  c.meshes.push(edge([0, Y0 - L, at(1)], tip, [t, w * 0.4], [0.03, 0.05], c.s.colors));
  // 刀背：發光的一道（比刀身厚，兩面都看得到）＋最外緣的金邊
  const back = (k: number, f: number): V3 => [0, Y0 - L * k, at(k) - w * hs[Math.min(6, Math.round(k * 6))]! * f];
  c.meshes.push(...groove([0.02, 0.2, 0.4, 0.6, 0.8, 0.95].map((k) => back(k, 0.42)), t * 1.1, w * 0.24, w * 0.1, glowTones(glow)));
  c.meshes.push(...groove([0.02, 0.2, 0.4, 0.6, 0.8, 0.97].map((k) => back(k, 0.9)), t * 1.1, 0.18, 0.08, trim));
  for (const k of [0.28, 0.5, 0.7]) {
    const p = back(k, 0.92);
    c.meshes.push(taper(p, [0, p[1] - 1.3, p[2] - w * 0.55], [t * 0.9, 0.32], [0.03, 0.04], trim, 4, 0, Math.PI / 4));
  }
  // 護手：中央一小塊，前鉤往劍尖彎、後鉤往柄頭彎
  c.meshes.push(taper([0, -1.2, 0], [0, -2.4, 0], [0.62, 0.8], [0.62, 0.8], trim, 6, 0, Math.PI / 6));
  c.meshes.push(...chain([[0, GUARD, 0.5], [0, -1.9, w * 1.4], [0, -3, w * 2], [0, -4.4, w * 1.75]], [0.42, 0.5], [0.05, 0.06], trim, false));
  c.meshes.push(...chain([[0, GUARD, -0.5], [0, -1.4, -w * 1.3], [0, -0.2, -w * 1.8], [0, 1.2, -w * 1.5]], [0.4, 0.46], [0.05, 0.06], trim, false));
  hilt(c, 0.56, [0.2, 1.6]);
  c.meshes.push(taper([0, 2.7, 0], [0, 3.3, 0], [0.7, 0.7], [0.5, 0.5], trim, 6, 1, 0), gem(0.5, [0, 3.1, 0], glow, [1.1, 0.9, 1.1]));
  c.meshes.push(...chain([[0, 3.2, 0], [0, 4.2, 0.4], [0, 4.8, 1.3]], [0.34, 0.4], [0.04, 0.05], trim, false));
  // 拿在手上時刀尖要往上翹、長的刀刃朝下朝前：整把前後（Z）鏡射
  for (let i = first; i < c.meshes.length; i++) c.meshes[i] = mirrorZ(c.meshes[i]!);
  return { tip: [tip[0], tip[1], -tip[2]], badge: badge(1, 0.8) };
}

/** B 騎士聖劍：寬直劍、中央發光刻紋溝與金邊、劍根菱形金飾；大十字護手（末端外擴＋尖刺），柄頭是圓形徽章 */
function knight(c: Ctx): Built {
  const { L, glow, trim } = c;
  const w = c.w * 1.9;
  const t = 0.28 * Math.max(1, w / 1.8);
  const ks = [0, 0.25, 0.5, 0.75, 0.88];
  const hs = [0.95, 1, 0.98, 0.9, 0.78];
  c.meshes.push(...blade(ks.map((k, i) => ({ y: Y0 - L * k, h: w * hs[i]!, t })), c.s.colors));
  const tip: V3 = [0, Y0 - L - 3, 0];
  c.meshes.push(edge([0, Y0 - L * 0.88, 0], tip, [t, w * 0.78], [0.03, 0.05], c.s.colors));
  c.meshes.push(...groove([[0, Y0 - 0.4, 0], [0, Y0 - L * 0.45, 0], [0, Y0 - L * 0.86, 0]], t * 1.1, w * 0.2, w * 0.08, glowTones(glow)));
  for (const sd of [1, -1]) c.meshes.push(...groove([[0, Y0 - 0.3, sd * w * 0.32], [0, Y0 - L * 0.45, sd * w * 0.3], [0, Y0 - L * 0.84, sd * w * 0.14]], t * 1.12, 0.12, 0.06, trim));
  c.meshes.push(edge([0, Y0 + 0.1, 0], [0, Y0 - L * 0.14, 0], [t * 1.3, w * 1.02], [t * 1.25, w * 0.5], trim));
  // 十字護手
  const W = w * 2;
  c.meshes.push(edge([0, GUARD, -W], [0, GUARD, W], [0.6, 0.7], [0.6, 0.7], trim));
  c.meshes.push(taper([0, -0.8, 0], [0, -2.9, 0], [0.75, 0.95], [0.75, 0.95], trim, 4, 1, 0));
  for (const sd of [1, -1]) {
    c.meshes.push(taper([0, GUARD, sd * W], [0, GUARD, sd * (W + 1.1)], [0.62, 0.72], [0.85, 1.15], trim, 4, 2, Math.PI / 4));
    c.meshes.push(edge([0, GUARD, sd * (W + 1.1)], [0, GUARD, sd * (W + 2)], [0.5, 0.6], [0.03, 0.04], trim));
    c.meshes.push(edge([0, -2.1, sd * W * 0.45], [0, -3.4, sd * W * 0.32], [0.38, 0.42], [0.03, 0.04], trim));
    c.meshes.push(gem(0.38, [0, GUARD, sd * (W + 0.55)], glow, [1.9, 1, 1], 4, 3));
  }
  hilt(c, 0.56, [-0.4, 0.7, 1.8]);
  // 圓形徽章柄頭
  c.meshes.push(taper([0, 2.5, 0], [0, 2.95, 0], [0.62, 0.62], [0.45, 0.45], trim, 6, 1, 0));
  c.meshes.push(gem(1.15, [0, 3.95, 0], trim[0]!, [0.42, 1, 1], 8, 4), gem(0.52, [0, 3.95, 0], glow, [1.05, 1, 1]));
  return { tip, badge: badge(1.05, 0.95) };
}

/** C 骨節獸刃：寬度忽寬忽窄、略為歪斜的骨節劍身，兩段皮繩，刃口一排往劍尖斜的骨刺；護手是兩支往柄頭彎的爪，柄頭彎鉤 */
function bone(c: Ctx): Built {
  const { L, trim, spikes } = c;
  const w = c.w * 1.8;
  const t = 0.3 * Math.max(1, w / 1.8);
  const ws = [1, 1.12, 0.95, 1.08, 0.92, 0.8, 0.62];
  const n = ws.length - 1;
  const pts: V3[] = ws.map((_, i) => [0, Y0 - (L * i) / n, (i % 2 ? 0.12 : -0.08) * w]);
  for (let i = 0; i < n; i++) c.meshes.push(edge(pts[i]!, pts[i + 1]!, [t, w * ws[i]!], [t, w * ws[i + 1]!], c.s.colors));
  const tip: V3 = [0, Y0 - L - 3, w * 0.25];
  c.meshes.push(edge(pts[n]!, tip, [t, w * ws[n]!], [0.03, 0.05], c.s.colors));
  for (const i of [1, 3]) {
    const y = Y0 - (L * (i + 0.5)) / n;
    c.meshes.push(edge([0, y + 0.45, 0], [0, y - 0.45, 0], [t * 1.6, w * 1.02], [t * 1.6, w * 0.98], c.grip));
    for (const z of [-0.5, 0.5]) c.meshes.push(gem(0.22, [t * 1.6, y, z * w], trim[0]!, [0.6, 1, 1], 4, 3), gem(0.22, [-t * 1.6, y, z * w], trim[0]!, [0.6, 1, 1], 4, 3));
  }
  for (let i = 0; i < 5; i++) {
    const y = Y0 - L * (0.12 + (i * 0.8) / 5);
    for (const sd of [1, -1]) {
      const k = 1 - i * 0.08;
      const len = (1.1 + ((i + (sd > 0 ? 0 : 1)) % 2) * 0.7) * w * k;
      c.meshes.push(taper([0, y, sd * w * 0.85], [0, y - len * 0.75, sd * (w * 0.85 + len)], [t * 0.9, 0.42 * k], [0.03, 0.04], spikes, 4, i, Math.PI / 4));
    }
  }
  c.meshes.push(edge([0, GUARD, -w * 0.7], [0, GUARD, w * 0.7], [0.55, 0.6], [0.55, 0.6], trim));
  for (const sd of [1, -1]) c.meshes.push(...chain([[0, GUARD, sd * w * 0.6], [0, -1.5, sd * w * 1.7], [0, -0.2, sd * w * 2.15], [0, 1.2, sd * w * 1.75]], [0.42, 0.55], [0.05, 0.06], spikes, false));
  hilt(c, 0.6, [1.9, 0]);
  c.meshes.push(...chain([[0, 2.7, 0], [0, 3.9, 0.3], [0, 4.7, 1.3], [0, 4.4, 2.3]], [0.5, 0.55], [0.05, 0.06], spikes, false));
  return { tip, badge: badge(1.05, 0.85) };
}

/** D 異變寄生刃：普通的直劍，刃的一側（+Z）被怪物組織蓋住並長出一排晶刺，上面有幾顆發光點；護手也只長在一側 */
function parasite(c: Ctx): Built {
  const { L, glow, trim, spikes } = c;
  const w = c.w * 1.75;
  const t = 0.27 * Math.max(1, w / 1.8);
  const ks = [0, 0.3, 0.6, 0.85];
  const hs = [1, 0.98, 0.9, 0.72];
  c.meshes.push(...blade(ks.map((k, i) => ({ y: Y0 - L * k, h: w * hs[i]!, t })), c.s.colors));
  const tip: V3 = [0, Y0 - L - 2.8, -w * 0.1];
  c.meshes.push(edge([0, Y0 - L * 0.85, 0], tip, [t, w * 0.72], [0.03, 0.05], c.s.colors));
  // 寄生組織：蓋住 +Z 半邊、往劍尖越來越細，外側長出大小不一的晶刺
  c.meshes.push(...groove([0.02, 0.2, 0.42, 0.62, 0.8].map((k): V3 => [0, Y0 - L * k, w * (0.55 - k * 0.12)]), t * 1.3, w * 0.5, w * 0.22, spikes));
  for (let i = 0; i < 8; i++) {
    const k = 0.05 + i * 0.1;
    const y = Y0 - L * k;
    const len = w * (0.8 + ((i * 3) % 4) * 0.25) * (1 - k * 0.45);
    c.meshes.push(taper([0, y, w * 0.75], [0, y - len * 0.8, w * 0.9 + len], [t * 1.3, 0.5 * (1 - k * 0.4)], [0.03, 0.04], spikes, 4, i, Math.PI / 4));
  }
  for (const k of [0.12, 0.3, 0.48, 0.66]) c.meshes.push(gem(0.42, [0, Y0 - L * k, w * 0.42], glow, [1.55, 1.25, 1]));
  // 護手：-Z 是原本的護手，+Z 長出往兩邊彎的寄生爪
  c.meshes.push(edge([0, GUARD, -w * 1.2], [0, GUARD, w * 0.4], [0.55, 0.65], [0.55, 0.65], trim));
  c.meshes.push(edge([0, GUARD, -w * 1.2], [0, -0.8, -w * 1.75], [0.5, 0.55], [0.03, 0.04], trim));
  c.meshes.push(...chain([[0, GUARD, w * 0.3], [0, -1.6, w * 1.3], [0, -0.4, w * 1.9], [0, 1, w * 1.6]], [0.55, 0.7], [0.05, 0.06], spikes, false));
  c.meshes.push(...chain([[0, -2, w * 0.5], [0, -3.3, w * 1.5], [0, -4.5, w * 1.4]], [0.45, 0.5], [0.04, 0.05], spikes, false));
  hilt(c, 0.56, [0.2, 1.8]);
  c.meshes.push(...chain([[0, 2.7, 0], [0, 3.8, 0.5], [0, 4.6, 0.2]], [0.55, 0.6], [0.05, 0.06], spikes, false), gem(0.4, [0, 3.2, 0.3], glow, [1.4, 1.2, 1.2]));
  return { tip, badge: badge(1, 0.85) };
}

// ─────────────────────────── 紅：六把專屬 ───────────────────────────

/** 世界裂痕：厚重岩層般的寬劍，兩側是錯落的岩塊與飄浮的碎石，中央一道之字形熔岩裂縫；護手是厚岩塊往下展開 */
function rift(c: Ctx): Built {
  const { L, glow, trim } = c;
  const w = c.w * 2.3;
  const t = 0.42;
  const ks = [0, 0.25, 0.5, 0.75, 0.9];
  const hs = [0.95, 0.88, 1, 0.82, 0.66];
  c.meshes.push(...blade(ks.map((k, i) => ({ y: Y0 - L * k, c: (i % 2 ? 0.06 : -0.06) * w, h: w * hs[i]!, t })), c.s.colors));
  const tip: V3 = [0, Y0 - L - 2.4, w * 0.1];
  c.meshes.push(edge([0, Y0 - L * 0.9, 0], tip, [t, w * 0.66], [0.04, 0.06], c.s.colors));
  for (let i = 0; i < 10; i++) {
    const k = 0.04 + i * 0.094;
    const sd = i % 2 ? 1 : -1;
    const r = w * 0.36 * (1 - k * 0.4);
    c.meshes.push(gem(r, [0, Y0 - L * k, sd * w * (0.72 - k * 0.12)], c.s.colors[i % 3]!, [(t * 1.9) / r, 1.25, 0.9], 5, 3));
  }
  for (const [k, sd, r] of [[0.2, 1, 0.5], [0.42, -1, 0.42], [0.63, 1, 0.38], [0.08, -1, 0.34]] as const) c.meshes.push(gem(r, [0, Y0 - L * k, sd * w * 1.32], c.s.colors[1]!, [0.8, 1.1, 0.9], 4, 3));
  const crack: V3[] = [];
  for (let i = 0; i <= 8; i++) crack.push([0, Y0 - 0.3 - ((L + 1.2) * i) / 8, (i % 2 ? 1 : -1) * w * 0.22]);
  c.meshes.push(...groove(crack, t * 1.1, 0.42, 0.2, glowTones(glow)));
  c.meshes.push(edge([0, GUARD, -w * 0.8], [0, GUARD, w * 0.8], [0.85, 0.95], [0.85, 0.95], trim));
  for (const sd of [1, -1]) {
    c.meshes.push(taper([0, -1.3, sd * w * 0.65], [0, -2.9, sd * w * 1.2], [0.75, 0.9], [0.45, 1.4], trim, 4, 1, Math.PI / 4));
    c.meshes.push(gem(0.4, [0, -2.2, sd * w * 0.8], glow, [2.2, 1, 1], 4, 3));
  }
  hilt(c, 0.7, [0.2, 1.9]);
  c.meshes.push(edge([0, 2.7, 0], [0, 4.8, 0], [0.85, 0.95], [0.04, 0.05], trim), gem(0.45, [0, 3.2, 0], glow, [2.1, 1, 1]));
  return { tip, badge: badge(1.3, 1.05) };
}

/** 永恆之刃：修長的白金直劍、中央金色凹槽嵌一排星點；護手後方一圈光環，光環四個方向是星芒尖刺 */
function eternal(c: Ctx): Built {
  const { L, glow, trim } = c;
  const w = c.w * 1.6;
  const t = 0.26 * Math.max(1, w / 1.8);
  const ks = [0, 0.3, 0.6, 0.86];
  const hs = [0.85, 0.95, 0.9, 0.74];
  c.meshes.push(...blade(ks.map((k, i) => ({ y: Y0 - L * k, h: w * hs[i]!, t })), c.s.colors));
  const tip: V3 = [0, Y0 - L - 3.4, 0];
  c.meshes.push(edge([0, Y0 - L * 0.86, 0], tip, [t, w * 0.74], [0.03, 0.05], c.s.colors));
  // 金色凹槽在每顆星點處斷開（整條穿過星點的話，畫的順序會把星點蓋掉）
  const stars = [0, 1, 2, 3, 4, 5, 6].map((i) => 0.08 + i * 0.12);
  const cuts = [-0.3 / L, ...stars, 0.9];
  for (let i = 0; i < cuts.length - 1; i++) {
    const k0 = cuts[i]! + (i ? 0.025 : 0), k1 = cuts[i + 1]! - (i < cuts.length - 2 ? 0.025 : 0);
    const hw = (k: number) => w * (0.17 - k * 0.1);
    c.meshes.push(slab([0, Y0 - L * k0, 0], [0, Y0 - L * k1, 0], t * 1.08, hw(k0), trim, t * 1.08, hw(k1), i));
  }
  stars.forEach((k, i) => c.meshes.push(gem(0.6 - i * 0.03, [0, Y0 - L * k, 0], glow, [1.3, 1.5, 1.45], 4, 3)));
  // 光環（在 Y-Z 平面，繞著護手）＋四個星芒
  const R = w * 1.9;
  const halo: V3[] = [];
  for (let i = 0; i <= 18; i++) halo.push([0, GUARD + R * Math.cos((i / 18) * Math.PI * 2), R * Math.sin((i / 18) * Math.PI * 2)]);
  c.meshes.push(...chain(halo, [0.22, 0.32], [0.22, 0.32], trim));
  for (const [dy, dz, len] of [[0, 1, 2], [0, -1, 2], [1, 0, 1], [-1, 0, 1.2]] as const) {
    const p: V3 = [0, GUARD + dy * R, dz * R];
    c.meshes.push(edge([0, p[1] - dy * 0.5, p[2] - dz * 0.5], [0, p[1] + dy * len, p[2] + dz * len], [0.45, 0.55], [0.03, 0.04], trim));
  }
  for (const a of [1, 3, 5, 7]) c.meshes.push(gem(0.3, [0, GUARD + R * Math.cos((a * Math.PI) / 4), R * Math.sin((a * Math.PI) / 4)], glow, [1.3, 1, 1], 4, 3));
  c.meshes.push(edge([0, GUARD, -w * 1.1], [0, GUARD, w * 1.1], [0.55, 0.65], [0.55, 0.65], trim));
  hilt(c, 0.52, [-0.3, 0.9, 2.1]);
  c.meshes.push(gem(0.55, [0, 3.3, 0], glow, [1.2, 1.4, 1.2], 4, 3));
  for (const [dy, dz] of [[1, 0], [0, 1], [0, -1]] as const) c.meshes.push(edge([0, 3.3, 0], [0, 3.3 + dy * 1.3, dz * 1], [0.25, 0.3], [0.03, 0.03], trim));
  return { tip, badge: badge(1.15, 0.85) };
}

/** 墓守巨劍：墓碑石板般的方形巨刃，中央凹進去一塊發光的符文板，鎖鏈斜纏；護手兩端各一個骷髏，往下垂著鎖鏈 */
function tomb(c: Ctx): Built {
  const { L, glow, trim, spikes } = c;
  const w = c.w * 2.2;
  const t = 0.5;
  const top = Y0 - L * 0.92;
  c.meshes.push(slab([0, Y0, 0], [0, top, 0], t, w, c.s.colors, t, w * 0.97));
  const tip: V3 = [0, top - w * 0.9, 0];
  c.meshes.push(edge([0, top, 0], tip, [t, w * 0.97], [t * 0.6, 0.08], c.s.colors));
  // 石框（兩側凸起）、深色的符文板、亮的符文
  for (const sd of [1, -1]) c.meshes.push(slab([0, Y0 - 0.4, sd * w * 0.48], [0, top + 0.6, sd * w * 0.48], t * 1.16, 0.22, trim, t * 1.16, 0.2, 1));
  c.meshes.push(slab([0, Y0 - 0.7, 0], [0, top + 0.9, 0], t * 1.06, w * 0.36, glowTones(darken(glow, 0.55))));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const y = Y0 - 1.4 - ((Y0 - 1.4 - (top + 1.6)) * i) / (n - 1);
    c.meshes.push(slab([0, y, -w * 0.2], [0, y, w * 0.2], t * 1.12, 0.14, glowTones(glow), t * 1.12, 0.14));
    c.meshes.push(edge([0, y - 0.15, 0], [0, y - 0.9, 0], [t * 1.14, 0.18], [t * 1.14, 0.03], glowTones(glow)));
  }
  // 斜纏的鎖鏈：正面從 -Z 斜到 +Z，再從背面斜回來
  const X = t * 1.41 + 0.12;
  const pts: V3[] = [];
  for (let j = 0; j <= 4; j++) pts.push([j % 2 ? -X : X, Y0 - L * (0.12 + j * 0.11), (j % 2 ? 1 : -1) * w * 1.05]);
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j]!, b = pts[j + 1]!;
    for (let k = 0; k < 4; k++) {
      const f0 = k / 4, f1 = (k + 0.8) / 4;
      const p = (f: number): V3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      c.meshes.push(taper(p(f0), p(f1), [0.2, 0.2], [0.2, 0.2], spikes, 6, k, Math.PI / 6));
    }
  }
  // 護手：厚石塊，兩端骷髏，骷髏下垂著鎖鏈
  c.meshes.push(slab([0, GUARD, -w * 0.78], [0, GUARD, w * 0.78], 0.7, 0.55, trim));
  c.meshes.push(slab([0, -1.1, 0], [0, -2.6, 0], 0.72, 0.85, trim, 0.72, 0.85, 2));
  const BONE_C = 0xd8d0b8;
  for (const sd of [1, -1]) {
    const z = sd * w * 0.98;
    c.meshes.push(gem(0.88, [0, GUARD - 0.1, z], BONE_C, [0.95, 1, 0.95], 6, 4), gem(0.5, [0, GUARD + 0.65, z], darken(BONE_C, 0.1), [0.85, 0.6, 0.8], 6, 3));
    for (const x of [0.62, -0.62]) c.meshes.push(gem(0.24, [x, GUARD - 0.2, z + sd * 0.1], 0x1a1410, [0.5, 1, 0.9], 4, 3), gem(0.24, [x, GUARD - 0.2, z - sd * 0.32], 0x1a1410, [0.5, 1, 0.9], 4, 3));
    const hang: V3[] = [[0, GUARD + 0.9, z], [0, 0.4, z * 1.02], [0, 2, z * 0.94], [0, 3.2, z * 0.9]];
    for (let j = 0; j < hang.length - 1; j++) c.meshes.push(taper(hang[j]!, hang[j + 1]!, [0.17, 0.17], [0.17, 0.17], spikes, 6, j, Math.PI / 6));
  }
  hilt(c, 0.7, [0.3, 1.9]);
  c.meshes.push(slab([0, 2.7, 0], [0, 3.1, 0], 0.8, 0.8, trim), gem(0.75, [0, 3.9, 0], glow, [1.05, 1.45, 1.05], 4, 3));
  return { tip, badge: badge(1.35, 1.0) };
}

/** 墮聖之劍：白色聖劍，中央一道血紅裂縫，+Z 半邊被血浸透、刃口竄出血焰，旁邊飄著血晶；護手是一對羽翼（+Z 那邊折斷染血） */
function saint(c: Ctx): Built {
  const { L, glow, trim, spikes } = c;
  const w = c.w * 1.85;
  const t = 0.28 * Math.max(1, w / 1.8);
  const ks = [0, 0.3, 0.6, 0.86];
  const hs = [0.92, 1, 0.92, 0.72];
  c.meshes.push(...blade(ks.map((k, i) => ({ y: Y0 - L * k, h: w * hs[i]!, t })), c.s.colors));
  const tip: V3 = [0, Y0 - L - 3, 0];
  c.meshes.push(edge([0, Y0 - L * 0.86, 0], tip, [t, w * 0.72], [0.03, 0.05], c.s.colors));
  c.meshes.push(...groove([0.02, 0.25, 0.5, 0.75, 0.9].map((k): V3 => [0, Y0 - L * k, w * (0.72 - k * 0.12)]), t * 1.06, w * 0.2, w * 0.1, spikes));
  const crack: V3[] = [];
  for (let i = 0; i <= 7; i++) crack.push([0, Y0 - 0.3 - (L * 0.95 * i) / 7, (i % 2 ? 1 : -1) * w * 0.12]);
  c.meshes.push(...groove(crack, t * 1.12, 0.3, 0.14, glowTones(glow)));
  for (let i = 0; i < 6; i++) {
    const k = 0.1 + i * 0.13;
    const y = Y0 - L * k;
    const sz = w * (1 - k * 0.5) * (i % 2 ? 0.9 : 1.25);
    c.meshes.push(...chain([[0, y, w * 0.85], [0, y - 1.1, w * 0.95 + sz * 0.8], [0, y - 2.6, w * 0.9 + sz * 0.45]], [t * 1.05, 0.48], [0.03, 0.05], spikes));
  }
  for (const [k, z, r] of [[0.3, 2.3, 0.32], [0.55, 2.1, 0.26], [0.78, 1.8, 0.22]] as const) c.meshes.push(gem(r, [0, Y0 - L * k, w * z], glow, [0.9, 1.4, 0.9], 4, 3));
  // 羽翼護手：每邊五片羽毛往外、往柄頭展開（+Z 的比較短、染血）
  c.meshes.push(edge([0, GUARD, -w * 0.9], [0, GUARD, w * 0.9], [0.55, 0.6], [0.55, 0.6], trim));
  for (const sd of [1, -1]) {
    const broken = sd > 0;
    for (let j = 0; j < 5; j++) {
      const a = 0.15 + j * 0.28;
      const len = w * (broken ? 2.1 - j * 0.2 : 3.2 - j * 0.3);
      const from: V3 = [0, GUARD + 0.1 * j, sd * w * 0.55];
      c.meshes.push(edge(from, [0, from[1] + Math.sin(a) * len, sd * (w * 0.55 + Math.cos(a) * len)], [0.32, 0.7], [0.03, 0.12], broken && j > 1 ? spikes : c.s.colors));
    }
  }
  hilt(c, 0.54, [0.2, 1.8]);
  c.meshes.push(taper([0, 2.7, 0], [0, 3.2, 0], [0.7, 0.7], [0.5, 0.5], trim, 6, 1, 0), gem(0.6, [0, 3.8, 0], glow, [1.1, 1.4, 1.1], 4, 3));
  return { tip, badge: badge(1.1, 0.85) };
}

/** 墮騎之劍：黑鐵騎士長劍，劍身三道光溝（紅 / 藍 / 黃 = 火 / 冰 / 雷）；護手兩臂往外再往劍尖彎出尖刺，嵌著冰與雷的寶石 */
function fallen(c: Ctx): Built {
  const { L, trim, spikes } = c;
  const w = c.w * 1.8;
  const t = 0.3 * Math.max(1, w / 1.8);
  const ks = [0, 0.3, 0.6, 0.85];
  const hs = [0.95, 1, 0.92, 0.76];
  c.meshes.push(...blade(ks.map((k, i) => ({ y: Y0 - L * k, h: w * hs[i]!, t })), c.s.colors));
  const tip: V3 = [0, Y0 - L - 3, 0];
  c.meshes.push(edge([0, Y0 - L * 0.85, 0], tip, [t, w * 0.76], [0.03, 0.05], c.s.colors));
  const FIRE = 0xff3a2a, ICE_C = 0x3a8cff, BOLT = 0xffc030;
  for (const [z, col] of [[-0.42, FIRE], [0, ICE_C], [0.42, BOLT]] as const) {
    c.meshes.push(...groove([[0, Y0 - 0.5, z * w], [0, Y0 - L * 0.45, z * w * 0.95], [0, Y0 - L * 0.84, z * w * 0.6]], t * 1.1, w * 0.1, w * 0.05, glowTones(col)));
  }
  for (const sd of [1, -1]) c.meshes.push(taper([0, Y0 - 0.6, sd * w * 0.9], [0, Y0 - 2.2, sd * w * 1.5], [t * 0.9, 0.4], [0.03, 0.04], spikes, 4, 0, Math.PI / 4));
  c.meshes.push(taper([0, -0.9, 0], [0, -2.8, 0], [0.75, 0.95], [0.75, 0.95], trim, 4, 1, 0));
  for (const sd of [1, -1]) {
    const arm: V3[] = [[0, GUARD, sd * 0.6], [0, -2.1, sd * w * 1.5], [0, -1.2, sd * w * 2.3]];
    c.meshes.push(...chain(arm, [0.6, 0.75], [0.45, 0.55], trim));
    c.meshes.push(edge(arm[2]!, [0, -4.2, sd * w * 2.7], [0.5, 0.6], [0.03, 0.04], spikes));
    c.meshes.push(edge([0, -1.4, sd * 0.55], [0, 0.4, sd * 1.25], [0.3, 0.35], [0.03, 0.03], spikes));
    c.meshes.push(gem(0.62, [0, -2, sd * w * 1.35], sd > 0 ? BOLT : ICE_C, [1.5, 1.2, 1], 6, 4));
  }
  hilt(c, 0.58, [-0.3, 0.9, 2.1]);
  c.meshes.push(taper([0, 2.7, 0], [0, 3.2, 0], [0.75, 0.75], [0.55, 0.55], trim, 6, 1, 0), gem(0.6, [0, 3.7, 0], FIRE, [1.2, 1.3, 1.2], 6, 4));
  c.meshes.push(edge([0, 4.1, 0], [0, 5.3, 0], [0.35, 0.4], [0.03, 0.03], spikes));
  return { tip, badge: badge(1.15, 0.9) };
}

/** 深淵魔劍：細的脊骨中軸，兩側一根根往劍尖彎的翼骨倒刺（越往劍尖越短），中央熔紅的光；護手是一對往劍尖掃的巨角＋往柄頭彎的鉤 */
function abyss(c: Ctx): Built {
  const { L, glow, trim, spikes } = c;
  const w = c.w * 1.7;
  const t = 0.32 * Math.max(1, w / 1.8);
  const ks = [0, 0.25, 0.5, 0.75, 0.9];
  const hs = [0.6, 0.62, 0.56, 0.46, 0.34];
  c.meshes.push(...blade(ks.map((k, i) => ({ y: Y0 - L * k, h: w * hs[i]!, t })), c.s.colors));
  const tip: V3 = [0, Y0 - L - 3.4, 0];
  c.meshes.push(edge([0, Y0 - L * 0.9, 0], tip, [t, w * 0.34], [0.03, 0.05], spikes));
  for (let i = 0; i < 8; i++) {
    const k = 0.04 + i * 0.115;
    const y = Y0 - L * k;
    const h = w * (0.6 - k * 0.28);
    const sz = 1.25 - k * 0.9;
    for (const sd of [1, -1]) c.meshes.push(...chain([[0, y, sd * h * 0.7], [0, y - 0.9, sd * (h + w * 0.85 * sz)], [0, y - 2.6 * sz - 0.6, sd * (h + w * 1.1 * sz)]], [t * 0.95, 0.62], [0.03, 0.05], spikes));
  }
  c.meshes.push(...groove([[0, Y0 - 0.3, 0], [0, Y0 - L * 0.4, 0], [0, Y0 - L * 0.8, 0]], t * 1.1, w * 0.2, w * 0.06, glowTones(glow)));
  c.meshes.push(gem(0.75, [0, Y0 - L * 0.12, 0], lighten(glow, 0.2), [0.9, 1.5, 1], 6, 4));
  c.meshes.push(edge([0, GUARD, -w * 0.8], [0, GUARD, w * 0.8], [0.65, 0.75], [0.65, 0.75], trim));
  for (const sd of [1, -1]) {
    c.meshes.push(...chain([[0, GUARD, sd * 0.6], [0, -2.2, sd * w * 1.4], [0, -3.8, sd * w * 2.1], [0, -6, sd * w * 1.9]], [0.6, 0.8], [0.04, 0.06], spikes));
    c.meshes.push(...chain([[0, -1.6, sd * w * 0.9], [0, -0.4, sd * w * 1.7], [0, 1.4, sd * w * 1.6]], [0.45, 0.55], [0.04, 0.05], spikes));
  }
  hilt(c, 0.6, [0.2, 1.9]);
  c.meshes.push(gem(0.55, [0, 3.1, 0], glow, [1.2, 1.2, 1.2], 6, 4), edge([0, 3.4, 0], [0, 5.4, 0], [0.5, 0.55], [0.03, 0.04], spikes));
  for (const sd of [1, -1]) c.meshes.push(edge([0, 3, sd * 0.4], [0, 4.4, sd * 1.5], [0.3, 0.35], [0.03, 0.03], spikes));
  return { tip, badge: badge(1.2, 0.9) };
}

const BUILDERS: Record<SwordStyle, (c: Ctx) => Built> = { crescent, knight, bone, parasite, rift, eternal, tomb, saint, fallen, abyss };

export function styledSword(s: StyledSwordSpec, lengthScale: number): { meshes: Mesh[]; tip: V3; badge: Badge } {
  const c: Ctx = {
    s,
    L: s.length * lengthScale,
    w: s.width,
    trim: s.trim ?? GOLD,
    spikes: s.spikes ?? s.colors,
    glow: s.glow ?? 0xfff0c0,
    grip: s.grip ?? [0x4a3029, 0x3f2923, 0x352320],
    meshes: [],
  };
  const b = BUILDERS[s.style](c);
  return { meshes: c.meshes, ...b };
}
