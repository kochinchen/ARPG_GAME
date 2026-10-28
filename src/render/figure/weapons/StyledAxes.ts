import { tone } from '../Facets';
import { orient, type Mesh, type V3 } from '../Poly3D';
import { slab } from './StyledSwords';
import { depthFor, glowTones, ring, rod, type Badge } from './StyledWeapons';
import { chain, darken, edge, gem, GOLD, lighten, taper, type AxeOptions, type AxeStyle, type Tones } from './WeaponParts';

/**
 * 橘 / 紅斧的造型：設計稿 art/gear/axes_unique/concept（橘斧四種基本款.png、紅斧六把.png）。
 * 橘四種基本款：moon 月刃戰斧、cleaver 重型劈斧、carapace 甲殼獸斧、rock 岩石巨斧；
 * 紅六把各一種：jaw 獸神之齒、doom 末日審判、warden 亡衛戰斧、lava 熔岩巨斧、queen 蛛后戰斧、sovereign 統御者巨斧。
 * 座標同原本的斧：斧柄沿 -Y，斧頭在 y = -haft，斧刃往 +Z（背面 -Z），X 是厚度。代表物件鑲在斧頭套筒上。
 */
export type StyledAxeOptions = AxeOptions & { style: AxeStyle };

interface Ctx {
  o: StyledAxeOptions;
  /** 斧頭中心的 y */
  Y: number;
  s: number;
  trim: Tones;
  spikes: Tones;
  glow: number;
  meshes: Mesh[];
}

/** 斧頭平面上的一段弧：a = 0 朝 +Z，a > 0 往斧頭尖端（-Y） */
const arc = (cy: number, cz: number, ry: number, rz: number, a0: number, a1: number, n: number): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [0, cy - Math.sin(a) * ry, cz + Math.cos(a) * rz] as V3;
  });
/** 一片實心的刃：Y-Z 平面上的輪廓擠出成板，刃緣薄（半厚 tEdge）、中央隆起（半厚 tMid） */
export function plate(outline: readonly [number, number][], tEdge: number, tMid: number, colors: Tones, seed = 0): Mesh {
  const n = outline.length;
  const cy = outline.reduce((a, p) => a + p[0], 0) / n, cz = outline.reduce((a, p) => a + p[1], 0) / n;
  const verts: V3[] = [...outline.map(([y, z]) => [tEdge, y, z] as V3), ...outline.map(([y, z]) => [-tEdge, y, z] as V3), [tMid, cy, cz], [-tMid, cy, cz]];
  const faces: Mesh['faces'] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({ idx: [2 * n, i, j], color: colors[0]! }, { idx: [2 * n + 1, n + j, n + i], color: colors[0]! }, { idx: [i, n + i, n + j, j], color: colors[2] ?? colors[0]! });
  }
  return tone(orient({ verts, faces }), colors, seed);
}
/** 從中心 C 到一串弧上的點圍成的實心刃身 */
function fan(c: Ctx, C: V3, pts: V3[], t: number, w0: number, colors: Tones): void {
  const outline: [number, number][] = [[C[1] + w0, C[2]], ...pts.map((p) => [p[1], p[2]] as [number, number]), [C[1] - w0, C[2]]];
  if (pts[0]![1] < pts[pts.length - 1]![1]) outline.reverse();
  c.meshes.push(plate(outline, t * 0.45, t * 1.2, colors));
}
/** 斧柄與幾圈箍 */
function haft(c: Ctx, r: number, rings: number[]): void {
  c.meshes.push(rod(3, c.Y - 1.2, r, r * 0.95, c.o.haftColors));
  rings.forEach((y, i) => c.meshes.push(ring(y, r + 0.18, 0.45, c.trim, i + 1)));
}
/** 柄尾：一截尖錐＋發光寶石 */
function butt(c: Ctx, len = 2, colors = c.trim): void {
  c.meshes.push(taper([0, 3, 0], [0, 3.6, 0], [0.75, 0.75], [0.9, 0.9], colors, 6, 1, Math.PI / 6), edge([0, 3.6, 0], [0, 3.6 + len, 0], [0.7, 0.7], [0.04, 0.04], colors));
  c.meshes.push(gem(0.5, [0, 4.1, 0], c.glow, [1.6, 1.1, 1.6], 6, 4));
}
const socket = (c: Ctx, r: number, h = 1.7) => c.meshes.push(taper([0, c.Y + h, 0], [0, c.Y - h, 0], [r, r * 1.08], [r, r * 1.08], c.trim, 6, 1, Math.PI / 6));
const badge = (c: Ctx, size = 1.3, half = 1.35): Badge => ({ at: [0, c.Y, 0], size, depth: depthFor(half), rot: Math.PI });

