import type { Joint } from '../FigureModel';
import { loft, tone, type Ring } from '../Facets';
import { lowSphere, mapVerts, prism, type Mesh, type V3 } from '../Poly3D';
import { darken, gem, lighten, taper, type Tones } from '../weapons/WeaponParts';
import { F, glowTones, horn, rand } from './StyledArmors';

/**
 * 橘 / 紅頭盔的專屬造型（設計稿：art/gear/helmets_unique/concept/單件/）：
 * 連同女主角的頭與脖子一起換掉——頭盔掛在 head 關節、護頸掛在 neck 關節，被蓋住的臉、頭髮、脖子不畫。
 * head 關節的區域座標：下巴約 y -1、頭頂約 y 10；臉最前面約 z 5、後腦約 z -6；寬約 x ±4.6。
 * neck 關節在 head 下方 2.75、後方 0.4；脖子從 neck 往上到下巴。
 */

export type HelmetLook = 'fallenKnight' | 'stormCrown' | 'plumed' | 'visor' | 'crypt' | 'circlet' | 'skull' | 'agesCrown' | 'priestCrown' | 'demonCrown';

export interface StyledHelmetSpec {
  look: HelmetLook;
  mat: Tones;
  trim: Tones;
  /** 發光的顏色（眼縫、寶石） */
  glow: number;
  /** 盔纓、羽飾等布料的顏色 */
  cloth?: Tones;
}

/** 關節 → 網格；hide = 被蓋住、不畫的身體部位 */
export interface StyledHelmet {
  parts: Map<Joint, Mesh[]>;
  hide: string[];
}

/** 放樣體在高度 y、橫向 x 處的正面 z（貼在表面上的零件用） */
function frontZ(rings: readonly Ring[], x: number, y: number): number {
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1]!.y < y) i++;
  const a = rings[i]!, b = rings[i + 1]!;
  const t = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
  const rx = a.rx + (b.rx - a.rx) * t;
  const rz = a.rz + (b.rz - a.rz) * t;
  const cz = (a.cz ?? 0) + ((b.cz ?? 0) - (a.cz ?? 0)) * t;
  return cz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
}

/** 垂墜的小尖飾 */
const pendant = (c: V3, colors: Tones, len: number, r: number): Mesh[] => [
  tone(taper(c, [c[0], c[1] - len * 0.35, c[2]], [0.06, 0.06], [r, r], colors, 4, 0, Math.PI / 4), colors, 1),
  tone(taper([c[0], c[1] - len * 0.35, c[2]], [c[0], c[1] - len, c[2]], [r, r], [0.04, 0.04], colors, 4, 2, Math.PI / 4), colors, 2),
];

/** 依女主角的頭縮放（頭髮蓬鬆，量到的頭比實際的頭大；頭盔依量到的大小設計再縮小） */
const fit = (meshes: Mesh[], k: number, c: V3) => meshes.map((m) => mapVerts(m, ([x, y, zz]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k, c[2] + (zz - c[2]) * k]));
const fitHead = (meshes: Mesh[]) => fit(meshes, 0.72, [0, 0, 0.5]);

// ─────────────────────────── 紅 墮落騎士盔 ───────────────────────────

/** 盔殼（head 關節）：比頭大一圈、前後略長，下緣在下巴下方 */
const KNIGHT_SHELL: Ring[] = [
  { y: -1.6, rx: 3.7, rz: 4.3, cz: 0.2 },
  { y: 0, rx: 4.6, rz: 5.3, cz: -0.2 },
  { y: 2, rx: 5.1, rz: 5.8, cz: -0.4 },
  { y: 4.2, rx: 5.3, rz: 6, cz: -0.5 },
  { y: 6.4, rx: 5, rz: 5.7, cz: -0.6 },
  { y: 8.4, rx: 4, rz: 4.7, cz: -0.7 },
  { y: 9.8, rx: 2.5, rz: 3.1, cz: -0.8 },
  { y: 10.6, rx: 0.8, rz: 1.1, cz: -0.8 },
];

/** 全罩騎士盔的變化：墮落騎士盔（彎角＋盔纓）、騎士面甲（高冠脊）、墓守頭盔（T 字眼縫、骨刺、金屬牌） */
interface KnightOptions {
  horns?: boolean;
  plume?: boolean;
  /** 頭頂：spike = 金色尖冠、fin = 一道高高的冠脊、bones = 一排骨刺 */
  crest: 'spike' | 'fin' | 'bones';
  /** 眼縫：v = 往兩側上揚、t = T 字 */
  slit: 'v' | 't';
  /** 兩側垂掛的金屬牌 */
  plaques?: boolean;
  /** 尖刺、骨刺的顏色 */
  spikes?: Tones;
}

