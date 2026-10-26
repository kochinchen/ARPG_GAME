import type { DataRegistry } from '../../data/DataRegistry';
import type { Rarity } from '../../data/schema/item';
import type { ItemInstance } from '../../game/items/ItemInstance';
import { facetize, loft, tone } from '../figure/Facets';
import { specForItem } from '../figure/gear/ArmorLooks';
import { HIDE_DARK, helmetMeshes, scaleMeshes, shieldMeshes, type ArmorSpec, type BootSpec, type GloveSpec } from '../figure/gear/ArmorPieces';
import { itemThemes, THEMES, themeColors } from '../figure/gear/GearTheme';
import { apply, box, dot, faceNormal, jointRotation, lowSphere, mul, normalize, placeMesh, prism, rotX, rotY, rotZ, type M3, type Mesh, type V3 } from '../figure/Poly3D';
import { HOLD, weaponLookFor, type WeaponLook } from '../figure/weapons/WeaponLooks';
import { ABYSS, BLACK_STEEL, BLOOD_STEEL, BONE, BRONZE, chain, CRIMSON, darken, EMBER, gem, GOLD, ICE, JADE, LEATHER, lighten, SHADOW, SILVER, STAR, STORM, taper, VOID, WOOD, type Tones } from '../figure/weapons/WeaponParts';

/**
 * 物品圖示：用遊戲裡的裝備模型（與主角身上相同的造型、染色、專屬外觀）投影成 SVG，
 * 背景是稀有度光暈，主題（詞綴）加上粒子。結果是 data URI，同一種外觀只畫一次。
 * 戒指、護符、藥水沒有穿在身上的模型，另外用簡單的多面體畫。
 */

const F = (m: Mesh, seed = 0, bump = 0.1) => facetize(m, bump, seed);
const t = (m: Mesh, c: Tones, s = 0) => tone(m, c, s);
const spike = (a: V3, dir: V3, len: number, r: number, colors: Tones, seed = 0) =>
  taper(a, [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len], [r, r], [0.04, 0.04], colors, 5, seed, 0.3);
const glowBox = (w: number, h: number, d: number, color: number, c: V3) => t(box(w, h, d, color, c), [color, 0xffffff]);
const SOLE: Tones = [0x2a201a, 0x221a15];

// ─────────────────────────── 圖示專用的整件造型 ───────────────────────────
// 身上的盔甲、手套、靴子分散在好幾個關節；圖示要一件完整的物品，所以另外組合。

