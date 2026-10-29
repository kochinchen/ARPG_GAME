import type { Joint } from '../FigureModel';
import { facetize, loft, refine, tone, type Ring } from '../Facets';
import { lowSphere, prism, type Mesh, type V3 } from '../Poly3D';
import { chain, darken, gem, lighten, taper, type Tones } from '../weapons/WeaponParts';

/**
 * 橘 / 紅盔甲的專屬造型（設計稿：art/gear/armors_unique/concept/單件/）：胸甲、腰甲、腰帶、裙甲與護肩，
 * 直接依 AI 版女主角各關節的區域座標設計（chest = 胸、root = 骨盆、cloth / clothBack = 前後裙擺、upperArm = 上臂）。
 * 女主角的身體中心在 z ≈ 2.5（胸口最前面約 6.9、背約 -1.6）；大腿中段約 x ±6、z -1.5 ～ 5.4。
 */

export type ArmorLook = 'obsidian' | 'carapace' | 'robe' | 'barbed' | 'abyss' | 'undying' | 'fallen' | 'spider' | 'sovereign';

export interface StyledArmorSpec {
  look: ArmorLook;
  mat: Tones;
  trim: Tones;
  /** 發光的顏色（晶核、裂縫） */
  glow: number;
  /** 布條的顏色（倒刺輕甲、不朽者、墮騎黑鎧、統御者魔鎧） */
  cloth?: Tones;
}

const FACETS = { size: 1.2, bump: 0.18, vary: 0.06 };
const F = (m: Mesh, seed = 0, bump = 0.1) => refine(m, { ...FACETS, seed, coarse: facetize(m, bump, seed) });
const dense = (m: Mesh, seed = 0): Mesh => refine(m, { ...FACETS, seed });
const glowTones = (c: number): Tones => [lighten(c, 0.55), lighten(c, 0.2), c, lighten(c, 0.35)];

/** 放樣體在高度 y、橫向 x 處的正面 z（貼在表面上的零件用） */
function frontZ(rings: readonly Ring[], x: number, y: number, dir = 1): number {
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1]!.y < y) i++;
  const a = rings[i]!, b = rings[i + 1]!;
  const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
  const rx = a.rx + (b.rx - a.rx) * t;
  const rz = a.rz + (b.rz - a.rz) * t;
  const cz = (a.cz ?? 0) + ((b.cz ?? 0) - (a.cz ?? 0)) * t;
  return cz + dir * rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
}

/** 沿表面的發光線（每段一根細菱柱） */
function seam(rings: readonly Ring[], pts: [number, number][], color: number, r = 0.17): Mesh[] {
  return line((x, y) => frontZ(rings, x, y) + 0.12, pts, glowTones(color), r);
}

/** 貼在表面 z = surf(x, y) 上的線（每段一根細菱柱）：發光紋、皮帶、金邊 */
function line(surf: (x: number, y: number) => number, pts: [number, number][], colors: Tones, r = 0.17): Mesh[] {
  const p: V3[] = pts.map(([x, y]) => [x, y, surf(x, y)]);
  return p.slice(0, -1).map((a, i) => tone(taper(a, p[i + 1]!, [r, r], [r, r], colors, 4, i, Math.PI / 4), colors, i));
}

/** 尖晶柱：從 a 往 dir 長 len，六角截面、尖端收成一點 */
const crystal = (a: V3, dir: V3, len: number, r: number, colors: Tones, seed = 0) =>
  dense(taper(a, [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len], [r, r * 0.85], [0.03, 0.03], colors, 6, seed, seed * 0.7), seed);

/** 固定的擬亂數（同一件裝備每次長得一樣） */
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ─────────────────────────── 黑曜晶甲 ───────────────────────────

/** 胸（chest 關節）：胸下緣到肩頸，貼著身體（胸口最前面約 6.9、背約 -1.6） */
const OBSIDIAN_CHEST: Ring[] = [
  { y: -0.9, rx: 3.6, rz: 3.3, cz: 2.4 },
  { y: 0.4, rx: 4, rz: 3.7, cz: 2.5 },
  { y: 1.8, rx: 4.3, rz: 4.1, cz: 2.65 },
  { y: 3.2, rx: 4.8, rz: 4.5, cz: 2.65 },
  { y: 4.7, rx: 5.7, rz: 4.3, cz: 2.35 },
  { y: 6.1, rx: 5.1, rz: 3.5, cz: 1.6 },
  { y: 6.9, rx: 3.4, rz: 2.8, cz: 1.3 },
];
/** 低腰的腰帶（root 關節，骨盆 = 0）：腰露出來，腰帶掛在臀部 */
const OBSIDIAN_BELT: Ring[] = [
  { y: 1.2, rx: 6, rz: 4.7, cz: 1.4 },
  { y: 2.6, rx: 5.5, rz: 4.4, cz: 1.5 },
  { y: 4, rx: 4.6, rz: 4, cz: 1.6 },
  { y: 4.6, rx: 4.1, rz: 3.7, cz: 1.7 },
];

function obsidian(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const plate: Tones = [trim[2]!, mat[0]!, mat[1]!, mat[3]!];

  // ── 胸：貼身的黑曜石殼、兩片胸板、高領、胸口的大晶核、發光的裂縫（腰露出來） ──
  const chest: Mesh[] = [F(loft(OBSIDIAN_CHEST, 14, mat, 1), 1, 0.12)];
  for (const x of [-1, 1]) chest.push(F(tone(lowSphere(2.3, mat[0]!, [x * 2.3, 3, frontZ(OBSIDIAN_CHEST, x * 2.3, 3) - 1.15], 6, 3, [1.05, 0.95, 0.65]), plate, 3), 3 + x, 0.16));
  // 兩側的斜切板（腋下到胸下緣）
  for (const x of [-1, 1]) chest.push(F(tone(lowSphere(1.8, mat[0]!, [x * 3.6, 1.4, frontZ(OBSIDIAN_CHEST, x * 3.6, 1.4) - 1.3], 4, 3, [0.7, 1.2, 0.75]), plate, 9), 9 + x, 0.14));
  // 胸下緣一圈切面邊
  chest.push(tone(prism(14, -1.15, -0.75, [3.7, 3.4], [3.75, 3.45], trim[1]!, [0, 0, 2.4]), plate, 5));
  // 高領：黑曜石，上緣一圈亮灰的切面邊
  chest.push(F(tone(prism(10, 5.6, 7.7, [3.5, 3], [3.2, 2.8], mat[1]!, [0, 0, 1.2]), mat, 4), 4, 0.1));
  chest.push(tone(prism(10, 7.6, 7.95, [3.28, 2.87], [3.2, 2.8], trim[1]!, [0, 0, 1.2]), trim, 4));
  const coreZ = frontZ(OBSIDIAN_CHEST, 0, 2.8);
  chest.push(gem(1.7, [0, 2.8, coreZ + 0.1], trim[0]!, [0.85, 1.4, 0.45], 4, 2));
  chest.push(gem(1.35, [0, 2.8, coreZ + 0.42], glow, [0.8, 1.35, 0.5], 4, 2));
  chest.push(
    ...[-1, 1].flatMap((x) => [
      ...seam(OBSIDIAN_CHEST, [[x * 0.9, 4.4], [x * 2.1, 5.2], [x * 3.4, 5.5]], glow),
      ...seam(OBSIDIAN_CHEST, [[x * 1, 2], [x * 2.4, 0.9], [x * 3.6, 1.1]], glow),
    ]),
    ...seam(OBSIDIAN_CHEST, [[0, 1.1], [0, -0.7]], glow),
  );
  parts.set('chest', chest);

  // ── 低腰的腰帶：一圈方形扣片、帶扣的晶核 ──
  const belt: Mesh[] = [F(loft(OBSIDIAN_BELT, 14, plate, 6), 6, 0.1)];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const p: V3 = [Math.sin(a) * 6.1, 1.8, 1.4 + Math.cos(a) * 4.8];
    belt.push(F(tone(lowSphere(0.9, mat[1]!, p, 4, 2, [1, 0.9, 0.6]), [trim[1]!, mat[0]!, mat[2]!], 7 + i), 7 + i, 0.08));
  }
  belt.push(gem(1.3, [0, 2, 6.2], trim[0]!, [0.8, 1.15, 0.4], 4, 2));
  belt.push(gem(1, [0, 2, 6.5], glow, [0.75, 1.1, 0.45], 4, 2));
  parts.set('root', belt);

  // ── 裙甲：從腰帶往下張開的黑曜石尖片，到大腿中段（前後分別跟著裙擺擺動），外圈嵌著發光的晶片 ──
  // cloth 關節在骨盆上方 2.4；女主角原本的紅裙藏起來
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  for (const [layer, N, r0, r1, base, w] of [[0, 14, 6, 8.2, 7.2, 2.6], [1, 12, 6.3, 8.8, 9.4, 2.3]] as const) {
    for (let i = 0; i < N; i++) {
      const a = ((i + layer * 0.5) / N) * Math.PI * 2;
      const c = Math.cos(a);
      const len = base + c * 0.8 + (rand(i + layer * 20) - 0.5) * 1.6;
      const top: V3 = [Math.sin(a) * r0, -0.7 - layer * 0.4, 1.4 + c * (r0 - 1.2)];
      const tip: V3 = [Math.sin(a) * r1, top[1] - len, 1.4 + c * (r1 - 1.6)];
      const list = c >= -0.05 ? front : back;
      list.push(F(taper(top, tip, [w, 0.55], [0.06, 0.05], mat, 4, i, 0), 20 + i + layer * 20, 0.12));
      if (layer === 1 && (i % 2 === 0 || c > 0.6)) {
        // 嵌在尖片正面的發光晶片
        const o = 0.48;
        const at = (t: number): V3 => [top[0] + (tip[0] - top[0]) * t + Math.sin(a) * o, top[1] + (tip[1] - top[1]) * t, top[2] + (tip[2] - top[2]) * t + c * o];
        list.push(tone(taper(at(0.3), at(0.85), [w * 0.3, 0.12], [0.05, 0.05], lit, 4, i, 0), lit, i));
      }
    }
  }
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：圓頂的黑曜石肩甲、兩層往下的甲片，上面長出一簇往上、往外的黑晶柱（夾著發光的晶柱） ──
  for (const side of [1, -1] as const) {
    const pad: Mesh[] = [];
    const cx = side * 1;
    pad.push(F(tone(lowSphere(2.5, mat[0]!, [cx, 0.3, 1.8], 8, 5, [1, 0.8, 1.05]), mat, 30), 30, 0.16));
    for (const [k, y] of [[0.8, -1.3], [0.68, -2.6]] as const)
      pad.push(F(tone(prism(8, y, y - 1.8 * k, [3.3 * k, 3.1 * k], [3.7 * k, 3.4 * k], mat[1]!, [cx + side * 0.4, 0, 1.8]), mat, 31), 31, 0.16));
    for (let i = 0; i < 9; i++) {
      // 晶柱的根部在肩頂一圈，越外側越往外倒
      const u = (i / 8) * 2 - 1;
      const base: V3 = [cx + side * (0.2 + (1 - Math.abs(u)) * 1.2 + rand(i) * 0.5), 1.5 + (1 - Math.abs(u)) * 0.7, 1.8 + u * 2];
      const out = 0.35 + rand(i + 7) * 0.45;
      const dir: V3 = [side * out, 1, u * 0.45];
      const n = Math.hypot(dir[0], dir[1], dir[2]);
      const len = 2 + (1 - Math.abs(u)) * 2.1 + rand(i + 3) * 0.9;
      const isGlow = i % 3 === 1;
      pad.push(crystal(base, [dir[0] / n, dir[1] / n, dir[2] / n], len * (isGlow ? 0.85 : 1), isGlow ? 0.55 : 0.75 + rand(i) * 0.25, isGlow ? lit : plate, 40 + i));
    }
    parts.set(side === 1 ? 'upperArmL' : 'upperArmR', pad);
  }
  return { parts, hide: ['chest', 'cloth', 'clothBack'] };
}