function knight(s: StyledHelmetSpec, o: KnightOptions): StyledHelmet {
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const cloth = s.cloth ?? [0x5a2a8a, 0x461e70, 0x2a1044, 0x50267e];
  const dark: Tones = [lighten(mat[0]!, 0.28), lighten(mat[0]!, 0.12), mat[1]!, lighten(mat[3]!, 0.18)];
  const spikes = o.spikes ?? trim;
  const z = (x: number, y: number) => frontZ(KNIGHT_SHELL, x, y);
  const head: Mesh[] = [F(loft(KNIGHT_SHELL, 16, mat, 3), 3, 0.14)];

  // 面甲：眉甲（眼縫以上）與下半的面甲（眼縫以下收成尖下巴）；中央一道金色的稜
  for (const x of [-1, 1]) {
    // 斜眉甲：從額頭中央往兩側斜下，順著眼縫
    head.push(F(taper([x * 0.2, 7.9, z(0.2, 7.9) + 0.1], [x * 3.9, 4.9, z(3.9, 4.9) + 0.3], [1.5, 0.6], [0.5, 0.4], dark, 4, 1, 0), 4, 0.12));
    head.push(tone(taper([x * 0.3, 7.1, z(0.3, 7.1) + 0.55], [x * 3.9, 4.45, z(3.9, 4.45) + 0.45], [0.2, 0.2], [0.14, 0.14], trim, 4, 1, Math.PI / 4), trim, 1));
  }
  head.push(F(taper([0, 2.9, z(0, 2.9) + 0.5], [0, -4.4, 3.4], [3.3, 1], [0.08, 0.08], dark, 4, 2, 0), 5, 0.12));
  head.push(tone(taper([0, 9.4, z(0, 9.4) + 0.2], [0, 4.7, z(0, 4.7) + 1.15], [0.42, 0.3], [0.3, 0.25], trim, 4, 3, 0), trim, 3));
  head.push(tone(taper([0, 2.6, z(0, 2.6) + 1.2], [0, -4.2, 3.95], [0.42, 0.3], [0.06, 0.06], trim, 4, 3, 0), trim, 3));
  // T 字眼縫：中央往下一道發光的縫
  if (o.slit === 't') head.push(tone(taper([0, 4.3, z(0, 4.3) + 1.25], [0, 0.4, z(0, 0.4) + 1.1], [0.42, 0.3], [0.3, 0.25], lit, 4, 4, Math.PI / 2), lit, 4));
  // 眼縫：眉甲與面甲之間一道發光的縫（V 形往兩側上揚；T 字是水平），上下有金邊
  for (const x of [-1, 1]) {
    const a: V3 = [x * 0.2, o.slit === 'v' ? 3.5 : 4.3, z(0.2, 3.5) + 1.2];
    const b: V3 = [x * 3.7, o.slit === 'v' ? 4.6 : 4.3, z(3.7, 4.6) + 0.35];
    head.push(tone(taper(a, b, [0.6, 0.3], [0.35, 0.25], lit, 4, 4, Math.PI / 2), lit, 4));
    head.push(tone(taper([a[0], a[1] + 0.85, a[2] - 0.1], [b[0], b[1] + 0.75, b[2]], [0.22, 0.22], [0.16, 0.16], trim, 4, 5, Math.PI / 4), trim, 5));
    // 頰甲：兩側往下的層疊甲片（尖端朝下）
    for (const [k, y] of [0.6, -1.2].entries()) {
      const top: V3 = [x * (4.7 - k * 0.5), y + 1.6, z(4.4, y) - 1.6 - k * 0.4];
      const tip: V3 = [x * (4.1 - k * 0.6), y - 2.6, z(4, y) - 1.3 - k * 0.6];
      head.push(F(taper(top, tip, [1.7, 0.5], [0.06, 0.05], dark, 4, 6 + k, 0), 6 + k, 0.1));
      head.push(tone(taper([top[0] * 1.06, top[1] - 0.2, top[2]], [tip[0] * 1.06, tip[1] + 0.2, tip[2]], [0.3, 0.2], [0.05, 0.05], trim, 4, 8 + k, 0), trim, 8));
    }
    // 太陽穴的金色圓飾（中間紫晶），下面垂著金尖飾
    const temple: V3 = [x * 5.25, 3.4, -0.3];
    head.push(tone(lowSphere(0.85, trim[1]!, temple, 8, 3, [0.45, 1, 1]), trim, 9));
    head.push(gem(0.42, [temple[0] + x * 0.35, temple[1], temple[2]], glow, [0.6, 1, 1], 4, 2));
    for (let k = 0; k < 3; k++) head.push(gem(0.2, [x * 5.3, 2.2 - k * 0.65, -0.3], trim[k % 2]!, [0.7, 1.4, 0.7], 4, 2));
    head.push(...pendant([x * 5.3, 0.3, -0.3], trim, 1.8, 0.42));
    // 兩側往上彎的大尖角：黑鐵，內側一層紫色
    if (o.horns) head.push(...horn([x * 4.6, 5.6, -0.6], [x * 8.4, 6.8, -0.4], [x * 6.6, 13.2, 0.3], 1.1, dark, 7));
    if (o.horns) head.push(...horn([x * 4.9, 6, -0.2], [x * 7.9, 7.2, 0], [x * 6.4, 12, 0.5], 0.6, lit.map((c) => darken(c, 0.35)) as Tones, 6));
    // 頭頂兩側的小尖刺（墓守頭盔是更長的骨刺）
    for (const [k, [y, zz]] of ([[8.2, 1.6], [7.4, -2.2]] as const).entries()) {
      const len = o.crest === 'bones' ? 4 : 2.2;
      head.push(tone(taper([x * 2.6, y, zz], [x * (2.6 + len * 0.45), y + len, zz * 1.1], [o.crest === 'bones' ? 0.7 : 0.42, 0.42], [0.04, 0.04], spikes, 4, 10 + k, Math.PI / 4), spikes, 10));
    }
    if (o.crest === 'bones') head.push(F(taper([x * 4.8, 5.4, -0.8], [x * 8, 7.6, -1], [0.75, 0.75], [0.04, 0.04], spikes, 4, 16, Math.PI / 4), 16, 0.06));
    // 兩側垂掛的金屬牌（刻著符文）
    if (o.plaques) head.push(...plaque([x * 5.5, 1.4, 0.4], trim, lit));
  }
  // 額頭中央的晶石與頭頂的冠：金色尖冠 / 一道高冠脊 / 一排骨刺
  head.push(gem(0.6, [0, 6.4, z(0, 6.4) + 0.45], glow, [0.75, 1.3, 0.5], 4, 2));
  if (o.crest === 'spike') head.push(F(taper([0, 8.8, z(0, 8.8) - 0.4], [0, 13.4, 1.4], [0.85, 0.55], [0.05, 0.05], trim, 4, 12, 0), 12, 0.08));
  if (o.crest === 'fin') {
    head.push(F(taper([0, 10.2, 3.6], [0, 15.2, -2.4], [0.35, 2.2], [0.1, 0.3], trim, 4, 12, 0), 12, 0.06));
    head.push(F(taper([0, 10.4, -1], [0, 11.6, -7.4], [0.3, 1.6], [0.08, 0.1], trim, 4, 17, 0), 17, 0.06));
  }
  if (o.crest === 'bones')
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const b: V3 = [0, 10.4 - Math.abs(t - 0.3) * 1.6, 2.4 - t * 6.4];
      head.push(F(taper(b, [0, b[1] + 3.4 - Math.abs(t - 0.3) * 1.6, b[2] - 0.8], [0.8, 0.8], [0.04, 0.04], spikes, 4, 18 + i, Math.PI / 4), 18 + i, 0.06));
    }
  // 盔殼的金色環帶（額頭以上、兩側與後腦）
  head.push(tone(prism(16, 6.9, 7.35, [5.05, 5.75], [4.75, 5.45], trim[1]!, [0, 0, -0.6]), trim, 14));
  for (const x of [-1, 1]) head.push(tone(taper([x * 1.4, 10.1, -0.8], [x * 4.9, 1, -3.2], [0.22, 0.22], [0.2, 0.2], trim, 4, 15, Math.PI / 4), trim, 15));
  // 盔殼下緣一圈金邊
  head.push(tone(prism(16, -1.75, -1.35, [3.85, 4.45], [3.8, 4.4], trim[1]!, [0, 0, 0.2]), trim, 13));
  // 盔纓：頭頂中線一道撕裂的黑紫色鬃毛，往後飄但停在後腦上方（下面露出紅色的馬尾）
  for (let i = 0; i < (o.plume ? 9 : 0); i++) {
    const t = i / 8;
    const base: V3 = [(rand(i + 1) - 0.5) * 0.5, 10.2 - t * 1.6, 1.5 - t * 5.4];
    const len = 3.2 + t * 3.6 + rand(i + 3) * 1.4;
    const mid: V3 = [base[0] * 1.5, base[1] + 1.8 - t * 0.6, base[2] - len * 0.45];
    const tip: V3 = [base[0] * 2.2 + (rand(i) - 0.5) * 0.8, base[1] + 0.6 - t * 2.2, base[2] - len];
    head.push(...horn(base, mid, tip, 0.6 + rand(i + 9) * 0.25, i % 3 === 1 ? lit.map((c) => darken(c, 0.25)) as Tones : cloth, 5));
  }

  // 護頸（neck 關節）：三層往下張開的黑鐵環片，下緣金邊
  const neck: Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const top = 4.6 - k * 1.7;
    const r0: [number, number] = [3.3 + k * 0.4, 3.4 + k * 0.4];
    const r1: [number, number] = [3.9 + k * 0.55, 4 + k * 0.55];
    neck.push(F(tone(prism(14, top, top - 2.3, r0, r1, mat[1]!, [0, 0, 0.6]), k % 2 ? dark : mat, 20 + k), 20 + k, 0.1));
    neck.push(tone(prism(14, top - 2.25, top - 2.6, [r1[0] + 0.05, r1[1] + 0.05], [r1[0] + 0.1, r1[1] + 0.1], trim[1]!, [0, 0, 0.6]), trim, 23 + k));
  }
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)], ['neck', fit(neck, 0.8, [0, 1, 0.6])]]), hide: ['head', 'face', 'hair', 'neck'] };
}