/** 整件盔甲（軀幹、領口、腰帶、肩甲、垂甲、紋章） */
function armorIcon(s: ArmorSpec): Mesh[] {
  const out: Mesh[] = [];
  const mats = s.mat;
  out.push(loft([{ y: -7, rx: 4.4, rz: 2.8 }, { y: -3, rx: 4.6, rz: 3 }, { y: 1, rx: 5.4, rz: 3.4 }, { y: 4.6, rx: 5.9, rz: 3.3 }, { y: 6.6, rx: 5, rz: 2.6 }, { y: 7.3, rx: 2.4, rz: 1.7 }], 12, mats, 1));
  out.push(F(t(prism(10, 6.2, 8, [2.7, 2], [3, 2.3], s.trim[0]!), s.trim, 2), 2, 0.06));
  if (s.style === 'cloth') for (const y of [-2, 0.6, 3.2]) out.push(box(7.6, 0.25, 0.4, 0x5a4c36, [0, y, 3.3]));
  if (s.style === 'chain') for (let y = -4; y < 5; y += 1.3) out.push(box(8.6, 0.18, 0.3, 0x5c6168, [0, y, 3.2 + (y > 0 ? 0.2 : -0.1)]));
  if (s.style === 'plate' && !s.carapace) [-4.6, -3.3, -2].forEach((y, i) => out.push(F(t(prism(12, y, y + 1.1, [4.75 + i * 0.1, 3.15], [4.85 + i * 0.1, 3.2], mats[0]!), mats, 3 + i), 3 + i, 0.05)));
  if (s.carapace) [-5, -2.6, -0.2, 2.2].forEach((y, i) => out.push(F(t(prism(12, y, y + 2, [4.7 + i * 0.25, 3.2], [5.1 + i * 0.25, 3.45], mats[1]!), mats, 7 + i), 7 + i, 0.14)));
  out.push(F(t(prism(14, -6.6, -5.2, [4.7, 3.05], [4.75, 3.1], HIDE_DARK[0]!), HIDE_DARK, 4), 4, 0.04));
  out.push(t(box(1.5, 1.5, 0.5, GOLD[0]!, [0, -5.9, 3.2]), GOLD));
  if (s.tassets) for (const x of [-1, 1]) out.push(F(t(placeMesh(box(3, 4, 0.8, mats[0]!), [0, 0, x * 0.18], [x * 2.6, -8.4, 2.4]), mats, 6), 6));
  if (s.ribs) [-1.5, 0.6, 2.7].forEach((y) => { for (const x of [-1, 1]) out.push(...chain([[x * 0.4, y + 0.6, 3.75], [x * 2.6, y, 3.6], [x * 4.6, y - 1, 2.6]], [0.5, 0.45], [0.3, 0.25], s.ribs!, false)); });
  if (s.pauldron > 0) {
    const p = s.pauldron;
    const pm = s.pauldronMat ?? mats;
    for (const side of [-1, 1]) {
      const plate = (r0: number, r1: number, hh: number, x: number, y: number, tilt: number, seed: number) =>
        F(t(placeMesh(prism(8, 0, -hh, [r0, r0 * 0.95], [r1, r1 * 0.95], pm[0]!, [0, 0, 0], 0.3), [0, 0, -tilt * side], [x * side, y, 0]), pm, seed), seed, 0.14);
      out.push(plate(2.6 * p, 3.3 * p, 2.2 * p, 5.3 + 0.6 * p, 7 + 0.4 * p, 0.35, 11), plate(2.7 * p, 3.1 * p, 1.8 * p, 5.8 + 0.8 * p, 5.2 + 0.2 * p, 0.5, 12));
      if (p > 1.2) out.push(plate(2.4 * p, 2.7 * p, 1.6 * p, 6.2 + p, 3.6, 0.62, 13));
      if (s.spikes) for (let i = 0; i < 3; i++) out.push(spike([side * (5.6 + p + i * 0.9), 7.6 + p * 0.4 - i * 0.5, -0.6 + i * 0.6], [side * 0.5, 1, 0], 2.2 + p * 0.6, 0.5, s.spikeColors ?? BLACK_STEEL, i));
      if (s.trimPauldron) {
        const y = 7 + 0.4 * p - 2.2 * p;
        out.push(t(prism(8, y, y - 0.4, [3.35 * p, 3.2 * p], [3.4 * p, 3.25 * p], s.trimPauldron[0]!, [(5.3 + 0.6 * p) * side, 0, 0]), s.trimPauldron));
      }
    }
  }
  if (s.emblem) out.push(gem(1.3, [0, 2.2, 3.9], s.emblem, [1, 1.2, 0.6]));
  if (s.runes) for (const [x, y] of [[-2.6, 3.6], [2.6, 3.6], [-2.2, -0.6], [2.2, -0.6]] as [number, number][]) out.push(glowBox(0.7, 0.7, 0.5, s.runes, [x, y, 3.55]));
  if (s.spikes && !s.pauldron) for (let i = 0; i < 3; i++) out.push(spike([-2 + i * 2, 4.2, 3.4], [0, 0.3, 1], 1.8, 0.45, s.spikeColors ?? BLACK_STEEL, i));
  return out;
}

/** 一隻護手（袖口、手背、四指、拇指、指節甲、爪、尖刺、寶石） */
function gloveIcon(s: GloveSpec): Mesh[] {
  const out: Mesh[] = [];
  const flare = s.flare ?? 0;
  out.push(loft([{ y: -7, rx: 2.6 + flare, rz: 2.4 + flare * 0.8 }, { y: -3, rx: 2.2 + flare * 0.3, rz: 2 }, { y: 0, rx: 2, rz: 1.75 }], 12, s.cuff, 1));
  if (s.trim) out.push(t(prism(12, -7.1, -6.2, [2.75 + flare, 2.55 + flare * 0.8], [2.7 + flare, 2.5 + flare * 0.8], s.trim[0]!), s.trim, 2));
  out.push(F(t(box(4.4, 5, 2, s.hand[0]!, [0, 2.4, 0]), s.hand, 3), 3, 0.12));
  [-1.6, -0.55, 0.5, 1.55].forEach((x, i) => {
    const len = [3.2, 3.8, 3.6, 2.8][i]!;
    out.push(...chain([[x, 4.8, 0], [x * 1.05, 4.8 + len * 0.55, 0.35], [x * 1.08, 4.8 + len, 0.9]], [0.5, 0.5], [0.42, 0.42], s.fingers, false));
    if (s.claws) out.push(taper([x * 1.08, 4.8 + len, 0.9], [x * 1.1, 4.8 + len + s.claws.len, 1.9], [0.38, 0.38], [0.04, 0.04], s.claws.colors, 4, i, 0.3));
  });
  out.push(...chain([[2.2, 1.2, 0.4], [3.2, 2.8, 0.9], [3.4, 4.4, 1.3]], [0.55, 0.55], [0.45, 0.45], s.fingers, false));
  if (s.knuckle) out.push(F(t(box(4.8, 1.2, 2.4, s.knuckle[0]!, [0, 4.9, 0.1]), s.knuckle, 4), 4, 0.1));
  if (s.plate) out.push(F(t(placeMesh(box(4, 3.8, 0.8, s.plate[0]!), [0.08, 0, 0], [0, 2.3, 1.2]), s.plate, 5), 5, 0.14));
  const spikes = s.spikes ?? 0;
  for (let i = 0; i < spikes; i++) out.push(spike([-1.5 + i * (3 / Math.max(1, spikes - 1)), 5.1, 1.2], [0, 0.35, 1], 1.8, 0.4, s.spikeColors ?? BLACK_STEEL, i));
  if (s.gem) out.push(gem(0.9, [0, 2.4, 1.75], s.gem));
  if (s.runes) for (const y of [-2, -4.4]) out.push(glowBox(0.7, 0.7, 0.5, s.runes, [0, y, 2.2]));
  return out;
}

