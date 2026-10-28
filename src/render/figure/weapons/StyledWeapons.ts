import { tone } from '../Facets';
import { prism, type Mesh, type V3 } from '../Poly3D';
import { chain, darken, edge, gem, GOLD, lighten, taper, type AxeOptions, type StaffOptions, type Tones } from './WeaponParts';

/**
 * 橘 / 紅專用的三種基本款（斧、法杖；劍在 StyledSwords、弓在 WeaponParts.bow）：設計稿 art/gear/{axes,staves}_unique/concept。
 * beast = 獸材（骨節、皮繩與金屬箍、骨刺與爪）、elemental = 精工元素（銀白與金色、發光晶體與凹槽）、
 * demon = 魔王（黑鐵、整排尖刃倒刺、裂縫透光、發光核心）。座標與原本的劍 / 斧 / 杖相同（見 WeaponParts）。
 * badge：代表物件（Emblems）鑲的位置、大小與厚度。
 */
export type WeaponStyle = 'beast' | 'elemental' | 'demon';
export interface Badge {
  at: V3;
  size: number;
  depth: number;
  /** 符號在 Y-Z 平面的旋轉（斧、杖的頭在 -Y，轉半圈讓符號朝頭的方向立起） */
  rot: number;
}

export const glowTones = (c: number): Tones => [lighten(c, 0.45), c, darken(c, 0.25), lighten(c, 0.2)];
/** 套在 Y 軸上的一圈箍 */
export const ring = (y: number, r: number, h: number, c: Tones, seed = 0): Mesh => tone(prism(8, y + h / 2, y - h / 2, [r, r], [r, r], c[0]!), c, seed);
/** Y 軸上一段柄 */
export const rod = (y0: number, y1: number, r0: number, r1: number, c: Tones, seed = 0): Mesh => taper([0, y0, 0], [0, y1, 0], [r0, r0], [r1, r1], c, 6, seed, Math.PI / 6);
/** 符號的厚度倍率：片狀符號半厚 0.22，要比 half 厚一點才兩面都凸出來 */
export const depthFor = (half: number) => (half + 0.14) / 0.22;

// ─────────────────────────── 斧（斧柄沿 -Y，斧刃往 +Z） ───────────────────────────

export type StyledAxeOptions = AxeOptions & { style: WeaponStyle; trim?: Tones; spikes?: Tones; glow?: number };