const fallenKnight = (s: StyledHelmetSpec) => knight(s, { horns: true, plume: true, crest: 'spike', slit: 'v' });
/** 橘 C 騎士面甲（獨眼頭盔、鐵骸頭盔、餘燼頭盔）：墮落騎士盔拿掉彎角與盔纓，頭頂一道高高的冠脊 */
const visor = (s: StyledHelmetSpec) => knight(s, { crest: 'fin', slit: 'v' });
/** 紅 墓守頭盔：鏽鐵、T 字眼縫透出餘燼光、頭頂與兩側插著骨刺、兩側垂著金屬牌 */
const crypt = (s: StyledHelmetSpec) => knight(s, { crest: 'bones', slit: 't', plaques: true, spikes: s.cloth ?? [0xe8dcc0, 0xcfc0a0, 0xa89878, 0xdccfb0] });

/** 垂掛的金屬牌：短鍊、長方形的牌、中間一道發光的符文 */
function plaque(c: V3, trim: Tones, lit: Tones): Mesh[] {
  const out: Mesh[] = [];
  for (let k = 0; k < 2; k++) out.push(gem(0.18, [c[0], c[1] + 1.6 - k * 0.5, c[2]], trim[k]!, [0.7, 1.4, 0.7], 4, 2));
  out.push(F(tone(prism(4, c[1] + 0.9, c[1] - 2.2, [0.75, 0.2], [0.65, 0.18], trim[1]!, [c[0], 0, c[2]], Math.PI / 4), trim, 24), 24, 0.04));
  out.push(tone(taper([c[0] + Math.sign(c[0]) * 0.22, c[1] + 0.4, c[2]], [c[0] + Math.sign(c[0]) * 0.22, c[1] - 1.6, c[2]], [0.08, 0.14], [0.08, 0.14], lit, 4, 25, 0), lit, 25));
  return out;
}

// ─────────────────────────── 紅 風暴之冠 ───────────────────────────

/** 拿掉盔殼正面的臉部（開放式頭盔：臉從開口露出來） */
function openFace(m: Mesh, below: number): Mesh {
  return {
    ...m,
    faces: m.faces.filter((f) => {
      const c = [0, 1, 2].map((k) => f.idx.reduce((a, i) => a + m.verts[i]![k]!, 0) / f.idx.length);
      return !(c[1]! < below && Math.atan2(Math.abs(c[0]!), c[2]! + 0.4) < 1.15);
    }),
  };
}

/** 鋸齒狀的閃電晶片：從 a 往 dir 長 len，中間折兩次 */
function bolt(a: V3, dir: V3, side: V3, len: number, r: number, colors: Tones, seed: number): Mesh[] {
  const at = (t: number, s: number): V3 => [a[0] + dir[0] * len * t + side[0] * s, a[1] + dir[1] * len * t + side[1] * s, a[2] + dir[2] * len * t + side[2] * s];
  const pts = [at(0, 0), at(0.4, 0.5), at(0.55, -0.3), at(1, 0.4)];
  return pts.slice(0, -1).map((p, i) => tone(taper(p, pts[i + 1]!, [r * (1 - i * 0.28), r * 0.6 * (1 - i * 0.28)], [r * (0.72 - i * 0.3) + 0.04, r * 0.4 * (0.72 - i * 0.3) + 0.03], colors, 4, seed + i, Math.PI / 4), colors, seed + i));
}