// ─────────────────────────── 橘：四種基本款 ───────────────────────────

/** A 月刃戰斧：細長斧柄，薄而彎的新月刃（外緣一道元素光），斧背一上一下兩支小鉤、頂端尖刺 */
function moon(c: Ctx): void {
  const { Y, s, trim, glow } = c;
  haft(c, 0.5, [1.6, Y * 0.35, Y * 0.68]);
  for (const y of [Y * 0.35, Y * 0.68]) for (const sd of [1, -1]) c.meshes.push(taper([0, y, sd * 0.6], [0, y - 0.5, sd * 1.4], [0.24, 0.28], [0.03, 0.03], trim, 4, 0, Math.PI / 4));
  socket(c, 0.9);
  const outer = arc(Y, s * 0.12, s * 1.05, s * 0.88, -1.2, 1.2, 10);
  const mid = 5;
  // 新月：中段最寬、兩端收尖
  c.meshes.push(...chain(outer.slice(0, mid + 1), [0.24, 0.06], [0.3, s * 0.2], c.o.headColors), ...chain(outer.slice(mid), [0.3, s * 0.2], [0.24, 0.06], c.o.headColors));
  c.meshes.push(edge([0, Y, 0.6], [0, Y, s * 0.82], [0.42, s * 0.24], [0.32, s * 0.16], c.o.headColors));
  const rim = arc(Y, s * 0.12, s * 1.11, s * 0.95, -1.1, 1.1, 10);
  c.meshes.push(...chain(rim, [0.34, s * 0.05], [0.34, s * 0.05], glowTones(glow)));
  c.meshes.push(...chain(arc(Y, s * 0.12, s * 0.9, s * 0.72, -1.05, 1.05, 10), [0.36, s * 0.035], [0.36, s * 0.035], trim));
  c.meshes.push(...chain([[0, Y - 0.6, -0.6], [0, Y - s * 0.25, -s * 0.45], [0, Y - s * 0.5, -s * 0.32]], [0.4, 0.5], [0.04, 0.05], trim, false));
  c.meshes.push(...chain([[0, Y + 0.6, -0.6], [0, Y + s * 0.2, -s * 0.38], [0, Y + s * 0.38, -s * 0.26]], [0.35, 0.42], [0.04, 0.05], trim, false));
  c.meshes.push(edge([0, Y - 1.7, 0], [0, Y - 1.7 - s * 0.45, 0], [0.5, 0.55], [0.03, 0.04], trim));
  butt(c);
}