/** 一隻靴子（靴筒、腳掌、鞋底、鞋頭、靴口、綁帶、脛甲、護膝、尖刺、翅膀） */
function bootIcon(s: BootSpec): Mesh[] {
  const out: Mesh[] = [];
  const h = 8;
  out.push(loft([{ y: -1.2, rx: 2.2, rz: 2.15 }, { y: h * 0.35, rx: 2.45, rz: 2.35 }, { y: h * 0.75, rx: 2.25, rz: 2.2 }, { y: h, rx: 2.45, rz: 2.4 }], 12, s.mat, 1));
  // 腳掌沿 X 放樣（腳跟 → 鞋尖）
  const foot = (rings: Parameters<typeof loft>[0], colors: Tones, seed: number): Mesh => {
    const m = loft(rings, 10, colors, seed);
    return { ...m, verts: m.verts.map(([x, y, z]) => [y, -x - 1.6, z] as V3) };
  };
  out.push(foot([{ y: -1.8, rx: 1.7, rz: 2 }, { y: 0.6, rx: 1.9, rz: 2.15 }, { y: 3, rx: 1.45, rz: 2.2 }, { y: 4.8, rx: 1.05, rz: 1.9 }, { y: 6, rx: 0.5, rz: 1.1 }], s.mat, 2));
  out.push(t(box(8.4, 0.8, 4.4, SOLE[0]!, [2.1, -3.1, 0]), SOLE));
  out.push(t(box(2.2, 1, 4.2, SOLE[0]!, [-1.2, -3.6, 0]), SOLE));
  if (s.toe) out.push(foot([{ y: 3.2, rx: 1.55, rz: 2.32 }, { y: 4.9, rx: 1.15, rz: 2.02 }, { y: 6.2, rx: 0.55, rz: 1.2 }], s.toe, 3));
  const cuff = s.cuff ?? HIDE_DARK;
  out.push(F(t(prism(14, h - 0.2, h + 1.4, [2.6, 2.6], [3.1, 3.1], cuff[0]!), cuff, 4), 4, 0.06));
  if (s.straps) for (const y of [1.2, 3.4, 5.6]) out.push(t(prism(12, y, y + 0.55, [2.3, 2.3], [2.3, 2.3], HIDE_DARK[0]!), HIDE_DARK, 5));
  if (s.shin) out.push(F(t(placeMesh(box(1, h * 0.7, 3, s.shin[0]!), [0, 0, 0.06], [2.2, h * 0.5, 0]), s.shin, 6), 6, 0.14));
  if (s.knee) out.push(F(t(lowSphere(1.5, s.knee[0]!, [2.2, h - 0.4, 0], 8, 5, [0.7, 1, 1]), s.knee, 7), 7, 0.1));
  for (let i = 0; i < (s.spikes ?? 0); i++) out.push(spike([2.6, h * 0.3 + i * h * 0.22, 0], [1, 0.25, 0], 1.6, 0.45, s.spikeColors ?? BLACK_STEEL, i));
  if (s.wings) {
    [1.9, -1.9].forEach((z, k) => {
      out.push(taper([-1.8, 2.6, z], [-5.6, 6.4, z * 1.4], [0.25, 1.4], [0.05, 0.2], s.wings!, 4, 1 + k, 0));
      out.push(taper([-1.8, 1.8, z], [-6, 3.8, z * 1.4], [0.25, 1], [0.05, 0.15], s.wings!, 4, 3 + k, 0));
    });
  }
  if (s.gem) out.push(gem(0.8, [2.5, h * 0.75, 0], s.gem));
  if (s.runes) for (const y of [h * 0.35, h * 0.55]) out.push(glowBox(0.5, 0.7, 0.7, s.runes, [2.75, y, 0]));
  return out;
}