/** 墮落騎士盔的盔殼拿掉面甲（臉露出來）：銀色的冠盔、冠上一圈銀尖與閃電晶片、額前大藍晶、頭頂一團烏雲 */
function stormCrown(s: StyledHelmetSpec): StyledHelmet {
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const crystal: Tones = [lighten(glow, 0.45), glow, darken(glow, 0.35), lighten(glow, 0.2)];
  const cloud = s.cloth ?? [0x4a4c56, 0x3a3c44, 0x26282e, 0x42444c];
  // 銀尖、頰甲、眉帶用亮銀色（trim），盔殼是暗一點的鋼藍（mat）
  const plate: Tones = [trim[0]!, trim[1]!, trim[2]!, trim[3]!];
  const z = (x: number, y: number) => frontZ(KNIGHT_SHELL, x, y);
  const head: Mesh[] = [F(openFace(loft(KNIGHT_SHELL, 16, mat, 3), 7.6), 3, 0.14)];

  // 臉孔開口上緣的眉帶（往中央收成 V），中間一顆大藍晶
  head.push(tone(prism(16, 7.3, 7.9, [5.05, 5.75], [4.85, 5.55], trim[1]!, [0, 0, -0.6]), trim, 14));
  head.push(F(taper([0, 9.6, z(0, 9.6) + 0.2], [0, 6.6, z(0, 7) + 0.5], [2.6, 0.7], [0.08, 0.08], plate, 4, 7, 0), 7, 0.1));
  head.push(gem(1.2, [0, 8.3, z(0, 8.3) + 0.8], trim[0]!, [0.85, 1.35, 0.45], 4, 2));
  head.push(gem(0.95, [0, 8.3, z(0, 8.3) + 1.1], glow, [0.8, 1.3, 0.5], 4, 2));
  // 冠：頭頂一圈往上、往外的銀尖（前面最高），之間夾著藍色的閃電晶片
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const sn = Math.sin(a), c = Math.cos(a);
    const base: V3 = [sn * 4.4, 8.4, -0.7 + c * 5.1];
    const out: V3 = [sn * 0.45, 1, c * 0.35];
    const n = Math.hypot(...out);
    const dir: V3 = [out[0] / n, out[1] / n, out[2] / n];
    if (i % 2 === 0) {
      const len = 3 + Math.max(0, c) * 2 + rand(i) * 1;
      head.push(F(taper(base, [base[0] + dir[0] * len, base[1] + dir[1] * len, base[2] + dir[2] * len], [0.7, 0.55], [0.04, 0.04], plate, 4, 20 + i, Math.PI / 4), 20 + i, 0.08));
    } else {
      const side = Math.abs(sn) > 0.6;
      const d: V3 = side ? [sn * 0.9, 0.75, c * 0.2] : dir;
      const dn = Math.hypot(...d);
      head.push(...bolt(base, [d[0] / dn, d[1] / dn, d[2] / dn], [c * 0.6, 0, -sn * 0.6], side ? 5.6 : 3.8, 0.6, crystal, 30 + i));
    }
  }
  for (const x of [-1, 1]) {
    // 頰甲：臉的兩側往下的層疊銀片（尖端朝下）
    for (const [k, y] of [2.6, 0.4].entries()) {
      const top: V3 = [x * (5.1 - k * 0.3), y + 1.8, -0.4 - k * 0.6];
      const tip: V3 = [x * (4.5 - k * 0.4), y - 3, 0.6 - k * 0.6];
      head.push(F(taper(top, tip, [1.7, 0.5], [0.06, 0.05], plate, 4, 6 + k, 0), 6 + k, 0.1));
    }
    // 太陽穴的銀色圓飾（中間藍晶），下面垂著藍晶墜
    const temple: V3 = [x * 5.35, 5.2, -0.6];
    head.push(tone(lowSphere(0.9, mat[1]!, temple, 8, 3, [0.45, 1, 1]), mat, 9));
    head.push(gem(0.45, [temple[0] + x * 0.35, temple[1], temple[2]], glow, [0.6, 1, 1], 4, 2));
    for (let k = 0; k < 2; k++) head.push(gem(0.2, [x * 5.4, 4 - k * 0.65, -0.6], trim[k]!, [0.7, 1.4, 0.7], 4, 2));
    head.push(gem(0.7, [x * 5.4, 1.9, -0.6], glow, [0.7, 1.7, 0.7], 4, 2));
  }
  // 頭頂飄著的一小團烏雲，雲裡有亮藍的電光
  const cloudC: V3 = [0, 19.5, -0.8];
  const puffs: [number, number, number, number][] = [[0, 0.8, 0, 3], [-2.9, 0, 0.5, 2.4], [3, 0.1, -0.3, 2.5], [-1.3, -0.4, -1.8, 2.2], [1.6, -0.3, 1.8, 2.1], [-4.5, -0.6, -0.5, 1.6], [4.6, -0.5, 0.6, 1.6], [0.5, 1.8, -1, 2]];
  puffs.forEach(([dx, dy, dz, r], i) => head.push(F(tone(lowSphere(r, cloud[0]!, [cloudC[0] + dx, cloudC[1] + dy, cloudC[2] + dz], 7, 4, [1, 0.72, 0.9]), cloud, 50 + i), 50 + i, 0.14)));
  for (const [k, [x, zz]] of ([[-2.1, 1.7], [1.6, 2], [0.3, -2.1]] as const).entries())
    head.push(...bolt([x, cloudC[1] - 0.8, cloudC[2] + zz], [0.15, -1, 0], [1, 0, 0], 4.2, 0.3, lit, 60 + k * 3));
  head.push(...bolt([-3.4, cloudC[1] + 0.3, cloudC[2] + 2.5], [1, 0.1, 0], [0, 0.8, 0], 6.8, 0.22, lit, 70));
  // 和墮落騎士盔一樣依女主角的頭縮小
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)]]), hide: ['head', 'hair'] };
}

