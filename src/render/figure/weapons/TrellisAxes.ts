import { tone } from '../Facets';
import { faceNormal, type Mesh, type V3 } from '../Poly3D';
import AXE_BASE from './axeBase.json';
import type { AxeOptions, Tones } from './WeaponParts';

/**
 * 用 TRELLIS 生成的雙刃斧（重甲骷髏那把，monster_ai.py 的 PROPS）當底稿，改出各階級的斧頭（設計者 2026-11-14 的試作）：
 * 斧柄拉長 / 縮短、斧頭依 size 縮放，斧刃依 head 變形（單刃把背面那片縮成小凸塊或尖刺、新月把刃尖往外張、
 * 鬍鬚斧把下尖拉長、劈刀把靠套筒的地方補寬、獠牙把刃緣切出鋸齒），顏色依原本的明暗對到 headColors / haftColors。
 * 座標同 WeaponParts.axe：斧柄沿 -Y（握點在原點、柄尾 +3），斧頭在 y = -haft，斧刃往 +Z，X 是厚度。
 */
/** axeBase.json：從 monster_ai.py 產生的重甲骷髏斧頭（armoredSkeletonAI.json 的 props）複製出來，武器與怪物各自一份 */
type Prop = { verts: number[][]; faces: number[][] };
/** 底稿（TRELLIS / Blender）來的網格：本身面就夠細，拿到手上時不再 refine；程式畫的零件（杖頭、弓梢、護手尖角）照常 refine */
export const BASE_MESHES = new WeakSet<Mesh>();
export const baseMesh = (m: Mesh): Mesh => (BASE_MESHES.add(m), m);
/** 較細的版本（2400 面；重甲骷髏手上的是 900 面） */
const P = (AXE_BASE as unknown as { props: { axe_hi: Prop } }).props.axe_hi;

/** 底稿的尺寸（公尺，遊戲軸向：Y 朝上、斧刃往 ±X）：斧頭從 HEAD_Y0 開始，中心、半高、刃寬；套筒半寬 */
const LO = Math.min(...P.verts.map((v) => v[1]!));
const HEAD_Y0 = 0.04;
const HEAD_C = 0.28;
const HEAD_H = 0.22;
const REACH = Math.max(...P.verts.map((v) => Math.abs(v[0]!)));
const SOCKET = 0.045;
/** 斧柄半徑（同 WeaponParts.axe） */
const HAFT_R = 0.62;
const HAFT_K = HAFT_R / 0.04;

export const lum = (c: number) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
const sat = (c: number) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx ? (mx - mn) / mx : 0;
};
export const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
/** 依名次（0～1）在由暗到亮排好的色票中取色 */
export const pick = (tones: Tones, q: number) => {
  const sorted = [...tones].sort((a, b) => lum(a) - lum(b));
  const f = Math.min(0.999, Math.max(0, q)) * (sorted.length - 1);
  const i = Math.floor(f);
  return mix(sorted[i]!, sorted[Math.min(sorted.length - 1, i + 1)]!, f - i);
};
/** 每個值在清單中的名次（0～1） */
export const ranks = (xs: number[]) => {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  order.forEach(([, i], n) => (r[i] = xs.length > 1 ? n / (xs.length - 1) : 0.5));
  return r;
};

/** 兩面都有刃的斧頭（新月是兩面的大弧刃，同舊版） */
const TWO_SIDED = new Set(['double', 'crescent']);

/** 斧刃的形狀：AxeOptions.head 的五種，加上橘 / 紅斧用的 broad（加大的單刃）、fangs（往柄尾彎的毒牙）、slim（細新月） */
export type HeadShape = AxeOptions['head'] | 'broad' | 'fangs' | 'slim';

