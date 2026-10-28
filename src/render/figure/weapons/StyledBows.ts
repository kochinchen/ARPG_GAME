import type { Mesh, V3 } from '../Poly3D';
import { plate } from './StyledAxes';
import { glowTones } from './StyledWeapons';
import { chain, darken, edge, gem, GOLD, lighten, resample, sample, taper, vadd, type BowOptions, type BowStyle, type Tones } from './WeaponParts';

/**
 * 橘 / 紅弓的造型：設計稿 art/gear/bows_unique/concept（橘弓四種基本款.png、紅弓六把.png）。
 * 橘四種基本款：recurve 精工反曲弓、chitin 甲殼刃弓、spine 骨刺獸弓、vine 寄生藤蔓弓；
 * 紅六把各一種：sky 天穹裂弦、stars 群星箭雨、blood 血祭神弓、fallen 墮騎魔弓、queen 蛛后毒弓、wing 魔王炎弓。
 * 座標同原本的弓：弓臂沿 ±Y、往 +Z 彎，弓弦在 -Z 側；握把在原點附近。代表物件鑲在握把中央（WeaponLooks.bowLook）。
 */
export type StyledBowOptions = BowOptions & { style: BowStyle };

interface Ctx {
  o: StyledBowOptions;
  th: number;
  trim: Tones;
  spikes: Tones;
  glow: number;
  meshes: Mesh[];
}
type Limb = (c: Ctx, pts: V3[], sd: 1 | -1) => void;

/** 流線的扁弓臂（前後寬、左右薄）＋弓背的鑲邊 */
function flatLimb(c: Ctx, pts: V3[], colors: Tones, rim: Tones | null, w = 1.5): void {
  const { th } = c;
  const seg = resample(pts, 8);
  seg.slice(0, -1).forEach((p, i) => {
    const k = 1 - (i / 8) * 0.55;
    c.meshes.push(edge(p, seg[i + 1]!, [th * 0.45 * k, th * w * k], [th * 0.42 * (k - 0.06), th * (w - 0.1) * (k - 0.06)], colors));
    if (rim) {
      const n0 = sample(pts, i / 8).n, n1 = sample(pts, (i + 1) / 8).n;
      c.meshes.push(taper(vadd(p, n0, th * (w - 0.15) * k), vadd(seg[i + 1]!, n1, th * (w - 0.2) * (k - 0.06)), [0.16, 0.22], [0.14, 0.2], rim, 4, i, Math.PI / 4));
    }
  });
}
/** 弓臂兩側（側面看得到）一道發光的線 */
function sideGlow(c: Ctx, pts: V3[], color: number, t0 = 0.05, t1 = 0.92, off = 0, n = 8): void {
  const { th } = c;
  for (let i = 0; i < n; i++) {
    const a = sample(pts, t0 + ((t1 - t0) * i) / n), b = sample(pts, t0 + ((t1 - t0) * (i + 1)) / n);
    const k = 1 - (t0 + ((t1 - t0) * i) / n) * 0.5;
    for (const x of [-1, 1]) c.meshes.push(taper(vadd(vadd(a.p, a.n, off * th * k), [x * th * 0.5 * k, 0, 0]), vadd(vadd(b.p, b.n, off * th * k), [x * th * 0.48 * k, 0, 0]), [0.14, 0.26], [0.14, 0.24], glowTones(color), 4, i, Math.PI / 4));
  }
}
/** 一顆星芒：Y-Z 平面上六道尖刺＋中心寶石 */
function star(c: Ctx, at: V3, r: number, glow: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 ? r * 0.55 : r;
    c.meshes.push(edge(at, [at[0], at[1] + Math.cos(a) * len, at[2] + Math.sin(a) * len], [0.3, r * 0.22], [0.03, 0.03], c.trim));
  }
  c.meshes.push(gem(r * 0.3, at, glow, [1.6, 1, 1], 6, 4));
}

// ─────────────────────────── 橘：四種基本款 ───────────────────────────

