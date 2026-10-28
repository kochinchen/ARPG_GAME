import { refine } from '../Facets';
import { mapVerts, type Mesh, type V3 } from '../Poly3D';
import { plate } from '../weapons/StyledAxes';
import { slab } from '../weapons/StyledSwords';
import { glowTones } from '../weapons/StyledWeapons';
import { chain, darken, edge, gem, lighten, taper, type Tones } from '../weapons/WeaponParts';

/**
 * 橘 / 紅盾牌的造型：設計稿 art/gear/shields_unique/concept（橘盾四種基本款.png、紅盾六面.png）。
 * 橘四種基本款：bulwark 鋼鐵壁壘、emblem 元素紋章盾、bone 獸骨刺盾、carapace 甲殼岩盾；
 * 紅六面各一種：wall 世界之壁、storm 雷鳴壁壘、mirror 毀滅之鏡、tomb 墓守巨盾、magma 熔核之盾、knight 墮騎士之盾。
 * 座標同原本的盾（ArmorPieces.shieldMeshes）：盾面朝 +X，Y = 高、Z = 寬。
 */
export type ShieldStyle = 'bulwark' | 'emblem' | 'bone' | 'carapace' | 'wall' | 'storm' | 'mirror' | 'tomb' | 'magma' | 'knight';

export interface StyledShieldOptions {
  style: ShieldStyle;
  size: number;
  mat: Tones;
  rim: Tones;
  boss?: Tones;
  spikeColors?: Tones;
  gem?: number | null;
  runes?: number;
}

interface Ctx {
  o: StyledShieldOptions;
  k: number;
  glow: number;
  meshes: Mesh[];
}

const BANNER: Tones = [0xc8302a, 0xa82420, 0x6a1410, 0xb82a24];
const FACETS = { size: 1.2, bump: 0.18, vary: 0.06 };
const dense = (m: Mesh, seed = 0): Mesh => refine(m, { ...FACETS, seed });
/** 盾面中央凸起的高度（零件貼在這個 X 上） */
const FX = 1.2;
const shiftX = (m: Mesh, dx: number): Mesh => mapVerts(m, ([x, y, z]) => [x + dx, y, z]);
const scale = (pts: [number, number][], k: number): [number, number][] => pts.map(([y, z]) => [y * k, z * k]);
/** 盾身：外框（rim，略大、在後）＋盾面（mat） */
function body(c: Ctx, outline: [number, number][], rimScale = 1.08, mid = 0.6): void {
  c.meshes.push(dense(shiftX(plate(scale(outline, rimScale), 0.3, 0.45, c.o.rim), 0.25), 1));
  c.meshes.push(dense(shiftX(plate(outline, 0.3, mid, c.o.mat, 2), 0.55), 2));
}
const ringPts = (n: number, ry: number, rz: number, a0 = 0): [number, number][] => Array.from({ length: n }, (_, i) => [Math.cos(a0 + (i / n) * Math.PI * 2) * ry, Math.sin(a0 + (i / n) * Math.PI * 2) * rz]);
/** 盾面上一條凸起的帶（十字、光溝、框） */
const band = (c: Ctx, a: [number, number], b: [number, number], h: number, colors: Tones, t = 0.22, x = FX) => c.meshes.push(dense(slab([x, a[0], a[1]], [x, b[0], b[1]], t, h, colors)));
const stud = (c: Ctx, y: number, z: number, r: number, color: number, x = FX) => c.meshes.push(gem(r, [x + 0.1, y, z], color, [0.7, 1, 1], 5, 3));
/** 沿盾緣往外的尖刺 */
const edgeSpike = (c: Ctx, y: number, z: number, dy: number, dz: number, len: number, colors: Tones, r = 0.5) => c.meshes.push(dense(taper([0.6, y, z], [0.6, y + dy * len, z + dz * len], [r * 0.7, r], [0.04, 0.05], colors, 4, 0, Math.PI / 4)));

// ─────────────────────────── 橘：四種基本款 ───────────────────────────

/** A 鋼鐵壁壘：高大的塔盾、上下尖、金色外框；正面金色十字、四周鉚釘 */
function bulwark(c: Ctx): void {
  const { k, o, glow } = c;
  body(c, scale([[5.6, 0], [4.8, 2.6], [-4.4, 2.6], [-5.6, 0], [-4.4, -2.6], [4.8, -2.6]], k));
  band(c, [4.6 * k, 0], [-4.6 * k, 0], 0.5 * k, o.rim);
  band(c, [1.4 * k, -2.2 * k], [1.4 * k, 2.2 * k], 0.45 * k, o.rim);
  c.meshes.push(gem(0.6 * k, [FX + 0.3, 1.4 * k, 0], glow, [0.8, 1.3, 1], 6, 4));
  for (const y of [4, 2.4, -0.6, -2.6, -4]) for (const z of [-2.1, 2.1]) stud(c, y * k, z * k, 0.28 * k, o.rim[0]!);
  for (const sd of [1, -1]) edgeSpike(c, sd * 5.5 * k, 0, sd, 0, 1.2 * k, o.rim);
}