/** 飾品的材質與預設寶石（依基底：銅 / 銀 / 金 / 符文；木 / 骨 / 銀 / 符文） */
const JEWEL: Record<string, { metal: Tones; gem: number | null; runes?: number }> = {
  'ring.plain': { metal: BRONZE, gem: null },
  'ring.silver': { metal: SILVER, gem: 0x4aa8ff },
  'ring.gold': { metal: GOLD, gem: 0xd02030 },
  'ring.rune': { metal: ABYSS, gem: 0xb070ff, runes: 0xc8a0ff },
  'amulet.plain': { metal: WOOD, gem: null },
  'amulet.bone': { metal: BONE, gem: null },
  'amulet.gold': { metal: GOLD, gem: 0xd02030 },
  'amulet.silver': { metal: SILVER, gem: 0x4aa8ff },
  'amulet.rune': { metal: ABYSS, gem: 0xb070ff, runes: 0xc8a0ff },
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T>(list: readonly T[], key: string, salt: number): T => list[(hash(key) >>> salt) % list.length]!;

/** 橘 / 紅飾品：外形、材質、寶石、戒指款式都依傳奇 ID 固定挑選（同一件永遠一樣，不同件看得出差別） */
const UNIQUE_SHAPES = { ring: ['plain', 'silver', 'gold', 'rune'], amulet: ['plain', 'bone', 'silver', 'rune'] } as const;
const LEGENDARY_METALS: Tones[] = [GOLD, SILVER, BRONZE, BONE, JADE, ICE, EMBER, STAR];
const MYTHIC_METALS: Tones[] = [ABYSS, CRIMSON, VOID, SHADOW, BLOOD_STEEL, STORM];
const GEMS = [0xffb040, 0x4aa8ff, 0xd02030, 0x7ee08a, 0xc070ff, 0xfff0b0, 0x40e0d0, 0xff6ab0];
const RUNES = [0xff9a7a, 0xc8a0ff, 0x9fe8ff, 0xffe08a];
type RingStyle = 'solitaire' | 'twin' | 'crown' | 'band';
const RING_STYLES: RingStyle[] = ['solitaire', 'twin', 'crown', 'band'];

function jewelFor(baseId: string, rarity: Rarity, key?: string): (typeof JEWEL)[string] {
  const j = JEWEL[baseId] ?? JEWEL[baseId.startsWith('ring') ? 'ring.plain' : 'amulet.plain']!;
  if (!key) return j;
  if (rarity === 'mythic') return { ...j, metal: pick(MYTHIC_METALS, key, 0), gem: pick(GEMS, key, 3), runes: pick(RUNES, key, 7) };
  return { ...j, metal: pick(LEGENDARY_METALS, key, 0), gem: pick(GEMS, key, 3) };
}

/** 戒指：一圈戒身、戒台與寶石（主題色） */
function ringIcon(baseId: string, gemColor: number | null, rarity: Rarity, key?: string): Mesh[] {
  const j = jewelFor(baseId, rarity, key);
  const style: RingStyle = key ? pick(RING_STYLES, key, 5) : 'solitaire';
  const pts: V3[] = Array.from({ length: 15 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    return [Math.sin(a) * 3, Math.cos(a) * 3, 0];
  });
  const band: [number, number] = style === 'band' ? [1.1, 0.55] : [0.75, 0.6];
  const out: Mesh[] = [...chain(pts, band, band, j.metal, false)];
  const color = gemColor ?? j.gem;
  if (style === 'band') {
    // 寬戒身、三顆鑲嵌的小寶石
    for (const a of [-0.45, 0, 0.45]) out.push(gem(0.55, [Math.sin(a) * 3.1, Math.cos(a) * 3.1, 0.7], color ?? 0xfff0b0));
  } else if (style === 'twin') {
    out.push(F(t(box(3.4, 1, 1.6, j.metal[0]!, [0, 3.1, 0]), j.metal, 3), 3, 0.06));
    for (const x of [-0.9, 0.9]) out.push(gem(0.85, [x, 3.9, 0], color ?? 0xfff0b0, [1, 0.8, 1]));
  } else {
    out.push(F(t(prism(6, 2.6, 3.6, [1.3, 1.3], [1.6, 1.6], j.metal[0]!), j.metal, 3), 3, 0.06));
    if (color) out.push(gem(1.25, [0, 4.3, 0], color, [1, 0.8, 1]));
    else out.push(F(t(lowSphere(1, j.metal[1]!, [0, 4, 0], 6, 4, [1, 0.6, 1]), j.metal, 4), 4, 0.06));
    // 皇冠爪：寶石四周的尖爪
    if (style === 'crown') for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      out.push(taper([Math.cos(a) * 1.4, 3.4, Math.sin(a) * 1.4], [Math.cos(a) * 1.7, 5.2, Math.sin(a) * 1.7], [0.3, 0.3], [0.04, 0.04], j.metal, 4, i, 0.3));
    }
  }
  if (j.runes) for (const a of [1.6, 2.4, 3.9, 4.7]) out.push(glowBox(0.45, 0.45, 0.5, j.runes, [Math.sin(a) * 3, Math.cos(a) * 3, 0.65]));
  return out;
}