/** A 精工反曲弓：流線扁弓臂、金色鑲邊、中段發光晶體，刀鋒弓梢＋小翼 */
const recurve: Limb = (c, pts) => {
  const { th, trim, glow, o } = c;
  flatLimb(c, pts, o.colors, trim);
  const { p, d } = sample(pts, 0.42);
  for (const x of [-1, 1]) {
    const q = vadd(p, [x * th * 0.35, 0, 0]);
    c.meshes.push(edge(vadd(q, d, -2.2), q, [0.05, 0.05], [th * 0.75, th * 1.25], glowTones(glow)), edge(q, vadd(q, d, 2.2), [th * 0.75, th * 1.25], [0.05, 0.05], glowTones(glow)));
  }
  for (const k of [-2.3, 2.3]) c.meshes.push(taper(vadd(p, d, k - 0.3), vadd(p, d, k + 0.3), [th * 0.65, th * 1.6], [th * 0.65, th * 1.6], trim, 6, 3, Math.PI / 6));
  for (const [t, len] of [[0.25, 2.2], [0.6, 1.8]] as const) {
    const s = sample(pts, t);
    c.meshes.push(edge(vadd(s.p, s.n, th), vadd(vadd(s.p, s.n, th + len), s.d, len * 0.9), [th * 0.3, th * 0.8], [0.03, 0.04], trim));
  }
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  c.meshes.push(edge(tip, vadd(vadd(tip, end.d, 3.4), end.n, 0.6), [th * 0.35, th * 1.1], [0.03, 0.04], trim));
  c.meshes.push(edge(vadd(tip, end.d, -0.6), vadd(vadd(tip, end.d, 0.8), end.n, 2.2), [th * 0.3, th * 0.8], [0.03, 0.04], o.colors));
};

/** B 甲殼刃弓：一節節疊起的暗色甲殼板，外緣每節一支往弓梢斜的短刃，節縫透光；弓梢是大鉤爪 */
const chitin: Limb = (c, pts) => {
  const { th, glow, spikes, o } = c;
  const seg = resample(pts, 8);
  const dark: Tones = o.colors.map((x) => darken(x, 0.25));
  seg.slice(0, -1).forEach((p, i) => {
    const q = seg[i + 1]!;
    const k = 1 - (i / 8) * 0.45;
    const s0 = sample(pts, i / 8), s1 = sample(pts, (i + 1) / 8);
    c.meshes.push(taper(p, q, [th * 0.85 * k, th * 1.35 * k], [th * 0.7 * k, th * 1.05 * k], o.colors, 6, i, Math.PI / 6));
    c.meshes.push(edge(vadd(p, s0.n, th * 0.5 * k), vadd(q, s1.n, th * 0.35 * k), [th * 0.75 * k, th * 0.9 * k], [th * 0.35 * k, th * 0.4 * k], dark));
    c.meshes.push(edge(vadd(q, s1.n, th * 0.8 * k), vadd(vadd(q, s1.n, th * 0.8 * k + 2 * k), s1.d, 1.3 * k), [th * 0.25, th * 0.7 * k], [0.03, 0.04], spikes));
    if (i % 2 === 1) for (const x of [-1, 1]) c.meshes.push(gem(th * 0.32, vadd(q, [x * th * 0.78 * k, 0, 0]), glow, [0.6, 1, 1], 4, 3));
  });
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  const h1 = vadd(vadd(tip, end.d, 1.6), end.n, 1.8);
  c.meshes.push(...chain([tip, h1, vadd(vadd(h1, end.d, 1.4), end.n, -0.6), vadd(vadd(h1, end.d, 1.1), end.n, -2.6)], [th * 0.85, th * 1.1], [0.05, 0.06], spikes, false));
  c.meshes.push(gem(th * 0.55, vadd(tip, end.n, th * 0.5), glow, [1.4, 1, 1], 6, 4));
};