/** 斧刃變形：a = 離斧柄中心線的距離、u = 相對斧頭中心的高度（-1～1），回傳變形後的 [a, u] */
function bladeShape(head: HeadShape, a: number, u: number): [number, number] {
  const d = Math.min(1, Math.max(0, (a - SOCKET) / (REACH - SOCKET)));
  const W = REACH - SOCKET;
  if (a <= SOCKET) return [a, u];
  switch (head) {
    case 'single':
      // 樸素的小刃：刃寬、刃高都收一點
      return [SOCKET + (a - SOCKET) * 0.85, u * 0.85];
    case 'crescent': {
      // 大弧刃：上下刃尖往外張得很開，再往斧柄勾回來
      const hook = Math.max(0, Math.abs(u) - 0.6) * Math.max(0, d - 0.5) * W * 0.9;
      return [a - hook, u * (1 + 1.1 * d * d)];
    }
    case 'slim': {
      // 細新月：同大弧刃，但靠斧柄的刃身收窄，只剩外側一道彎月
      const hook = Math.max(0, Math.abs(u) - 0.6) * Math.max(0, d - 0.5) * W * 0.9;
      return [a - hook, u * (0.45 + 1.6 * d * d)];
    }
    case 'bearded': {
      // 鬍鬚斧：下刃尖沿著斧柄往下拉長、往斧柄勾；上半部收小
      if (u >= 0) return [a, u * (1 - 0.35 * d)];
      const beard = Math.max(0, -u - 0.3) * d * W * 0.35;
      return [a - beard, u * (1 + 2.2 * d)];
    }
    case 'cleaver':
      // 方正：刃寬縮短、上下緣壓平（超過 0.55 的部分壓扁），整片稍微加高
      return [SOCKET + (a - SOCKET) * 0.8, Math.sign(u) * (Math.min(Math.abs(u), 0.55) + Math.max(0, Math.abs(u) - 0.55) * 0.35) * 1.35];
    case 'fang': {
      // 獠牙：刃緣切出深的鋸齒，上刃尖往上長成一根獠牙
      const horn = u > 0.5 ? (u - 0.5) * d * 1.2 : 0;
      if (d < 0.5) return [a, u + horn];
      const tooth = Math.abs(((u * 3.5 + 10.5) % 1) * 2 - 1);
      return [a - W * 0.35 * tooth * ((d - 0.5) / 0.5), u + horn];
    }
    case 'broad':
      // 行刑巨刃：刃往外伸長、刃緣上下張開
      return [SOCKET + (a - SOCKET) * 1.12, u * (1 + 0.45 * d)];
    case 'fangs': {
      // 毒牙：整片往柄尾（u 負）彎，刃尖越外越彎、收細
      return [SOCKET + (a - SOCKET) * 1.05, u * (1 - 0.35 * d) - 0.9 * d * d];
    }
    default:
      return [a, u];
  }
}
/** 背面：有尖刺時收成往外的長尖錐，沒有時縮成套筒上的小凸塊 */
function backShape(spike: boolean, a: number, u: number): [number, number] {
  const d = Math.min(1, Math.max(0, (a - SOCKET) / (REACH - SOCKET)));
  if (a <= SOCKET) return [a, u];
  return spike ? [SOCKET + (a - SOCKET) * 0.75, u * (1 - 0.9 * d)] : [SOCKET + (a - SOCKET) * 0.18, u * 0.5];
}

function shape(o: AxeOptions, front: boolean, a: number, u: number): [number, number] {
  if (!front && !TWO_SIDED.has(o.head)) return backShape(!!o.spike, a, u);
  return bladeShape(o.head, a, u);
}

export function trellisAxe(o: AxeOptions): { meshes: Mesh[]; head: V3; edgeTop: V3; edgeBottom: V3 } {
  const k = o.size / REACH;
  const headBottom = -o.haft - ((HEAD_Y0 - HEAD_C) / HEAD_H) * HEAD_H * k;
  const verts = P.verts.map((v): V3 => {
    const [x, y, z] = [v[0]!, v[1]!, v[2]!];
    if (y < HEAD_Y0) {
      const t = (y - LO) / (HEAD_Y0 - LO);
      return [z * HAFT_K, 3 + t * (headBottom - 3), x * HAFT_K];
    }
    const front = x >= 0;
    const [a, u] = shape(o, front, Math.abs(x), (y - HEAD_C) / HEAD_H);
    return [z * k * 0.8, -o.haft - u * HEAD_H * k, (front ? 1 : -1) * a * k];
  });
  // 顏色：斧頭（套筒以上）與斧柄上亮灰色的金屬箍用 headColors；斧柄上偏紅的木頭用 haftColors 亮的一半、
  // 灰暗的纏繩用 haftColors 暗的一半（再壓暗）；都依原本的亮度排名次取色
  const isHead = P.faces.map((f) => (P.verts[f[0]!]![1]! + P.verts[f[1]!]![1]! + P.verts[f[2]!]![1]!) / 3 >= HEAD_Y0);
  const isMetal = P.faces.map((f, i) => isHead[i] || (sat(f[3]!) < 0.25 && lum(f[3]!) > 0.42));
  const isWrap = P.faces.map((f, i) => !isMetal[i] && sat(f[3]!) < 0.25);
  const rank = (sel: boolean[]) => {
    const idx = P.faces.map((_, i) => i).filter((i) => sel[i]);
    const r = ranks(idx.map((i) => lum(P.faces[i]![3]!)));
    return new Map(idx.map((i, n) => [i, r[n]!]));
  };
  const headRank = rank(isMetal);
  const woodRank = rank(P.faces.map((_, i) => !isMetal[i] && !isWrap[i]));
  const wrapRank = rank(isWrap);
  const zMax = Math.max(...verts.map((v) => v[2]));
  const faces = P.faces.map((f, i) => {
    const idx: V3 = [f[0]!, f[1]!, f[2]!];
    let color: number;
    if (isMetal[i]) {
      const edge = isHead[i] && o.edgeColor !== undefined && idx.every((j) => verts[j]![2] > zMax * 0.85);
      color = edge ? o.edgeColor! : pick(o.headColors, headRank.get(i)!);
    } else if (isWrap[i]) color = mix(pick(o.haftColors, wrapRank.get(i)! * 0.5), 0x000000, 0.35);
    else color = pick(o.haftColors, 0.5 + woodRank.get(i)! * 0.5);
    return { idx, color };
  });
  const edge = verts.filter((v) => v[2] > zMax * 0.85);
  return {
    meshes: [baseMesh({ verts, faces })],
    head: [0, -o.haft, 0],
    edgeTop: edge.reduce((a, v) => (v[1] > a[1] ? v : a)),
    edgeBottom: edge.reduce((a, v) => (v[1] < a[1] ? v : a)),
  };
}

