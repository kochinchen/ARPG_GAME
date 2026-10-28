import type { Mesh, V3 } from '../Poly3D';
import { slab } from './StyledSwords';
import { depthFor, glowTones, ring, rod, type Badge } from './StyledWeapons';
import { chain, darken, edge, gem, lighten, taper, type StaffOptions, type StaffStyle, type Tones } from './WeaponParts';

/**
 * 橘 / 紅法杖的造型：設計稿 art/gear/staves_unique/concept（橘杖四種基本款.png、紅杖六把.png）。
 * 橘四種基本款：crystal 晶核法杖、skull 骸骨巫杖、nature 自然異變杖、tuning 音叉符文杖；
 * 紅六把各一種：void 虛空權杖、throne 冰封王座、priest 墮神血杖、lava 熔岩巨杖、queen 蛛后法杖、sovereign 統御魔杖。
 * 座標同原本的法杖：杖頭在 -Y（末端 y = 1 - length），握點往 +Y 是杖尾。杖頭（y ≤ 末端的零件）之後會在 WeaponLooks 放大。
 * 代表物件鑲在杖頭下方的套環。
 */
export type StyledStaffOptions = StaffOptions & { style: StaffStyle };

interface Ctx {
  o: StyledStaffOptions;
  /** 杖身末端（杖頭從這裡往 -Y） */
  end: number;
  trim: Tones;
  spikes: Tones;
  glow: number;
  meshes: Mesh[];
}

/** 一圈 Y-Z 平面上的環（光環、軌道） */
const loop = (cy: number, r: number, n = 16, skip: number[] = []): V3[][] => {
  const segs: V3[][] = [];
  let cur: V3[] = [];
  for (let i = 0; i <= n; i++) {
    if (skip.includes(i % n)) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
      continue;
    }
    const a = (i / n) * Math.PI * 2;
    cur.push([0, cy + Math.cos(a) * r, Math.sin(a) * r]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
};
/** 繞著杖身的螺旋（藤蔓、蛛絲、緞帶） */
const helix = (y0: number, y1: number, r: number, turns: number, phase = 0, n = 14): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    const a = phase + k * turns * Math.PI * 2;
    return [Math.cos(a) * r, y0 + (y1 - y0) * k, Math.sin(a) * r] as V3;
  });

// ─────────────────────────── 橘：四種基本款 ───────────────────────────

/** A 晶核法杖：筆直的金屬杖身、金色箍；杖頭是四支托架夾一顆大水晶，周圍浮著小晶片 */
function crystal(c: Ctx): V3 {
  const { o, end, trim, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.48, 0.52, o.shaft));
  c.meshes.push(taper([0, o.length * -0.2, 0], [0, o.length * -0.45, 0], [0.6, 0.6], [0.6, 0.6], o.metal, 6, 1, Math.PI / 6));
  for (const yy of [o.butt - 0.6, -o.length * 0.2, -o.length * 0.45, end + 1.4]) c.meshes.push(ring(yy, 0.68, 0.4, trim, 2));
  c.meshes.push(edge([0, o.butt, 0], [0, o.butt + 1.8, 0], [0.5, 0.5], [0.03, 0.03], glowTones(glow)));
  const hy = end - 2.2;
  c.meshes.push(taper([0, end + 0.2, 0], [0, end - 0.9, 0], [0.7, 0.7], [1, 1], trim, 6, 3, Math.PI / 6));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a), cz = Math.sin(a);
    c.meshes.push(...chain([[cx * 0.6, end - 0.8, cz * 0.6], [cx * 1.6, hy + 0.4, cz * 1.6], [cx * 1.4, hy - 1.4, cz * 1.4], [cx * 0.6, hy - 2.4, cz * 0.6]], [0.28, 0.3], [0.05, 0.06], trim, false));
  }
  c.meshes.push(edge([0, end - 1, 0], [0, hy, 0], [0.4, 0.4], [1, 1], glowTones(glow)), edge([0, hy, 0], [0, hy - 2.6, 0], [1, 1], [0.04, 0.04], glowTones(glow)));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p: V3 = [Math.cos(a) * 2.5, hy - 0.4 + (i % 2) * 0.6, Math.sin(a) * 2.5];
    c.meshes.push(edge([p[0], p[1] + 0.5, p[2]], [p[0], p[1] - 0.5, p[2]], [0.25, 0.25], [0.25, 0.25], glowTones(glow)));
  }
  return [0, hy, 0];
}