// ─────────────────────────── 共用零件（其他造型沿用黑曜晶甲的穿法） ───────────────────────────

const CHEST = OBSIDIAN_CHEST;
const BELT = OBSIDIAN_BELT;
/** 胸板的位置與大小（兩顆，x = ±BUST.x） */
const BUST = { x: 2.3, y: 3, r: 2.3, scale: [1.05, 0.95, 0.65] as V3 };
const bustCenter = (x: number): V3 => [x * BUST.x, BUST.y, frontZ(CHEST, x * BUST.x, BUST.y) - 1.15];

/** 胸口的表面（胸甲殼與兩片胸板取外側）：貼在胸前的發光紋、金邊用 */
function chestZ(x: number, y: number): number {
  let z = frontZ(CHEST, x, y);
  for (const sx of [-1, 1]) {
    const c = bustCenter(sx);
    const [rx, ry, rz] = BUST.scale.map((k) => k * BUST.r) as V3;
    const q = 1 - ((x - c[0]) / rx) ** 2 - ((y - c[1]) / ry) ** 2;
    if (q > 0) z = Math.max(z, c[2] + rz * Math.sqrt(q));
  }
  return z;
}
const onChest = (lift = 0.12) => (x: number, y: number) => chestZ(x, y) + lift;
const onBack = (lift = 0.12) => (x: number, y: number) => frontZ(CHEST, x, y, -1) - lift;

const shell = (mat: Tones, seed = 1) => F(loft(CHEST, 14, mat, seed), seed, 0.12);
const busts = (colors: Tones, k = 1) => [-1, 1].map((x) => F(tone(lowSphere(BUST.r * k, colors[0]!, bustCenter(x), 6, 3, BUST.scale), colors, 3), 3 + x, 0.16));
const underBust = (color: number, colors: Tones) => tone(prism(14, -1.15, -0.75, [3.7, 3.4], [3.75, 3.45], color, [0, 0, 2.4]), colors, 5);
/** 高領：h = 上緣高度、flare = 上緣往外張 */
function collar(mat: Tones, rim: Tones, h = 7.7, flare = 0): Mesh[] {
  const top: [number, number] = [3.2 + flare, 2.8 + flare * 0.8];
  return [
    F(tone(prism(10, 5.6, h, [3.5, 3], top, mat[1]!, [0, 0, 1.2]), mat, 4), 4, 0.1),
    tone(prism(10, h - 0.1, h + 0.25, [top[0] + 0.08, top[1] + 0.07], top, rim[1]!, [0, 0, 1.2]), rim, 4),
  ];
}
const beltBand = (colors: Tones, rings: readonly Ring[] = BELT) => F(loft(rings, 14, colors, 6), 6, 0.1);
/** 腰帶上一圈扣片 */
function studs(n: number, colors: Tones, r = 0.9, y = 1.8, scale: V3 = [1, 0.9, 0.6]): Mesh[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    return F(tone(lowSphere(r, colors[1]!, [Math.sin(a) * 6.1, y, 1.4 + Math.cos(a) * 4.8], 4, 2, scale), colors, 7 + i), 7 + i, 0.08);
  });
}
/** 帶扣：外框 + 發光的晶核 */
const buckle = (frame: number, glow: number, y = 2, r = 1.3): Mesh[] => [
  gem(r, [0, y, 6.2], frame, [0.8, 1.15, 0.4], 4, 2),
  gem(r * 0.77, [0, y, 6.5], glow, [0.75, 1.1, 0.45], 4, 2),
];