/** 護符：繩 / 鏈、墜子（木片、獸牙、銀牌、符文石）與寶石 */
function amuletIcon(baseId: string, gemColor: number | null, rarity: Rarity, key?: string): Mesh[] {
  const j = jewelFor(baseId, rarity, key);
  const cord = baseId === 'amulet.plain' || baseId === 'amulet.bone' ? LEATHER : GOLD;
  const out: Mesh[] = [...chain([[-2.6, 3.2, -0.4], [-2.5, 5.4, -0.6], [-1.3, 6.9, -0.8], [0, 7.3, -0.8], [1.3, 6.9, -0.8], [2.5, 5.4, -0.6], [2.6, 3.2, -0.4], [1, 2.6, 0]], [0.3, 0.3], [0.3, 0.3], cord, false)];
  out.push(...chain([[-2.6, 3.2, -0.4], [-1, 2.6, 0]], [0.3, 0.3], [0.3, 0.3], cord, false));
  out.push(F(t(box(1.2, 1, 0.8, GOLD[0]!, [0, 2.3, 0]), GOLD, 2), 2, 0.05));
  out.push(...scaleMeshes(amuletPendant(baseId, j, gemColor ?? j.gem), 1.4, [0, 2.3 - 2.3 * 1.4, 0]));
  return out;
}

function amuletPendant(baseId: string, j: (typeof JEWEL)[string], color: number | null): Mesh[] {
  const out: Mesh[] = [];
  if (baseId === 'amulet.bone') {
    out.push(taper([0, 1.8, 0], [0.4, -4.2, 0.6], [1.3, 0.9], [0.06, 0.06], BONE, 6, 1, 0.3));
    if (color) out.push(gem(0.6, [0, 0.6, 0.9], color));
  } else {
    const sides = baseId === 'amulet.rune' ? 6 : 10;
    const r0 = baseId === 'amulet.plain' ? 2.3 : 2.5;
    out.push(F(t(placeMesh(prism(sides, -0.45, 0.45, [r0, r0], [r0 * 0.9, r0 * 0.9], j.metal[0]!, [0, 0, 0], sides === 6 ? 0 : Math.PI / sides), [Math.PI / 2, 0, 0], [0, -0.6, 0]), j.metal, 3), 3, 0.08));
    if (baseId !== 'amulet.plain') out.push(t(placeMesh(prism(sides, 0.4, 0.7, [r0 * 1.02, r0 * 1.02], [r0 * 0.95, r0 * 0.95], GOLD[0]!, [0, 0, 0], sides === 6 ? 0 : Math.PI / sides), [Math.PI / 2, 0, 0], [0, -0.6, 0]), GOLD));
    if (color) out.push(gem(1.1, [0, -0.6, 0.8], color, [1, 1, 0.7]));
    if (j.runes) for (const a of [0, 2.1, 4.2]) out.push(glowBox(0.45, 0.45, 0.3, j.runes, [Math.sin(a) * 1.75, -0.6 + Math.cos(a) * 1.75, 0.65]));
  }
  return out;
}

/** 藥水瓶：液體顏色依回復生命 / 魔力（紅 / 藍 / 紫） */
function potionMeshes(hpPct: number, mpPct: number): Mesh[] {
  const liquid = hpPct > 0 && mpPct > 0 ? 0xb03a8a : mpPct > 0 ? 0x3a62d0 : 0xd0303a;
  const tones: Tones = [lighten(liquid, 0.25), liquid, darken(liquid, 0.35), lighten(liquid, 0.1)];
  const glass: Tones = [0xd8e4ea, 0xb8c8d0, 0x8a9aa4];
  return [
    loft([{ y: 0, rx: 1.4, rz: 1.4 }, { y: 0.8, rx: 3, rz: 3 }, { y: 3.2, rx: 3.5, rz: 3.5 }, { y: 5.4, rx: 2.7, rz: 2.7 }, { y: 6.4, rx: 1.2, rz: 1.2 }], 12, tones, 1),
    loft([{ y: 6.2, rx: 1.05, rz: 1.05 }, { y: 8.4, rx: 0.95, rz: 0.95 }, { y: 8.8, rx: 1.35, rz: 1.35 }, { y: 9.3, rx: 1.3, rz: 1.3 }], 8, glass, 2),
    F(t(prism(6, 9.1, 10.6, [0.95, 0.95], [0.8, 0.8], WOOD[0]!), WOOD, 3), 3, 0.08),
    t(box(0.6, 1.8, 0.4, 0xffffff, [-1.6, 3.6, 2.7]), [0xffffff, 0xe8f0ff]),
  ];
}