/** B 骸骨巫杖：歪扭的骨節杖身、皮繩、骨刺；杖頭是長角的頭骨，額頭嵌發光寶石，垂著骨飾 */
function skull(c: Ctx): V3 {
  const { o, end, trim, spikes, glow } = c;
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    pts.push([Math.sin(k * 5) * 0.35, o.butt + (end - o.butt) * k, Math.cos(k * 4) * 0.3 - 0.3]);
  }
  c.meshes.push(...chain(pts, [0.55, 0.55], [0.68, 0.68], o.shaft, false));
  for (const k of [0.25, 0.5, 0.78]) {
    const p = pts[Math.round(k * 6)]!;
    c.meshes.push(taper([p[0], p[1] + 0.35, p[2]], [p[0], p[1] - 0.35, p[2]], [0.8, 0.8], [0.8, 0.8], trim, 8, 1, 0));
  }
  for (const [k, sd] of [[0.35, 1], [0.6, -1], [0.85, 1]] as const) {
    const p = pts[Math.round(k * 6)]!;
    c.meshes.push(taper([p[0], p[1], p[2] + sd * 0.5], [p[0], p[1] - 0.9, p[2] + sd * 1.9], [0.3, 0.36], [0.03, 0.04], spikes, 4, 2, Math.PI / 4));
  }
  c.meshes.push(taper([0, o.butt, -0.3], [0, o.butt + 1.6, -0.3], [0.5, 0.5], [0.05, 0.05], spikes, 4, 3, Math.PI / 4));
  const hy = end - 1.6;
  c.meshes.push(gem(1.25, [0, hy, 0], spikes[0]!, [1, 1.05, 1.1], 6, 4), taper([0, hy + 0.4, 0.4], [0, hy + 1, 1.1], [0.55, 0.55], [0.4, 0.3], spikes, 4, 4, 0));
  for (const sd of [1, -1]) c.meshes.push(...chain([[sd * 0.7, hy - 0.6, -0.2], [sd * 1.5, hy - 1.6, -0.6], [sd * 1.5, hy - 2.8, 0.2], [sd * 1, hy - 3.2, 1]], [0.4, 0.45], [0.05, 0.06], spikes, false));
  c.meshes.push(gem(0.6, [0, hy - 0.4, 1.05], glow, [1, 1, 0.7], 6, 4));
  for (const [x, z] of [[0.9, 0.3], [-0.9, 0.2]] as const) c.meshes.push(taper([x, hy + 0.9, z], [x, hy + 2.1, z], [0.06, 0.06], [0.06, 0.06], o.shaft, 4, 5, Math.PI / 4), gem(0.28, [x, hy + 2.3, z], glow, [0.6, 1.4, 0.6], 4, 3));
  return [0, hy - 0.4, 1];
}