/** B 重型劈斧：粗柄、很多道箍；寬大方正的劈刀刃（內側深色鋼板＋鉚釘、刃口亮鋼、刃後一道光），斧背方錘頭，頂端圓錐 */
function cleaver(c: Ctx): void {
  const { Y, s, trim, glow } = c;
  haft(c, 0.75, [1.8, -0.6, Y * 0.3, Y * 0.5, Y * 0.7, Y + 2.4]);
  c.meshes.push(slab([0, Y + s * 0.45, 0], [0, Y - s * 0.45, 0], 1, 1.1, trim));
  c.meshes.push(slab([0, Y, 0.9], [0, Y, s], 0.42, s * 0.34, c.o.headColors, 0.32, s * 0.5));
  c.meshes.push(slab([0, Y, 0.9], [0, Y, s * 0.5], 0.52, s * 0.36, c.spikes, 0.5, s * 0.42, 1));
  for (const sd of [1, -1]) c.meshes.push(slab([0, Y + sd * s * 0.38, 0.9], [0, Y + sd * s * 0.42, s * 0.5], 0.58, 0.22, trim));
  for (const [dy, dz] of [[-0.25, 0.22], [0.25, 0.22], [-0.25, 0.42], [0.25, 0.42]] as const) for (const x of [0.58, -0.58]) c.meshes.push(gem(0.32, [x, Y + dy * s, dz * s], trim[0]!, [0.6, 1, 1], 4, 3));
  c.meshes.push(slab([0, Y - s * 0.5, s * 0.99], [0, Y + s * 0.5, s * 0.99], 0.24, 0.26, [lighten(c.o.headColors[0]!, 0.35), c.o.headColors[0]!, c.o.headColors[1]!, c.o.headColors[0]!]));
  c.meshes.push(slab([0, Y - s * 0.42, s * 0.8], [0, Y + s * 0.42, s * 0.8], 0.4, 0.16, glowTones(glow)));
  c.meshes.push(slab([0, Y, -0.9], [0, Y, -s * 0.38], 0.95, 0.95, trim, 1.05, 1.05, 2), taper([0, Y, -s * 0.38], [0, Y, -s * 0.55], [1.45, 1.45], [0.35, 0.35], trim, 4, 3, Math.PI / 4));
  c.meshes.push(taper([0, Y - s * 0.45, 0], [0, Y - s * 0.45 - 1.6, 0], [0.75, 0.75], [0.1, 0.1], trim, 6, 4, Math.PI / 6));
  butt(c, 1.6);
}

/** C 甲殼獸斧：皮繩柄上長著發光囊泡；斧頭是層層疊起的甲殼板，每片尖端是角質刺，背面兩支往上彎的角 */
function carapace(c: Ctx): void {
  const { Y, s, glow, spikes } = c;
  haft(c, 0.6, [1.6, Y * 0.3, Y * 0.62, Y + 2.4]);
  for (const [y, z] of [[Y * 0.22, 0.55], [Y * 0.45, -0.55], [Y * 0.72, 0.55]] as const) c.meshes.push(gem(0.55, [0, y, z], glow, [1.3, 1.2, 1], 6, 4));
  for (const [y, sd] of [[Y * 0.35, 1], [Y * 0.58, -1], [Y * 0.85, 1]] as const) c.meshes.push(taper([0, y, sd * 0.5], [0, y - 0.7, sd * 1.8], [0.3, 0.36], [0.03, 0.04], spikes, 4, 2, Math.PI / 4));
  socket(c, 1);
  // 兩層甲殼：外層淺、內層深，每片往外放射
  for (const [scale, colors, t] of [[1, c.o.headColors, 0.5], [0.68, [darken(c.o.headColors[0]!, 0.3), darken(c.o.headColors[1]!, 0.3), darken(c.o.headColors[2]!, 0.3), darken(c.o.headColors[3] ?? c.o.headColors[1]!, 0.3)] as Tones, 0.62]] as const) {
    for (let i = 0; i < 5; i++) {
      const a = -0.95 + i * 0.475;
      const len = s * scale * (0.98 - Math.abs(a) * 0.18);
      const p: V3 = [0, Y - Math.sin(a) * len, Math.cos(a) * len];
      c.meshes.push(edge([0, Y, 0.5], p, [t, s * 0.18 * scale], [t * 0.55, s * 0.16 * scale], colors));
      if (scale === 1) c.meshes.push(...chain([p, [0, p[1] - Math.sin(a + 0.5) * s * 0.18, p[2] + Math.cos(a + 0.5) * s * 0.18], [0, p[1] - Math.sin(a + 1.1) * s * 0.3, p[2] + Math.cos(a + 1.1) * s * 0.26]], [0.35, 0.42], [0.03, 0.04], spikes, false));
    }
  }
  for (const k of [0.35, 0.65]) c.meshes.push(gem(0.6, [0, Y - (k - 0.5) * s, s * 0.45], glow, [1.4, 1.2, 1.2], 6, 4));
  for (const dy of [-1, 1]) c.meshes.push(...chain([[0, Y + dy * 0.6, -0.6], [0, Y + dy * s * 0.15 - s * 0.2, -s * 0.38], [0, Y + dy * s * 0.1 - s * 0.45, -s * 0.3]], [0.42, 0.5], [0.04, 0.05], spikes, false));
  c.meshes.push(...chain([[0, 3, 0], [0, 4.2, 0.6], [0, 4.9, 0.2]], [0.5, 0.55], [0.04, 0.05], spikes, false), ...chain([[0, 3, 0], [0, 4.2, -0.6], [0, 4.9, -0.2]], [0.5, 0.55], [0.04, 0.05], spikes, false));
}