/** 斧頭面上的一點（給 trellisHead 的 paint 決定顏色）：y、z 是遊戲座標；side = 刃在 +Z（1）或 -Z（-1）；
 * e = 離斧柄多遠（0 = 套筒、1 = 刃緣，同一個角度上的比例）；u = 高度（-1 往柄尾、1 往斧頭頂）；q = 底稿明暗的名次 */
export interface HeadPoint { y: number; z: number; side: 1 | -1; e: number; u: number; q: number }
export interface TrellisHeadOptions {
  size: number;
  haft: number;
  /** 刃（+Z）與背面（-Z）的形狀；背面 nub = 小凸塊、spike = 尖錐、none = 只留套筒 */
  front: HeadShape;
  back: HeadShape | 'nub' | 'spike';
  /** 斧頭高度倍率（橘 / 紅的斧刃比一般的高） */
  tall?: number;
  /** 厚度倍率 */
  thick?: number;
  colors: Tones;
  /** 依位置換色（回傳 undefined = 用 colors 依明暗取色） */
  paint?: (p: HeadPoint) => number | undefined;
}

/**
 * 橘 / 紅斧的斧頭（只有斧頭與套筒，斧柄與裝飾由 StyledAxes 畫）：TRELLIS 底稿的斧頭依 front / back 變形。
 * 回傳 rim(side, n) = 刃緣上平均分布的 n 個點（由柄尾往斧頭頂；放牙齒、火焰尖用），
 * surface(y, z) = 該處刃面的半厚（把寶石、刻痕貼在刃面上用），top = 斧頭頂（套筒最遠處）的 y。
 */