/** C 自然異變杖：兩股樹根絞成的杖身、長著葉子；杖頭是往上捲的根，中間綻開一朵發光的花 */
function nature(c: Ctx): V3 {
  const { o, end, trim, spikes, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.2, 0.32, 0.36, o.shaft));
  for (const ph of [0, Math.PI]) c.meshes.push(...chain(helix(o.butt, end + 0.4, 0.38, 3.5, ph), [0.3, 0.3], [0.36, 0.36], o.shaft, false));
  for (let i = 0; i < 6; i++) {
    const y = o.butt - 2 + ((end + 3 - o.butt + 2) * i) / 5;
    const a = i * 2.2;
    c.meshes.push(taper([Math.cos(a) * 0.4, y, Math.sin(a) * 0.4], [Math.cos(a) * 1.3, y - 0.6, Math.sin(a) * 1.3], [0.08, 0.35], [0.03, 0.05], trim, 4, i, 0));
  }
  c.meshes.push(...chain([[0, o.butt, 0], [0.4, o.butt + 1.2, 0.3], [0, o.butt + 1.9, 0.6]], [0.4, 0.4], [0.06, 0.06], o.shaft, false));
  const hy = end - 1.8;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const cx = Math.cos(a), cz = Math.sin(a);
    c.meshes.push(...chain([[cx * 0.4, end, cz * 0.4], [cx * 1.6, end - 1, cz * 1.6], [cx * 1.7, end - 2.6, cz * 1.7], [cx * 0.9, end - 3.6, cz * 0.9], [cx * 0.3, end - 3.3, cz * 0.3]], [0.36, 0.36], [0.1, 0.1], o.shaft, false));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const up = i % 2 ? 1.2 : 1.8;
    c.meshes.push(taper([Math.cos(a) * 0.4, hy, Math.sin(a) * 0.4], [Math.cos(a) * 1.3, hy - up, Math.sin(a) * 1.3], [0.32, 0.5], [0.04, 0.06], glowTones(glow), 4, i, 0));
  }
  c.meshes.push(gem(0.65, [0, hy - 0.3, 0], lighten(glow, 0.3), [1, 1.2, 1], 6, 4));
  for (const [y, a] of [[end - 1, 0.5], [end - 2.6, 2.6], [end - 3, 4.4]] as const) c.meshes.push(taper([Math.cos(a) * 1.5, y, Math.sin(a) * 1.5], [Math.cos(a) * 2.5, y - 0.3, Math.sin(a) * 2.5], [0.06, 0.4], [0.03, 0.06], spikes, 4, 3, 0));
  return [0, hy, 0];
}

/** D 音叉符文杖：筆直的符文杖身刻著發光溝紋；杖頭一根橫樑撐起三支平行的叉（中間最長），叉間有能量光 */
function tuning(c: Ctx): V3 {
  const { o, end, trim, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.46, 0.5, o.shaft));
  for (const yy of [o.butt - 0.8, -o.length * 0.3, -o.length * 0.6, end + 1.2]) c.meshes.push(ring(yy, 0.66, 0.5, trim, 1));
  for (const sd of [1, -1]) for (let i = 0; i < 6; i++) {
    const y = -o.length * 0.12 - i * o.length * 0.11;
    c.meshes.push(slab([sd * 0.46, y, 0], [sd * 0.46, y - o.length * 0.06, 0], 0.08, 0.16, glowTones(glow)));
  }
  c.meshes.push(edge([0, o.butt, 0], [0, o.butt + 1.8, 0], [0.55, 0.55], [0.04, 0.04], glowTones(glow)));
  c.meshes.push(taper([0, end + 0.3, 0], [0, end - 0.5, 0], [0.62, 0.62], [0.85, 0.85], trim, 6, 2, Math.PI / 6));
  c.meshes.push(slab([0, end - 0.75, -1.5], [0, end - 0.75, 1.5], 0.42, 0.32, trim));
  for (const [z, h] of [[-1.3, 3], [0, 4], [1.3, 3]] as const) {
    c.meshes.push(edge([0, end - 0.8, z], [0, end - 0.8 - h, z * 1.05], [0.34, 0.36], [0.24, 0.26], trim));
    c.meshes.push(edge([0, end - 0.8 - h, z * 1.05], [0, end - 1.6 - h, z * 1.05], [0.24, 0.26], [0.03, 0.04], trim));
  }
  c.meshes.push(edge([0, end - 1.2, 0], [0, end - 3.2, 0], [0.5, 0.5], [0.05, 0.05], glowTones(glow)));
  for (const z of [-0.65, 0.65]) c.meshes.push(edge([0, end - 1.2, z], [0, end - 3.4, z], [0.14, 0.2], [0.14, 0.08], glowTones(lighten(glow, 0.3))));
  return [0, end - 2.4, 0];
}