/** 手套與靴子畫成一雙：後面那一隻鏡像、往後錯開 */
function pair(meshes: Mesh[], mirrorAxis: 0 | 2, off: V3): Mesh[] {
  const mirror = (m: Mesh): Mesh => ({
    verts: m.verts.map((v) => {
      const w: V3 = [v[0], v[1], v[2]];
      w[mirrorAxis] = -w[mirrorAxis];
      return [w[0] + off[0], w[1] + off[1], w[2] + off[2]];
    }),
    faces: m.faces.map((f) => ({ ...f, idx: [...f.idx].reverse() })),
  });
  return [...meshes.map(mirror), ...meshes];
}

// ─────────────────────────── 投影 ───────────────────────────

const LIGHT = normalize([-0.55, 0.75, 0.85]);
const view = (x: number, y: number, z: number): M3 => mul(mul(rotZ(z), rotX(x)), rotY(y));
/** 武器：刃面朝鏡頭、尖端朝右上 */
const WEAPON_VIEW = mul(mul(rotX(-0.28), rotZ((3 * Math.PI) / 4)), rotY(-Math.PI / 2));
const VIEWS: Record<'helmet' | 'armor' | 'gloves' | 'boots' | 'shield', M3> = {
  helmet: view(0.22, -0.42, 0),
  armor: view(0.12, -0.32, 0),
  gloves: view(0.1, -0.35, -0.25),
  boots: view(0.22, -0.38, 0),
  // 盾面（+X）轉向鏡頭，略往右轉看得到厚度
  shield: view(0.12, -Math.PI / 2 + 0.38, 0),
};
const JEWEL_VIEW = view(0.3, -0.45, 0);
const POTION_VIEW = view(0.25, 0, 0);

interface Face2 {
  z: number;
  pts: [number, number][];
  color: string;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
function shade(c: number, k: number): string {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k)));
  return hex((ch(16) << 16) | (ch(8) << 8) | ch(0));
}

function project(meshes: readonly Mesh[], m: M3): Face2[] {
  const faces: Face2[] = [];
  for (const mesh of meshes) {
    const verts = mesh.verts.map((v) => apply(m, v));
    for (const f of mesh.faces) {
      if (f.idx.length < 3) continue;
      const n = normalize(faceNormal(verts, f.idx));
      if (n[2] <= 0) continue;
      faces.push({
        z: f.idx.reduce((s, i) => s + verts[i]![2], 0) / f.idx.length,
        pts: f.idx.map((i) => [verts[i]![0], -verts[i]![1]]),
        color: shade(f.color, 0.42 + 0.75 * Math.max(0, dot(n, LIGHT))),
      });
    }
  }
  return faces.sort((a, b) => a.z - b.z);
}

/** 長柄（斧、杖）把柄縮短，讓斧頭 / 杖頭成為主角 */
const SHAFT: Partial<Record<WeaponLook['kind'], { head: number; keep: number }>> = { axe: { head: 0.42, keep: 0.5 }, staff: { head: 0.3, keep: 0.38 } };
function shortenShaft(kind: WeaponLook['kind'], meshes: Mesh[]): Mesh[] {
  const cfg = SHAFT[kind];
  if (!cfg) return meshes;
  const all = meshes.flatMap((m) => m.verts);
  const ys = all.map((v) => v[1]);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const span = ymax - ymin;
  const width = (end: number) => Math.max(0, ...all.filter((v) => Math.abs(v[1] - end) < span * 0.2).map((v) => Math.hypot(v[0], v[2])));
  const headAtMin = width(ymin) > width(ymax);
  const head = span * cfg.head;
  const map = (y: number) => {
    const d = headAtMin ? y - ymin : ymax - y;
    const d2 = d <= head ? d : head + (d - head) * cfg.keep;
    return headAtMin ? ymin + d2 : ymax - d2;
  };
  return meshes.map((m) => ({ ...m, verts: m.verts.map((v) => [v[0], map(v[1]), v[2]] as V3) }));
}

/** 手上的武器轉回握點空間（取消 HOLD 的角度） */
function unheld(look: WeaponLook): Mesh[] {
  const r = jointRotation(HOLD[look.kind]);
  const inv: M3 = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
  return coarse(look.meshes).map((m) => ({ ...m, verts: m.verts.map((v) => apply(inv, v)) }));
}

/** 圖示很小：裝備用加密前的粗網格（小三角面在圖示上看不出來，只會讓圖示變大） */
const coarse = (meshes: readonly Mesh[]): Mesh[] => meshes.map((m) => m.coarse ?? m);

// ─────────────────────────── 光暈與粒子 ───────────────────────────