export function trellisHead(o: TrellisHeadOptions): {
  mesh: Mesh;
  rim: (side: 1 | -1, n: number, from?: number, to?: number) => { p: V3; out: [number, number] }[];
  surface: (y: number, z: number) => number;
  inside: (y: number, z: number, margin?: number) => boolean;
  /** 套筒中心（刃緣距離的原點），side 那一面 */
  center: (side: 1 | -1) => [number, number];
  top: number;
  edgeTop: V3;
  edgeBottom: V3;
} {
  const k = o.size / REACH;
  const tall = o.tall ?? 1;
  const Y = -o.haft;
  const thick = (o.thick ?? 1) * 0.8;
  const src = P.verts.map((v) => [v[0]!, v[1]!, v[2]!] as V3);
  const verts = src.map(([x, y, z]): V3 => {
    const side = x >= 0 ? 1 : -1;
    const s = side > 0 ? o.front : o.back;
    const a0 = Math.abs(x), u0 = (y - HEAD_C) / HEAD_H;
    const [a, u] = s === 'nub' || s === 'spike' ? backShape(s === 'spike', a0, u0) : bladeShape(s, a0, u0);
    return [z * k * thick, Y - u * HEAD_H * k * tall, side * a * k];
  });
  const keep = P.faces.map((f) => (src[f[0]!]![1] + src[f[1]!]![1] + src[f[2]!]![1]) / 3 >= HEAD_Y0);
  // 每個角度的刃緣距離（以套筒中心為原點、兩面分開算）
  const zc = SOCKET * k;
  const BINS = 36;
  const polar = (y: number, z: number, side: 1 | -1) => {
    const dz = side * z - zc, dy = Y - y;
    return { r: Math.hypot(dz, dy), t: Math.atan2(dy, Math.max(dz, 1e-6)) };
  };
  const bin = (t: number) => Math.min(BINS - 1, Math.max(0, Math.floor(((t + Math.PI / 2) / Math.PI) * BINS)));
  const rimR = { 1: new Array<number>(BINS).fill(0), [-1]: new Array<number>(BINS).fill(0) } as Record<1 | -1, number[]>;
  verts.forEach((v, i) => {
    if (src[i]![1] < HEAD_Y0) return;
    const side = v[2] >= 0 ? 1 : -1;
    const { r, t } = polar(v[1], v[2], side);
    const b = bin(t);
    if (r > rimR[side][b]!) rimR[side][b] = r;
  });
  const order = P.faces.map((f, i) => [lum(f[3]!), i] as const).filter(([, i]) => keep[i]).sort((a, b) => a[0] - b[0]);
  const q = new Map(order.map(([, i], n) => [i, order.length > 1 ? n / (order.length - 1) : 0.5]));
  const faces: Mesh['faces'] = [];
  P.faces.forEach((f, i) => {
    if (!keep[i]) return;
    const idx: V3 = [f[0]!, f[1]!, f[2]!];
    const c = idx.map((j) => verts[j]!);
    const y = (c[0]![1] + c[1]![1] + c[2]![1]) / 3, z = (c[0]![2] + c[1]![2] + c[2]![2]) / 3;
    const side: 1 | -1 = z >= 0 ? 1 : -1;
    const { r, t } = polar(y, z, side);
    const e = Math.min(1, r / Math.max(1e-6, rimR[side][bin(t)]!));
    const point: HeadPoint = { y, z, side, e, u: (Y - y) / (HEAD_H * k * tall), q: q.get(i)! };
    faces.push({ idx, color: o.paint?.(point) ?? pick(o.colors, point.q) });
  });
  // 刃緣：每個角度的距離前後平滑兩次，再沿角度內插，弧線才不會一格一格鋸齒
  const smoothRim = (side: 1 | -1) => {
    // 太靠近套筒的角度（刃尖勾回來的內側）不算刃緣
    const far = Math.max(...rimR[side]);
    const ok = rimR[side].map((r) => r > Math.max(zc * 1.6, far * 0.55));
    let r = rimR[side].slice();
    for (let pass = 0; pass < 2; pass++)
      r = r.map((v, b) => {
        if (!ok[b]) return v;
        const l = ok[b - 1] ? r[b - 1]! : v, h = ok[b + 1] ? r[b + 1]! : v;
        return (l + 2 * v + h) / 4;
      });
    return { r, bins: r.map((_, b) => b).filter((b) => ok[b]) };
  };
  const smoothed = { 1: smoothRim(1), [-1]: smoothRim(-1) } as Record<1 | -1, ReturnType<typeof smoothRim>>;
  /** 沿刃緣第 x 個有效角度（可帶小數）的半徑與角度 */
  const rimAt = (side: 1 | -1, x: number) => {
    const { r, bins } = smoothed[side];
    const lo = Math.max(0, Math.min(bins.length - 1, Math.floor(x))), hi = Math.min(bins.length - 1, lo + 1);
    const f = x - lo;
    return { R: r[bins[lo]!]! + (r[bins[hi]!]! - r[bins[lo]!]!) * f, t: ((bins[lo]! + (bins[hi]! - bins[lo]!) * f + 0.5) / BINS) * Math.PI - Math.PI / 2 };
  };
  const rim = (side: 1 | -1, n: number, from = 0, to = 1) => {
    const { bins } = smoothed[side];
    if (bins.length < 2) return [];
    return Array.from({ length: n }, (_, i) => {
      const f = from + ((to - from) * (n > 1 ? i : 0.5)) / Math.max(1, n - 1);
      const { R, t } = rimAt(side, f * (bins.length - 1));
      const p: V3 = [0, Y - R * Math.sin(t), side * (zc + R * Math.cos(t))];
      return { p, out: [-Math.sin(t), side * Math.cos(t)] as [number, number] };
    });
  };
  /** (y, z) 在刃面內、離刃緣還有 margin 的比例 */
  const inside = (y: number, z: number, margin = 0.9) => {
    const side: 1 | -1 = z >= 0 ? 1 : -1;
    const { r, t } = polar(y, z, side);
    const b = bin(t);
    const { r: rs, bins } = smoothed[side];
    if (r < zc * 1.2) return true;
    if (!bins.includes(b)) return r < rimR[side][b]! * margin;
    return r < rs[b]! * margin;
  };
  /** 刃面在 (y, z) 的半厚：找投影包住這點的三角面，內插出 x（兩面取較厚的） */
  const tris = faces.map((f) => f.idx.map((j) => verts[j]!) as [V3, V3, V3]);
  const surface = (y: number, z: number) => {
    let best = 0;
    for (const [p0, p1, p2] of tris) {
      const d = (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p2[1] - p0[1]) * (p1[2] - p0[2]);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((y - p0[1]) * (p2[2] - p0[2]) - (p2[1] - p0[1]) * (z - p0[2])) / d;
      const l2 = ((p1[1] - p0[1]) * (z - p0[2]) - (y - p0[1]) * (p1[2] - p0[2])) / d;
      if (l1 < -0.01 || l2 < -0.01 || l1 + l2 > 1.01) continue;
      const x = Math.abs(p0[0] + (p1[0] - p0[0]) * l1 + (p2[0] - p0[0]) * l2);
      if (x > best) best = x;
    }
    return best;
  };
  const front = verts.filter((v, i) => src[i]![1] >= HEAD_Y0 && v[2] > 0);
  const zMax = Math.max(...front.map((v) => v[2]));
  const edge = front.filter((v) => v[2] > zMax * 0.85);
  const socketTop = Math.min(...verts.filter((v, i) => src[i]![1] >= HEAD_Y0 && Math.abs(v[2]) < zc).map((v) => v[1]));
  // 只留斧頭用到的頂點（斧柄那段由 StyledAxes 畫）
  const used = [...new Set(faces.flatMap((f) => f.idx))].sort((a, b) => a - b);
  const remap = new Map(used.map((j, n) => [j, n]));
  return {
    mesh: baseMesh({ verts: used.map((j) => verts[j]!), faces: faces.map((f) => ({ ...f, idx: f.idx.map((j) => remap.get(j)!) as V3 })) }),
    rim,
    surface,
    inside,
    center: (side) => [Y, side * zc],
    top: socketTop,
    edgeTop: edge.reduce((a, v) => (v[1] > a[1] ? v : a)),
    edgeBottom: edge.reduce((a, v) => (v[1] < a[1] ? v : a)),
  };
}