/** D 岩石巨斧：黑鐵柄配岩塊配重；斧頭是一大團粗岩塊，岩縫透出熔光，頂端一支岩刺 */
function rock(c: Ctx): void {
  const { Y, s, trim, glow, spikes } = c;
  haft(c, 0.68, [1.6, Y * 0.5, Y + 2.4]);
  for (const [y, r] of [[Y * 0.3, 1.1], [Y * 0.7, 1]] as const) c.meshes.push(gem(r, [0, y, 0], spikes[1]!, [1, 1.2, 1], 5, 3));
  socket(c, 1.05);
  const R = s * 0.95;
  const pts: [number, number, number][] = [[-0.9, 0.45, 0.22], [-0.45, 0.62, 0.26], [0, 0.55, 0.28], [0.45, 0.62, 0.26], [0.9, 0.48, 0.22], [-0.7, 0.88, 0.2], [-0.2, 0.92, 0.22], [0.3, 0.9, 0.22], [0.75, 0.86, 0.2], [0, 0.28, 0.24]];
  pts.forEach(([a, k, r], i) => {
    const rr = s * r;
    c.meshes.push(gem(rr, [0, Y - Math.sin(a) * R * k, Math.cos(a) * R * k], c.o.headColors[i % 3]!, [0.85 / rr, 1.15, 1], 5, 3));
  });
  const crack = (pts2: V3[]) => c.meshes.push(...chain(pts2, [0.92, 0.2], [0.92, 0.12], glowTones(glow)));
  crack([[0, Y - s * 0.55, s * 0.3], [0, Y - s * 0.2, s * 0.55], [0, Y + s * 0.1, s * 0.45], [0, Y + s * 0.5, s * 0.7]]);
  crack([[0, Y - s * 0.1, s * 0.25], [0, Y - s * 0.3, s * 0.75], [0, Y - s * 0.55, s * 0.85]]);
  crack([[0, Y + s * 0.2, s * 0.25], [0, Y + s * 0.35, s * 0.5]]);
  c.meshes.push(edge([0, Y - 1.6, 0], [0, Y - 1.6 - s * 0.5, 0], [0.85, 0.9], [0.05, 0.06], spikes));
  c.meshes.push(gem(1.2, [0, 3.8, 0], spikes[1]!, [1, 1.1, 1], 5, 3), gem(0.45, [0, 3.8, 0], glow, [2.4, 1, 1], 6, 4));
  void trim;
}

// ─────────────────────────── 紅：六把專屬 ───────────────────────────