/** B 元素紋章盾：圓盾上下各一個尖角；金色外圈刻著發光符文，中央是元素紋章（往上竄的光焰） */
function emblemShield(c: Ctx): void {
  const { k, o, glow } = c;
  const round = ringPts(20, 3.4 * k, 3 * k);
  body(c, round, 1.12);
  c.meshes.push(dense(shiftX(plate(scale(ringPts(20, 2.3, 2), k), 0.2, 0.35, [darken(o.mat[0]!, 0.35), darken(o.mat[1]!, 0.35), darken(o.mat[2]!, 0.35), darken(o.mat[0]!, 0.35)]), 1), 3));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    c.meshes.push(gem(0.26 * k, [FX - 0.05, Math.cos(a) * 2.8 * k, Math.sin(a) * 2.45 * k], glow, [0.5, 1.2, 1], 4, 3));
  }
  for (let i = 0; i < 5; i++) {
    const z = (i - 2) * 0.45 * k, h = (i === 2 ? 2.6 : i % 2 ? 1.9 : 1.3) * k;
    c.meshes.push(edge([FX + 0.35, -1.2 * k, z * 0.6], [FX + 0.35, -1.2 * k + h, z], [0.25, 0.35 * k], [0.04, 0.05], glowTones(glow)));
  }
  c.meshes.push(gem(0.55 * k, [FX + 0.4, -0.6 * k, 0], lighten(glow, 0.3), [0.8, 1, 1], 6, 4));
  for (const [dy, dz, len] of [[1, 0, 1.6], [-1, 0, 1.6], [0, 1, 0.9], [0, -1, 0.9]] as const) edgeSpike(c, dy * 3.6 * k, dz * 3.2 * k, dy, dz, len * k, o.rim, 0.55);
}

/** C 獸骨刺盾：鱗片疊成的圓盾、外圈一圈骨刺、頂上兩支彎角；中央是骨製獸頭盾心 */
function boneShield(c: Ctx): void {
  const { k, o, glow } = c;
  const bone = o.spikeColors ?? o.rim;
  body(c, ringPts(18, 3.5 * k, 3 * k), 1.05);
  for (let row = 0; row < 3; row++) {
    const r = (1.2 + row * 0.85) * k;
    const n = 7 + row * 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + row * 0.3;
      c.meshes.push(gem(0.55 * k, [FX - 0.1, Math.cos(a) * r * 1.1, Math.sin(a) * r * 0.95], o.mat[(i + row) % 3]!, [0.35, 0.8, 1], 4, 3));
    }
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    edgeSpike(c, Math.cos(a) * 3.5 * k, Math.sin(a) * 3 * k, Math.cos(a), Math.sin(a), (i % 2 ? 1 : 1.6) * k, bone, 0.5);
  }
  for (const sd of [1, -1]) c.meshes.push(...chain([[0.6, 3 * k, sd * 1.2 * k], [0.6, 4.4 * k, sd * 1.8 * k], [0.6, 5.6 * k, sd * 1.4 * k], [0.8, 6.1 * k, sd * 0.6 * k]], [0.5, 0.6], [0.04, 0.05], bone, false));
  c.meshes.push(gem(1.3 * k, [FX + 0.3, 0.2 * k, 0], bone[0]!, [0.7, 1.15, 1], 6, 4));
  c.meshes.push(edge([FX + 0.4, -0.6 * k, 0], [FX + 0.4, -2.4 * k, 0], [0.4, 0.6 * k], [0.04, 0.05], bone));
  for (const z of [-0.5, 0.5]) c.meshes.push(gem(0.25 * k, [FX + 1.1, 0.4 * k, z * k], glow, [0.6, 1, 1], 4, 3));
}