/** C 骨刺獸弓：骨節與皮繩交錯、金屬箍，外側往弓梢彎的骨刺，大彎鉤弓梢 */
const spine: Limb = (c, pts) => {
  const { th, trim, spikes, o } = c;
  const seg = resample(pts, 9);
  seg.slice(0, -1).forEach((p, i) => {
    const q = seg[i + 1]!;
    const wrap = i % 3 === 1;
    const k = 1 - (i / 9) * 0.45;
    c.meshes.push(taper(p, q, [th * (wrap ? 0.85 : 0.7) * k, th * (wrap ? 1.05 : 1.1) * k], [th * (wrap ? 0.85 : 0.75) * k, th * (wrap ? 1.05 : 0.95) * k], wrap ? o.grip : o.colors, 6, i, Math.PI / 6));
    if (i % 3 === 2) c.meshes.push(taper(vadd(q, sample(pts, (i + 1) / 9).d, -0.25), vadd(q, sample(pts, (i + 1) / 9).d, 0.25), [th * 0.95 * k, th * 1.25 * k], [th * 0.95 * k, th * 1.25 * k], trim, 8, i, 0));
  });
  for (const [t, len] of [[0.18, 2.6], [0.4, 3.6], [0.62, 3.2], [0.82, 2.4]] as const) {
    const { p, d, n } = sample(pts, t);
    const base = vadd(p, n, th * 0.8);
    const mid = vadd(vadd(base, n, len * 0.55), d, len * 0.35);
    c.meshes.push(...chain([base, mid, vadd(vadd(mid, n, len * 0.25), d, len * 0.55)], [th * 0.5, th * 0.55], [0.04, 0.05], spikes, false));
  }
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  const h1 = vadd(vadd(tip, end.d, 1.6), end.n, 1.6);
  const h2 = vadd(vadd(h1, end.d, 1.4), end.n, -0.4);
  c.meshes.push(...chain([tip, h1, h2, vadd(vadd(h2, end.d, 0.3), end.n, -1.6)], [th * 0.7, th * 0.8], [0.05, 0.06], spikes, false));
};

/** D 寄生藤蔓弓：兩股藤蔓絞成的弓臂、荊棘、發光果實，上臂長出蕈傘（左右不對稱）；弓梢是捲曲的藤 */
const vine: Limb = (c, pts, sd) => {
  const { th, trim, spikes, glow, o } = c;
  const seg = resample(pts, 10);
  seg.slice(0, -1).forEach((p, i) => {
    const k = 1 - (i / 10) * 0.45;
    c.meshes.push(taper(p, seg[i + 1]!, [th * 0.7 * k, th * 0.8 * k], [th * 0.65 * k, th * 0.75 * k], o.colors, 6, i, Math.PI / 6));
  });
  const twist = Array.from({ length: 13 }, (_, i) => {
    const s = sample(pts, i / 12);
    const a = i * 1.3;
    return vadd(vadd(s.p, s.n, Math.sin(a) * th * 0.75), [Math.cos(a) * th * 0.7, 0, 0]);
  });
  c.meshes.push(...chain(twist, [th * 0.35, th * 0.4], [th * 0.22, th * 0.25], o.grip, false));
  for (let i = 0; i < 6; i++) {
    const s = sample(pts, 0.1 + i * 0.15);
    const side = i % 2 ? 1 : -1;
    c.meshes.push(taper(vadd(s.p, s.n, side * th * 0.6), vadd(vadd(s.p, s.n, side * (th * 0.6 + 1.1)), s.d, 0.7), [0.2, 0.24], [0.02, 0.02], spikes, 4, i, Math.PI / 4));
  }
  for (const t of sd > 0 ? [0.2, 0.45, 0.75] : [0.3, 0.6]) {
    const s = sample(pts, t);
    c.meshes.push(gem(th * 0.6, vadd(s.p, s.n, th * 0.75), glow, [1.2, 1.2, 1.2], 6, 4));
  }
  for (const [t, r] of sd > 0 ? ([[0.62, 1.5], [0.84, 1.1]] as const) : ([[0.5, 0.9]] as const)) {
    const s = sample(pts, t);
    const stalk = vadd(s.p, s.n, th * 0.7), cap = vadd(vadd(stalk, s.n, 1.4), s.d, 0.4);
    c.meshes.push(taper(stalk, cap, [0.22, 0.22], [0.18, 0.18], trim, 4, 1, Math.PI / 4), gem(r, cap, spikes[0]!, [0.6, 0.55, 1.1], 7, 3));
  }
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  const h1 = vadd(vadd(tip, end.d, 1.4), end.n, 1.2);
  c.meshes.push(...chain([tip, h1, vadd(vadd(h1, end.d, 0.8), end.n, -0.9), vadd(vadd(h1, end.d, -0.2), end.n, -1.2)], [th * 0.5, th * 0.55], [0.06, 0.06], o.colors, false));
};