/** 獸神之齒：骨節柄纏著血紅皮；斧頭是一段巨大的顎骨，一排往外的巨牙、中間是血肉，頂上一支往前彎的大獠牙 */
function jaw(c: Ctx): void {
  const { Y, s, spikes } = c;
  const bone = c.o.headColors;
  haft(c, 0.62, [1.4, Y * 0.25, Y * 0.5, Y * 0.75]);
  for (const y of [Y * 0.38, Y * 0.62]) c.meshes.push(gem(0.85, [0, y, 0], bone[0]!, [1, 1.3, 1], 6, 4));
  socket(c, 1.05);
  const jawArc = arc(Y + s * 0.1, s * 0.1, s * 0.72, s * 0.72, -1.05, 0.9, 8);
  fan(c, [0, Y, 0.6], jawArc, 0.5, s * 0.16, spikes);
  c.meshes.push(...chain(jawArc, [0.62, s * 0.11], [0.62, s * 0.11], bone));
  jawArc.forEach((p, i) => {
    if (i % 1 !== 0) return;
    const a = -1.05 + (1.95 * i) / 8;
    const len = s * (0.34 + (i % 2) * 0.12);
    c.meshes.push(taper(p, [0, p[1] - Math.sin(a + 0.35) * len, p[2] + Math.cos(a + 0.35) * len], [0.55, 0.5], [0.04, 0.05], bone, 4, i, Math.PI / 4));
  });
  c.meshes.push(...chain([[0, Y - 1.2, 0.2], [0, Y - s * 0.6, s * 0.15], [0, Y - s * 1.1, s * 0.45], [0, Y - s * 1.25, s * 0.9]], [0.85, 1], [0.05, 0.06], bone, false));
  for (const sd of [1, -1]) c.meshes.push(...chain([[0, 3, sd * 0.3], [0, 4.2, sd * 1.3], [0, 5.2, sd * 0.9]], [0.5, 0.55], [0.04, 0.05], bone, false));
  c.meshes.push(gem(0.55, [0, 3.6, 0], c.glow, [1.5, 1.2, 1.5], 6, 4));
}

/** 末日審判：黑鐵行刑巨斧，刃口一圈參差的火焰尖；套筒是一個帶光芒的日輪；斧背尖刺、頂端尖錐 */
function doom(c: Ctx): void {
  const { Y, s, trim, glow, spikes } = c;
  haft(c, 0.66, [1.6, Y * 0.3, Y * 0.55, Y * 0.8]);
  const outer = arc(Y, s * 0.05, s * 1.1, s * 1, -1.15, 1.15, 10);
  fan(c, [0, Y, 0.8], outer, 0.55, s * 0.18, c.o.headColors);
  c.meshes.push(...chain(outer, [0.5, s * 0.06], [0.5, s * 0.06], glowTones(glow)));
  outer.forEach((p, i) => {
    if (i === 0 || i === outer.length - 1) return;
    const a = -1.15 + (2.3 * i) / 10;
    const len = s * (0.18 + (i % 2) * 0.12);
    c.meshes.push(taper(p, [0, p[1] - Math.sin(a + 0.3) * len, p[2] + Math.cos(a + 0.3) * len], [0.42, 0.55], [0.03, 0.05], glowTones(lighten(glow, 0.15)), 4, i, Math.PI / 4));
  });
  socket(c, 1.15);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = 1.5, r1 = i % 2 ? 2.6 : 3.3;
    c.meshes.push(taper([0, Y + Math.sin(a) * r0, Math.cos(a) * r0], [0, Y + Math.sin(a) * r1, Math.cos(a) * r1], [0.35, 0.45], [0.04, 0.05], trim, 4, i, Math.PI / 4));
  }
  for (const dy of [-0.4, 0.4]) c.meshes.push(edge([0, Y + dy * s, -0.8], [0, Y + dy * s * 1.4, -s * 0.42], [0.5, 0.6], [0.04, 0.05], spikes));
  c.meshes.push(edge([0, Y - 1.8, 0], [0, Y - 1.8 - s * 0.55, 0], [0.6, 0.65], [0.03, 0.04], trim));
  butt(c, 2.2);
}