/** D 甲殼岩盾：不規則的岩殼 / 甲殼，表面一顆顆凸起的岩塊，發光的裂縫與囊泡，頂上一支岩刺 */
function carapace(c: Ctx): void {
  const { k, o, glow } = c;
  body(c, scale([[5, 0.4], [4.2, 2.2], [2.2, 3.1], [-0.6, 3.2], [-3, 2.4], [-5, 0.6], [-5.4, -0.3], [-3.4, -2.3], [-0.4, -3.1], [2.4, -3], [4.4, -1.8]], k), 1.06, 0.8);
  const knobs: [number, number, number][] = [[3, 0.4, 1.1], [1.2, -1.6, 0.9], [1.4, 1.5, 1], [-0.8, 0, 1.2], [-2.8, -1.2, 0.9], [-2.6, 1.3, 0.85], [-4.2, 0.1, 0.7], [3.6, -1.4, 0.6], [0.2, 2.5, 0.6]];
  knobs.forEach(([y, z, r], i) => c.meshes.push(gem(r * k, [FX - 0.05, y * k, z * k], o.mat[i % 3]!, [0.55, 1, 1], 5, 3)));
  const crack = (pts: [number, number][]) => c.meshes.push(...chain(pts.map(([y, z]) => [FX + 0.25, y * k, z * k] as V3), [0.3, 0.2], [0.3, 0.12], glowTones(glow)));
  crack([[4.4, -0.6], [2.2, 0], [0.2, -0.8], [-1.6, 0.6], [-3.6, -0.2], [-4.8, 0.4]]);
  crack([[2.2, 0], [2.6, 2.2]]);
  crack([[0.2, -0.8], [-0.6, -2.6]]);
  crack([[-1.6, 0.6], [-1.2, 2.6]]);
  for (const [y, z] of [[3.4, 1.8], [-1.8, -2.2], [-3.6, 1.6], [0.8, 2.8]] as const) c.meshes.push(gem(0.42 * k, [FX + 0.2, y * k, z * k], glow, [1, 1, 1], 6, 4));
  edgeSpike(c, 5 * k, 0.4 * k, 1, 0.1, 1.6 * k, o.mat, 0.7);
}

// ─────────────────────────── 紅：六面專屬 ───────────────────────────

/** 世界之壁：一段古老的石磚城牆，頂上是城垛；金色框邊，兩側垂著紅旗，中央一道金色長釘 */
function wall(c: Ctx): void {
  const { k, o, glow } = c;
  const top = 4.6;
  const outline: [number, number][] = [[top + 0.8, 2.9], [top + 0.8, 1.9], [top, 1.9], [top, 0.5], [top + 0.8, 0.5], [top + 0.8, -0.5], [top, -0.5], [top, -1.9], [top + 0.8, -1.9], [top + 0.8, -2.9], [-4.2, -2.9], [-5.4, 0], [-4.2, 2.9]];
  body(c, scale(outline, k), 1.06, 0.4);
  const brick: Tones = [lighten(o.mat[0]!, 0.1), o.mat[1]!, o.mat[2]!, o.mat[0]!];
  for (let row = 0; row < 7; row++) {
    const y = (3.8 - row * 1.25) * k;
    const off = row % 2 ? 0.7 : 0;
    for (let z = -2.1 + off; z <= 2.2; z += 1.4) c.meshes.push(dense(slab([FX - 0.15, y + 0.5 * k, z * k], [FX - 0.15, y - 0.5 * k, z * k], 0.16, 0.6 * k, brick, 0.16, 0.6 * k, row)));
  }
  for (const sd of [1, -1]) c.meshes.push(dense(slab([FX + 0.15, 4 * k, sd * 1.5 * k], [FX + 0.15, 0.6 * k, sd * 1.5 * k], 0.06, 0.45 * k, BANNER, 0.06, 0.25 * k)));
  band(c, [4.4 * k, 0], [-4.6 * k, 0], 0.32 * k, o.rim, 0.3);
  c.meshes.push(gem(0.6 * k, [FX + 0.45, 0.8 * k, 0], glow, [0.8, 1.4, 1], 6, 4));
  edgeSpike(c, -5.3 * k, 0, -1, 0, 1.1 * k, o.rim);
}