/** 裙甲的一圈位置：top = 腰帶下緣、tip = 尖端；前半圈跟著 cloth、後半圈跟著 clothBack 擺動 */
interface SkirtSlot {
  i: number;
  a: number;
  s: number;
  c: number;
  top: V3;
  tip: V3;
  out: Mesh[];
}
interface SkirtLayer {
  n: number;
  r0: number;
  r1: number;
  len: number;
  /** 半圈的偏移（0.5 = 和上一層錯開） */
  shift?: number;
  y?: number;
  jitter?: number;
  /** 後面加長（披風、長袍） */
  backLen?: number;
}
function skirtRing(l: SkirtLayer, front: Mesh[], back: Mesh[], seed = 0): SkirtSlot[] {
  return Array.from({ length: l.n }, (_, i) => {
    const a = ((i + (l.shift ?? 0)) / l.n) * Math.PI * 2;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const len = l.len + c * 0.8 - Math.min(0, c) * (l.backLen ?? 0) + (rand(i + seed) - 0.5) * (l.jitter ?? 1.6);
    const top: V3 = [s * l.r0, l.y ?? -0.7, 1.4 + c * (l.r0 - 1.2)];
    const tip: V3 = [s * l.r1, top[1] - len, 1.4 + c * (l.r1 - 1.6)];
    return { i, a, s, c, top, tip, out: c >= -0.05 ? front : back };
  });
}
/** 裙甲上 t（0 = 上緣、1 = 尖端）處、往外推 o 的點 */
const along = (p: SkirtSlot, t: number, o = 0): V3 => [
  p.top[0] + (p.tip[0] - p.top[0]) * t + p.s * o,
  p.top[1] + (p.tip[1] - p.top[1]) * t,
  p.top[2] + (p.tip[2] - p.top[2]) * t + p.c * o,
];
/** 尖片（甲片、鱗片） */
const shard = (p: SkirtSlot, w: number, colors: Tones, seed: number, thick = 0.55) => F(taper(p.top, p.tip, [w, thick], [0.06, 0.05], colors, 4, p.i, 0), seed, 0.12);
/** 寬甲片：下半段才收尖 */
function plate(p: SkirtSlot, w: number, colors: Tones, seed: number, o = 0, t = 0.65): Mesh[] {
  const mid = along(p, t, o);
  return [
    F(taper(along(p, 0, o), mid, [w, 0.45], [w * 0.9, 0.4], colors, 4, p.i, 0), seed, 0.1),
    F(taper(mid, along(p, 1, o), [w * 0.9, 0.4], [0.06, 0.05], colors, 4, p.i + 1, 0), seed + 1, 0.1),
  ];
}
/** 布條：下端撕成兩個尖齒 */
function strip(p: SkirtSlot, w: number, colors: Tones, seed: number, o = 0): Mesh[] {
  const t: V3 = [p.c, 0, -p.s];
  const top = along(p, 0, o);
  const end = along(p, 0.82, o);
  const out = [F(taper(top, end, [w, 0.16], [w * 0.85, 0.14], colors, 4, p.i, 0), seed, 0.08)];
  for (const k of [-1, 1]) {
    const b: V3 = [end[0] + t[0] * k * w * 0.42, end[1], end[2] + t[2] * k * w * 0.42];
    const d = 1.4 + rand(seed + k) * 1.8;
    const tip = along(p, 1, o);
    out.push(tone(taper(b, [b[0] + (tip[0] - end[0]) * 0.3, b[1] - d, b[2] + (tip[2] - end[2]) * 0.3], [w * 0.42, 0.14], [0.04, 0.04], colors, 4, p.i + k, 0), colors, seed + k));
  }
  return out;
}
/** 垂墜的小尖飾（金、骨） */
const drop = (c: V3, colors: Tones, len = 1.6, r = 0.45): Mesh[] => [
  tone(taper(c, [c[0], c[1] - len * 0.35, c[2]], [0.06, 0.06], [r, r], colors, 4, 0, Math.PI / 4), colors, 1),
  tone(taper([c[0], c[1] - len * 0.35, c[2]], [c[0], c[1] - len, c[2]], [r, r], [0.04, 0.04], colors, 4, 2, Math.PI / 4), colors, 2),
];
/** 四角星（不朽者的星飾、統御者的頂飾） */
function star(c: V3, r: number, colors: Tones, normal: 'z' | 'x' = 'z'): Mesh[] {
  const out = [gem(r * 0.32, c, colors[0]!, [1, 1, 0.6], 4, 2)];
  for (const [dx, dy, k] of [[0, 1, 1], [0, -1, 0.75], [1, 0, 0.6], [-1, 0, 0.6]] as const) {
    const d: V3 = normal === 'z' ? [dx, dy, 0] : [0, dy, dx];
    out.push(tone(taper(c, [c[0] + d[0] * r * k, c[1] + d[1] * r * k, c[2] + d[2] * r * k], [r * 0.2, r * 0.12], [0.03, 0.03], colors, 4, dx + dy, 0), colors, 3));
  }
  return out;
}
/** 彎角 / 爪：二次貝茲曲線 p0 → p1（控制點）→ p2，從粗到尖 */
function horn(p0: V3, p1: V3, p2: V3, r: number, colors: Tones, segs = 6): Mesh[] {
  const pts: V3[] = Array.from({ length: segs + 1 }, (_, k) => {
    const t = k / segs;
    const u = 1 - t;
    return [0, 1, 2].map((j) => u * u * p0[j]! + 2 * u * t * p1[j]! + t * t * p2[j]!) as V3;
  });
  return chain(pts, [r, r], [0.04, 0.04], colors, false);
}

/** 護肩的圓頂與兩層甲片（k = 大小） */
function shoulder(side: 1 | -1, colors: Tones, k = 1, seed = 30): Mesh[] {
  const cx = side * 1;
  const out = [F(tone(lowSphere(2.5 * k, colors[0]!, [cx, 0.3, 1.8], 8, 5, [1, 0.8, 1.05]), colors, seed), seed, 0.16)];
  for (const [s, y] of [[0.8, -1.3], [0.68, -2.6]] as const)
    out.push(F(tone(prism(8, y * k, y * k - 1.8 * s * k, [3.3 * s * k, 3.1 * s * k], [3.7 * s * k, 3.4 * s * k], colors[1]!, [cx + side * 0.4, 0, 1.8]), colors, seed + 1), seed + 1, 0.16));
  return out;
}
/** 護肩外側往下、往外翻的一排甲片（u = 前後位置 -1 ～ 1） */
function armFlaps(side: 1 | -1, n: number, y: number, len: number, w: number, colors: Tones, seed: number, r0 = 2.3, r1 = 3.6, spread = 1.25): { u: number; top: V3; tip: V3; mesh: Mesh }[] {
  return Array.from({ length: n }, (_, i) => {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const f = u * spread;
    const d: V3 = [side * Math.cos(f), 0, Math.sin(f)];
    const top: V3 = [side * 1 + d[0] * r0, y, 1.8 + d[2] * r0];
    const tip: V3 = [side * 1 + d[0] * r1, y - len, 1.8 + d[2] * r1];
    return { u, top, tip, mesh: F(taper(top, tip, [w, 0.4], [0.06, 0.05], colors, 4, i, 0), seed + i, 0.12) };
  });
}
/** 護肩下垂的布條（跟著上臂） */
function armCloth(side: 1 | -1, list: [number, number, Tones][], seed: number): Mesh[] {
  return list.flatMap(([z, len, colors], i) => {
    // s = -1、c = 0：布條的寬度沿前後方向
    const p: SkirtSlot = { i, a: 0, s: -1, c: 0, top: [side * 3.1, -1, 1.8 + z], tip: [side * 3.5, -1 - len, 1.8 + z], out: [] };
    return strip(p, 0.9, colors, seed + i);
  });
}

const both = (f: (side: 1 | -1) => Mesh[], parts: Map<Joint, Mesh[]>) => {
  parts.set('upperArmL', f(1));
  parts.set('upperArmR', f(-1));
};
const HIDE_SKIN = ['chest', 'cloth', 'clothBack'];

// ─────────────────────────── 橘 B 甲殼鱗甲 ───────────────────────────

/** 胸前一排排往下的鱗片 */
function scaleRows(rows: [number, number, number][], colors: Tones, size = 0.75, seed = 60): Mesh[] {
  return rows.flatMap(([y, half, n], r) =>
    Array.from({ length: n }, (_, i) => {
      const x = n === 1 ? 0 : -half + (i / (n - 1)) * half * 2;
      const top: V3 = [x, y + 0.55, chestZ(x, y + 0.55) - 0.05];
      const tip: V3 = [x, y - 0.8, chestZ(x, y - 0.8) + 0.3];
      return tone(taper(top, tip, [size, 0.22], [0.05, 0.05], colors, 4, i, 0), colors, seed + r * 10 + i);
    }),
  );
}

