import type { CoreElement, CoreTypeId } from '../../data/schema/core';
import type { CoreInstance } from '../../game/items/CoreInstance';
import { RARITY_COLORS } from '../palette';

/**
 * 熔核圖示（v0.5.0，SPEC §3.5）：明亮式切割的六角寶石。
 * - 很多小三角刻面，每一面依角度與所在的環做明暗交錯（像萬花筒的反射），再加星芒與高光
 * - 外緣（腰圍）= 核色；寶石本身的顏色 = 核種（混核左右兩半各一種；靈核依元素）
 * - 核階 = 切工的細緻度：T1 約 18 面 → T5 超過 100 面，星芒也越多
 * - 帶印記：頂點加一顆大星芒；中央台面刻著淡淡的核種符號
 * 圖示與融合結果動畫共用同一組幾何（coreGem）。
 */

/** 核光 / 寶石的顏色（銳 銀藍、重 琥珀、穿 翠綠、靈 紫；靈核依元素） */
export const CORE_TYPE_COLORS: Record<CoreTypeId, number> = {
  sharp: 0x8fc4ff,
  heavy: 0xffa630,
  pierce: 0x3ee08a,
  arcane: 0xc04dff,
  wall: 0x9aa6b8,
  swift: 0x4ff0d0,
  grip: 0xff7a4a,
  crown: 0xffd84a,
};
const ELEMENT_COLORS: Record<CoreElement, number> = { fire: 0xff4a2a, cold: 0x4ac8ff, lightning: 0xffe23a };

export const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 核種的顏色（靈核有元素時用元素色） */
export function coreTypeColor(type: CoreTypeId, element?: CoreElement): number {
  return type === 'arcane' && element ? ELEMENT_COLORS[element] : CORE_TYPE_COLORS[type];
}

type Pt = [number, number];
type GemSource = Pick<CoreInstance, 'types' | 'tier' | 'rarity'> & Partial<Pick<CoreInstance, 'element' | 'brand'>>;

export interface CoreGem {
  /** 腰圍外框（核色） */
  frame: { points: string; color: string };
  /** 刻面：order = 揭曉動畫的順序（0～5，依角度掃過） */
  facets: { points: string; color: string; order: number }[];
  /** 刻面之間的稜線顏色 */
  edge: string;
  /** 星芒（白色四角星） */
  sparkles: { x: number; y: number; r: number }[];
  /** 中央台面的核種符號（白色、半透明） */
  glyph: { d: string; fill: boolean };
  brand: Pt | null;
}

// ─────────────────────────── 幾何 ───────────────────────────

const CX = 50;
const CY = 50;
const R = 44;
const SQRT3_2 = Math.sqrt(3) / 2;