const RARITY_GLOW: Record<Rarity, { color: number; alpha: number }> = {
  normal: { color: 0x8a8478, alpha: 0 },
  magic: { color: 0x6f8dff, alpha: 0.2 },
  rare: { color: 0xf2d24b, alpha: 0.3 },
  epic: { color: 0xb07cff, alpha: 0.42 },
  legendary: { color: 0xff9a3c, alpha: 0.55 },
  mythic: { color: 0xff4040, alpha: 0.7 },
};

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 粒子：武器沿對角線、防具在四周 */
function particles(b: Bounds, particle: string, color: number, diagonal: boolean): string {
  const c = hex(color);
  const s = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 22;
  const spots: [number, number][] = diagonal
    ? [0.35, 0.5, 0.62, 0.74, 0.86, 0.95].map((k, i) => {
        const o = (i % 2 ? 1 : -1) * s * (2.2 + (i % 3));
        return [b.x0 + (b.x1 - b.x0) * k + o, b.y1 - (b.y1 - b.y0) * k + o];
      })
    : ([[0.1, 0.25], [0.9, 0.2], [0.05, 0.62], [0.95, 0.58], [0.2, 0.92], [0.82, 0.9]] as const).map(([u, v]) => [b.x0 + (b.x1 - b.x0) * u, b.y0 + (b.y1 - b.y0) * v]);
  const star = (x: number, y: number, r: number, w: number) =>
    `<path d="M${x} ${y - r}L${x + w} ${y - w}L${x + r} ${y}L${x + w} ${y + w}L${x} ${y + r}L${x - w} ${y + w}L${x - r} ${y}L${x - w} ${y - w}Z" fill="${c}" opacity=".85"/>`;
  const drop = (x: number, y: number) =>
    `<path d="M${x} ${y - s * 1.2}C${x + s} ${y + s * 0.2} ${x + s * 0.7} ${y + s * 1.1} ${x} ${y + s * 1.1}C${x - s * 0.7} ${y + s * 1.1} ${x - s} ${y + s * 0.2} ${x} ${y - s * 1.2}Z" fill="${c}" opacity=".85"/>`;
  let out = '';
  spots.forEach(([x, y], i) => {
    switch (particle) {
      case 'ember':
        out += `<path d="M${x} ${y - s * 1.2}L${x + s * 0.6} ${y}L${x} ${y + s * 1.2}L${x - s * 0.6} ${y}Z" fill="${c}" opacity="${(0.6 + 0.06 * i).toFixed(2)}"/>`;
        break;
      case 'frost':
        out += `<g stroke="${c}" stroke-width="${s * 0.28}" opacity=".85">${[0, 60, 120]
          .map((a) => {
            const dx = Math.cos((a * Math.PI) / 180) * s * 1.1;
            const dy = Math.sin((a * Math.PI) / 180) * s * 1.1;
            return `<line x1="${x - dx}" y1="${y - dy}" x2="${x + dx}" y2="${y + dy}"/>`;
          })
          .join('')}</g>`;
        break;
      case 'spark':
        if (i % 2 === 0) out += `<polyline points="${x - s * 1.5},${y - s} ${x - s * 0.2},${y - s * 0.2} ${x - s * 0.8},${y + s * 0.4} ${x + s * 1.4},${y + s * 1.2}" fill="none" stroke="${c}" stroke-width="${s * 0.35}" stroke-linejoin="round" opacity=".9"/>`;
        break;
      case 'blood':
        if (i % 2) out += drop(x, y);
        break;
      case 'prism':
        out += `<circle cx="${x}" cy="${y}" r="${s * (0.5 + 0.15 * (i % 3))}" fill="none" stroke="${c}" stroke-width="${s * 0.25}" opacity=".8"/>`;
        break;
      case 'star':
      case 'holy':
        out += star(x, y, s * 1.3, s * 0.3);
        break;
      case 'wind':
        if (i % 2 === 0) out += `<path d="M${x - s * 3} ${y + s * 1.6}Q${x} ${y - s * 0.4} ${x + s * 3} ${y + s * 0.4}" fill="none" stroke="${c}" stroke-width="${s * 0.3}" stroke-linecap="round" opacity=".7"/>`;
        break;
      case 'void':
      case 'shadow':
        out += `<rect x="${x - s * 0.5}" y="${y - s * 0.5}" width="${s}" height="${s}" transform="rotate(45 ${x} ${y})" fill="${c}" opacity=".7"/>`;
        break;
      case 'rock':
        out += `<path d="M${x - s * 0.7} ${y}L${x} ${y - s * 0.8}L${x + s * 0.8} ${y - s * 0.2}L${x + s * 0.4} ${y + s * 0.7}L${x - s * 0.5} ${y + s * 0.6}Z" fill="${c}" opacity=".75"/>`;
        break;
    }
  });
  return out;
}