// ─────────────────────────── 紅：六把專屬 ───────────────────────────

/** 虛空權杖：紫黑杖身纏著發光緞帶；杖頭是一個虛空漩渦，三顆元素寶珠（火 / 冰 / 雷）在金色軌道上環繞，周圍飄著碎晶 */
function voidScepter(c: Ctx): V3 {
  const { o, end, trim, spikes, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.5, 0.55, o.shaft));
  c.meshes.push(...chain(helix(o.butt - 1, end + 1, 0.6, 3), [0.22, 0.3], [0.22, 0.3], glowTones(glow)));
  for (const yy of [o.butt - 0.6, -o.length * 0.4, end + 1.4]) c.meshes.push(ring(yy, 0.75, 0.5, trim, 1));
  c.meshes.push(edge([0, o.butt, 0], [0, o.butt + 2.2, 0], [0.6, 0.6], [0.04, 0.04], spikes));
  const hy = end - 2.6;
  c.meshes.push(taper([0, end + 0.2, 0], [0, end - 0.9, 0], [0.75, 0.75], [1.05, 1.05], trim, 6, 3, Math.PI / 6));
  c.meshes.push(gem(1.6, [0, hy, 0], 0x140a20, [0.6, 1, 1], 10, 5));
  for (const seg of loop(hy, 1.65, 16)) c.meshes.push(...chain(seg, [0.7, 0.3], [0.7, 0.3], glowTones(glow)));
  for (const seg of loop(hy, 2.6, 18)) c.meshes.push(...chain(seg.map(([x, y, z]) => [x + z * 0.35, y, z] as V3), [0.12, 0.12], [0.12, 0.12], trim));
  for (const [a, col] of [[0.4, 0xff5a2a], [2.5, 0x4ab0ff], [4.6, 0xffe04a]] as const) c.meshes.push(gem(0.6, [Math.sin(a) * 2.6 * 0.35, hy + Math.cos(a) * 2.6, Math.sin(a) * 2.6], col, [1, 1, 1], 6, 4));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const p: V3 = [Math.cos(a) * 0.6, hy + Math.cos(a) * 2.2, Math.sin(a) * 2.2];
    c.meshes.push(edge([p[0], p[1], p[2]], [p[0], p[1] + Math.cos(a) * 1.2, p[2] + Math.sin(a) * 1.2], [0.3, 0.32], [0.03, 0.03], spikes));
  }
  return [0, hy, 0];
}

/** 冰封王座：銀白杖身垂著冰柱；杖頭是一座小冰王座：底座、背後一排高低錯落的冰晶尖塔、正面金色小王冠 */
function throne(c: Ctx): V3 {
  const { o, end, trim, spikes, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.45, 0.5, o.shaft));
  for (const yy of [o.butt - 0.6, -o.length * 0.3, -o.length * 0.6, end + 1.4]) c.meshes.push(ring(yy, 0.68, 0.45, trim, 1));
  for (const yy of [-o.length * 0.3, -o.length * 0.6]) for (const sd of [1, -1]) c.meshes.push(edge([0, yy + 0.3, sd * 0.68], [0, yy + 1.6, sd * 0.75], [0.18, 0.2], [0.02, 0.02], glowTones(glow)));
  c.meshes.push(edge([0, o.butt, 0], [0, o.butt + 2.2, 0], [0.7, 0.7], [0.04, 0.04], glowTones(glow)));
  c.meshes.push(taper([0, end + 0.2, 0], [0, end - 0.6, 0], [0.65, 0.65], [1, 1], trim, 6, 2, Math.PI / 6));
  c.meshes.push(slab([0, end - 0.6, 0], [0, end - 1.2, 0], 1.3, 2, trim, 1.4, 2.3));
  for (const [z, h] of [[-2, 2.4], [-1.25, 3.4], [-0.5, 4.4], [0.5, 4.4], [1.25, 3.4], [2, 2.4], [0, 5.2]] as const) c.meshes.push(edge([-0.5, end - 1.2, z], [-0.5, end - 1.2 - h, z * 1.1], [0.42, 0.42], [0.04, 0.04], glowTones(glow)));
  for (let i = 0; i < 5; i++) c.meshes.push(edge([0.9, end - 1.3, -1.2 + i * 0.6], [0.9, end - 2.2 - (i % 2) * 0.5, -1.2 + i * 0.6], [0.22, 0.22], [0.03, 0.03], trim));
  c.meshes.push(slab([0.9, end - 1.2, -1.4], [0.9, end - 1.2, 1.4], 0.2, 0.2, trim));
  for (const z of [-2.2, -1.4, 1.4, 2.2]) c.meshes.push(edge([0, end - 0.7, z], [0, end + 0.8, z], [0.2, 0.22], [0.02, 0.02], glowTones(lighten(glow, 0.2))));
  c.meshes.push(gem(0.75, [0.4, end - 2.6, 0], lighten(glow, 0.3), [1, 1.5, 1], 6, 4));
  void spikes;
  return [0, end - 2.6, 0];
}