// ─────────────────────────── 橘 D 輕盔羽飾 ───────────────────────────

/** 羽毛：從 a 往 dir 長 len 的長葉形（中間最寬），寬面朝 side 方向的法線，中央一道羽軸 */
function feather(a: V3, dir: V3, len: number, w: number, colors: Tones, seed: number): Mesh[] {
  const p = (t: number): V3 => [a[0] + dir[0] * len * t, a[1] + dir[1] * len * t, a[2] + dir[2] * len * t];
  const rib: Tones = [lighten(colors[0]!, 0.25), colors[0]!, colors[1]!, colors[0]!];
  return [
    F(taper(p(0), p(0.4), [0.1, w * 0.4], [0.1, w], colors, 4, seed, 0), seed, 0.06),
    F(taper(p(0.4), p(1), [0.1, w], [0.03, 0.03], colors, 4, seed + 1, 0), seed + 1, 0.06),
    tone(taper(p(0), p(0.85), [0.12, 0.12], [0.05, 0.05], rib, 4, seed + 2, Math.PI / 4), rib, seed + 2),
  ];
}

/**
 * 輕盔羽飾（鷹眼頭巾、弓骸頭巾、指揮官頭盔）：墮落騎士盔拿掉面甲（臉露出來）、換成皮革與金邊；
 * 保留盔殼、金色環帶、層疊的頰甲與太陽穴的垂飾，彎角與盔纓換成額前的星形寶石、一側的日輪飾與一束往後披的羽飾
 */
function plumed(s: StyledHelmetSpec): StyledHelmet {
  const { mat, trim, glow } = s;
  const plume = s.cloth ?? [0x4a9a5a, 0x3a7e48, 0x245432, 0x5aa866];
  const leaf: Tones = [lighten(plume[0]!, 0.18), plume[0]!, plume[2]!, plume[3]!];
  const plate: Tones = [lighten(mat[0]!, 0.18), mat[0]!, mat[2]!, mat[3]!];
  const z = (x: number, y: number) => frontZ(KNIGHT_SHELL, x, y);
  const head: Mesh[] = [F(openFace(loft(KNIGHT_SHELL, 16, mat, 8), 7.6), 8, 0.14)];

  // 盔殼的金色環帶（同墮落騎士盔；下緣的金邊會橫過喉嚨，開放式不加）、額前往下收的尖角
  head.push(tone(prism(16, 6.9, 7.35, [5.05, 5.75], [4.75, 5.45], trim[1]!, [0, 0, -0.6]), trim, 14));
  for (const x of [-1, 1]) head.push(tone(taper([x * 1.4, 10.1, -0.8], [x * 4.9, 1, -3.2], [0.22, 0.22], [0.2, 0.2], trim, 4, 15, Math.PI / 4), trim, 15));
  head.push(F(taper([0, 9.4, z(0, 9.4) + 0.2], [0, 6.6, z(0, 7) + 0.6], [2.2, 0.6], [0.08, 0.08], trim, 4, 4, 0), 4, 0.08));
  // 額前的星形飾：四道金色尖芒抱著一顆寶石
  const gz = z(0, 8.5) + 0.7;
  for (const [dx, dy, k] of [[0, 1, 2.3], [0, -1, 1.4], [1, 0.2, 1.6], [-1, 0.2, 1.6]] as const)
    head.push(tone(taper([0, 8.5, gz], [dx * k, 8.5 + dy * k, gz - Math.abs(dx) * 0.6], [0.5, 0.3], [0.04, 0.04], trim, 4, 5, 0), trim, 5));
  head.push(gem(1.0, [0, 8.5, gz + 0.1], trim[0]!, [0.8, 1.3, 0.45], 4, 2));
  head.push(gem(0.78, [0, 8.5, gz + 0.35], glow, [0.75, 1.25, 0.5], 4, 2));
  // 頭頂中線一道金色的脊
  head.push(tone(taper([0, 10.6, 1.6], [0, 10.4, -4.4], [0.35, 0.9], [0.3, 0.5], trim, 4, 6, 0), trim, 6));
  for (const x of [-1, 1]) {
    // 頰甲：臉的兩側往下的層疊皮甲（同墮落騎士盔的位置），金邊
    for (const [k, y] of [2.6, 0.4].entries()) {
      const top: V3 = [x * (5.1 - k * 0.3), y + 1.8, -0.4 - k * 0.6];
      const tip: V3 = [x * (4.5 - k * 0.4), y - 3, 0.6 - k * 0.6];
      head.push(F(taper(top, tip, [1.7, 0.5], [0.06, 0.05], plate, 4, 6 + k, 0), 6 + k, 0.1));
      head.push(tone(taper([top[0] * 1.06, top[1] - 0.2, top[2]], [tip[0] * 1.06, tip[1] + 0.2, tip[2]], [0.3, 0.2], [0.05, 0.05], trim, 4, 8 + k, 0), trim, 8));
    }
    // 太陽穴的垂飾
    for (let k = 0; k < 3; k++) head.push(gem(0.2, [x * 5.3, 4.4 - k * 0.65, -0.3], trim[k % 2]!, [0.7, 1.4, 0.7], 4, 2));
    head.push(...pendant([x * 5.3, 2.5, -0.3], trim, 1.8, 0.42));
  }
  // 左側（+X）太陽穴的日輪飾，羽飾從這裡往上、往後披下（取代墮落騎士盔的彎角與盔纓）
  const sun: V3 = [5.6, 6.6, -0.6];
  head.push(tone(lowSphere(1.05, trim[1]!, sun, 8, 3, [0.45, 1, 1]), trim, 10));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    head.push(tone(taper([sun[0] + 0.25, sun[1], sun[2]], [sun[0] + 0.4, sun[1] + Math.sin(a) * 1.9, sun[2] + Math.cos(a) * 1.9], [0.3, 0.35], [0.03, 0.03], trim, 4, 11 + k, 0), trim, 11));
  }
  head.push(gem(0.45, [sun[0] + 0.55, sun[1], sun[2]], glow, [0.6, 1, 1], 4, 2));
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    // 由前到後：前面的羽毛往上立，後面的往後、往下披
    const ang = 0.2 + t * 2.3;
    const dir: V3 = [0.32 + rand(i) * 0.15, Math.cos(ang), -Math.sin(ang)];
    const n = Math.hypot(...dir);
    const base: V3 = [4.4 + rand(i + 4) * 0.6, 8.4 - t * 1.4, -0.6 - t * 1.8];
    head.push(...feather(base, [dir[0] / n, dir[1] / n, dir[2] / n], 5.5 + rand(i + 2) * 2.5 - t * 0.5, 0.85 + rand(i + 6) * 0.25, i % 2 ? leaf : plume, 30 + i * 3));
  }
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)]]), hide: ['head', 'hair'] };
}