/** 雷鳴壁壘：厚重的騎士盾，中央一圈儲雷的線圈（圈裡一道閃電），四道閃電紋往盾緣散開；上下藍晶 */
function storm(c: Ctx): void {
  const { k, o, glow } = c;
  body(c, scale([[5, 0], [4.4, 2.4], [3.6, 3.2], [-0.6, 3], [-3.4, 2], [-5.6, 0], [-3.4, -2], [-0.6, -3], [3.6, -3.2], [4.4, -2.4]], k), 1.08, 0.7);
  const coil: V3[] = ringPts(16, 1.5 * k, 1.5 * k).map(([y, z]) => [FX + 0.2, y + 0.4 * k, z] as V3);
  coil.push(coil[0]!);
  c.meshes.push(...chain(coil, [0.35, 0.35], [0.35, 0.35], o.rim));
  c.meshes.push(...chain([[FX + 0.45, 1.5 * k, 0.4 * k], [FX + 0.45, 0.5 * k, -0.35 * k], [FX + 0.45, 0.4 * k, 0.35 * k], [FX + 0.45, -0.8 * k, -0.4 * k]], [0.3, 0.32 * k], [0.3, 0.22 * k], glowTones(glow)));
  for (const [dy, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const pts: V3[] = [[FX + 0.2, 0.4 * k + dy * 1.4 * k, dz * 1 * k], [FX + 0.2, 0.4 * k + dy * 2.2 * k, dz * 1.9 * k], [FX + 0.2, 0.4 * k + dy * 2.6 * k, dz * 1.5 * k], [FX + 0.1, 0.4 * k + dy * 3.6 * k, dz * 2.4 * k]];
    c.meshes.push(...chain(pts, [0.22, 0.2], [0.2, 0.12], glowTones(glow)));
  }
  for (const y of [4.2, -4.5]) c.meshes.push(gem(0.55 * k, [FX, y * k, 0], 0x5aa8ff, [0.8, 1.6, 1], 6, 4));
  for (const sd of [1, -1]) edgeSpike(c, 3.8 * k, sd * 3.1 * k, 0.6, sd * 0.8, 1.1 * k, o.rim);
}

/** 毀滅之鏡：黑框裡一面多切面的亮鏡，鏡面裂紋透紅光；邊緣一圈尖刺 */
function mirror(c: Ctx): void {
  const { k, o, glow } = c;
  const kite = scale([[5.6, 0], [3.2, 2.9], [-1.4, 2.6], [-5.6, 0], [-1.4, -2.6], [3.2, -2.9]], k);
  body(c, kite, 1.1, 0.5);
  const face: Tones = [0xf4f4f8, 0xd8d8e0, 0x9a9aa8, 0xe8e8f0];
  c.meshes.push(dense(shiftX(plate(scale(kite, 0.8), 0.2, 0.75, face, 3), 0.75), 3));
  for (const pts of [[[4.2, 0], [2, 0.6], [0.4, -0.4], [-1.6, 0.4], [-4, 0]], [[2, 0.6], [1.6, 2]], [[0.4, -0.4], [-0.2, -1.9]], [[-1.6, 0.4], [-2.2, 1.5]]] as [number, number][][]) c.meshes.push(...chain(pts.map(([y, z]) => [FX + 0.45, y * k, z * k] as V3), [0.22, 0.16], [0.22, 0.1], glowTones(glow)));
  for (let i = 0; i < 12; i++) {
    const t0 = i / 12;
    const seg = Math.floor(t0 * kite.length), f = t0 * kite.length - seg;
    const a = kite[seg]!, b = kite[(seg + 1) % kite.length]!;
    const y = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
    const l = Math.hypot(y, z) || 1;
    edgeSpike(c, y * 1.08, z * 1.08, y / l, z / l, (i % 2 ? 0.9 : 1.5) * k, o.spikeColors ?? o.rim, 0.45);
  }
}

/** 墓守巨盾：像一扇墓門的塔盾：兩根石柱、尖拱頂、中央綠光符文板，鎖鏈交叉纏住 */
function tomb(c: Ctx): void {
  const { k, o, glow } = c;
  body(c, scale([[5.6, 0], [4.6, 1.6], [3.8, 2.9], [-5, 2.9], [-5, -2.9], [3.8, -2.9], [4.6, -1.6]], k), 1.05, 0.4);
  for (const sd of [1, -1]) c.meshes.push(dense(slab([FX, 3.8 * k, sd * 2.3 * k], [FX, -4.8 * k, sd * 2.3 * k], 0.35, 0.5 * k, o.rim)));
  c.meshes.push(dense(slab([FX - 0.1, 3.4 * k, 0], [FX - 0.1, -4 * k, 0], 0.3, 1.05 * k, glowTones(darken(glow, 0.6)))));
  for (let i = 0; i < 7; i++) {
    const y = (2.8 - i * 0.95) * k;
    c.meshes.push(dense(slab([FX + 0.15, y, -0.55 * k], [FX + 0.15, y, 0.55 * k], 0.12, 0.12 * k, glowTones(glow))));
  }
  c.meshes.push(gem(0.6 * k, [FX + 0.3, 4.4 * k, 0], glow, [0.8, 1.4, 1], 6, 4), gem(0.5 * k, [FX + 0.3, -4.4 * k, 0], glow, [0.8, 1.4, 1], 6, 4));
  const links = o.spikeColors ?? o.rim;
  for (const [y0, y1] of [[2.6, -1.8], [-1.8, 2.6], [0.2, -4.2], [-4.2, 0.2]] as const) {
    const a: V3 = [FX + 0.45, y0 * k, -2.8 * k], b: V3 = [FX + 0.45, y1 * k, 2.8 * k];
    for (let j = 0; j < 8; j++) {
      const f0 = j / 8, f1 = (j + 0.75) / 8;
      const p = (f: number): V3 => [a[0], a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      c.meshes.push(taper(p(f0), p(f1), [0.18, 0.18], [0.18, 0.18], links, 6, j, Math.PI / 6));
    }
  }
}

/** 熔核之盾：黑色岩殼拼成、邊緣一圈岩刺；岩縫流著岩漿，中央一顆熔核 */
function magma(c: Ctx): void {
  const { k, o, glow } = c;
  const outline: [number, number][] = ringPts(16, 4, 3.3).map(([y, z], i) => (i % 2 ? [y * 0.86, z * 0.86] : [y, z]) as [number, number]);
  body(c, scale(outline, k), 1.04, 0.8);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = (i % 2 ? 2.6 : 1.5) * k;
    c.meshes.push(gem(0.95 * k, [FX - 0.05, Math.cos(a) * r * 1.15, Math.sin(a) * r], o.mat[i % 3]!, [0.5, 1, 1], 5, 3));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    c.meshes.push(...chain([[FX + 0.3, Math.cos(a) * 1 * k, Math.sin(a) * 0.9 * k], [FX + 0.3, Math.cos(a + 0.25) * 2.2 * k, Math.sin(a + 0.25) * 1.9 * k], [FX + 0.2, Math.cos(a) * 3.6 * k, Math.sin(a) * 3 * k]], [0.28, 0.24], [0.26, 0.12], glowTones(glow)));
  }
  c.meshes.push(gem(1.1 * k, [FX + 0.5, 0, 0], glow, [0.7, 1, 1], 8, 5), gem(0.6 * k, [FX + 0.95, 0, 0], lighten(glow, 0.4), [0.6, 1, 1], 6, 4));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    edgeSpike(c, Math.cos(a) * 4 * k, Math.sin(a) * 3.3 * k, Math.cos(a), Math.sin(a), (i % 3 === 0 ? 1.8 : 1) * k, o.mat, 0.6);
  }
}