/** 墮神血杖：白金杖身裂開滲出血光、纏著血紅鎖鏈與布條；杖頭是殘缺的聖徽光環（斷了一角），中央血紅寶石 */
function priest(c: Ctx): V3 {
  const { o, end, trim, spikes, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.5, 0.55, o.shaft));
  const crack: V3[] = [];
  for (let i = 0; i <= 9; i++) crack.push([0.5, o.butt - 1 + ((end + 1 - o.butt + 1) * i) / 9, i % 2 ? 0.18 : -0.18]);
  c.meshes.push(...chain(crack, [0.12, 0.14], [0.12, 0.14], glowTones(glow)), ...chain(crack.map(([, y, z]) => [-0.5, y, -z] as V3), [0.12, 0.14], [0.12, 0.14], glowTones(glow)));
  c.meshes.push(...chain(helix(-o.length * 0.25, end + 2, 0.62, 2.5), [0.16, 0.16], [0.16, 0.16], spikes));
  for (const sd of [1, -1]) c.meshes.push(slab([0, end + 1.6, sd * 0.9], [0, end + 5.5, sd * 1.1], 0.06, 0.4, spikes, 0.06, 0.25));
  c.meshes.push(edge([0, o.butt, 0], [0, o.butt + 2, 0], [0.6, 0.6], [0.04, 0.04], trim));
  const hy = end - 2.3;
  c.meshes.push(taper([0, end + 0.2, 0], [0, end - 0.8, 0], [0.7, 0.7], [1, 1], trim, 6, 2, Math.PI / 6));
  for (const seg of loop(hy, 1.8, 16, [3, 4])) c.meshes.push(...chain(seg, [0.4, 0.38], [0.4, 0.38], trim));
  for (let i = 0; i < 8; i++) {
    if (i === 1) continue;
    const a = (i / 8) * Math.PI * 2;
    c.meshes.push(edge([0, hy + Math.cos(a) * 1.9, Math.sin(a) * 1.9], [0, hy + Math.cos(a) * (i % 2 ? 2.7 : 3.3), Math.sin(a) * (i % 2 ? 2.7 : 3.3)], [0.34, 0.4], [0.03, 0.04], trim));
  }
  c.meshes.push(gem(0.85, [0, hy, 0], glow, [1, 1.4, 1], 6, 4));
  for (const [y, z] of [[hy - 2.4, 1.6], [hy - 1, -2.6], [hy + 0.8, 2.6]] as const) c.meshes.push(gem(0.3, [0, y, z], glow, [0.8, 1.6, 0.8], 4, 3));
  return [0, hy, 0];
}