// ─────────────────────────── 開放式（臉露出來）的共用零件 ───────────────────────────

/** 墮落騎士盔的盔殼拿掉面甲 */
const openShell = (mat: Tones, seed = 3) => F(openFace(loft(KNIGHT_SHELL, 16, mat, seed), 7.6), seed, 0.14);
const shellZ = (x: number, y: number) => frontZ(KNIGHT_SHELL, x, y);

/** 盔殼的環帶（額頭以上）與兩側往下的線 */
const bands = (trim: Tones): Mesh[] => [
  tone(prism(16, 6.9, 7.35, [5.05, 5.75], [4.75, 5.45], trim[1]!, [0, 0, -0.6]), trim, 14),
  ...[-1, 1].map((x) => tone(taper([x * 1.4, 10.1, -0.8], [x * 4.9, 1, -3.2], [0.22, 0.22], [0.2, 0.2], trim, 4, 15, Math.PI / 4), trim, 15)),
];

/** 臉兩側往下的層疊頰甲（帶邊）與太陽穴的垂飾 */
function sides(plate: Tones, trim: Tones, glow: number | null): Mesh[] {
  const out: Mesh[] = [];
  for (const x of [-1, 1]) {
    for (const [k, y] of [2.6, 0.4].entries()) {
      const top: V3 = [x * (5.1 - k * 0.3), y + 1.8, -0.4 - k * 0.6];
      const tip: V3 = [x * (4.5 - k * 0.4), y - 3, 0.6 - k * 0.6];
      out.push(F(taper(top, tip, [1.7, 0.5], [0.06, 0.05], plate, 4, 6 + k, 0), 6 + k, 0.1));
      out.push(tone(taper([top[0] * 1.06, top[1] - 0.2, top[2]], [tip[0] * 1.06, tip[1] + 0.2, tip[2]], [0.3, 0.2], [0.05, 0.05], trim, 4, 8 + k, 0), trim, 8));
    }
    for (let k = 0; k < 3; k++) out.push(gem(0.2, [x * 5.3, 4.4 - k * 0.65, -0.3], trim[k % 2]!, [0.7, 1.4, 0.7], 4, 2));
    if (glow === null) out.push(...pendant([x * 5.3, 2.5, -0.3], trim, 1.8, 0.42));
    else out.push(gem(0.65, [x * 5.3, 1.8, -0.3], glow, [0.7, 1.7, 0.7], 4, 2));
  }
  return out;
}

/** 額前的寶石（外框 + 發光的晶石） */
const browGem = (y: number, r: number, frame: number, glow: number): Mesh[] => [
  gem(r * 1.25, [0, y, shellZ(0, y) + 0.75], frame, [0.85, 1.35, 0.45], 4, 2),
  gem(r, [0, y, shellZ(0, y) + 1.05], glow, [0.8, 1.3, 0.5], 4, 2),
];

/** 一圈往上、往外的尖刺（前面最高）；colors(i) 決定每根的顏色 */
function spikeRing(y: number, n: number, len: (i: number, front: number) => number, r: number, colors: (i: number) => Tones, seed: number, out = 0.45, radius = 1): Mesh[] {
  const meshes: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sn = Math.sin(a), c = Math.cos(a);
    const ring = KNIGHT_SHELL.find((q) => q.y >= y) ?? KNIGHT_SHELL.at(-1)!;
    const base: V3 = [sn * ring.rx * 0.95 * radius, y, (ring.cz ?? 0) + c * ring.rz * 0.95 * radius];
    const d: V3 = [sn * out, 1, c * out * 0.8];
    const k = Math.hypot(...d);
    const l = len(i, c);
    meshes.push(F(taper(base, [base[0] + (d[0] / k) * l, base[1] + (d[1] / k) * l, base[2] + (d[2] / k) * l], [r, r * 0.8], [0.04, 0.04], colors(i), 4, seed + i, Math.PI / 4), seed + i, 0.08));
  }
  return meshes;
}

/** 往上竄的火焰：幾段左右擺動的發光尖片 */
function flame(base: V3, h: number, w: number, colors: Tones, seed: number): Mesh[] {
  const pts: V3[] = [0, 0.35, 0.7, 1].map((t, k) => [base[0] + (rand(seed + k) - 0.5) * w * (k ? 1 : 0), base[1] + h * t, base[2] + (rand(seed + k + 9) - 0.5) * w * 0.6 * (k ? 1 : 0)]);
  return pts.slice(0, -1).map((p, k) => tone(taper(p, pts[k + 1]!, [w * (1 - k * 0.3), w * 0.5 * (1 - k * 0.3)], [w * (0.7 - k * 0.3) + 0.03, w * 0.35 * (0.7 - k * 0.3) + 0.03], colors, 4, seed + k, Math.PI / 4), colors, seed + k));
}

// ─────────────────────────── 橘 A 法冠 ───────────────────────────

