import { tone } from '../Facets';
import { faceNormal, type Mesh, type V3 } from '../Poly3D';
import { slab } from './StyledSwords';
import { badge, butt, haft, type Ctx, type StyledAxeOptions } from './StyledAxes';
import { glowTones, type Badge } from './StyledWeapons';
import { baseMesh, pick, ribbon, trellisHead, type HeadPoint, type TrellisHeadOptions } from './TrellisAxes';
import { chain, darken, edge, gem, GOLD, lighten, sweep, taper, type Tones } from './WeaponParts';

/**
 * 橘 / 紅斧的底稿改版（設計者 2026-11-14：拿 TRELLIS 生成的斧頭去優化橘紅斧）：
 * 斧刃換成 TRELLIS 雙刃斧依款式變形（TrellisAxes.trellisHead），刃緣光、岩縫、毒光直接畫在刃面上；
 * 各款的斧柄、牙齒、尖刺、鎖鏈、光環、柄尾等特色零件照 StyledAxes 的設計。座標同 StyledAxes。
 */
type Head = ReturnType<typeof trellisHead>;

function head(c: Ctx, o: Omit<TrellisHeadOptions, 'size' | 'haft'>): Head {
  const h = trellisHead({ ...o, size: c.s, haft: c.o.haft });
  c.meshes.push(h.mesh);
  return h;
}