/** 亡衛戰斧：鏽鐵柄纏鎖鏈；斧刃是裂著綠光的石鐵，斧背是一顆方形錘頭（正面嵌綠寶石），錘下垂著鎖鏈和小骷髏 */
function warden(c: Ctx): void {
  const { Y, s, trim, glow, spikes } = c;
  haft(c, 0.66, [1.5, Y * 0.35, Y * 0.7]);
  for (let j = 0; j < 7; j++) {
    const y0 = Y * 0.15 + (Y * 0.6 * j) / 7;
    c.meshes.push(taper([j % 2 ? 0.7 : -0.7, y0, -0.6], [j % 2 ? -0.7 : 0.7, y0 + Y * 0.07, 0.6], [0.2, 0.2], [0.2, 0.2], spikes, 6, j, Math.PI / 6));
  }
  socket(c, 1.1);
  const outer = arc(Y, s * 0.1, s * 1.02, s * 0.9, -1, 1.15, 9);
  fan(c, [0, Y, 0.8], outer, 0.5, s * 0.16, c.o.headColors);
  c.meshes.push(...chain(outer, [0.46, s * 0.05], [0.46, s * 0.05], [lighten(c.o.headColors[0]!, 0.2), c.o.headColors[0]!, c.o.headColors[1]!, c.o.headColors[0]!]));
  const crack = (pts: V3[]) => c.meshes.push(...chain(pts, [0.85, 0.22], [0.85, 0.12], glowTones(glow)));
  crack([[0, Y - s * 0.6, s * 0.4], [0, Y - s * 0.25, s * 0.7], [0, Y + s * 0.1, s * 0.55], [0, Y + s * 0.5, s * 0.8]]);
  crack([[0, Y - s * 0.1, s * 0.3], [0, Y - s * 0.4, s * 0.85]]);
  c.meshes.push(slab([0, Y, -1], [0, Y, -s * 0.5], 1.25, 1.4, trim, 1.3, 1.45, 1));
  c.meshes.push(gem(0.6, [1.35, Y, -s * 0.32], glow, [0.8, 1.3, 1.3], 6, 4), gem(0.6, [-1.35, Y, -s * 0.32], glow, [0.8, 1.3, 1.3], 6, 4));
  const hang: V3[] = [[0, Y + 1.5, -s * 0.36], [0, Y + 3, -s * 0.4], [0, Y + 4.4, -s * 0.36], [0, Y + 5.6, -s * 0.38]];
  for (let j = 0; j < hang.length - 1; j++) c.meshes.push(taper(hang[j]!, hang[j + 1]!, [0.18, 0.18], [0.18, 0.18], spikes, 6, j, Math.PI / 6));
  c.meshes.push(gem(0.75, [0, Y + 6.4, -s * 0.38], 0xd8d0b8, [0.95, 1, 0.95], 6, 4), gem(0.2, [0.6, Y + 6.3, -s * 0.38], glow, [0.5, 1, 1], 4, 3), gem(0.2, [-0.6, Y + 6.3, -s * 0.38], glow, [0.5, 1, 1], 4, 3));
  c.meshes.push(edge([0, Y - 1.7, 0], [0, Y - 1.7 - s * 0.35, 0], [0.7, 0.75], [0.05, 0.06], trim));
  butt(c, 1.8);
}