/** 法冠（先知之冠、心靈頭冠、霜蕈頭盔）：墮落騎士盔拿掉面甲，額前一圈金屬額冠往上長出一簇晶體，額前一顆發光寶石 */
function circlet(s: StyledHelmetSpec): StyledHelmet {
  const { mat, trim, glow } = s;
  const crystal: Tones = [lighten(glow, 0.45), glow, darken(glow, 0.35), lighten(glow, 0.2)];
  const head: Mesh[] = [openShell(mat), ...bands(trim), ...sides(trim, trim, glow)];
  // 額冠：額頭一圈金屬，前面往上高起成尖拱
  head.push(tone(prism(16, 7.2, 8.2, [5.1, 5.8], [4.7, 5.4], trim[1]!, [0, 0, -0.6]), trim, 20));
  for (const x of [-1, 0, 1]) head.push(F(taper([x * 1.6, 7.8, shellZ(x * 1.6, 7.8) + 0.3], [x * 2.4, 11.6 - Math.abs(x) * 1.6, shellZ(x * 2, 9) - 0.3], [0.9, 0.4], [0.05, 0.05], trim, 4, 21 + x, 0), 21 + x, 0.08));
  head.push(...browGem(8.4, 0.95, trim[0]!, glow));
  // 一簇往上、往外的晶體（前面與兩側最高）
  for (let i = 0; i < 11; i++) {
    const a = ((i - 5) / 11) * Math.PI * 1.6;
    const sn = Math.sin(a), c = Math.cos(a);
    const base: V3 = [sn * 4.6, 8.4, -0.6 + c * 5.1];
    const d: V3 = [sn * 0.5, 1, c * 0.3];
    const k = Math.hypot(...d);
    const len = 2.6 + (1 - Math.abs(i - 5) / 5) * 2.2 + rand(i) * 1.4;
    head.push(F(taper(base, [base[0] + (d[0] / k) * len, base[1] + (d[1] / k) * len, base[2] + (d[2] / k) * len], [0.75, 0.6], [0.04, 0.04], crystal, 6, 30 + i, 0), 30 + i, 0.06));
  }
  // 霜蕈頭盔：盔頂長著冰藍的菌傘（用 cloth 指定菌傘的顏色）
  if (s.cloth)
    for (const [k, [x, y, z, r]] of ([[-1.6, 10.4, -2.4, 2.1], [1.8, 10, -3.2, 1.7], [0, 10.9, -0.6, 1.5]] as const).entries()) {
      head.push(tone(prism(6, y - 1.6, y, [0.35, 0.35], [0.3, 0.3], s.cloth[2]!, [x, 0, z]), s.cloth, 40 + k));
      head.push(F(tone(lowSphere(r, s.cloth[0]!, [x, y, z], 8, 3, [1, 0.45, 1]), s.cloth, 43 + k), 43 + k, 0.1));
    }
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)]]), hide: ['head', 'hair'] };
}

// ─────────────────────────── 橘 B 獸骨角盔 ───────────────────────────

/** 獸骨角盔（狂戰士頭盔、影豹頭盔、骨咒法冠）：墮落騎士盔拿掉面甲，額頭換成野獸頭骨（眼窩發光、蓋到眼睛上方）、兩側往後彎的大角 */
function skull(s: StyledHelmetSpec): StyledHelmet {
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const bone: Tones = [lighten(trim[0]!, 0.1), trim[0]!, trim[2]!, trim[3]!];
  const hornTones: Tones = s.cloth ?? [lighten(mat[0]!, 0.2), mat[0]!, mat[2]!, mat[1]!];
  const head: Mesh[] = [openShell(mat), ...sides(bone, trim, null)];
  // 頭骨：額頭上一片骨板往前凸、往下蓋到眼睛上方，中間一道鼻樑往下收尖
  head.push(F(taper([0, 10.2, shellZ(0, 10) - 0.4], [0, 6.2, shellZ(0, 7) + 1.6], [3.4, 1.2], [4.6, 1.3], bone, 4, 50, 0), 50, 0.12));
  head.push(F(taper([0, 6.8, shellZ(0, 7) + 1.4], [0, 3.6, shellZ(0, 5) + 1.9], [1.6, 0.8], [0.1, 0.1], bone, 4, 51, 0), 51, 0.1));
  for (const x of [-1, 1]) {
    // 眼窩：骨板下緣兩個發光的眼
    head.push(tone(lowSphere(0.75, glow, [x * 1.6, 6.6, shellZ(1.6, 6.6) + 1.45], 6, 3, [1.2, 0.6, 0.5]), lit, 52));
    // 骨板兩側往下的尖齒
    for (let k = 0; k < 3; k++) head.push(F(taper([x * (2.2 + k * 0.8), 6.6 - k * 0.2, shellZ(2.2 + k * 0.8, 6.6) + 0.9 - k * 0.3], [x * (2.4 + k * 0.85), 4.6 - k * 0.5, shellZ(2.4 + k * 0.85, 5) + 0.9 - k * 0.3], [0.5, 0.4], [0.04, 0.04], bone, 4, 53 + k, Math.PI / 4), 53 + k, 0.06));
    // 往外、往後彎的大角
    head.push(...horn([x * 4.4, 7.4, -0.8], [x * 9.6, 9, -1.4], [x * 8.2, 14.6, -4.6], 1.35, hornTones, 8));
  }
  // 頭頂往後的一排骨刺
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const b: V3 = [0, 10.3 - t * 1.2, 1 - t * 6];
    head.push(F(taper(b, [0, b[1] + 2.6 - t * 0.8, b[2] - 1.2], [0.6, 0.6], [0.04, 0.04], bone, 4, 60 + i, Math.PI / 4), 60 + i, 0.06));
  }
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)]]), hide: ['head', 'hair'] };
}

// ─────────────────────────── 紅 歲月王冠 ───────────────────────────