/** 墮騎士之盾：黑鐵鳶盾、邊緣尖角；正面三道光溝（紅 / 藍 / 黃 = 火 / 冰 / 雷），各嵌一顆元素寶石 */
function knight(c: Ctx): void {
  const { k, o } = c;
  body(c, scale([[5.4, 0], [4.6, 1.6], [4, 3], [0, 2.9], [-3.6, 1.8], [-5.8, 0], [-3.6, -1.8], [0, -2.9], [4, -3], [4.6, -1.6]], k), 1.08, 0.6);
  for (const [z, col] of [[-1.25, 0xff3a2a], [0, 0x3a8cff], [1.25, 0xffc030]] as const) {
    c.meshes.push(dense(slab([FX + 0.05, 3.2 * k, z * k], [FX + 0.05, -2.6 * k, z * 0.75 * k], 0.24, 0.26 * k, glowTones(col), 0.24, 0.12 * k)));
    c.meshes.push(gem(0.5 * k, [FX + 0.25, 3.4 * k, z * k], col, [0.8, 1.5, 1], 6, 4));
  }
  const sp = o.spikeColors ?? o.rim;
  for (const [y, z, dy, dz, len] of [[5.3, 0, 1, 0, 1.6], [4.2, 2.9, 0.5, 0.9, 1.3], [4.2, -2.9, 0.5, -0.9, 1.3], [-5.7, 0, -1, 0, 1.4], [0, 2.9, 0, 1, 0.9], [0, -2.9, 0, -1, 0.9]] as const) edgeSpike(c, y * k, z * k, dy, dz, len * k, sp, 0.55);
}

const BUILDERS: Record<ShieldStyle, (c: Ctx) => void> = { bulwark, emblem: emblemShield, bone: boneShield, carapace, wall, storm, mirror, tomb, magma, knight };

export function styledShieldMeshes(o: StyledShieldOptions): Mesh[] {
  const c: Ctx = { o, k: o.size, glow: o.runes ?? o.gem ?? 0xfff0c0, meshes: [] };
  BUILDERS[o.style](c);
  return c.meshes;
}