// ─────────────────────────── 紅：六把專屬 ───────────────────────────

/** 天穹裂弦：白金扁弓臂、兩側天藍光，外緣一層層往弓梢掃的雲翼羽片；弓梢長刃 */
const sky: Limb = (c, pts) => {
  const { th, trim, glow, o } = c;
  flatLimb(c, pts, o.colors, trim, 1.6);
  sideGlow(c, pts, glow);
  for (let i = 0; i < 8; i++) {
    const s = sample(pts, 0.06 + i * 0.115);
    const len = (3.2 - Math.abs(i - 3) * 0.35) * (i === 0 ? 0.7 : 1);
    c.meshes.push(edge(vadd(s.p, s.n, th * 1.1), vadd(vadd(s.p, s.n, th + len), s.d, len * 0.75), [th * 0.28, th * 1], [0.03, 0.12], i % 2 ? trim : o.colors));
  }
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  c.meshes.push(edge(tip, vadd(vadd(tip, end.d, 3.8), end.n, 0.4), [th * 0.35, th * 1.1], [0.03, 0.04], trim));
};

/** 群星箭雨：夜空色的弓臂、金色鑲邊，弓臂兩側一串星點連成星座，中段與弓梢各一顆大星芒 */
const stars: Limb = (c, pts) => {
  const { th, trim, glow, o } = c;
  flatLimb(c, pts, o.colors, trim, 1.4);
  const dots = [0.14, 0.3, 0.58, 0.74].map((t) => sample(pts, t));
  for (const x of [-1, 1]) {
    const ps = dots.map((s, i) => vadd(vadd(s.p, s.n, (i % 2 ? 0.4 : -0.3) * th), [x * th * 0.5, 0, 0]));
    ps.forEach((p) => c.meshes.push(gem(th * 0.3, p, lighten(glow, 0.3), [0.7, 1, 1], 4, 3)));
    for (let i = 0; i < ps.length - 1; i++) c.meshes.push(taper(ps[i]!, ps[i + 1]!, [0.06, 0.06], [0.06, 0.06], glowTones(glow), 4, i, Math.PI / 4));
  }
  const mid = sample(pts, 0.45);
  star(c, vadd(mid.p, mid.n, th * 1.8), 2.6, glow);
  const tip = pts[pts.length - 1]!;
  star(c, tip, 3.2, glow);
};

/** 血祭神弓：白金扁弓臂被血浸透一半、往弓弦滴著血，外緣血紅尖刺；弓梢竄出血焰 */
const blood: Limb = (c, pts) => {
  const { th, trim, spikes, glow, o } = c;
  flatLimb(c, pts, o.colors, trim, 1.5);
  sideGlow(c, pts, glow, 0.1, 0.95, -0.4, 7);
  for (let i = 0; i < 6; i++) {
    const s = sample(pts, 0.1 + i * 0.15);
    c.meshes.push(edge(vadd(s.p, s.n, th * 1.1), vadd(vadd(s.p, s.n, th * 1.1 + 1.6 + (i % 2) * 1), s.d, 1.2), [th * 0.25, th * 0.6], [0.03, 0.04], spikes));
    if (i % 2 === 0) c.meshes.push(taper(vadd(s.p, s.n, -th * 1.2), vadd(vadd(s.p, s.n, -th * 1.2 - 1.4), s.d, 0.3), [0.2, 0.3], [0.03, 0.05], glowTones(glow), 4, i, Math.PI / 4));
  }
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  for (const [k, len] of [[0.6, 2.8], [-0.4, 2]] as const) c.meshes.push(...chain([tip, vadd(vadd(tip, end.d, len * 0.5), end.n, k + 0.6), vadd(vadd(tip, end.d, len), end.n, k)], [th * 0.5, th * 0.7], [0.03, 0.05], glowTones(glow)));
};