/** 歲月王冠：墮落騎士盔拿掉面甲（金色），盔頂一圈圈疊高的尖頂（每層一個朝代），額前白金色寶石，兩側垂著紅布與金飾 */
function agesCrown(s: StyledHelmetSpec): StyledHelmet {
  const { mat, trim, glow } = s;
  const cloth = s.cloth ?? [0xa83a32, 0x8c2c26, 0x5e1a18, 0x9a322c];
  const crack: Tones = [darken(mat[2]!, 0.4), darken(mat[2]!, 0.5), darken(mat[2]!, 0.6), darken(mat[2]!, 0.45)];
  const head: Mesh[] = [openShell(mat), ...bands(trim), ...sides(mat, trim, null)];
  // 三層疊高的冠：每層一圈環與尖頂，越上層越小
  for (const [k, [y, scale, len, n]] of ([[7.6, 1, 2.6, 12], [9.2, 0.78, 2.2, 10], [10.2, 0.5, 1.8, 8]] as const).entries()) {
    const ring = KNIGHT_SHELL.find((q) => q.y >= y) ?? KNIGHT_SHELL.at(-1)!;
    head.push(tone(prism(16, y - 0.3, y + 0.5, [ring.rx * 1.02 * (k ? 1.1 : 1), ring.rz * 1.02 * (k ? 1.1 : 1)], [ring.rx * 0.98 * (k ? 1.1 : 1), ring.rz * 0.98 * (k ? 1.1 : 1)], trim[1]!, [0, 0, ring.cz ?? 0]), trim, 70 + k));
    head.push(...spikeRing(y + 0.4, n, (i, c) => len + Math.max(0, c) * 1.2 + (i % 2) * 0.6, 0.5 * scale + 0.15, () => mat, 72 + k * 20, 0.25, k ? 1.1 : 1));
  }
  head.push(...browGem(8.6, 1.05, mat[0]!, glow));
  // 冠上細小的裂痕（修補過）
  for (const x of [-1, 1]) head.push(tone(taper([x * 2.6, 9.4, shellZ(2.6, 9.4) + 0.05], [x * 3.4, 8, shellZ(3.4, 8) + 0.05], [0.12, 0.12], [0.1, 0.1], crack, 4, 80, Math.PI / 4), crack, 80));
  // 兩側垂下的紅布
  for (const x of [-1, 1]) head.push(F(taper([x * 5.2, 6.2, -1.6], [x * 5.6, -1.6, -2.4], [0.15, 1.1], [0.12, 0.8], cloth, 4, 81, 0), 81, 0.06));
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)]]), hide: ['head', 'hair'] };
}

// ─────────────────────────── 紅 墮神之冠 ───────────────────────────

/** 墮神之冠：墮落神官的高冠（被血焰燻紅的金），冠前血紅寶石，兩側垂下金色的祈禱牌，冠頂冒著暗紅的火焰 */
function priestCrown(s: StyledHelmetSpec): StyledHelmet {
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const fire: Tones = [lighten(glow, 0.3), glow, darken(glow, 0.35), lighten(glow, 0.15)];
  const head: Mesh[] = [openShell(mat), ...bands(trim), ...sides(mat, trim, null)];
  // 高冠：一圈往上的金色尖板，前面一片最高的尖拱
  head.push(tone(prism(16, 7.2, 8.2, [5.1, 5.8], [4.9, 5.6], trim[1]!, [0, 0, -0.6]), trim, 90));
  head.push(...spikeRing(8, 10, (i, c) => 3 + Math.max(0, c) * 2.4 + (i % 2) * 0.8, 0.85, () => trim, 91, 0.2));
  head.push(...browGem(8.8, 1.1, trim[0]!, glow));
  // 冠頂冒著暗紅的火焰
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    head.push(...flame([Math.sin(a) * 2.6, 10, -0.8 + Math.cos(a) * 3], 3.4 + rand(i) * 2.2, 0.9, i % 2 ? fire : lit, 100 + i * 5));
  }
  // 兩側垂下的金色祈禱牌
  for (const x of [-1, 1]) head.push(...plaque([x * 5.7, 1.6, -0.4], trim, lit));
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)]]), hide: ['head', 'hair'] };
}

// ─────────────────────────── 紅 深淵魔冠 ───────────────────────────

/** 深淵魔冠：深淵魔王的雙角化成的王冠，暗紅的巨角往上、往後彎（角上發光的裂紋），角之間一圈骨白的尖刺，額前一顆橘色的火眼 */
function demonCrown(s: StyledHelmetSpec): StyledHelmet {
  const { mat, trim, glow } = s;
  const lit = glowTones(glow);
  const bone = s.cloth ?? [0xe0d2b4, 0xcbb487, 0x8a7450, 0xc0a878];
  const hornTones: Tones = [lighten(mat[0]!, 0.15), mat[0]!, mat[2]!, mat[1]!];
  const head: Mesh[] = [openShell(mat), ...bands(trim), ...sides(mat, trim, null)];
  head.push(tone(prism(16, 7.2, 8, [5.1, 5.8], [4.9, 5.6], trim[1]!, [0, 0, -0.6]), trim, 110));
  // 一圈骨白的尖刺（前面最高）
  head.push(...spikeRing(8, 12, (i, c) => 2.2 + Math.max(0, c) * 1.6 + (i % 2) * 0.7, 0.6, () => bone, 111, 0.35));
  // 額前的火眼
  head.push(...browGem(8.6, 1.05, trim[0]!, glow));
  for (const x of [-1, 1]) {
    // 暗紅的巨角：往外、往上、再往後彎；角上幾道發光的裂紋
    const p0: V3 = [x * 4.4, 8, -0.6], p1: V3 = [x * 10.4, 10.6, -0.2], p2: V3 = [x * 7.4, 17.4, -5];
    head.push(...horn(p0, p1, p2, 1.7, hornTones, 9));
    for (const t of [0.25, 0.45, 0.65]) {
      const u = 1 - t;
      const c: V3 = [0, 1, 2].map((j) => u * u * p0[j]! + 2 * u * t * p1[j]! + t * t * p2[j]!) as V3;
      const r = 1.7 * (1 - t) + 0.1;
      head.push(tone(prism(8, c[1] - 0.12, c[1] + 0.12, [r * 1.03, r * 1.03], [r * 1.03, r * 1.03], glow, [c[0], 0, c[2]]), lit, 112));
    }
  }
  return { parts: new Map<Joint, Mesh[]>([['head', fitHead(head)]]), hide: ['head', 'hair'] };
}

const LOOKS: Record<HelmetLook, (s: StyledHelmetSpec) => StyledHelmet> = { fallenKnight, stormCrown, plumed, visor, crypt, circlet, skull, agesCrown, priestCrown, demonCrown };

/** 專屬造型的頭盔 */
export const styledHelmet = (s: StyledHelmetSpec): StyledHelmet => LOOKS[s.look](s);