/** 平貼在刃面上的細帶（x 是刃面高度、寬度在 Y-Z 平面上），一整條連續、不會翻轉 */
export function ribbon(pts: V3[], w: number, th: number, colors: Tones, seed = 0): Mesh {
  const verts: V3[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dy, dz) || 1;
    const ny = -dz / L, nz = dy / L;
    // 兩端收細一點
    const k = i === 0 || i === pts.length - 1 ? 0.6 : 1;
    for (const dx of [th, -th]) for (const sd of [1, -1]) verts.push([p[0] + dx, p[1] + ny * w * k * sd, p[2] + nz * w * k * sd]);
  });
  const faces: Mesh['faces'] = [];
  const v = (i: number, j: number) => i * 4 + j;
  const mid = (i: number): V3 => [(pts[i]![0] + pts[i + 1]![0]) / 2, (pts[i]![1] + pts[i + 1]![1]) / 2, (pts[i]![2] + pts[i + 1]![2]) / 2];
  // 每一面朝外：側面以那一段的中點為準、端面以往內一點為準（整條彎的時候不能用整體的中心）
  const add = (idx: number[], color: number, ref: V3) => {
    const fc = idx.reduce<V3>((acc, j) => [acc[0] + verts[j]![0] / idx.length, acc[1] + verts[j]![1] / idx.length, acc[2] + verts[j]![2] / idx.length], [0, 0, 0]);
    const nn = faceNormal(verts, idx);
    if (nn[0] * (fc[0] - ref[0]) + nn[1] * (fc[1] - ref[1]) + nn[2] * (fc[2] - ref[2]) < 0) idx.reverse();
    faces.push({ idx, color });
  };
  const side = colors[1] ?? colors[0]!;
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const m = mid(i);
    add([v(i, 0), v(i, 1), v(i + 1, 1), v(i + 1, 0)], colors[0]!, m);
    add([v(i, 2), v(i + 1, 2), v(i + 1, 3), v(i, 3)], colors[0]!, m);
    add([v(i, 0), v(i + 1, 0), v(i + 1, 2), v(i, 2)], side, m);
    add([v(i, 1), v(i, 3), v(i + 1, 3), v(i + 1, 1)], side, m);
  }
  add([v(0, 0), v(0, 2), v(0, 3), v(0, 1)], side, mid(0));
  add([v(n, 0), v(n, 1), v(n, 3), v(n, 2)], side, mid(n - 1));
  return baseMesh(tone({ verts, faces }, colors, seed));
}