export function styledAxe(o: StyledAxeOptions): { meshes: Mesh[]; head: V3; edgeTop: V3; edgeBottom: V3; badge: Badge } {
  const y = -o.haft;
  const s = o.size;
  const trim = o.trim ?? GOLD;
  const spikes = o.spikes ?? o.headColors;
  const glow = o.glow ?? 0xfff0c0;
  const meshes: Mesh[] = [];
  if (o.style === 'beast') {
    // 皮繩纏的柄、三根骨刺、柄尾三根爪；斧頭是骨質的鋸齒巨刃＋背後往上彎的角
    meshes.push(rod(3, y - 1.2, 0.66, 0.62, o.haftColors));
    for (const yy of [1.6, -1.2, y * 0.6, y + 2.4]) meshes.push(ring(yy, 0.8, 0.45, trim, 1));
    for (const [yy, sd] of [[y * 0.35, 1], [y * 0.5, -1], [y * 0.7, 1]] as const) meshes.push(taper([0, yy, sd * 0.5], [0, yy - 0.6, sd * 1.9], [0.32, 0.4], [0.03, 0.04], spikes, 4, 2, Math.PI / 4));
    for (const z of [-0.6, 0, 0.6]) meshes.push(...chain([[0, 2.9, z * 0.5], [0, 3.9, z * 1.4], [0, 4.5, z * 1.2 + 0.3]], [0.3, 0.32], [0.04, 0.05], spikes, false));
    meshes.push(taper([0, y + 1.6, 0], [0, y - 1.8, 0], [1.1, 1.2], [1.1, 1.2], trim, 6, 1, Math.PI / 6));
    meshes.push(taper([0, y + 0.4, 0], [0, y + 0.4, s * 0.95], [0.5, s * 0.34], [0.28, s * 0.9], o.headColors, 4, 2, Math.PI / 4));
    meshes.push(edge([0, y + 0.5, s * 0.15], [0, y + 0.5, s * 0.55], [0.7, s * 0.4], [0.7, s * 0.38], o.haftColors));
    for (let i = 0; i < 5; i++) {
      const yy = y + 0.4 + s * (0.75 - i * 0.37);
      const len = s * (0.35 + (i % 2) * 0.2);
      meshes.push(taper([0, yy, s * 0.88], [0, yy - len * 0.35, s * 0.88 + len], [0.45, s * 0.14], [0.04, 0.05], spikes, 4, i, Math.PI / 4));
    }
    meshes.push(...chain([[0, y + 1.7, -0.6], [0, y + s * 0.42, -s * 0.45], [0, y + s * 0.75, -s * 0.4], [0, y + s * 0.95, -s * 0.12]], [0.5, s * 0.14], [0.05, 0.06], spikes, false));
  } else if (o.style === 'elemental') {
    // 深色柄、金色箍與晶體、柄尾晶尖；斧頭是銀色彎月刃＋內側一道發光符文＋背刺與頂刺
    meshes.push(rod(3, y - 1.2, 0.55, 0.52, o.haftColors));
    for (const yy of [2.6, y * 0.45, y * 0.75]) {
      meshes.push(ring(yy, 0.75, 0.6, trim, 1));
      meshes.push(gem(0.5, [0.55, yy, 0], glow, [0.6, 1.2, 0.8], 4, 3), gem(0.5, [-0.55, yy, 0], glow, [0.6, 1.2, 0.8], 4, 3));
    }
    meshes.push(taper([0, 3, 0], [0, 4, 0], [0.7, 0.7], [0.5, 0.5], trim, 6, 2, 0), edge([0, 4, 0], [0, 5.6, 0], [0.45, 0.45], [0.03, 0.03], glowTones(glow)));
    meshes.push(taper([0, y + 1.8, 0], [0, y - 1.8, 0], [0.95, 1.05], [0.95, 1.05], trim, 6, 1, Math.PI / 6));
    const arc: V3[] = [
      [0, y + s * 1.05, s * 0.45],
      [0, y + s * 0.7, s * 0.95],
      [0, y, s * 1.12],
      [0, y - s * 0.7, s * 0.95],
      [0, y - s * 1.05, s * 0.45],
    ];
    meshes.push(...chain(arc, [0.22, 0.45], [0.22, 0.45], o.headColors));
    // 刃身一路展開到彎月刃口（填滿，不留空隙）
    meshes.push(taper([0, y, 0.5], [0, y, s * 1.02], [0.5, s * 0.45], [0.28, s * 1.02], o.headColors, 4, 2, Math.PI / 4));
    meshes.push(...chain(arc.map((p) => [0, y + (p[1] - y) * 0.72, p[2] * 0.78] as V3), [0.55, 0.12], [0.55, 0.12], glowTones(glow)));
    meshes.push(taper([0, y, -0.6], [0, y + 0.6, -s * 0.95], [0.55, 0.6], [0.04, 0.05], trim, 4, 4, Math.PI / 4));
    meshes.push(edge([0, y - 1.6, 0], [0, y - 1.6 - s * 0.6, 0], [0.6, 0.7], [0.03, 0.04], trim));
    for (const sd of [1, -1]) meshes.push(taper([0, y + 0.8, sd * 0.6], [0, y + 2.2, sd * 1.4], [0.3, 0.35], [0.03, 0.03], trim, 4, 5, Math.PI / 4));
  } else {
    // 魔王巨斧：雙刃、上下緣尖刃、刃上裂縫透光、中央核心、頂刺；柄上一圈圈尖刺箍、柄尾發光尖刺
    meshes.push(rod(3, y - 1.2, 0.62, 0.6, o.haftColors));
    for (const yy of [2.2, y * 0.4, y * 0.7]) {
      meshes.push(ring(yy, 0.85, 0.55, trim, 1));
      for (const sd of [1, -1]) meshes.push(taper([0, yy, sd * 0.8], [0, yy - 0.4, sd * 1.6], [0.28, 0.3], [0.03, 0.03], o.spikes ?? trim, 4, 2, Math.PI / 4));
    }
    meshes.push(taper([0, 3, 0], [0, 3.8, 0], [0.8, 0.8], [0.6, 0.6], trim, 6, 2, 0), edge([0, 3.8, 0], [0, 6, 0], [0.55, 0.55], [0.03, 0.03], glowTones(glow)));
    meshes.push(taper([0, y + 1.8, 0], [0, y - 1.8, 0], [1.15, 1.25], [1.15, 1.25], trim, 6, 1, Math.PI / 6));
    for (const sd of [1, -1]) {
      const k = sd > 0 ? 1 : 0.92;
      const arc: V3[] = [
        [0, y + s * 1.1, sd * s * 0.5],
        [0, y + s * 0.75, sd * s * 1.05 * k],
        [0, y, sd * s * 1.15 * k],
        [0, y - s * 0.75, sd * s * 1.05 * k],
        [0, y - s * 1.1, sd * s * 0.5],
      ];
      meshes.push(...chain(arc, [0.3, 0.55], [0.3, 0.55], o.headColors));
      meshes.push(taper([0, y, sd * 0.6], [0, y, sd * s * 1.05 * k], [0.6, s * 0.48], [0.34, s * 1.05], o.headColors, 4, 2, Math.PI / 4));
      meshes.push(...chain(arc.map((p) => [0, y + (p[1] - y) * 0.7, p[2] * 0.72] as V3), [0.7, 0.14], [0.7, 0.14], glowTones(glow)));
      for (const t of [0, 1, 3, 4]) {
        const p = arc[t]!;
        meshes.push(edge(p, [0, p[1] + (t < 2 ? 1 : -1) * s * 0.35, p[2] + sd * s * 0.25], [0.3, 0.45], [0.03, 0.04], spikes));
      }
    }
    meshes.push(edge([0, y - 1.6, 0], [0, y - 1.6 - s * 0.9, 0], [0.7, 0.8], [0.03, 0.04], spikes));
  }
  return { meshes, head: [0, y, s * 0.5], edgeTop: [0, y + s * 0.8, s], edgeBottom: [0, y - s * 0.8, s], badge: { at: [0, y, 0], size: 1.3, depth: depthFor(1.35), rot: Math.PI } };
}