/** 折線切細（每段不超過 step），貼刃面時才跟得上刃面的起伏 */
function subdivide(pts: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [y0, z0] = pts[i - 1]!, [y1, z1] = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(y1 - y0, z1 - z0) / step));
    for (let k = 1; k <= n; k++) out.push([y0 + ((y1 - y0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  return out;
}

/** 刃面上的一道紋（裂縫、毒光、內圈飾線）：兩面各一條細帶貼著刃面；刃面外的點不畫 */
function bladeLine(c: Ctx, h: Head, pts: [number, number][], w: number, colors: Tones, clip = false): void {
  const fine = subdivide(pts, 0.7);
  const t = fine.map(([y, z]) => (!clip || h.inside(y, z) ? h.surface(y, z) : 0));
  // 刃面厚度取前後平均，細帶才不會一格一格跳
  const ts = t.map((v, i) => (v && (t[i - 1] ?? v) && (t[i + 1] ?? v) ? (v * 2 + (t[i - 1] ?? v) + (t[i + 1] ?? v)) / 4 : 0));
  const runs: number[][] = [[]];
  ts.forEach((v, i) => (v > 0 ? runs[runs.length - 1]!.push(i) : runs[runs.length - 1]!.length && runs.push([])));
  for (const run of runs.filter((r) => r.length >= 2))
    for (const sx of [1, -1]) {
      const line = run.map((i): V3 => [sx * (ts[i]! + 0.14), fine[i]![0], fine[i]![1]]);
      c.meshes.push(ribbon(line, w, 0.12, colors));
    }
}

/** 刃緣內縮成的一圈弧線（f = 1 是刃緣、越小越靠套筒） */
function innerArc(c: Ctx, h: Head, side: 1 | -1, f: number, w: number, colors: Tones, from = 0.04, to = 0.96): void {
  const [cy, cz] = h.center(side);
  const pts = h.rim(side, 14, from, to).map(({ p }): [number, number] => [cy + (p[1] - cy) * f, cz + (p[2] - cz) * f]);
  bladeLine(c, h, pts, w, colors);
}

/** 包住刃緣的一道邊（發光刃口、金邊） */
function rimBand(c: Ctx, h: Head, side: 1 | -1, w: number, colors: Tones, from = 0.03, to = 0.97): void {
  const pts = h.rim(side, 16, from, to).map(({ p, out }): V3 => [0, p[1] - out[0] * w * 0.35, p[2] - out[1] * w * 0.35]);
  c.meshes.push(baseMesh(sweep(pts, pts.map(() => [0.32, w] as [number, number]), colors)));
}

/** 裂縫：以斧頭中心為原點、s 為單位的折線（dy 往柄尾為正、dz 往刃為正） */
const crack = (c: Ctx, h: Head, side: 1 | -1, pts: [number, number][], w = 0.28) =>
  bladeLine(c, h, pts.map(([dy, dz]): [number, number] => [c.Y + dy * c.s, side * dz * c.s]), w, glowTones(c.glow), true);

/** 從刃緣往外長的尖（牙齒、火焰、角質刺） */
function rimSpikes(c: Ctx, h: Head, side: 1 | -1, n: number, len: (i: number) => number, r: number, colors: Tones, from = 0.08, to = 0.92, bend = 0): void {
  h.rim(side, n, from, to).forEach(({ p, out }, i) => {
    const L = len(i);
    const tip: V3 = [0, p[1] + (out[0] - bend * out[1] * side) * L, p[2] + (out[1] + bend * out[0] * side) * L];
    const base: V3 = [0, p[1] - out[0] * r * 0.6, p[2] - out[1] * r * 0.6];
    c.meshes.push(taper(base, tip, [r, r * 1.2], [0.04, 0.05], colors, 4, i, Math.PI / 4));
  });
}

/** 寶石貼在刃面兩側（依刃面的厚度） */
function surfaceGem(c: Ctx, h: Head, y: number, z: number, r: number, color: number): void {
  const t = h.surface(y, z);
  for (const sx of [1, -1]) c.meshes.push(gem(r, [sx * (t + r * 0.25), y, z], color, [0.55, 1.2, 1.2], 6, 4));
}

/** 斧頭頂的尖刺（從套筒最遠處往外） */
const topSpike = (c: Ctx, h: Head, len: number, r: [number, number], colors: Tones) => c.meshes.push(edge([0, h.top + 0.4, 0], [0, h.top - len, 0], r, [0.03, 0.04], colors));

// ─────────────────────────── 橘：四種基本款 ───────────────────────────

function moon(c: Ctx): Head {
  const { Y, s, trim, glow } = c;
  haft(c, 0.5, [1.6, Y * 0.35, Y * 0.68]);
  for (const y of [Y * 0.35, Y * 0.68]) for (const sd of [1, -1]) c.meshes.push(taper([0, y, sd * 0.6], [0, y - 0.5, sd * 1.4], [0.24, 0.28], [0.03, 0.03], trim, 4, 0, Math.PI / 4));
  const h = head(c, {
    front: 'slim',
    back: 'nub',
    tall: 1.3,
    thick: 0.75,
    colors: c.o.headColors,
  });
  rimBand(c, h, 1, 0.45, glowTones(glow));
  innerArc(c, h, 1, 0.8, 0.22, trim);
  c.meshes.push(...chain([[0, Y - 0.6, -1.2], [0, Y - s * 0.25, -s * 0.45], [0, Y - s * 0.5, -s * 0.32]], [0.4, 0.5], [0.04, 0.05], trim, false));
  c.meshes.push(...chain([[0, Y + 0.6, -1.2], [0, Y + s * 0.2, -s * 0.38], [0, Y + s * 0.38, -s * 0.26]], [0.35, 0.42], [0.04, 0.05], trim, false));
  topSpike(c, h, s * 0.45, [0.5, 0.55], trim);
  butt(c);
  return h;
}

function cleaver(c: Ctx): Head {
  const { Y, s, trim, glow } = c;
  haft(c, 0.75, [1.8, -0.6, Y * 0.3, Y * 0.5, Y * 0.7, Y + 2.4]);
  const h = head(c, {
    front: 'cleaver',
    back: 'nub',
    tall: 1.2,
    thick: 0.85,
    colors: c.o.headColors,
    paint: (p) =>
      p.side < 0 ? pick(trim, p.q) : p.e < 0.5 ? pick(c.spikes, p.q) : undefined,
  });
  rimBand(c, h, 1, 0.4, [lighten(c.o.headColors[0]!, 0.35), c.o.headColors[0]!, lighten(c.o.headColors[0]!, 0.2), c.o.headColors[0]!]);
  innerArc(c, h, 1, 0.8, 0.3, glowTones(glow), 0.12, 0.88);
  // 內側鋼板的鉚釘
  for (const [dy, dz] of [[-0.25, 0.24], [0.25, 0.24], [-0.25, 0.42], [0.25, 0.42]] as const) surfaceGem(c, h, Y + dy * s, dz * s, 0.32, trim[0]!);
  // 斧背的方錘頭
  c.meshes.push(slab([0, Y, -1.2], [0, Y, -s * 0.38], 0.95, 0.95, trim, 1.05, 1.05, 2), taper([0, Y, -s * 0.38], [0, Y, -s * 0.55], [1.45, 1.45], [0.35, 0.35], trim, 4, 3, Math.PI / 4));
  c.meshes.push(taper([0, h.top + 0.4, 0], [0, h.top - 1.6, 0], [0.75, 0.75], [0.1, 0.1], trim, 6, 4, Math.PI / 6));
  butt(c, 1.6);
  return h;
}

function carapace(c: Ctx): Head {
  const { Y, s, glow, spikes } = c;
  haft(c, 0.6, [1.6, Y * 0.3, Y * 0.62, Y + 2.4]);
  for (const [y, z] of [[Y * 0.22, 0.55], [Y * 0.45, -0.55], [Y * 0.72, 0.55]] as const) c.meshes.push(gem(0.55, [0, y, z], glow, [1.3, 1.2, 1], 6, 4));
  for (const [y, sd] of [[Y * 0.35, 1], [Y * 0.58, -1], [Y * 0.85, 1]] as const) c.meshes.push(taper([0, y, sd * 0.5], [0, y - 0.7, sd * 1.8], [0.3, 0.36], [0.03, 0.04], spikes, 4, 2, Math.PI / 4));
  const dark = c.o.headColors.map((x) => darken(x, 0.3)) as unknown as Tones;
  // 一層層的甲殼：由內往外深淺交替，最外緣是角質
  const h = head(c, {
    front: 'crescent',
    back: 'nub',
    tall: 1.25,
    colors: c.o.headColors,
    paint: (p) => (p.side > 0 && p.e < 0.42 ? pick(dark, p.q) : undefined),
  });
  for (const f of [0.62, 0.82]) innerArc(c, h, 1, f, 0.32, dark, 0.06, 0.94);
  rimSpikes(c, h, 1, 6, () => s * 0.2, 0.38, spikes, 0.08, 0.92, 0.6);
  for (const k of [0.35, 0.65]) surfaceGem(c, h, Y - (k - 0.5) * s, s * 0.45, 0.55, glow);
  for (const dy of [-1, 1]) c.meshes.push(...chain([[0, Y + dy * 0.6, -1.2], [0, Y + dy * s * 0.15 - s * 0.2, -s * 0.38], [0, Y + dy * s * 0.1 - s * 0.45, -s * 0.3]], [0.42, 0.5], [0.04, 0.05], spikes, false));
  c.meshes.push(...chain([[0, 3, 0], [0, 4.2, 0.6], [0, 4.9, 0.2]], [0.5, 0.55], [0.04, 0.05], spikes, false), ...chain([[0, 3, 0], [0, 4.2, -0.6], [0, 4.9, -0.2]], [0.5, 0.55], [0.04, 0.05], spikes, false));
  return h;
}

function rock(c: Ctx): Head {
  const { Y, s, glow, spikes } = c;
  haft(c, 0.68, [1.6, Y * 0.5, Y + 2.4]);
  for (const [y, r] of [[Y * 0.3, 1.1], [Y * 0.7, 1]] as const) c.meshes.push(gem(r, [0, y, 0], spikes[1]!, [1, 1.2, 1], 5, 3));
  const h = head(c, { front: 'broad', back: 'nub', tall: 1.15, thick: 1.35, colors: c.o.headColors });
  crack(c, h, 1, [[0.55, 0.3], [0.2, 0.55], [-0.1, 0.45], [-0.5, 0.75]]);
  crack(c, h, 1, [[0.1, 0.25], [0.3, 0.7], [0.5, 0.85]]);
  crack(c, h, 1, [[-0.2, 0.25], [-0.35, 0.5]]);
  // 刃緣凸出的岩塊
  h.rim(1, 6, 0.05, 0.95).forEach(({ p }, i) => {
    const r = s * (i % 2 ? 0.1 : 0.13);
    c.meshes.push(gem(r, [0, p[1], p[2] - Math.sign(p[2]) * r * 0.6], c.o.headColors[i % 3]!, [1.4 / r, 1.15, 1], 5, 3));
  });
  topSpike(c, h, s * 0.5, [0.85, 0.9], spikes);
  c.meshes.push(gem(1.2, [0, 3.8, 0], spikes[1]!, [1, 1.1, 1], 5, 3), gem(0.45, [0, 3.8, 0], glow, [2.4, 1, 1], 6, 4));
  return h;
}

// ─────────────────────────── 紅：六把專屬 ───────────────────────────

function jaw(c: Ctx): Head {
  const { Y, s, spikes } = c;
  const bone = c.o.headColors;
  haft(c, 0.62, [1.4, Y * 0.25, Y * 0.5, Y * 0.75]);
  for (const y of [Y * 0.38, Y * 0.62]) c.meshes.push(gem(0.85, [0, y, 0], bone[0]!, [1, 1.3, 1], 6, 4));
  // 顎骨：外圈是骨、靠套筒是血肉
  const h = head(c, { front: 'fang', back: 'nub', tall: 1.15, colors: bone, paint: (p) => (p.side > 0 && p.e < 0.55 ? pick(spikes, p.q) : undefined) });
  rimSpikes(c, h, 1, 9, (i) => s * (0.32 + (i % 2) * 0.12), 0.55, bone, 0.05, 0.95, 0.25);
  // 頂上往前彎的大獠牙
  c.meshes.push(...chain([[0, h.top + 0.6, 0.2], [0, h.top - s * 0.2, s * 0.15], [0, h.top - s * 0.55, s * 0.45], [0, h.top - s * 0.65, s * 0.9]], [0.85, 1], [0.05, 0.06], bone, false));
  for (const sd of [1, -1]) c.meshes.push(...chain([[0, 3, sd * 0.3], [0, 4.2, sd * 1.3], [0, 5.2, sd * 0.9]], [0.5, 0.55], [0.04, 0.05], bone, false));
  c.meshes.push(gem(0.55, [0, 3.6, 0], c.glow, [1.5, 1.2, 1.5], 6, 4));
  return h;
}

function doom(c: Ctx): Head {
  const { Y, s, trim, glow, spikes } = c;
  haft(c, 0.66, [1.6, Y * 0.3, Y * 0.55, Y * 0.8]);
  const h = head(c, { front: 'broad', back: 'spike', tall: 1.3, colors: c.o.headColors });
  rimBand(c, h, 1, 0.55, glowTones(glow));
  // 刃口一圈參差的火焰尖
  rimSpikes(c, h, 1, 9, (i) => s * (0.18 + (i % 2) * 0.12), 0.45, glowTones(lighten(glow, 0.15)), 0.06, 0.94, 0.3);
  // 套筒上帶光芒的日輪
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = 1.8, r1 = i % 2 ? 2.9 : 3.6;
    c.meshes.push(taper([0, Y + Math.sin(a) * r0, Math.cos(a) * r0], [0, Y + Math.sin(a) * r1, Math.cos(a) * r1], [0.35, 0.45], [0.04, 0.05], trim, 4, i, Math.PI / 4));
  }
  for (const sd of [1, -1]) c.meshes.push(gem(1.2, [sd * (h.surface(Y, 0) + 0.2), Y, 0], glow, [0.4, 1, 1], 8, 4));
  void spikes;
  topSpike(c, h, s * 0.55, [0.6, 0.65], trim);
  butt(c, 2.2);
  return h;
}

function warden(c: Ctx): Head {
  const { Y, s, trim, glow, spikes } = c;
  haft(c, 0.66, [1.5, Y * 0.35, Y * 0.7]);
  for (let j = 0; j < 7; j++) {
    const y0 = Y * 0.15 + (Y * 0.6 * j) / 7;
    c.meshes.push(taper([j % 2 ? 0.7 : -0.7, y0, -0.6], [j % 2 ? -0.7 : 0.7, y0 + Y * 0.07, 0.6], [0.2, 0.2], [0.2, 0.2], spikes, 6, j, Math.PI / 6));
  }
  const h = head(c, {
    front: 'broad',
    back: 'nub',
    tall: 1.15,
    colors: c.o.headColors,
    paint: (p) => (p.side < 0 ? pick(trim, p.q) : undefined),
  });
  rimBand(c, h, 1, 0.45, [lighten(c.o.headColors[0]!, 0.2), c.o.headColors[0]!, c.o.headColors[1]!, c.o.headColors[0]!]);
  crack(c, h, 1, [[0.6, 0.4], [0.25, 0.7], [-0.1, 0.55], [-0.5, 0.8]]);
  crack(c, h, 1, [[0.1, 0.3], [0.4, 0.85]]);
  // 斧背的方錘頭，兩側嵌綠寶石；錘下垂著鎖鏈和小骷髏
  c.meshes.push(slab([0, Y, -1.4], [0, Y, -s * 0.5], 1.25, 1.4, trim, 1.3, 1.45, 1));
  c.meshes.push(gem(0.6, [1.35, Y, -s * 0.32], glow, [0.8, 1.3, 1.3], 6, 4), gem(0.6, [-1.35, Y, -s * 0.32], glow, [0.8, 1.3, 1.3], 6, 4));
  const hang: V3[] = [[0, Y + 1.5, -s * 0.36], [0, Y + 3, -s * 0.4], [0, Y + 4.4, -s * 0.36], [0, Y + 5.6, -s * 0.38]];
  c.meshes.push(...chain(hang, [0.18, 0.18], [0.18, 0.18], spikes, false));
  c.meshes.push(gem(0.75, [0, Y + 6.4, -s * 0.38], 0xd8d0b8, [0.95, 1, 0.95], 6, 4), gem(0.2, [0.6, Y + 6.3, -s * 0.38], glow, [0.5, 1, 1], 4, 3), gem(0.2, [-0.6, Y + 6.3, -s * 0.38], glow, [0.5, 1, 1], 4, 3));
  topSpike(c, h, s * 0.35, [0.7, 0.75], trim);
  butt(c, 1.8);
  return h;
}

function lava(c: Ctx): Head {
  const { Y, s, glow } = c;
  haft(c, 0.7, [Y * 0.3, Y * 0.55, Y * 0.8]);
  c.meshes.push(...chain([[0.72, 2, 0.1], [0.72, Y * 0.3, -0.2], [0.72, Y * 0.6, 0.2], [0.72, Y + 1, 0]], [0.12, 0.2], [0.12, 0.2], glowTones(glow)));
  c.meshes.push(...chain([[-0.72, 2, -0.1], [-0.72, Y * 0.3, 0.2], [-0.72, Y * 0.6, -0.2], [-0.72, Y + 1, 0]], [0.12, 0.2], [0.12, 0.2], glowTones(glow)));
  const h = head(c, { front: 'crescent', back: 'crescent', tall: 1.15, thick: 1.25, colors: c.o.headColors });
  for (const sd of [1, -1] as const) {
    crack(c, h, sd, [[0.6, 0.35], [0.25, 0.6], [-0.15, 0.45], [-0.55, 0.65]]);
    crack(c, h, sd, [[0, 0.25], [0.05, 0.8]]);
  }
  topSpike(c, h, s * 0.55, [0.75, 0.8], c.o.headColors);
  c.meshes.push(gem(1.1, [0, 3.7, 0], c.o.headColors[1]!, [1, 1.1, 1], 5, 3), gem(0.45, [0, 3.7, 0], glow, [2.3, 1, 1], 6, 4));
  return h;
}

function queen(c: Ctx): Head {
  const { Y, s, glow, spikes } = c;
  haft(c, 0.55, [1.6, Y * 0.3, Y * 0.6]);
  for (const [y, sd] of [[Y * 0.2, 1], [Y * 0.45, -1], [Y * 0.7, 1]] as const) c.meshes.push(taper([0, y, sd * 0.5], [0, y + 0.8, sd * 1.6], [0.26, 0.32], [0.03, 0.04], spikes, 4, 2, Math.PI / 4));
  // 兩片往柄尾彎的毒牙刃，刃身內側一道毒光
  const h = head(c, { front: 'fangs', back: 'fangs', tall: 1.1, thick: 0.8, colors: c.o.headColors });
  for (const sd of [1, -1] as const) innerArc(c, h, sd, 0.72, 0.4, glowTones(glow), 0.1, 0.95);
  for (const sd of [1, -1])
    for (const [k, len] of [[0.5, 1], [0.25, 0.75]] as const) {
      const leg: V3[] = [[0, Y - 0.8, sd * 0.6], [0, Y - s * 0.4 * len, sd * s * 0.5 * (k + 0.5)], [0, Y - s * 0.75 * len, sd * s * 0.32 * (k + 0.5)], [0, Y - s * 0.95 * len, sd * s * 0.45 * (k + 0.5)]];
      c.meshes.push(...chain(leg, [0.32, 0.4], [0.04, 0.05], spikes, false));
    }
  for (const [x, z] of [[0, 0], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]] as const) c.meshes.push(gem(0.38, [x, h.top - 0.2 - Math.abs(z) * 0.5, z], glow, [1, 1.2, 1], 6, 4));
  c.meshes.push(...chain([[0, 3, 0], [0, 4.2, 0.6], [0, 5, 0.2]], [0.45, 0.5], [0.04, 0.05], spikes, false), ...chain([[0, 3, 0], [0, 4.2, -0.6], [0, 5, -0.2]], [0.45, 0.5], [0.04, 0.05], spikes, false));
  return h;
}

function sovereign(c: Ctx): Head {
  const { Y, s, trim, glow, spikes } = c;
  haft(c, 0.62, [1.6, Y * 0.25, Y * 0.5, Y * 0.75]);
  for (const y of [Y * 0.38, Y * 0.62]) for (const sd of [1, -1]) c.meshes.push(taper([0, y, sd * 0.6], [0, y - 0.6, sd * 1.7], [0.28, 0.32], [0.03, 0.04], trim, 4, 0, Math.PI / 4));
  // 左右兩片新月巨刃：金邊、刃身內側一道暗紋
  const h = head(c, {
    front: 'crescent',
    back: 'crescent',
    tall: 1.3,
    colors: c.o.headColors,
  });
  for (const sd of [1, -1] as const) {
    rimBand(c, h, sd, 0.6, trim);
    innerArc(c, h, sd, 0.7, 0.35, spikes);
  }
  // 日蝕光環（Y-Z 平面）
  const halo: V3[] = [];
  for (let i = 0; i <= 16; i++) halo.push([0, Y + Math.cos((i / 16) * Math.PI * 2) * 2.6, Math.sin((i / 16) * Math.PI * 2) * 2.6]);
  c.meshes.push(...chain(halo, [0.75, 0.42], [0.75, 0.42], glowTones(glow)));
  c.meshes.push(gem(2.1, [0, Y, 0], 0x14100e, [0.42 + h.surface(Y, 0) / 2.1, 1, 1], 10, 5));
  for (let i = 0; i < 5; i++) {
    const a = -0.8 + i * 0.4;
    const len = i === 2 ? s * 0.6 : s * 0.38;
    c.meshes.push(edge([0, h.top + 0.3, 0], [0, h.top + 0.3 - Math.cos(a) * len, Math.sin(a) * len], [0.42, 0.5], [0.03, 0.04], trim));
  }
  c.meshes.push(gem(0.6, [0, h.top - s * 0.2, 0], glow, [1, 1.4, 1], 6, 4));
  butt(c, 2);
  return h;
}

const BUILDERS: Record<StyledAxeOptions['style'], (c: Ctx) => Head> = { moon, cleaver, carapace, rock, jaw, doom, warden, lava, queen, sovereign };

export function trellisStyledAxe(o: StyledAxeOptions): { meshes: Mesh[]; head: V3; edgeTop: V3; edgeBottom: V3; badge: Badge } {
  const c: Ctx = { o, Y: -o.haft, s: o.size, trim: o.trim ?? GOLD, spikes: o.spikes ?? o.headColors, glow: o.glow ?? 0xfff0c0, meshes: [] };
  const h = BUILDERS[o.style](c);
  const big = o.style === 'sovereign' || o.style === 'doom';
  return { meshes: c.meshes, head: [0, c.Y, c.s * 0.5], edgeTop: h.edgeTop, edgeBottom: h.edgeBottom, badge: badge(c, big ? 1.5 : 1.3, Math.max(1.35, h.surface(c.Y, 0) + 0.2)) };
}