/** 網格 → SVG（正方形 viewBox、稀有度光暈、粒子） */
function svgIcon(faces: Face2[], rarity: Rarity, effect: { particle: string; color: number } | null, diagonal: boolean): string {
  const xs = faces.flatMap((f) => f.pts.map((p) => p[0]));
  const ys = faces.flatMap((f) => f.pts.map((p) => p[1]));
  const b: Bounds = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.18;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const r = RARITY_GLOW[rarity];
  const glowColor = hex(effect?.color ?? r.color);
  const glow =
    r.alpha > 0
      ? `<defs><radialGradient id="g"><stop offset="0" stop-color="${glowColor}" stop-opacity="${r.alpha}"/><stop offset="1" stop-color="${glowColor}" stop-opacity="0"/></radialGradient></defs><circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(size * 0.5).toFixed(2)}" fill="url(#g)"/>`
      : '';
  const body = faces.map((f) => `<path d="M${f.pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L')}Z" fill="${f.color}"/>`).join('');
  const fx = effect && rarity !== 'normal' ? particles(b, effect.particle, effect.color, diagonal) : '';
  const vb = [cx - size / 2, cy - size / 2, size, size].map((v) => v.toFixed(2)).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${glow}${body}${fx}</svg>`;
}

// ─────────────────────────── 對外 ───────────────────────────

const cache = new Map<string, string | null>();
const toUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

type IconData = Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>;

/** 物品圖示（data URI）；沒有對應造型的物品回傳 null */
export function itemIcon(item: ItemInstance, data: IconData): string | null {
  if (!data.items.has(item.baseId)) return null;
  const base = data.items.get(item.baseId);
  const themes = item.rarity === 'normal' ? [] : itemThemes(item, data);
  const key = `${item.baseId}|${item.rarity}|${item.legendaryId ?? ''}|${themes.join(',')}`;
  if (cache.has(key)) return cache.get(key)!;
  const svg = buildIcon(item, base.slot, themes, data);
  const uri = svg ? toUri(svg) : null;
  cache.set(key, uri);
  return uri;
}

/** 藥水圖示（data URI） */
export function potionIcon(hpPct: number, mpPct: number): string {
  const key = `potion|${hpPct}|${mpPct}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = toUri(svgIcon(project(potionMeshes(hpPct, mpPct), POTION_VIEW), 'normal', null, false));
    cache.set(key, uri);
  }
  return uri;
}

function buildIcon(item: ItemInstance, slot: string, themes: ReturnType<typeof itemThemes>, data: IconData): string | null {
  // 主題的光暈色與粒子（形狀主題不加粒子，只有攻速 / 移速的風）
  const { main } = themeColors(themes);
  const style = main ? THEMES[main] : null;
  const themeFx = style && (!style.shape || style.particle === 'wind') ? { particle: style.particle, color: style.color } : null;
  if (slot === 'weapon') {
    const w = weaponLookFor(item, data);
    if (!w) return null;
    const meshes = shortenShaft(w.look.kind, unheld(w.look));
    const fx = w.look.glow ? { particle: w.look.glow.particle, color: w.look.glow.color } : themeFx;
    return svgIcon(project(meshes, WEAPON_VIEW), item.rarity, fx, true);
  }
  let meshes: Mesh[];
  switch (slot) {
    case 'helmet':
      meshes = coarse(helmetMeshes(specForItem('helmet', item, data)));
      break;
    case 'armor':
      meshes = armorIcon(specForItem('armor', item, data));
      break;
    case 'gloves':
      meshes = pair(gloveIcon(specForItem('gloves', item, data)), 0, [-5.2, -2.2, -3.4]);
      break;
    case 'boots':
      meshes = pair(bootIcon(specForItem('boots', item, data)), 2, [-2.6, 0.6, -4.6]);
      break;
    case 'shield':
      meshes = coarse(shieldMeshes(specForItem('shield', item, data)));
      break;
    case 'ring':
    case 'amulet': {
      // 寶石換成主題色（元素、吸血、法術；生命 / 暴擊等用基底或該件的寶石色）
      const elemental = main === 'fire' || main === 'cold' || main === 'lightning' || main === 'poison' || main === 'blood' || main === 'arcane';
      const color = style && elemental ? style.color : null;
      const key = item.legendaryId;
      const shape = key ? `${slot}.${pick(UNIQUE_SHAPES[slot], key, 0)}` : item.baseId;
      const jewel = slot === 'ring' ? ringIcon(shape, color, item.rarity, key) : amuletIcon(shape, color, item.rarity, key);
      return svgIcon(project(jewel, JEWEL_VIEW), item.rarity, themeFx, false);
    }
    default:
      return null;
  }
  return svgIcon(project(meshes, VIEWS[slot]), item.rarity, themeFx, false);
}