/** 尖頂六角形在角度 a（弧度，0 = 右，順時針為正 y 向下）的邊界半徑 */
function hexRadius(a: number): number {
  // 尖頂：頂點在 -90°、-30°、30°…；邊的中點在 -60°、0°、60°…
  const local = (((a + Math.PI / 2) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3);
  return (R * SQRT3_2) / Math.cos(local - Math.PI / 6);
}

const polar = (a: number, f: number): Pt => {
  const r = hexRadius(a) * f;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
};

/** 核階 → 切工：每環的分段數與各環的半徑比例（由內而外，最後一環是腰圍） */
const CUTS: { n: number; rings: number[] }[] = [
  { n: 6, rings: [0.4, 0.72, 1] },
  { n: 12, rings: [0.36, 0.68, 1] },
  { n: 12, rings: [0.3, 0.55, 0.8, 1] },
  { n: 18, rings: [0.26, 0.48, 0.7, 0.88, 1] },
  { n: 24, rings: [0.18, 0.34, 0.52, 0.7, 0.86, 1] },
];

const pts = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/** 0～1 的固定雜訊（同一個刻面每次都一樣） */
const noise = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ─────────────────────────── 顏色 ───────────────────────────

function toHsl(c: number): [number, number, number] {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const hsl = (h: number, s: number, l: number) => `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(1)}%)`;

/**
 * 一個刻面的顏色：亮度 b（0 = 深、1 = 反光）。大部分刻面是深而飽和的寶石色，
 * 少數反光面亮起（偏粉白但保留色相），對比要強才像切割寶石。
 */
function facetColor(base: [number, number, number], b: number): string {
  const [h, s] = base;
  const sat = Math.min(1, Math.max(0.55, s));
  const k = b ** 1.8;
  if (b > 0.86) return hsl(h - 6, sat * 0.75, 0.68 + (b - 0.86) * 1.6);
  return hsl(h + (b - 0.5) * 18, sat, 0.04 + k * 0.6);
}

// ─────────────────────────── 組合 ───────────────────────────

export function coreGem(core: GemSource): CoreGem {
  const cut = CUTS[Math.min(CUTS.length, Math.max(1, core.tier)) - 1]!;
  const bases = core.types.map((t) => toHsl(coreTypeColor(t, core.element)));
  const step = (Math.PI * 2) / cut.n;
  const start = -Math.PI / 2;
  const facets: CoreGem['facets'] = [];
  const add = (tri: Pt[], ring: number, idx: number) => {
    const mx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3;
    const my = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3;
    const a = Math.atan2(my - CY, mx - CX);
    // 混核：左半邊用第二種核種
    const base = bases.length === 2 && mx < CX ? bases[1]! : bases[0]!;
    // 萬花筒反射：六重對稱的明暗（每一環錯開相位），相鄰兩面一明一暗；左上方受光
    const sym = Math.cos(6 * a + ring * 1.9);
    let b = 0.42 + 0.3 * sym + (idx % 2 === 0 ? 0.16 : -0.16);
    b += ((CX - mx) + (CY - my)) / (R * 2) * 0.35;
    b += (noise(ring, idx) - 0.5) * 0.34;
    b = Math.min(0.98, Math.max(0.02, b));
    const order = Math.floor((((a - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 3));
    facets.push({ points: pts(tri), color: facetColor(base, b), order: Math.min(5, order) });
  };

  // 每一環的點（奇數環錯開半格，三角形才會交錯）
  const ring = (k: number) => Array.from({ length: cut.n }, (_, i) => polar(start + (i + (k % 2) * 0.5) * step, cut.rings[k]!));
  const rings = cut.rings.map((_, k) => ring(k));
  // 中央：台面扇形
  const inner = rings[0]!;
  inner.forEach((p, i) => add([[CX, CY], p, inner[(i + 1) % cut.n]!], 0, i));
  // 環與環之間：兩排交錯的三角形
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k]!;
    const b = rings[k + 1]!;
    const shift = k % 2 === 0 ? 0 : 1;
    for (let i = 0; i < cut.n; i++) {
      const a0 = a[i]!;
      const a1 = a[(i + 1) % cut.n]!;
      const b0 = b[(i + shift) % cut.n]!;
      const bPrev = b[(i + shift - 1 + cut.n) % cut.n]!;
      add([a0, a1, b0], k + 1, i * 2);
      add([a0, b0, bPrev], k + 1, i * 2 + 1);
    }
  }
  // 腰圍的角落：最外環沒碰到六角形頂點時，補上頂點的三角形
  const outer = rings[rings.length - 1]!;
  const corners = Array.from({ length: 6 }, (_, i) => polar(start + (i * Math.PI) / 3, 1));
  corners.forEach((c, i) => {
    let best = 0;
    outer.forEach((p, j) => {
      if (Math.hypot(p[0] - c[0], p[1] - c[1]) < Math.hypot(outer[best]![0] - c[0], outer[best]![1] - c[1])) best = j;
    });
    // 腰圍角落：比較深的冠部斜面（不參與反光，免得邊緣出現亮白的碎面）
    if (Math.hypot(outer[best]![0] - c[0], outer[best]![1] - c[1]) > 0.5) {
      const base = bases.length === 2 && c[0] < CX ? bases[1]! : bases[0]!;
      for (const tri of [[outer[best]!, c, outer[(best + 1) % cut.n]!], [outer[best]!, outer[(best - 1 + cut.n) % cut.n]!, c]] as Pt[][]) {
        facets.push({ points: pts(tri), color: facetColor(base, 0.18 + noise(i, tri.length) * 0.15), order: i });
      }
    }
  });

  const [h, s] = bases[0]!;
  // 星芒：核階越高越多（位置固定，落在受光的左上與台面）
  const SPARKS: { x: number; y: number; r: number }[] = [
    { x: 36, y: 34, r: 7 },
    { x: 62, y: 60, r: 4.5 },
    { x: 46, y: 24, r: 3.5 },
    { x: 30, y: 58, r: 3.5 },
    { x: 66, y: 36, r: 5 },
  ];
  return {
    frame: { points: pts(corners), color: hexColor(RARITY_COLORS[core.rarity]) },
    facets,
    edge: hsl(h, Math.min(1, s), 0.04),
    sparkles: SPARKS.slice(0, Math.min(SPARKS.length, core.tier)),
    glyph: glyphFor(core.types[0]!),
    brand: core.brand ? corners[0]! : null,
  };
}

function glyphFor(type: CoreTypeId): CoreGem['glyph'] {
  switch (type) {
    case 'sharp':
      return { d: 'M45 55 L55 45', fill: false };
    case 'heavy':
      return { d: 'M46 46 H54 V54 H46 Z', fill: false };
    case 'pierce':
      return { d: 'M45 55 L54 46 M49 45.5 H54.5 V51', fill: false };
    default:
      return { d: 'M50 46.5 A3.5 3.5 0 1 1 49.9 46.5 Z', fill: true };
  }
}

/** 四角星芒的路徑 */
export function sparklePath(x: number, y: number, r: number): string {
  const w = r * 0.18;
  return `M${x} ${y - r} L${x + w} ${y - w} L${x + r} ${y} L${x + w} ${y + w} L${x} ${y + r} L${x - w} ${y + w} L${x - r} ${y} L${x - w} ${y - w} Z`;
}

/** SVG 字串（背包格子、裝備圖鑑共用）；id 前綴避免同一頁多個 SVG 的漸層衝突 */
export function coreSvg(core: GemSource, id = 'core'): string {
  const g = coreGem(core);
  const facets = g.facets.map((f) => `<polygon points="${f.points}" fill="${f.color}" stroke="${g.edge}" stroke-width="0.45" stroke-opacity="0.55" stroke-linejoin="round"/>`).join('');
  const glyph = g.glyph.fill
    ? `<path d="${g.glyph.d}" fill="#fff" opacity="0.35"/>`
    : `<path d="${g.glyph.d}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>`;
  const sparkles = g.sparkles
    .map((s) => `<circle cx="${s.x}" cy="${s.y}" r="${(s.r * 0.55).toFixed(2)}" fill="#fff" opacity="0.28"/><path d="${sparklePath(s.x, s.y, s.r)}" fill="#fff" opacity="0.95"/>`)
    .join('');
  const brand = g.brand
    ? `<circle cx="${g.brand[0]}" cy="${g.brand[1]}" r="7" fill="#fff6d0" opacity="0.45"/><path d="${sparklePath(g.brand[0], g.brand[1], 10)}" fill="#fffbe8"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><radialGradient id="${id}-hl" cx="0.34" cy="0.3" r="0.55"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="0.5" stop-color="${g.frame.color}" stop-opacity="1"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient></defs>` +
    `<polygon points="${g.frame.points}" fill="#060505"/>${facets}` +
    `<polygon points="${g.frame.points}" fill="url(#${id}-hl)"/>${glyph}` +
    `<polygon points="${g.frame.points}" fill="none" stroke="${g.frame.color}" stroke-width="4.2" stroke-linejoin="round"/>` +
    `<polygon points="${g.frame.points}" fill="none" stroke="url(#${id}-rim)" stroke-width="1.6" stroke-linejoin="round" opacity="0.8"/>` +
    `${sparkles}${brand}</svg>`
  );
}

const cache = new Map<string, string>();
/** 熔核圖示（data URI；同一種外觀只畫一次） */
export function coreIcon(core: GemSource): string {
  const key = `${core.types.join('+')}|${core.tier}|${core.rarity}|${core.element ?? ''}|${core.brand ? 1 : 0}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coreSvg(core))}`;
    cache.set(key, uri);
  }
  return uri;
}

/** 空孔（空心六角，與寶石同一個外框形狀） */
export const EMPTY_SOCKET_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="${Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return `${(50 + Math.cos(a) * 42).toFixed(1)},${(50 + Math.sin(a) * 42).toFixed(1)}`;
  }).join(' ')}" fill="rgba(10,8,6,0.75)" stroke="#c8b48a" stroke-width="7" stroke-linejoin="round"/></svg>`,
)}`;