// ─────────────────────────── 法杖（杖頭在 -Y） ───────────────────────────

export type StyledStaffOptions = StaffOptions & { style: WeaponStyle; trim?: Tones; spikes?: Tones };

/** 杖頭的零件都在 y ≤ 1 − length（WeaponLooks 以這裡為中心把杖頭放大 2 倍） */
export function styledStaff(o: StyledStaffOptions): { meshes: Mesh[]; focus: V3; badge: Badge } {
  const end = 1 - o.length;
  const trim = o.trim ?? o.metal;
  const spikes = o.spikes ?? o.metal;
  const glow = o.focus;
  const meshes: Mesh[] = [];
  let focus: V3;
  if (o.style === 'beast') {
    // 歪扭的樹根杖身、皮繩、骨刺；杖頭是長角的頭骨，額頭嵌發光寶石，垂著骨飾
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      pts.push([Math.sin(k * 5) * 0.35, o.butt + (end - o.butt) * k, Math.cos(k * 4) * 0.3 - 0.3]);
    }
    meshes.push(...chain(pts, [0.55, 0.55], [0.68, 0.68], o.shaft, false));
    for (const k of [0.25, 0.5, 0.78]) {
      const p = pts[Math.round(k * 6)]!;
      meshes.push(taper([p[0], p[1] + 0.35, p[2]], [p[0], p[1] - 0.35, p[2]], [0.8, 0.8], [0.8, 0.8], trim, 8, 1, 0));
    }
    for (const [k, sd] of [[0.35, 1], [0.6, -1], [0.85, 1]] as const) {
      const p = pts[Math.round(k * 6)]!;
      meshes.push(taper([p[0], p[1], p[2] + sd * 0.5], [p[0], p[1] - 0.9, p[2] + sd * 1.9], [0.3, 0.36], [0.03, 0.04], spikes, 4, 2, Math.PI / 4));
    }
    meshes.push(taper([0, o.butt, -0.3], [0, o.butt + 1.6, -0.3], [0.5, 0.5], [0.05, 0.05], spikes, 4, 3, Math.PI / 4));
    const hy = end - 1.6;
    meshes.push(gem(1.25, [0, hy, 0], spikes[0]!, [1, 1.05, 1.1], 6, 4), taper([0, hy + 0.4, 0.4], [0, hy + 1, 1.1], [0.55, 0.55], [0.4, 0.3], spikes, 4, 4, 0));
    for (const sd of [1, -1]) meshes.push(...chain([[sd * 0.7, hy - 0.6, -0.2], [sd * 1.5, hy - 1.6, -0.6], [sd * 1.5, hy - 2.8, 0.2], [sd * 1, hy - 3.2, 1]], [0.4, 0.45], [0.05, 0.06], spikes, false));
    meshes.push(gem(0.6, [0, hy - 0.4, 1.05], glow, [1, 1, 0.7], 6, 4));
    for (const [x, z] of [[0.9, 0.3], [-0.9, 0.2]] as const) meshes.push(taper([x, hy + 0.9, z], [x, hy + 2.1, z], [0.06, 0.06], [0.06, 0.06], o.shaft, 4, 5, Math.PI / 4), gem(0.28, [x, hy + 2.3, z], glow, [0.6, 1.4, 0.6], 4, 3));
    focus = [0, hy - 0.4, 1];
  } else if (o.style === 'elemental') {
    // 筆直的金屬杖身、金色箍、皮革握把；杖頭是四支金色托架夾一顆大水晶，周圍浮著小晶片
    meshes.push(rod(o.butt, end + 0.4, 0.48, 0.52, o.shaft));
    meshes.push(taper([0, o.length * -0.2, 0], [0, o.length * -0.45, 0], [0.6, 0.6], [0.6, 0.6], o.metal, 6, 1, Math.PI / 6));
    for (const yy of [o.butt - 0.6, -o.length * 0.2, -o.length * 0.45, end + 1.4]) meshes.push(ring(yy, 0.68, 0.4, trim, 2));
    meshes.push(edge([0, o.butt, 0], [0, o.butt + 1.8, 0], [0.5, 0.5], [0.03, 0.03], glowTones(glow)));
    const hy = end - 2.2;
    meshes.push(taper([0, end + 0.2, 0], [0, end - 0.9, 0], [0.7, 0.7], [1, 1], trim, 6, 3, Math.PI / 6));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = Math.cos(a), cz = Math.sin(a);
      meshes.push(...chain([[cx * 0.6, end - 0.8, cz * 0.6], [cx * 1.6, hy + 0.4, cz * 1.6], [cx * 1.4, hy - 1.4, cz * 1.4], [cx * 0.6, hy - 2.4, cz * 0.6]], [0.28, 0.3], [0.05, 0.06], trim, false));
    }
    meshes.push(edge([0, end - 1, 0], [0, hy, 0], [0.4, 0.4], [1, 1], glowTones(glow)), edge([0, hy, 0], [0, hy - 2.6, 0], [1, 1], [0.04, 0.04], glowTones(glow)));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const c: V3 = [Math.cos(a) * 2.5, hy - 0.4 + (i % 2) * 0.6, Math.sin(a) * 2.5];
      meshes.push(edge([c[0], c[1] + 0.5, c[2]], [c[0], c[1] - 0.5, c[2]], [0.25, 0.25], [0.25, 0.25], glowTones(glow)));
    }
    focus = [0, hy, 0];
  } else {
    // 魔王法杖：黑鐵杖身、一圈圈尖刺箍、裂縫透光；杖頭是魔角與斷刃組成的王冠，中央核心，上方浮著紅晶
    meshes.push(rod(o.butt, end + 0.4, 0.55, 0.6, o.shaft));
    const n = 5;
    for (let i = 0; i < n; i++) {
      const yy = o.butt - 1 + ((end + 1.5 - (o.butt - 1)) * i) / (n - 1);
      meshes.push(ring(yy, 0.75, 0.45, trim, i));
      for (const sd of [1, -1]) meshes.push(taper([0, yy, sd * 0.7], [0, yy - 0.5, sd * 1.5], [0.25, 0.28], [0.03, 0.03], spikes, 4, i, Math.PI / 4));
    }
    const crack: V3[] = [];
    for (let i = 0; i <= 8; i++) crack.push([0.45, o.butt - 0.5 + ((end - o.butt + 0.5) * i) / 8, (i % 2 ? 0.2 : -0.2)]);
    meshes.push(...chain(crack, [0.12, 0.12], [0.12, 0.12], glowTones(glow)), ...chain(crack.map((p) => [-0.45, p[1], -p[2]] as V3), [0.12, 0.12], [0.12, 0.12], glowTones(glow)));
    meshes.push(edge([0, o.butt, 0], [0, o.butt + 2.2, 0], [0.55, 0.55], [0.03, 0.03], spikes));
    const hy = end - 2;
    meshes.push(taper([0, end + 0.2, 0], [0, end - 1.2, 0], [0.75, 0.75], [1.2, 1.2], trim, 6, 3, Math.PI / 6));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      const big = i % 2 === 0;
      meshes.push(...chain([[cx * 0.8, end - 1, cz * 0.8], [cx * (big ? 2.4 : 1.9), hy, cz * (big ? 2.4 : 1.9)], [cx * (big ? 2.2 : 1.6), hy - (big ? 2.6 : 1.8), cz * (big ? 2.2 : 1.6)], [cx * (big ? 1.4 : 1.1), hy - (big ? 3.6 : 2.6), cz * (big ? 1.4 : 1.1)]], [0.4, 0.5], [0.04, 0.05], spikes));
    }
    meshes.push(gem(1.15, [0, hy, 0], glow, [1, 1.35, 1], 6, 4));
    for (const [x, yy, z] of [[0, hy - 2.6, 0], [1.2, hy - 1.8, 0.6], [-1.2, hy - 1.8, -0.6]] as const) meshes.push(edge([x, yy + 0.5, z], [x, yy - 0.5, z], [0.3, 0.3], [0.3, 0.3], glowTones(glow)));
    focus = [0, hy, 0];
  }
  return { meshes, focus, badge: { at: [0, end + 3.2, 0], size: 1.45, depth: depthFor(o.style === 'beast' ? 0.7 : 0.6), rot: Math.PI } };
}