/** 熔岩巨斧：黑岩柄裂著熔光、纏金箍；左右兩片黑岩殼巨刃，岩縫流著岩漿；頂端岩刺 */
function lava(c: Ctx): void {
  const { Y, s, trim, glow } = c;
  haft(c, 0.7, [Y * 0.3, Y * 0.55, Y * 0.8]);
  c.meshes.push(...chain([[0.72, 2, 0.1], [0.72, Y * 0.3, -0.2], [0.72, Y * 0.6, 0.2], [0.72, Y + 1, 0]], [0.12, 0.2], [0.12, 0.2], glowTones(glow)));
  c.meshes.push(...chain([[-0.72, 2, -0.1], [-0.72, Y * 0.3, 0.2], [-0.72, Y * 0.6, -0.2], [-0.72, Y + 1, 0]], [0.12, 0.2], [0.12, 0.2], glowTones(glow)));
  socket(c, 1.2);
  for (const sd of [1, -1]) {
    const outer = arc(Y, sd * s * 0.08, s * 0.95, sd * s * 0.82, -1.05, 1.05, 8);
    fan(c, [0, Y, sd * 0.8], outer, 0.6, s * 0.16, c.o.headColors);
    outer.forEach((p, i) => i % 2 === 0 && c.meshes.push(gem(s * 0.14, [0, p[1], p[2] * 0.92], c.o.headColors[i % 3]!, [0.9 / (s * 0.14), 1.2, 1], 5, 3)));
    const crack = (pts: V3[]) => c.meshes.push(...chain(pts, [0.95, 0.24], [0.95, 0.14], glowTones(glow)));
    crack([[0, Y - s * 0.6, sd * s * 0.35], [0, Y - s * 0.25, sd * s * 0.6], [0, Y + s * 0.15, sd * s * 0.45], [0, Y + s * 0.55, sd * s * 0.62]]);
    crack([[0, Y, sd * s * 0.25], [0, Y - s * 0.05, sd * s * 0.75]]);
  }
  c.meshes.push(edge([0, Y - 1.8, 0], [0, Y - 1.8 - s * 0.55, 0], [0.75, 0.8], [0.05, 0.06], c.o.headColors));
  c.meshes.push(gem(1.1, [0, 3.7, 0], c.o.headColors[1]!, [1, 1.1, 1], 5, 3), gem(0.45, [0, 3.7, 0], glow, [2.3, 1, 1], 6, 4));
  void trim;
}

/** 蛛后戰斧：紫黑甲殼柄；左右兩片往柄尾彎的毒牙刃（內側綠色毒光），斧頭上方伸出四支蜘蛛腳，頂端一簇綠眼 */
function queen(c: Ctx): void {
  const { Y, s, glow, spikes } = c;
  haft(c, 0.55, [1.6, Y * 0.3, Y * 0.6]);
  for (const [y, sd] of [[Y * 0.2, 1], [Y * 0.45, -1], [Y * 0.7, 1]] as const) c.meshes.push(taper([0, y, sd * 0.5], [0, y + 0.8, sd * 1.6], [0.26, 0.32], [0.03, 0.04], spikes, 4, 2, Math.PI / 4));
  socket(c, 0.95);
  for (const sd of [1, -1]) {
    const fang: V3[] = [[0, Y - 0.4, sd * 0.8], [0, Y - s * 0.22, sd * s * 0.55], [0, Y + s * 0.2, sd * s * 0.85], [0, Y + s * 0.7, sd * s * 0.75], [0, Y + s * 1, sd * s * 0.45]];
    c.meshes.push(...chain(fang, [0.45, s * 0.2], [0.05, 0.06], c.o.headColors));
    c.meshes.push(...chain(fang.map(([x, y, z]) => [x, y + s * 0.02, z * 0.82] as V3).slice(1), [0.5, s * 0.07], [0.5, s * 0.03], glowTones(glow)));
    for (const [k, len] of [[0.5, 1], [0.25, 0.75]] as const) {
      const leg: V3[] = [[0, Y - 0.8, sd * 0.6], [0, Y - s * 0.4 * len, sd * s * 0.5 * (k + 0.5)], [0, Y - s * 0.75 * len, sd * s * 0.32 * (k + 0.5)], [0, Y - s * 0.95 * len, sd * s * 0.45 * (k + 0.5)]];
      c.meshes.push(...chain(leg, [0.32, 0.4], [0.04, 0.05], spikes, false));
    }
  }
  for (const [x, z] of [[0, 0], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]] as const) c.meshes.push(gem(0.38, [x, Y - 2.2 - Math.abs(z) * 0.5, z], glow, [1, 1.2, 1], 6, 4));
  c.meshes.push(...chain([[0, 3, 0], [0, 4.2, 0.6], [0, 5, 0.2]], [0.45, 0.5], [0.04, 0.05], spikes, false), ...chain([[0, 3, 0], [0, 4.2, -0.6], [0, 5, -0.2]], [0.45, 0.5], [0.04, 0.05], spikes, false));
}