/** 熔岩巨杖：粗大的岩石杖身裂著岩漿、纏金箍；杖頭是幾塊岩爪托著一顆熔核；杖尾也是一團熔岩 */
function lavaStaff(c: Ctx): V3 {
  const { o, end, trim, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.75, 0.85, o.shaft));
  c.meshes.push(...chain(helix(o.butt - 0.5, end + 0.5, 0.78, 1.5), [0.18, 0.2], [0.18, 0.2], glowTones(glow)));
  for (const yy of [-o.length * 0.3, -o.length * 0.55]) c.meshes.push(...chain(helix(yy, yy - 1.4, 0.92, 1, 0, 8), [0.18, 0.32], [0.18, 0.32], trim));
  c.meshes.push(gem(1.4, [0, o.butt + 0.4, 0], o.shaft[1]!, [1, 1.1, 1], 5, 3), gem(0.6, [0, o.butt + 0.6, 0], glow, [2.4, 1, 2.4], 6, 4));
  const hy = end - 2.2;
  c.meshes.push(gem(1.5, [0, hy, 0], glow, [1, 1.1, 1], 8, 5));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p: V3 = [Math.cos(a) * 1.5, hy + 0.4 - (i % 2) * 1.2, Math.sin(a) * 1.5];
    c.meshes.push(gem(0.9, p, o.shaft[i % 3]!, [1, 1.4, 1], 5, 3));
    c.meshes.push(edge(p, [p[0] * 1.15, p[1] - 1.8, p[2] * 1.15], [0.45, 0.45], [0.05, 0.05], o.shaft));
  }
  c.meshes.push(edge([0, hy - 1.2, 0], [0, hy - 3, 0], [0.55, 0.55], [0.04, 0.04], o.shaft));
  return [0, hy, 0];
}

/** 蛛后法杖：紫黑杖身纏著發光蛛絲、掛著綠晶；杖頭是一顆大卵囊，四支蜘蛛腳從下往上把它抱住，頂端綠眼 */
function queenStaff(c: Ctx): V3 {
  const { o, end, trim, spikes, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.45, 0.5, o.shaft));
  for (const ph of [0, 2.1, 4.2]) c.meshes.push(...chain(helix(-o.length * 0.15, end + 0.5, 0.7, 1.4, ph, 10), [0.06, 0.06], [0.06, 0.06], [0xf0f0f4, 0xd8d8e0, 0xb0b0bc, 0xe4e4ec]));
  for (const [y, z] of [[-o.length * 0.4, 0.9], [-o.length * 0.6, -0.9]] as const) c.meshes.push(edge([0, y, z], [0, y + 1.3, z], [0.3, 0.3], [0.03, 0.03], glowTones(glow)));
  c.meshes.push(edge([0, o.butt, 0], [0, o.butt + 2, 0], [0.55, 0.55], [0.04, 0.04], spikes));
  const hy = end - 2.4;
  c.meshes.push(gem(1.35, [0, hy, 0], o.metal[0]!, [1, 1.35, 1], 8, 5));
  for (const [x, y, z] of [[1.1, hy - 0.4, 0.6], [-1.1, hy + 0.3, 0.4], [0.9, hy + 0.6, -0.7], [-0.8, hy - 0.8, -0.8]] as const) c.meshes.push(gem(0.32, [x, y, z], glow, [1, 1, 1], 6, 4));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a), cz = Math.sin(a);
    c.meshes.push(...chain([[cx * 0.5, end - 0.2, cz * 0.5], [cx * 2, end - 1.2, cz * 2], [cx * 2.1, end - 3.2, cz * 2.1], [cx * 0.8, end - 4.6, cz * 0.8]], [0.3, 0.36], [0.04, 0.05], spikes, false));
  }
  c.meshes.push(gem(0.45, [0, end - 4.4, 0], glow, [1, 1.4, 1], 6, 4));
  void trim;
  return [0, hy, 0];
}