/** 墮騎魔弓：斷劍熔成的黑鐵刃片弓臂，兩側紅 / 藍 / 黃三道光溝，外緣一排斷刃；弓梢鐮刀 */
const fallen: Limb = (c, pts) => {
  const { th, spikes, o } = c;
  const seg = resample(pts, 6);
  seg.slice(0, -1).forEach((p, i) => {
    const k = 1 - (i / 6) * 0.45;
    c.meshes.push(edge(p, seg[i + 1]!, [th * 0.5 * k, th * 1.9 * k], [th * 0.45 * k, th * 1.5 * k], o.colors));
    const s = sample(pts, (i + 0.5) / 6);
    c.meshes.push(edge(vadd(s.p, s.n, th * 1.4 * k), vadd(vadd(s.p, s.n, th * 1.4 * k + 2.2 * k), s.d, 1.6 * k), [th * 0.3, th * 0.9 * k], [0.03, 0.04], spikes));
  });
  for (const [off, col] of [[-0.9, 0xff3a2a], [0, 0x3a8cff], [0.9, 0xffc030]] as const) sideGlow(c, pts, col, 0.04, 0.85, off, 6);
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  const s1 = vadd(vadd(tip, end.d, 2.2), end.n, 1.8);
  c.meshes.push(...chain([tip, s1, vadd(vadd(s1, end.d, 2), end.n, -0.6), vadd(vadd(s1, end.d, 2.4), end.n, -2.6)], [th * 0.5, th * 1.4], [0.04, 0.08], spikes));
};

/** 蛛后毒弓：弓臂是一支多節的蜘蛛腳（關節發綠光、節上倒刺），關節拉出蛛絲連到弓弦 */
const queen: Limb = (c, pts) => {
  const { th, spikes, glow, o } = c;
  const P = (t: number, out: number) => {
    const s = sample(pts, t);
    return vadd(s.p, s.n, out);
  };
  const leg = [P(0, 0), P(0.3, 2.4), P(0.62, 1.6), P(0.88, 0.4), pts[pts.length - 1]!];
  for (let i = 0; i < leg.length - 1; i++) {
    const k = 1 - i * 0.18;
    c.meshes.push(taper(leg[i]!, leg[i + 1]!, [th * 0.95 * k, th * 1.1 * k], [th * 0.7 * k, th * 0.8 * k], o.colors, 6, i, Math.PI / 6));
    if (i > 0) c.meshes.push(gem(th * 1.05 * k, leg[i]!, o.colors[0]!, [1, 1, 1], 6, 4), gem(th * 0.45, vadd(leg[i]!, [th * 0.9 * k, 0, 0]), glow, [0.6, 1, 1], 4, 3), gem(th * 0.45, vadd(leg[i]!, [-th * 0.9 * k, 0, 0]), glow, [0.6, 1, 1], 4, 3));
    const mid: V3 = [(leg[i]![0] + leg[i + 1]![0]) / 2, (leg[i]![1] + leg[i + 1]![1]) / 2, (leg[i]![2] + leg[i + 1]![2]) / 2];
    c.meshes.push(taper(mid, vadd(mid, [0, -0.8, 1.2]), [0.18, 0.22], [0.02, 0.02], spikes, 4, i, Math.PI / 4));
  }
  const tipEnd = pts[pts.length - 1]!;
  const stringZ = tipEnd[2];
  const silk: Tones = [0xf0f4e8, 0xd8e4c8, 0xb0c0a0, 0xe4ecd8];
  for (const j of [1, 2, 3]) {
    const a = leg[j]!;
    c.meshes.push(taper(a, [0, a[1] * 0.92, stringZ], [0.05, 0.05], [0.05, 0.05], silk, 4, j, Math.PI / 4));
    if (j < 3) c.meshes.push(taper(a, [0, (a[1] + leg[j + 1]![1]) / 2, stringZ], [0.04, 0.04], [0.04, 0.04], silk, 4, j, Math.PI / 4));
  }
  c.meshes.push(...chain([tipEnd, vadd(tipEnd, [0, Math.sign(tipEnd[1]) * 1.8, 1.2]), vadd(tipEnd, [0, Math.sign(tipEnd[1]) * 3.2, 0.2])], [th * 0.5, th * 0.6], [0.04, 0.05], spikes, false));
};