/** 統御者巨斧：暗金與黑的柄；左右兩片新月巨刃（金邊、紅色刃身），套筒是一圈日蝕光環，頂端一圈王冠尖刺 */
function sovereign(c: Ctx): void {
  const { Y, s, trim, glow, spikes } = c;
  haft(c, 0.62, [1.6, Y * 0.25, Y * 0.5, Y * 0.75]);
  for (const y of [Y * 0.38, Y * 0.62]) for (const sd of [1, -1]) c.meshes.push(taper([0, y, sd * 0.6], [0, y - 0.6, sd * 1.7], [0.28, 0.32], [0.03, 0.04], trim, 4, 0, Math.PI / 4));
  socket(c, 1.15);
  for (const sd of [1, -1]) {
    const outer = arc(Y, sd * s * 0.05, s * 1, sd * s * 0.95, -1.15, 1.15, 10);
    fan(c, [0, Y, sd * 1.6], outer, 0.5, s * 0.14, c.o.headColors);
    c.meshes.push(...chain(outer, [0.55, s * 0.06], [0.55, s * 0.06], trim));
    c.meshes.push(...chain(arc(Y, sd * s * 0.05, s * 0.72, sd * s * 0.66, -1.05, 1.05, 10), [0.6, s * 0.05], [0.6, s * 0.05], spikes));
    for (const a of [-1.15, 1.15]) {
      const p: V3 = [0, Y - Math.sin(a) * s, sd * (s * 0.05 + Math.cos(a) * s * 0.95)];
      c.meshes.push(edge(p, [0, p[1] - Math.sign(a) * s * 0.3, p[2] + sd * s * 0.12], [0.45, 0.5], [0.03, 0.04], trim));
    }
  }
  // 日蝕光環（Y-Z 平面）
  const halo: V3[] = [];
  for (let i = 0; i <= 16; i++) halo.push([0, Y + Math.cos((i / 16) * Math.PI * 2) * 2.3, Math.sin((i / 16) * Math.PI * 2) * 2.3]);
  c.meshes.push(...chain(halo, [0.75, 0.42], [0.75, 0.42], glowTones(glow)));
  c.meshes.push(gem(1.9, [0, Y, 0], 0x14100e, [0.42, 1, 1], 10, 5));
  for (let i = 0; i < 5; i++) {
    const a = -0.8 + i * 0.4;
    const len = i === 2 ? s * 0.6 : s * 0.38;
    c.meshes.push(edge([0, Y - 2.4, 0], [0, Y - 2.4 - Math.cos(a) * len, Math.sin(a) * len], [0.42, 0.5], [0.03, 0.04], trim));
  }
  c.meshes.push(gem(0.6, [0, Y - 2.6 - s * 0.2, 0], glow, [1, 1.4, 1], 6, 4));
  butt(c, 2);
}

const BUILDERS: Record<AxeStyle, (c: Ctx) => void> = { moon, cleaver, carapace, rock, jaw, doom, warden, lava, queen, sovereign };

export function styledAxe(o: StyledAxeOptions): { meshes: Mesh[]; head: V3; edgeTop: V3; edgeBottom: V3; badge: Badge } {
  const c: Ctx = { o, Y: -o.haft, s: o.size, trim: o.trim ?? GOLD, spikes: o.spikes ?? o.headColors, glow: o.glow ?? 0xfff0c0, meshes: [] };
  BUILDERS[o.style](c);
  const { Y, s } = c;
  const big = o.style === 'sovereign' || o.style === 'doom';
  return { meshes: c.meshes, head: [0, Y, s * 0.5], edgeTop: [0, Y + s * 0.8, s], edgeBottom: [0, Y - s * 0.8, s], badge: badge(c, big ? 1.5 : 1.3, o.style === 'sovereign' ? 1.6 : o.style === 'cleaver' ? 1.5 : 1.35) };
}

