import type { Mesh, V3 } from '../Poly3D';
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

/** 斧刃變形：a = 離斧柄中心線的距離、u = 相對斧頭中心的高度（-1～1），回傳變形後的 [a, u] */
function shape(o: AxeOptions, front: boolean, a: number, u: number): [number, number] {
  const d = Math.min(1, Math.max(0, (a - SOCKET) / (REACH - SOCKET)));
  const W = REACH - SOCKET;
  if (a <= SOCKET) return [a, u];
  if (!front && !TWO_SIDED.has(o.head)) {
    // 背面：有尖刺時收成往外的長尖錐，沒有時縮成套筒上的小凸塊
    return o.spike ? [SOCKET + (a - SOCKET) * 0.75, u * (1 - 0.9 * d)] : [SOCKET + (a - SOCKET) * 0.18, u * 0.5];
  }
  switch (o.head) {
    case 'single':
      // 樸素的小刃：刃寬、刃高都收一點
      return [SOCKET + (a - SOCKET) * 0.85, u * 0.85];
    case 'crescent': {
      // 大弧刃：上下刃尖往外張得很開，再往斧柄勾回來
      const hook = Math.max(0, Math.abs(u) - 0.6) * Math.max(0, d - 0.5) * W * 0.9;
      return [a - hook, u * (1 + 1.1 * d * d)];
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
    default:
      return [a, u];
  }
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