/** 魔王炎弓：翼骨弓臂伸出三根指骨，指骨之間撐開火紅的翼膜，膜緣尖刺；弓梢是大鉤爪 */
const wing: Limb = (c, pts, sd) => {
  const { th, spikes, glow, o } = c;
  const seg = resample(pts, 8);
  seg.slice(0, -1).forEach((p, i) => {
    const k = 1 - (i / 8) * 0.4;
    c.meshes.push(taper(p, seg[i + 1]!, [th * 0.85 * k, th * 1.1 * k], [th * 0.8 * k, th * 1 * k], o.colors, 6, i, Math.PI / 6));
  });
  const roots = [0.12, 0.42, 0.72, 0.98].map((t) => sample(pts, t));
  const tips = roots.map((s, i) => vadd(vadd(s.p, s.n, [4.2, 5.2, 4.4, 2.2][i]!), s.d, [-0.6, 1.2, 2, 1.6][i]!));
  roots.forEach((s, i) => c.meshes.push(edge(s.p, tips[i]!, [th * 0.6, th * 0.7], [0.05, 0.08], o.colors)));
  for (let i = 0; i < roots.length - 1; i++) {
    const a = roots[i]!.p, b = roots[i + 1]!.p, ta = tips[i]!, tb = tips[i + 1]!;
    const dip: V3 = [0, (ta[1] + tb[1]) / 2 * 0.8 + (a[1] + b[1]) / 2 * 0.2, (ta[2] + tb[2]) / 2 * 0.8 + (a[2] + b[2]) / 2 * 0.2];
    const outline: [number, number][] = [[a[1], a[2]], [ta[1], ta[2]], [dip[1], dip[2]], [tb[1], tb[2]], [b[1], b[2]]];
    if (sd < 0) outline.reverse();
    c.meshes.push(plate(outline, th * 0.12, th * 0.28, spikes, i));
    c.meshes.push(taper(ta, vadd(ta, sample(pts, 0.5).d, 1.4), [0.25, 0.3], [0.03, 0.03], o.colors, 4, i, Math.PI / 4));
  }
  sideGlow(c, pts, glow, 0.05, 0.6, 0, 5);
  const tip = pts[pts.length - 1]!, end = sample(pts, 1);
  const h1 = vadd(vadd(tip, end.d, 2), end.n, 1.6);
  c.meshes.push(...chain([tip, h1, vadd(vadd(h1, end.d, 1.6), end.n, -1.2)], [th * 0.8, th * 1], [0.05, 0.06], o.colors, false));
};

const LIMBS: Record<BowStyle, Limb> = { recurve, chitin, spine, vine, sky, stars, blood, fallen, queen, wing };
const GRIP: Record<BowStyle, 'fine' | 'beast' | 'core'> = { recurve: 'fine', sky: 'fine', stars: 'fine', chitin: 'beast', spine: 'beast', vine: 'beast', blood: 'core', fallen: 'core', queen: 'core', wing: 'core' };