/** 統御魔杖：斷掉的巨劍劍柄做成的杖：杖身是纏帶的劍柄、垂著鎖鏈與紅布；杖頭是寬護手上的一截斷刃，裂口透出熾烈魔光 */
function sovereignStaff(c: Ctx): V3 {
  const { o, end, trim, spikes, glow } = c;
  c.meshes.push(rod(o.butt, end + 0.4, 0.5, 0.56, o.shaft));
  for (let i = 0; i < 8; i++) c.meshes.push(ring(o.butt - 1 - i * ((o.butt - 1 - end - 2) / 7), 0.62, 0.3, trim, i));
  c.meshes.push(taper([0, o.butt, 0], [0, o.butt + 1, 0], [0.8, 0.8], [0.9, 0.9], trim, 6, 1, Math.PI / 6), gem(0.55, [0, o.butt + 1.3, 0], glow, [1.1, 1.3, 1.1], 6, 4));
  for (const sd of [1, -1]) {
    const hang: V3[] = [[0, end + 0.2, sd * 1.9], [0, end + 2, sd * 1.7], [0, end + 3.8, sd * 1.4], [0, end + 5.2, sd * 1.2]];
    for (let j = 0; j < hang.length - 1; j++) c.meshes.push(taper(hang[j]!, hang[j + 1]!, [0.12, 0.12], [0.12, 0.12], trim, 6, j, Math.PI / 6));
    c.meshes.push(slab([0, end + 0.4, sd * 1.2], [0, end + 4.2, sd * 1.35], 0.06, 0.32, spikes, 0.06, 0.2));
  }
  c.meshes.push(slab([0, end - 0.4, -2.2], [0, end - 0.4, 2.2], 0.55, 0.5, trim));
  for (const sd of [1, -1]) c.meshes.push(edge([0, end - 0.4, sd * 2.2], [0, end - 1.6, sd * 2.8], [0.45, 0.5], [0.03, 0.04], trim), edge([0, end - 0.2, sd * 1.4], [0, end + 0.9, sd * 1.9], [0.3, 0.35], [0.03, 0.03], trim));
  c.meshes.push(gem(0.6, [0, end - 0.4, 0], glow, [1.4, 1.2, 1.2], 6, 4));
  const blade: Tones = [lighten(o.metal[0]!, 0.2), o.metal[0]!, darken(o.metal[0]!, 0.3), o.metal[1] ?? o.metal[0]!];
  c.meshes.push(edge([0, end - 0.8, 0], [0, end - 3.2, 0.2], [0.35, 1], [0.32, 0.85], blade));
  c.meshes.push(edge([0, end - 3.2, 0.2], [0, end - 4.4, -0.3], [0.32, 0.5], [0.03, 0.05], blade), edge([0, end - 3.2, 0.2], [0, end - 3.9, 0.85], [0.3, 0.35], [0.03, 0.04], blade));
  c.meshes.push(...chain([[0, end - 1, 0], [0, end - 2, 0.25], [0, end - 3, -0.1], [0, end - 3.8, 0.1]], [0.42, 0.2], [0.42, 0.1], glowTones(glow)));
  for (const [y, z] of [[end - 4.8, 0.6], [end - 5.4, -0.4], [end - 4.2, -1.2]] as const) c.meshes.push(gem(0.28, [0, y, z], glow, [0.8, 1.6, 0.8], 4, 3));
  return [0, end - 2.4, 0];
}

const BUILDERS: Record<StaffStyle, (c: Ctx) => V3> = { crystal, skull, nature, tuning, void: voidScepter, throne, priest, lava: lavaStaff, queen: queenStaff, sovereign: sovereignStaff };

export function styledStaff(o: StyledStaffOptions): { meshes: Mesh[]; focus: V3; badge: Badge } {
  const c: Ctx = { o, end: 1 - o.length, trim: o.trim ?? o.metal, spikes: o.spikes ?? o.metal, glow: o.focus, meshes: [] };
  const focus = BUILDERS[o.style](c);
  const half = o.style === 'lava' ? 0.95 : o.style === 'skull' ? 0.7 : 0.62;
  return { meshes: c.meshes, focus, badge: { at: [0, c.end + 3.2, 0], size: 1.45, depth: depthFor(half), rot: Math.PI } };
}