function carapace(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const edge: Tones = [trim[0]!, mat[0]!, trim[1]!, mat[3]!];
  // ── 胸：甲殼、兩片硬殼胸板、上下的鱗片、胸口的菱形晶核、胸下緣的發光紋 ──
  const scale: Tones = [lighten(mat[0]!, 0.22), mat[0]!, mat[2]!, lighten(mat[3]!, 0.12)];
  const chest: Mesh[] = [shell(mat), ...busts(mat, 1.05), underBust(trim[1]!, edge)];
  chest.push(...scaleRows([[5.5, 2.6, 6], [4.8, 3.2, 5], [0.3, 3.2, 6], [-0.5, 2.6, 5]], scale, 0.75));
  chest.push(...collar(mat, trim, 7.4));
  chest.push(gem(1.55, [0, 3.2, chestZ(0, 3.2) + 0.15], trim[0]!, [0.8, 1.45, 0.45], 4, 2), gem(1.2, [0, 3.2, chestZ(0, 3.2) + 0.45], glow, [0.75, 1.4, 0.5], 4, 2));
  for (const x of [-1, 1]) chest.push(...seam(CHEST, [[x * 0.6, 1.2], [x * 2.3, 0.7], [x * 3.9, 1.5]], glow, 0.15));
  // 中間往下的尖甲（胸下緣 → 腰）
  chest.push(F(taper([0, 1.4, chestZ(0, 1.4) + 0.2], [0, -2.6, frontZ(CHEST, 0, -0.9) + 0.25], [1.1, 0.4], [0.05, 0.05], edge, 4, 1, 0), 61, 0.1));
  parts.set('chest', chest);

  // ── 腰帶：甲殼扣片 ──
  parts.set('root', [beltBand([mat[1]!, mat[2]!, mat[0]!, mat[1]!]), ...studs(10, edge, 0.85), ...buckle(trim[0]!, glow)]);

  // ── 裙甲：三層往下疊的鱗片（越外層越短），中間一片長尖甲 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  const layers: [SkirtLayer, number][] = [
    [{ n: 12, r0: 5.9, r1: 8.6, len: 10, y: -1.1 }, 2.1],
    [{ n: 13, r0: 6.2, r1: 8.4, len: 7.8, y: -0.9, shift: 0.5 }, 2.3],
    [{ n: 14, r0: 6.5, r1: 8.4, len: 5.4, y: -0.7 }, 2.5],
  ];
  layers.forEach(([l, w], k) => {
    for (const p of skirtRing(l, front, back, k * 20)) {
      const c = (p.i + k) % 3 === 0 ? edge : mat;
      p.out.push(shard(p, w, c, 70 + p.i + k * 20, 0.5));
      if (k === 1 && p.c > 0.3 && p.i % 2 === 0) p.out.push(tone(taper(along(p, 0.3, 0.4), along(p, 0.8, 0.4), [w * 0.28, 0.12], [0.05, 0.05], lit, 4, p.i, 0), lit, p.i));
    }
  });
  front.push(F(taper([0, -0.6, 6.3], [0, -11.5, 7.6], [1.5, 0.5], [0.06, 0.05], edge, 4, 3, 0), 99, 0.1));
  front.push(gem(0.8, [0, -2.6, 6.75], glow, [0.75, 1.3, 0.45], 4, 2));
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：甲殼圓頂、往外翻的鱗片（夾著發光的片）、一支往上彎的大角 ──
  both((side) => {
    const pad = shoulder(side, mat, 1, 30);
    for (const f of armFlaps(side, 5, 0.8, 3.4, 1.3, edge, 40)) pad.push(f.mesh);
    for (const f of armFlaps(side, 4, -1.2, 3.6, 1.2, mat, 50, 2.1, 3.4, 1.05)) pad.push(f.mesh);
    for (const f of armFlaps(side, 3, 0.4, 2.6, 0.5, lit, 55, 2.55, 3.75, 1.1)) pad.push(tone(f.mesh, lit, 1));
    pad.push(...horn([side * 1.6, 1.6, 1.4], [side * 4.4, 3.6, 1.6], [side * 2.6, 7.2, 1.1], 0.75, edge));
    pad.push(...horn([side * 2.3, 1, 2.6], [side * 3.9, 2.4, 3.2], [side * 3.4, 4.3, 3.1], 0.45, edge, 4));
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

// ─────────────────────────── 橘 C 元素法袍 ───────────────────────────

function robe(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  // 袍子上的發光布（暗一點的元素色）
  const cloth: Tones = [darken(glow, 0.25), darken(glow, 0.4), darken(glow, 0.58), darken(glow, 0.33)];
  // ── 胸：合身的上衣、金邊 V 線、胸口的大菱形寶石（外框是金色的星芒） ──
  const chest: Mesh[] = [shell(mat), ...busts(mat), underBust(trim[1]!, trim)];
  for (const x of [-1, 1]) {
    chest.push(...line(onChest(0.14), [[x * 4.6, 5.6], [x * 2.6, 4.9], [x * 0.9, 3.4], [x * 0.25, 1.2]], trim, 0.2));
    chest.push(...line(onChest(0.12), [[x * 3.8, 0.9], [x * 2.2, -0.2], [x * 0.4, -0.6]], trim, 0.17));
  }
  chest.push(...collar(mat, trim, 8.3, 0.7));
  const gz = chestZ(0, 3.4);
  chest.push(...star([0, 3.4, gz + 0.1], 2.6, trim));
  chest.push(gem(1.6, [0, 3.4, gz + 0.3], trim[1]!, [0.85, 1.35, 0.45], 4, 2), gem(1.3, [0, 3.4, gz + 0.55], glow, [0.8, 1.3, 0.5], 4, 2));
  parts.set('chest', chest);

  // ── 金腰帶 + 寶石帶扣 ──
  parts.set('root', [
    beltBand(mat),
    tone(prism(14, 1.2, 1.6, [6.05, 4.75], [5.9, 4.65], trim[1]!, [0, 0, 1.4]), trim, 2),
    tone(prism(14, 3.4, 3.75, [4.95, 4.15], [4.75, 4.05], trim[1]!, [0, 0, 1.55]), trim, 3),
    ...buckle(trim[0]!, glow, 2.2, 1.5),
  ]);

  // ── 長下擺：外層金邊短片、內層長片（布與發光布交錯），前中間一片發光的長布，尖端掛著金色的小尖飾 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  for (const p of skirtRing({ n: 12, r0: 6, r1: 9.6, len: 14.5, y: -1, shift: 0.5, jitter: 2, backLen: 1.2 }, front, back, 5)) {
    if (Math.abs(p.a) < 0.3) continue;
    p.out.push(...plate(p, 2.6, p.i % 2 ? cloth : mat, 80 + p.i, 0, 0.75));
  }
  for (const p of skirtRing({ n: 10, r0: 6.4, r1: 9, len: 9.5, y: -0.8, jitter: 1.4 }, front, back, 30)) {
    if (p.i === 0) continue;
    p.out.push(...plate(p, 2.6, trim, 90 + p.i, 0, 0.7), ...plate(p, 2.15, mat, 100 + p.i, 0.2, 0.7));
    if (p.i % 2) p.out.push(...drop(along(p, 1.03, 0.3), trim, 1.3, 0.34));
  }
  // 前中間：金邊的發光長布、上面一排菱形符文
  const mid: SkirtSlot = { i: 0, a: 0, s: 0, c: 1, top: [0, -0.8, 6.3], tip: [0, -16, 8.6], out: front };
  front.push(...plate(mid, 2.4, trim, 120, 0, 0.8), ...plate(mid, 1.95, cloth, 122, 0.25, 0.8));
  for (const t of [0.25, 0.45, 0.65]) front.push(gem(0.55, along(mid, t, 0.55), glow, [0.75, 1.35, 0.4], 4, 2));
  front.push(...line((_, y) => 6.3 + ((-0.8 - y) / 15.2) * 2.3 + 0.62, [[0, -2], [0, -13.5]], lit, 0.1));
  front.push(...drop(along(mid, 1.02, 0.3), trim, 1.6, 0.42));
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：三層金邊的尖角飾片、上面一簇往上長的元素晶體 ──
  both((side) => {
    const pad = shoulder(side, mat, 0.9, 30);
    for (const [y, len, r0, r1] of [[1.2, 3, 2.1, 4.1], [0, 3.2, 2.2, 4.3], [-1.4, 3.2, 2.1, 4]] as const) {
      for (const f of armFlaps(side, 4, y, len, 1.25, trim, 40, r0, r1, 1.1)) pad.push(f.mesh);
      for (const f of armFlaps(side, 4, y + 0.1, len - 0.4, 1, mat, 44, r0 + 0.18, r1 + 0.1, 1.1)) pad.push(f.mesh);
    }
    for (let i = 0; i < 8; i++) {
      const u = (i / 7) * 2 - 1;
      const base: V3 = [side * (1.2 + (1 - Math.abs(u)) * 0.9 + rand(i) * 0.4), 1.4 + (1 - Math.abs(u)) * 0.6, 1.8 + u * 1.8];
      const dir: V3 = [side * (0.45 + rand(i + 5) * 0.4), 1, u * 0.5];
      const n = Math.hypot(...dir);
      pad.push(crystal(base, [dir[0] / n, dir[1] / n, dir[2] / n], 1.8 + (1 - Math.abs(u)) * 1.9 + rand(i + 2) * 0.8, 0.5 + rand(i) * 0.2, i % 2 ? lit : glowTones(darken(glow, 0.15)), 50 + i));
    }
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

// ─────────────────────────── 橘 D 倒刺輕甲 ───────────────────────────

const STRAP: Tones = [0x7a4e2e, 0x684026, 0x4e2e1a, 0x704a2a];
const BUCKLE: Tones = [0xd8b060, 0xb8903e, 0x8a6a2a, 0xc8a04e];
const RED_CLOTH: Tones = [0xa83a32, 0x8c2c26, 0x5e1a18, 0x9a322c];

/** 倒刺：四角錐、從 a 往 dir 長 */
function barb(a: V3, dir: V3, len: number, r: number, colors: Tones, seed = 0): Mesh {
  const n = Math.hypot(...dir) || 1;
  return F(taper(a, [a[0] + (dir[0] / n) * len, a[1] + (dir[1] / n) * len, a[2] + (dir[2] / n) * len], [r, r * 0.8], [0.03, 0.03], colors, 4, seed, Math.PI / 4), seed, 0.08);
}

function barbed(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim } = s;
  const cloth = s.cloth ?? RED_CLOTH;
  // ── 胸：皮甲、胸口兩排往上翹的倒刺、胸上一條皮帶與扣環、背後交叉的皮帶 ──
  const chest: Mesh[] = [shell(mat), ...busts(mat), underBust(STRAP[1]!, STRAP)];
  chest.push(...line(onChest(0.15), [[-4.6, 5.3], [-2.5, 5.7], [0, 5.5], [2.5, 5.7], [4.6, 5.3]], STRAP, 0.32));
  for (const x of [-1, 1]) chest.push(gem(0.5, [x * 2.4, 5.7, chestZ(x * 2.4, 5.7) + 0.4], BUCKLE[1]!, [1, 1, 0.5], 4, 2));
  chest.push(gem(0.75, [0, 5.4, chestZ(0, 5.4) + 0.4], cloth[0]!, [0.8, 1.1, 0.5], 4, 2));
  chest.push(...line(onBack(0.15), [[-4.4, 5.6], [0, 2.6], [3.4, -0.6]], STRAP, 0.3), ...line(onBack(0.18), [[4.4, 5.6], [0, 2.6], [-3.4, -0.6]], STRAP, 0.3));
  chest.push(gem(0.6, [0, 2.6, frontZ(CHEST, 0, 2.6, -1) - 0.4], trim[0]!, [1, 1, 0.6], 4, 2));
  for (const x of [-1, 1])
    for (const [k, [bx, by]] of ([[0.7, 1.5], [1.6, 2.6], [2.6, 3.9], [3.5, 4.9]] as const).entries())
      chest.push(barb([x * bx, by, chestZ(x * bx, by) - 0.1], [x * 0.55, 0.75, 0.55], 1.6 + k * 0.25, 0.42, trim, 60 + k + x * 5));
  chest.push(barb([0, 1, chestZ(0, 1)], [0, -1, 0.15], 2, 0.5, trim, 69));
  chest.push(...collar(mat, STRAP, 7.2));
  parts.set('chest', chest);

  // ── 兩條交疊的皮帶、方形扣環、腰兩側往外的倒刺 ──
  const root: Mesh[] = [
    beltBand(STRAP, [{ y: 1.4, rx: 6.05, rz: 4.75, cz: 1.4 }, { y: 2.3, rx: 5.7, rz: 4.55, cz: 1.45 }, { y: 3.1, rx: 5.3, rz: 4.3, cz: 1.5 }]),
    beltBand(STRAP, [{ y: 3.1, rx: 4.95, rz: 4.1, cz: 1.55 }, { y: 3.9, rx: 4.6, rz: 3.95, cz: 1.6 }, { y: 4.6, rx: 4.15, rz: 3.7, cz: 1.7 }]),
  ];
  for (const [x, y, z] of [[1.6, 2.2, 6.05], [-2.6, 3.7, 5.3], [4.6, 2.2, 4.5]] as const) root.push(tone(prism(4, y - 0.45, y + 0.45, [0.6, 0.15], [0.6, 0.15], BUCKLE[1]!, [x, 0, z], Math.PI / 4), BUCKLE, 2));
  for (const sx of [-1, 1]) for (const [k, y] of [1.4, 2.6].entries()) root.push(barb([sx * 5.6, y, 1.6], [sx, 0.35 - k * 0.5, 0.1], 2.2, 0.5, trim, 70 + k));
  root.push(barb([0, 1.8, 6.1], [0, -0.3, 1], 1.4, 0.55, trim, 74));
  parts.set('root', root);

  // ── 裙：上層短的皮甲片、下層長的布條與皮條交錯、兩側垂著骨刺 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  for (const p of skirtRing({ n: 12, r0: 6, r1: 8.8, len: 11, y: -0.9, shift: 0.5, jitter: 2.4 }, front, back, 11))
    p.out.push(...strip(p, 2.3, p.i % 3 === 1 ? mat : cloth, 80 + p.i));
  for (const p of skirtRing({ n: 12, r0: 6.4, r1: 8.4, len: 5.6, y: -0.7 }, front, back, 23)) {
    p.out.push(shard(p, 2.4, p.i % 2 ? mat : [mat[1]!, mat[2]!, mat[0]!, mat[1]!], 90 + p.i, 0.4));
    if (p.i % 3 === 1) p.out.push(barb(along(p, 0.55, 0.3), [p.s * 0.4, -1, p.c * 0.4], 2.2, 0.45, trim, 95 + p.i));
  }
  for (const sx of [-1, 1]) front.push(...drop([sx * 5.8, -5, 4.8], trim, 3.2, 0.5));
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：皮革圓頂與甲片，長滿往上、往外的骨刺 ──
  both((side) => {
    const pad = shoulder(side, mat, 0.95, 30);
    for (const f of armFlaps(side, 5, -0.4, 3, 1.15, mat, 40, 2.3, 3.4, 1.15)) pad.push(f.mesh);
    for (let i = 0; i < 11; i++) {
      const u = (i / 10) * 2 - 1;
      const ring = i % 2;
      const base: V3 = [side * (1 + (ring ? 2.2 : 1) + (1 - Math.abs(u)) * 0.4), ring ? 0.9 : 1.6, 1.8 + u * (ring ? 2.2 : 1.7)];
      const dir: V3 = [side * (ring ? 1.1 : 0.55), ring ? 0.55 : 1, u * 0.6];
      pad.push(barb(base, dir, (ring ? 2.4 : 3) + (1 - Math.abs(u)) * 1.3 + rand(i) * 0.8, 0.5 + rand(i + 3) * 0.15, trim, 50 + i));
    }
    for (const f of armFlaps(side, 3, -1.6, 1.6, 0.4, trim, 64, 3.2, 4.4, 1)) pad.push(f.mesh);
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

// ─────────────────────────── 紅 2 深淵甲殼 ───────────────────────────

function abyss(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const shellTones: Tones = [lighten(mat[0]!, 0.12), mat[0]!, mat[2]!, mat[1]!];
  // ── 胸：一片片甲殼、紫光的縫、胸口的大晶核（骨色外框）、領口的殼刺 ──
  const chest: Mesh[] = [shell(mat), ...busts(shellTones, 1.05), underBust(mat[2]!, mat)];
  chest.push(...scaleRows([[5.6, 2.4, 5], [4.9, 3.3, 6], [0.4, 3.3, 6], [-0.4, 2.6, 5]], shellTones, 0.85));
  chest.push(...collar(mat, trim, 8, 0.4));
  const gz = chestZ(0, 3.2);
  chest.push(...star([0, 3.2, gz], 2.4, trim), gem(1.6, [0, 3.2, gz + 0.25], trim[1]!, [0.8, 1.5, 0.45], 4, 2), gem(1.25, [0, 3.2, gz + 0.5], glow, [0.75, 1.45, 0.5], 4, 2));
  for (const x of [-1, 1]) {
    chest.push(...seam(CHEST, [[x * 0.7, 0.9], [x * 2.4, 0.3], [x * 4, 0.9]], glow, 0.18));
    chest.push(...line(onBack(0.1), [[x * 0.4, 5], [x * 2.6, 3.6], [x * 3.6, 1]], lit, 0.16));
    chest.push(barb([x * 2.6, 6.6, 3.5], [x * 0.5, 1, 0.3], 1.8, 0.45, trim, 60 + x));
  }
  chest.push(...line(onBack(0.1), [[0, 6], [0, -0.6]], lit, 0.18));
  parts.set('chest', chest);

  // ── 腰帶：甲殼，前面與兩側翹起骨色的殼刺 ──
  const root: Mesh[] = [beltBand(shellTones), ...studs(10, mat, 0.95), ...buckle(trim[1]!, glow, 2, 1.4)];
  for (const a of [-0.9, -0.45, 0.45, 0.9]) {
    const p: V3 = [Math.sin(a) * 5.9, 2.6, 1.4 + Math.cos(a) * 4.7];
    root.push(...horn(p, [p[0] + Math.sin(a) * 1.6, p[1] + 0.6, p[2] + Math.cos(a) * 1.2], [p[0] + Math.sin(a) * 1.4, p[1] + 2.4, p[2] + Math.cos(a) * 1.4], 0.5, trim, 4));
  }
  parts.set('root', root);

  // ── 裙甲：三層紫黑的長殼片、外層尖端是骨色的爪，前中間一片發光的長殼 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  const layers: [SkirtLayer, number, Tones][] = [
    [{ n: 12, r0: 5.9, r1: 9.2, len: 12, y: -1.2, jitter: 2.4 }, 2.2, [lighten(mat[0]!, 0.2), mat[0]!, mat[1]!, lighten(mat[3]!, 0.15)]],
    [{ n: 12, r0: 6.2, r1: 9, len: 9, y: -0.9, shift: 0.5 }, 2.4, mat],
    [{ n: 13, r0: 6.5, r1: 8.6, len: 5.8, y: -0.7 }, 2.5, shellTones],
  ];
  layers.forEach(([l, w, c], k) => {
    for (const p of skirtRing(l, front, back, k * 17)) {
      if (k === 0 && Math.abs(p.a) < 0.3) continue;
      p.out.push(shard(p, w, c, 70 + p.i + k * 20, 0.5));
      if (k === 1) p.out.push(barb(along(p, 0.75, 0.3), [p.s * 0.3, -1, p.c * 0.3], 2.8, 0.42, trim, 90 + p.i));
      if (k === 0 && p.i % 2) p.out.push(tone(taper(along(p, 0.35, 0.4), along(p, 0.85, 0.4), [w * 0.26, 0.12], [0.05, 0.05], lit, 4, p.i, 0), lit, p.i));
    }
  });
  const mid: SkirtSlot = { i: 0, a: 0, s: 0, c: 1, top: [0, -0.6, 6.3], tip: [0, -13.5, 8.1], out: front };
  front.push(...plate(mid, 2, shellTones, 120, 0, 0.75), tone(taper(along(mid, 0.25, 0.42), along(mid, 0.85, 0.42), [0.55, 0.15], [0.05, 0.05], lit, 4, 1, 0), lit, 2));
  front.push(barb(along(mid, 0.95, 0.2), [0, -1, 0.2], 2, 0.5, trim, 125));
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：大圓頂、層層往下的殼片（尖端是骨爪）、兩支往上彎的大殼刺 ──
  both((side) => {
    const pad = shoulder(side, mat, 1.15, 30);
    for (const f of armFlaps(side, 5, 1, 3.2, 1.4, shellTones, 40, 2.5, 4)) pad.push(f.mesh);
    for (const f of armFlaps(side, 5, -0.8, 4.2, 1.2, mat, 46, 2.4, 4.3, 1.1)) {
      pad.push(f.mesh);
      pad.push(...horn(f.tip, [f.tip[0] + side * 0.6, f.tip[1] - 1.4, f.tip[2]], [f.tip[0] - side * 0.2, f.tip[1] - 2.4, f.tip[2]], 0.35, trim, 3));
    }
    for (const f of armFlaps(side, 3, 0.2, 2.6, 0.45, lit, 52, 2.75, 4.05, 1)) pad.push(tone(f.mesh, lit, 1));
    pad.push(...horn([side * 1.8, 1.8, 1.2], [side * 5.6, 4.2, 1.3], [side * 3.2, 9, 0.6], 1, [lighten(mat[0]!, 0.25), mat[0]!, mat[2]!, mat[1]!], 7));
    pad.push(...horn([side * 1.4, 1.9, 2.4], [side * 3.2, 4, 3], [side * 1.2, 6.2, 2.4], 0.55, trim, 5));
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

// ─────────────────────────── 紅 3 不朽者 ───────────────────────────

const IVORY: Tones = [0xf0e8d8, 0xddd2bc, 0xb8aa90, 0xe8dcc8];

function undying(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const cloth = s.cloth ?? RED_CLOTH;
  const crack: Tones = [darken(mat[2]!, 0.35), darken(mat[2]!, 0.5), darken(mat[2]!, 0.6), darken(mat[2]!, 0.45)];
  // ── 胸：古老的金色板甲、修補過的裂痕、胸口發光的不滅心核（星芒） ──
  const chest: Mesh[] = [shell(mat), ...busts(mat), underBust(trim[1]!, trim)];
  for (const pts of [[[-3.4, 5.4], [-2.6, 4.4], [-3, 3.4], [-2.4, 2]], [[3.6, 2.2], [2.8, 1.2], [3.2, 0]], [[1.6, 5.8], [1.1, 5], [1.7, 4.3]], [[-1.2, 0.8], [-1.8, 0], [-1.3, -0.6]]] as [number, number][][])
    chest.push(...line(onChest(0.08), pts, crack, 0.1));
  chest.push(...line(onChest(0.15), [[-4.5, 5.5], [-2.2, 5.9], [0, 5.6]], STRAP, 0.26), ...line(onChest(0.15), [[4.5, 5.5], [2.2, 5.9], [0, 5.6]], STRAP, 0.26));
  const gz = chestZ(0, 3);
  chest.push(...star([0, 3, gz + 0.2], 3.4, lit), ...star([0, 3, gz + 0.05], 2.3, trim));
  chest.push(gem(1.25, [0, 3, gz + 0.45], glow, [1, 1, 0.55], 4, 2));
  chest.push(...collar(mat, trim, 8, 0.5));
  // 背後一圈殘破的光環（有缺口），上方與兩側是星飾
  const halo: V3 = [0, 12.2, -3.6];
  const R = 5.8;
  const ringTones = glowTones(lighten(glow, 0.15));
  const ringAt = (t: number): V3 => [halo[0] + Math.cos(t) * R, halo[1] + Math.sin(t) * R, halo[2]];
  for (let k = 0; k < 16; k++) {
    if (k === 3 || k === 10 || k === 13) continue;
    const t0 = (k / 16) * Math.PI * 2 - Math.PI * 0.35;
    const t1 = t0 + (Math.PI * 2) / 16 - 0.12;
    if (Math.sin((t0 + t1) / 2) < -0.55) continue;
    chest.push(tone(taper(ringAt(t0), ringAt(t1), [0.6, 0.35], [0.55, 0.32], ringTones, 4, k, Math.PI / 4), ringTones, k));
  }
  chest.push(...star(ringAt(Math.PI / 2), 2.2, ringTones), ...star(ringAt(Math.PI / 6), 1.4, ringTones), ...star(ringAt((Math.PI * 5) / 6), 1.4, ringTones));
  parts.set('chest', chest);

  // ── 腰帶：金色的扣片、前面一顆星飾 ──
  parts.set('root', [beltBand([trim[1]!, trim[2]!, trim[0]!, trim[1]!]), ...studs(10, mat, 1), ...star([0, 2, 6.3], 1.6, mat), gem(0.5, [0, 2, 6.6], glow, [1, 1, 0.6], 4, 2)]);

  // ── 裙：外層寬的金色甲片、內層白與紅交錯的布條，尖端是星飾 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  for (const p of skirtRing({ n: 14, r0: 5.9, r1: 8.8, len: 10.5, y: -0.9, jitter: 2.4 }, front, back, 3)) {
    p.out.push(...strip(p, 2, p.i % 2 ? cloth : IVORY, 80 + p.i));
    if (p.i % 4 === 0) p.out.push(...star(along(p, 0.9, 0.35), 0.9, mat, 'z'));
  }
  for (const p of skirtRing({ n: 10, r0: 6.4, r1: 8.6, len: 6, y: -0.7, shift: 0.5, jitter: 1 }, front, back, 40)) {
    p.out.push(...plate(p, 3, mat, 100 + p.i, 0, 0.7));
  }
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：金色圓頂與甲片、頂上的星芒尖刺、下面垂著紅白布條 ──
  both((side) => {
    const pad = shoulder(side, mat, 1.05, 30);
    for (const f of armFlaps(side, 4, 0.6, 2.8, 1.5, mat, 40, 2.4, 3.8, 1.1)) pad.push(f.mesh);
    pad.push(...armCloth(side, [[-1.2, 6.5, cloth], [0, 7.5, IVORY], [1.2, 6, cloth]], 60));
    pad.push(barb([side * 1.6, 1.6, 1.8], [side * 0.3, 1, 0], 3, 0.55, mat, 70), barb([side * 2.6, 1.1, 0.6], [side * 0.7, 1, -0.3], 1.8, 0.4, mat, 71), barb([side * 2.6, 1.1, 3], [side * 0.7, 1, 0.3], 1.8, 0.4, mat, 72));
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

// ─────────────────────────── 紅 4 墮騎黑鎧 ───────────────────────────

/** 胸前三道光溝：火、冰、雷 */
const FALLEN_GLOWS = [0xff4a2a, 0x4a9aff, 0xffd040];

function fallen(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim } = s;
  const cloth = s.cloth ?? RED_CLOTH;
  // ── 胸：黑鐵板甲、三道光溝（紅在中間、藍在左、黃在右）、背後交叉的鐵鍊 ──
  const chest: Mesh[] = [shell(mat), ...busts(mat), underBust(trim[1]!, trim)];
  const grooves: [number, [number, number][]][] = [
    [FALLEN_GLOWS[0]!, [[0, 5.4], [0.35, 4.2], [-0.3, 3], [0.3, 1.8], [0, 0.2]]],
    [FALLEN_GLOWS[1]!, [[-1.6, 5.6], [-2, 4.4], [-1.5, 3.2], [-2, 1.9], [-1.7, 0.9]]],
    [FALLEN_GLOWS[2]!, [[1.6, 5.6], [2.1, 4.5], [1.6, 3.3], [2.1, 2], [1.7, 0.9]]],
  ];
  for (const [c, pts] of grooves) {
    chest.push(...line(onChest(0.12), pts, glowTones(c), 0.26));
    chest.push(gem(0.6, [pts[0]![0], pts[0]![1] + 0.3, chestZ(pts[0]![0], pts[0]![1] + 0.3) + 0.3], c, [0.8, 1.3, 0.5], 4, 2));
  }
  for (const x of [-1, 1]) chest.push(...line(onBack(0.15), [[x * 4.4, 5.6], [0, 2.4], [-x * 3.6, -0.6]], trim, 0.24));
  chest.push(...star([0, 2.4, frontZ(CHEST, 0, 2.4, -1) - 0.3], 1.6, trim, 'z'));
  chest.push(...collar(mat, trim, 8, 0.3));
  parts.set('chest', chest);

  // ── 腰帶：黑鐵扣片、前面一顆銅色的尖飾 ──
  parts.set('root', [beltBand([mat[1]!, mat[2]!, mat[0]!, mat[1]!]), ...studs(10, trim, 0.8), ...star([0, 2.1, 6.3], 1.9, trim)]);

  // ── 裙：外層黑鐵尖片、內層撕裂的紅布、四條掛著尖飾的鐵鍊 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  for (const p of skirtRing({ n: 10, r0: 5.8, r1: 8.8, len: 11.5, y: -1, jitter: 2.4 }, front, back, 7)) p.out.push(...strip(p, 2.6, cloth, 80 + p.i));
  for (const p of skirtRing({ n: 13, r0: 6.3, r1: 8.8, len: 7.5, y: -0.8, shift: 0.5 }, front, back, 21)) p.out.push(shard(p, 2.3, p.i % 3 ? mat : [lighten(mat[0]!, 0.15), mat[0]!, mat[1]!, mat[3]!], 90 + p.i, 0.5));
  for (const [x, z, list] of [[-2.6, 6.6, front], [2.6, 6.6, front], [-3.2, -2.9, back], [3.2, -2.9, back]] as const) {
    const zz = z + (z > 0 ? 0.6 : -0.6);
    for (let k = 0; k < 4; k++) list.push(gem(0.32, [x, -1.2 - k * 1.1, zz + (z > 0 ? k * 0.18 : -k * 0.18)], trim[k % 2]!, [0.7, 1.4, 0.7], 4, 2));
    list.push(...drop([x, -5.4, zz + (z > 0 ? 0.75 : -0.75)], trim, 2, 0.55));
  }
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：層層的尖鐵片、往上彎的大尖角（內側暗紅）、下面垂著撕裂的紅布 ──
  both((side) => {
    const pad = shoulder(side, mat, 1.1, 30);
    for (const f of armFlaps(side, 5, 1.2, 3, 1.3, mat, 40, 2.5, 4.4)) pad.push(f.mesh);
    for (const f of armFlaps(side, 4, -0.4, 3.4, 1.2, [lighten(mat[0]!, 0.12), mat[0]!, mat[1]!, mat[3]!], 46, 2.4, 4.6, 1.05)) pad.push(f.mesh);
    pad.push(...armCloth(side, [[-1.3, 7, cloth], [0, 8.5, cloth], [1.3, 6.5, cloth]], 60));
    pad.push(...horn([side * 1.8, 1.8, 1.4], [side * 5, 3.6, 1.6], [side * 3.4, 9.4, 0.9], 1, mat, 7));
    pad.push(...horn([side * 2, 2.2, 1.7], [side * 4.5, 3.8, 1.9], [side * 3.3, 8, 1.4], 0.55, cloth, 6));
    pad.push(...horn([side * 1.3, 1.9, 2.8], [side * 2.6, 3.4, 3.4], [side * 1.6, 5.6, 3.2], 0.55, mat, 4));
    pad.push(...star([side * 3.4, 0.2, 4.2], 1.3, trim, 'z'));
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

// ─────────────────────────── 紅 5 蛛后絲甲 ───────────────────────────

const EGG: Tones = [0xc8dca0, 0xa8c080, 0x7a9458, 0xb8d090];

function spider(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const silk: Tones = [lighten(mat[0]!, 0.18), lighten(mat[0]!, 0.06), mat[1]!, lighten(mat[0]!, 0.12)];
  // ── 胸：貼身的紫黑絲甲、紫色胸板、綠色的蛛絲、胸口的綠晶、肩前的尖骨 ──
  const chest: Mesh[] = [shell(mat), ...busts(silk), underBust(trim[1]!, trim)];
  for (const x of [-1, 1]) {
    chest.push(...line(onChest(0.12), [[x * 0.5, 5.4], [x * 2, 5], [x * 3.4, 4.2], [x * 4.4, 2.6]], lit, 0.1));
    chest.push(...line(onChest(0.12), [[x * 0.4, 1.2], [x * 2, 0.3], [x * 3.8, 0.8]], lit, 0.1));
    chest.push(...line(onChest(0.12), [[x * 0.8, 3.6], [x * 2.6, 6], [x * 4, 5.5]], lit, 0.09));
    chest.push(...horn([x * 3.4, 5.8, 3.8], [x * 4.4, 6.8, 5.6], [x * 3.4, 4.4, 7.3], 0.45, trim, 4));
  }
  chest.push(...line(onChest(0.12), [[0, 5.8], [0, -0.6]], lit, 0.1), ...line(onBack(0.12), [[0, 6], [0, -0.6]], trim, 0.2));
  chest.push(gem(1.2, [0, 3.1, chestZ(0, 3.1) + 0.2], trim[0]!, [0.75, 1.5, 0.45], 4, 2), gem(0.95, [0, 3.1, chestZ(0, 3.1) + 0.45], glow, [0.7, 1.45, 0.5], 4, 2));
  chest.push(...collar(mat, trim, 8.4, 0.6));
  parts.set('chest', chest);

  // ── 腰：骨色的尖刺一圈、兩側掛著一串卵囊（綠光的絲纏著） ──
  const root: Mesh[] = [beltBand(mat), ...studs(10, trim, 0.7)];
  for (const a of [-1.1, -0.6, 0, 0.6, 1.1]) {
    const p: V3 = [Math.sin(a) * 5.9, 2.4, 1.4 + Math.cos(a) * 4.7];
    root.push(barb(p, [Math.sin(a), 0.9, Math.cos(a)], 1.6, 0.4, trim, 70));
  }
  root.push(...buckle(trim[0]!, glow, 1.8, 1.1));
  for (const sx of [-1, 1]) {
    for (const [k, [ox, oy, oz, r]] of ([[0, -0.4, 0, 1.25], [0.6, -1.9, 0.8, 1.05], [-0.4, -1.8, -1, 1], [0.9, -0.2, 1.6, 0.9], [0.3, -3.2, 0, 0.85], [-0.6, 0.6, -0.9, 0.75]] as const).entries())
      root.push(F(tone(lowSphere(r * 1.3, EGG[0]!, [sx * (6.6 + ox * 1.3), 0.6 + oy * 1.3, 3 + oz * 1.3], 6, 4, [1, 1.15, 1]), EGG, 80 + k), 80 + k, 0.08));
    root.push(...chain([[sx * 5.8, 2.2, 4.6], [sx * 7.6, 0.4, 4.4], [sx * 7.2, -2.6, 3.6], [sx * 6.4, -4, 2.6]], [0.1, 0.1], [0.1, 0.1], lit, false));
  }
  parts.set('root', root);

  // ── 裙：紫黑的尖片、較淡的紫色絲片，夾著發光的綠絲 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  for (const p of skirtRing({ n: 11, r0: 5.9, r1: 9.4, len: 12, y: -1.1, jitter: 2.6 }, front, back, 9)) {
    if (Math.abs(p.a) < 0.3) continue;
    p.out.push(...plate(p, 2.5, p.i % 2 ? silk : mat, 80 + p.i, 0, 0.7));
  }
  for (const p of skirtRing({ n: 13, r0: 6.3, r1: 8.8, len: 7.5, y: -0.8, shift: 0.5 }, front, back, 30)) {
    p.out.push(shard(p, 2.2, mat, 90 + p.i, 0.45));
    if (p.i % 2) p.out.push(tone(taper(along(p, 0.15, 0.35), along(p, 0.9, 0.35), [0.12, 0.12], [0.08, 0.08], lit, 4, p.i, Math.PI / 4), lit, p.i));
  }
  const mid: SkirtSlot = { i: 0, a: 0, s: 0, c: 1, top: [0, -0.6, 6.3], tip: [0, -13, 8.2], out: front };
  front.push(...plate(mid, 1.6, mat, 120, 0, 0.8));
  for (const t of [0.2, 0.45, 0.7]) front.push(...star(along(mid, t, 0.45), 1, trim));
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：小圓頂，往上、往外伸出三支蜘蛛腳（關節是綠晶），腳之間掛著發光的蛛絲 ──
  both((side) => {
    const pad = shoulder(side, mat, 0.85, 30);
    for (const f of armFlaps(side, 4, 0.2, 2.6, 1.2, silk, 40, 2.1, 3.3, 1.1)) pad.push(f.mesh);
    const knees: V3[] = [];
    for (const [base, knee, tip] of [
      [[side * 1.4, 1.5, 1.6], [side * 5, 7.6, 0.8], [side * 8.4, 2.4, 0.2]],
      [[side * 1.8, 1.2, 2.8], [side * 5.8, 5.4, 3.8], [side * 8.4, -1.6, 4.8]],
      [[side * 1.8, 1.2, 0.6], [side * 5.6, 6, -1.6], [side * 8.2, -0.4, -2.8]],
    ] as [V3, V3, V3][]) {
      pad.push(...chain([base, knee], [0.85, 0.85], [0.6, 0.6], mat, false));
      pad.push(...chain([knee, [(knee[0] + tip[0]) / 2 + side * 0.4, (knee[1] + tip[1]) / 2 + 0.6, (knee[2] + tip[2]) / 2], tip], [0.6, 0.6], [0.05, 0.05], trim, false));
      pad.push(gem(0.75, knee, glow, [1, 1, 1], 4, 2));
      knees.push(knee);
    }
    pad.push(...chain([knees[1]!, [side * 4.8, 3, 2], knees[0]!, [side * 4.6, 3.4, -0.2], knees[2]!], [0.1, 0.1], [0.1, 0.1], lit, false));
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

// ─────────────────────────── 紅 6 統御者魔鎧 ───────────────────────────

function sovereign(s: StyledArmorSpec): StyledArmor {
  const parts = new Map<Joint, Mesh[]>();
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const cloth = s.cloth ?? RED_CLOTH;
  // ── 胸：暗色甲殼、金邊、胸口日蝕般的黑色圓盤（外圈發光、放出光芒） ──
  const chest: Mesh[] = [shell(mat), ...busts(mat), underBust(trim[1]!, trim)];
  for (const x of [-1, 1]) {
    chest.push(...line(onChest(0.14), [[x * 4.6, 5.4], [x * 2.6, 5.2], [x * 1.2, 4.7]], trim, 0.22));
    chest.push(...line(onChest(0.14), [[x * 0.6, 0.9], [x * 1.5, -0.3], [x * 3.6, -0.6]], trim, 0.2));
    chest.push(...seam(CHEST, [[x * 4.3, 3.6], [x * 3.8, 1.8], [x * 2.6, 0.7]], glow, 0.14));
  }
  const ez = chestZ(0, 3) + 0.15;
  chest.push(tone(lowSphere(1.65, 0x0a0608, [0, 3, ez], 10, 5, [1, 1, 0.35]), [0x1a1418, 0x0a0608, 0x050304, 0x120e10], 3));
  for (let k = 0; k < 14; k++) {
    const t0 = (k / 14) * Math.PI * 2;
    const t1 = ((k + 1) / 14) * Math.PI * 2;
    const p = (t: number, r: number): V3 => [Math.cos(t) * r, 3 + Math.sin(t) * r, ez + 0.2];
    chest.push(tone(taper(p(t0, 1.85), p(t1, 1.85), [0.24, 0.2], [0.24, 0.2], lit, 4, k, Math.PI / 4), lit, k));
    if (k % 2 === 0) chest.push(tone(taper(p(t0, 2.05), p(t0, k % 4 === 0 ? 3.3 : 2.7), [0.22, 0.1], [0.03, 0.03], lit, 4, k, 0), lit, k));
  }
  chest.push(...collar(mat, trim, 8.2, 0.5));
  // 頸後的金色尖冠
  for (const [x, h, z] of [[0, 4.4, -0.6], [-1.6, 3, -0.2], [1.6, 3, -0.2]] as const) chest.push(barb([x, 7.6, z], [x * 0.25, 1, -0.2], h, 0.5, trim, 70));
  chest.push(...star([0, 12.4, -1.5], 1.4, trim));
  parts.set('chest', chest);

  // ── 金邊的腰帶、前面一顆紅晶與垂下的金尖飾 ──
  const root: Mesh[] = [beltBand([mat[0]!, mat[1]!, trim[2]!, mat[3]!]), ...studs(8, trim, 0.9), ...buckle(trim[1]!, glow, 2, 1.4)];
  parts.set('root', root);

  // ── 下擺：外層金邊的暗甲片、內層像撕裂披風的長紅布（後面更長），金色的尖飾一串串垂下 ──
  const front: Mesh[] = [];
  const back: Mesh[] = [];
  for (const p of skirtRing({ n: 12, r0: 5.9, r1: 9.4, len: 12.5, y: -1.1, jitter: 2.6, backLen: 3 }, front, back, 13)) p.out.push(...strip(p, 2.6, p.i % 3 === 2 ? mat : cloth, 80 + p.i));
  for (const p of skirtRing({ n: 10, r0: 6.4, r1: 8.8, len: 7.4, y: -0.8, shift: 0.5 }, front, back, 33)) {
    p.out.push(...plate(p, 2.7, trim, 90 + p.i, 0, 0.7), ...plate(p, 2.25, mat, 100 + p.i, 0.2, 0.7));
    if (p.c > -0.2) p.out.push(...drop(along(p, 1.02, 0.4), trim, 1.6, 0.4));
  }
  const mid: SkirtSlot = { i: 0, a: 0, s: 0, c: 1, top: [0, -0.6, 6.3], tip: [0, -13, 8.3], out: front };
  for (const t of [0.2, 0.42, 0.64]) front.push(...star(along(mid, t, 0.4), 1.2, trim), gem(0.3, along(mid, t, 0.6), glow, [1, 1, 0.6], 4, 2));
  front.push(...drop(along(mid, 0.8, 0.4), trim, 2.4, 0.5));
  parts.set('cloth', front);
  parts.set('clothBack', back);

  // ── 護肩：巨大的王冠形肩甲（一圈往上的金尖），甲上的紅光紋，下面垂著紅布與掛尖飾的金鍊 ──
  both((side) => {
    const pad = shoulder(side, mat, 1.2, 30);
    for (const f of armFlaps(side, 5, 0.8, 3, 1.4, trim, 40, 2.6, 4.3)) pad.push(f.mesh);
    for (const f of armFlaps(side, 5, 0.9, 2.6, 1.1, mat, 46, 2.8, 4.45)) pad.push(f.mesh);
    for (const f of armFlaps(side, 3, 0.4, 2, 0.35, lit, 52, 3.1, 4.7, 1)) pad.push(tone(f.mesh, lit, 1));
    for (let i = 0; i < 7; i++) {
      const u = (i / 6) * 2 - 1;
      const base: V3 = [side * (2 + (1 - Math.abs(u)) * 0.6), 1.6, 1.8 + u * 2.4];
      const h = 2.6 + (1 - Math.abs(u)) * 3.6 + (i % 2) * 0.6;
      pad.push(barb(base, [side * (0.35 - Math.abs(u) * 0.1), 1, u * 0.35], h, 0.55, trim, 60 + i));
      if (i === 3) pad.push(...star([base[0] + side * h * 0.33, base[1] + h * 0.94 + 0.4, base[2]], 1, trim, 'x'));
    }
    pad.push(...armCloth(side, [[-0.8, 9, cloth], [0.8, 8, cloth]], 70));
    for (const z of [-1.8, 1.8]) {
      for (let k = 0; k < 3; k++) pad.push(gem(0.26, [side * 3.9, -1.6 - k * 1, 1.8 + z], trim[k % 2]!, [0.7, 1.4, 0.7], 4, 2));
      pad.push(...drop([side * 3.9, -4.6, 1.8 + z], trim, 1.8, 0.42));
    }
    return pad;
  }, parts);
  return { parts, hide: HIDE_SKIN };
}

/** 關節 → 網格；hide = 被蓋住、不畫的身體部位（例如藏起原本的裙子） */
export interface StyledArmor {
  parts: Map<Joint, Mesh[]>;
  hide: string[];
}

const LOOKS: Record<ArmorLook, (s: StyledArmorSpec) => StyledArmor> = { obsidian, carapace, robe, barbed, abyss, undying, fallen, spider, sovereign };

/** 專屬造型的盔甲 */
export const styledArmor = (s: StyledArmorSpec): StyledArmor => LOOKS[s.look](s);