export function styledBow(o: StyledBowOptions): { meshes: Mesh[]; top: V3; bottom: V3 } {
  // 設計稿的弓臂比一般弓粗壯得多
  const L = o.length, b = o.bend, r = o.recurve ?? 0;
  const c: Ctx = { o, th: o.thickness * 1.4, trim: o.trim ?? GOLD, spikes: o.spikes ?? o.colors, glow: o.glow ?? 0xfff0c0, meshes: [] };
  const { th, trim, glow } = c;
  const path = (sd: 1 | -1): V3[] => [
    [0, sd * 2.4, b * 0.3],
    [0, sd * L * 0.38, b * 0.9],
    [0, sd * L * 0.7, b],
    [0, sd * L * 0.9, b * 0.75 - r * 0.35],
    [0, sd * L, b * 0.4 - r],
  ];
  const tips: V3[] = [];
  for (const sd of [1, -1] as const) {
    const pts = path(sd);
    LIMBS[o.style](c, pts, sd);
    tips.push(pts[pts.length - 1]!);
  }
  const [top, bottom] = tips as [V3, V3];
  const gripZ = b * 0.25;
  const grip = GRIP[o.style];
  if (grip === 'core') {
    c.meshes.push(taper([0, 2.8, gripZ], [0, -2.8, gripZ], [th * 1.05, th * 1.25], [th * 1.05, th * 1.25], o.grip, 6, 0, Math.PI / 6));
    c.meshes.push(taper([0, 2.6, gripZ], [0, 5.2, gripZ + 0.4], [th * 1.4, th * 1.7], [th * 1.2, th * 1.5], trim, 6, 1, 0));
    c.meshes.push(gem(th * 1.3, [0, 3.9, gripZ + th * 0.6], glow, [1.1, 1.4, 1], 6, 4), gem(th * 0.75, [0, -3.6, gripZ + th * 0.6], glow, [1.1, 1.2, 1]));
  } else if (grip === 'fine') {
    c.meshes.push(taper([0, 2.5, gripZ], [0, -2.5, gripZ], [th * 0.85, th * 1.1], [th * 0.85, th * 1.1], o.grip, 6, 0, Math.PI / 6));
    c.meshes.push(taper([0, 2.9, gripZ], [0, 2.2, gripZ], [th * 1.1, th * 1.4], [th * 1.1, th * 1.4], trim, 8, 1, 0), taper([0, -2.2, gripZ], [0, -2.9, gripZ], [th * 1.1, th * 1.4], [th * 1.1, th * 1.4], trim, 8, 2, 0));
    for (const y of [1.3, -1.3]) c.meshes.push(gem(th * 0.6, [th * 0.75, y, gripZ + th * 0.3], glow, [0.6, 1.3, 0.8], 4, 3), gem(th * 0.6, [-th * 0.75, y, gripZ + th * 0.3], glow, [0.6, 1.3, 0.8], 4, 3));
  } else {
    c.meshes.push(taper([0, 2.6, gripZ], [0, -2.6, gripZ], [th * 0.95, th * 1.15], [th * 0.95, th * 1.15], o.grip, 6, 0, Math.PI / 6));
    for (const y of [2.5, -2.5]) c.meshes.push(taper([0, y + 0.3, gripZ], [0, y - 0.3, gripZ], [th * 1.15, th * 1.35], [th * 1.15, th * 1.35], trim, 8, 1, 0));
  }
  if (o.style === 'blood') {
    // 握把垂著念珠，末端一個小聖徽
    const beads: V3[] = Array.from({ length: 9 }, (_, i) => [0, 1.6 - i * 0.75, gripZ - 1 - Math.sin((i / 8) * Math.PI) * 1.4]);
    beads.forEach((p) => c.meshes.push(gem(0.32, p, c.spikes[0]!, [1, 1, 1], 5, 3)));
    star(c, [0, beads[8]![1] - 0.9, beads[8]![2]], 1.2, glow);
  }
  if (o.style === 'queen') for (const [y, z] of [[3.4, -0.9], [3, -1.6], [-3.2, -1.2], [-3.8, -0.6]] as const) c.meshes.push(gem(0.55, [0, y, gripZ + z], 0xe0d8e8, [1, 1, 1], 6, 4));
  // 弓弦：除了骨刺獸弓都是一道光；天穹裂弦的弦更粗，上面有幾個菱形節點
  const lit = o.style !== 'spine';
  const sw = o.style === 'sky' ? 0.2 : lit ? 0.11 : 0.08;
  c.meshes.push(taper(top, bottom, [sw, sw], [sw, sw], lit ? glowTones(glow) : [o.string ?? 0x6a4a30], 4, 0, Math.PI / 4));
  if (o.style === 'sky') for (const f of [0.25, 0.5, 0.75]) {
    const p: V3 = [0, top[1] + (bottom[1] - top[1]) * f, top[2] + (bottom[2] - top[2]) * f];
    c.meshes.push(edge(vadd(p, [0, -0.9, 0]), p, [0.05, 0.05], [0.45, 0.45], glowTones(glow)), edge(p, vadd(p, [0, 0.9, 0]), [0.45, 0.45], [0.05, 0.05], glowTones(glow)));
  }
  return { meshes: c.meshes, top, bottom };
}
