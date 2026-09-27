import { detail, tone } from '../Facets';
import { lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';

/**
 * 武器零件（手上的武器模型）：色階、兩點之間的錐形段（任意方向），以及劍身、護手、柄頭、
 * 斧頭、弓臂、杖頭等可組合的零件。每個零件都是凸多面體（彎曲的形狀用多段組成）。
 *
 * 座標（握點空間）：握點在原點；劍、斧、杖沿 -Y 伸出（杖頭在 -Y 端），劍身的寬面在 Y-Z 平面、
 * 刃朝 ±Z；弓沿 ±Y 伸出、弓臂往 +Z 彎。WeaponLooks 再依種類轉到手上的角度。
 */

export type Tones = readonly number[];

// ─────────────────────────── 色階（亮 / 中 / 暗 / 中） ───────────────────────────

export const IRON: Tones = [0xa7adb2, 0x8b9197, 0x6c7278, 0x979da3];
export const STEEL: Tones = [0xe8ecf0, 0xc4cad2, 0x8e96a0, 0xb0b8c2];
export const DARK_STEEL: Tones = [0x6d747c, 0x555b63, 0x3a3f46, 0x60666e];
export const BLACK_STEEL: Tones = [0x4a4e56, 0x363a41, 0x24272c, 0x40444b];
export const BLOOD_STEEL: Tones = [0xb04850, 0x8a2e36, 0x5c1a20, 0x9c3a42];
export const ANCIENT: Tones = [0xd8c89a, 0xb8a676, 0x8c7c52, 0xc8b686];
export const ABYSS: Tones = [0x5a4478, 0x43315e, 0x2a1d3c, 0x4e3a6a];
export const ICE: Tones = [0xe4f6ff, 0xb4e2f8, 0x7cbfe0, 0xcaeafa];
export const CRIMSON: Tones = [0xe0505a, 0xb82c38, 0x7a1822, 0xcc3c48];
export const EMBER: Tones = [0xffc070, 0xf08a3a, 0xb8541e, 0xf8a456];
export const STORM: Tones = [0xbfd4ff, 0x8aa8f0, 0x5a74c0, 0xa4bef8];
export const VOID: Tones = [0x3c2a5c, 0x281a44, 0x160e28, 0x33244f];
export const JADE: Tones = [0x9fe0b0, 0x6cc088, 0x3e8a5c, 0x86d09c];
export const SHADOW: Tones = [0x4a4a5e, 0x35354a, 0x202030, 0x404054];
export const STAR: Tones = [0xfff4d0, 0xf0dca0, 0xc8b070, 0xf8e8b8];
export const BONE: Tones = [0xe8dcc0, 0xcfc0a0, 0xa89878, 0xdccfb0];
export const GOLD: Tones = [0xe0bc60, 0xc8a048, 0xa88438, 0xd4ae54];
export const SILVER: Tones = [0xe6e8ec, 0xc8ccd2, 0x9aa0a8, 0xd8dce2];
export const BRONZE: Tones = [0xc28a48, 0xa8733a, 0x8c5d2c, 0xb67e40];
export const LEATHER: Tones = [0x4a3029, 0x3f2923, 0x352320];
export const RED_LEATHER: Tones = [0x7a2228, 0x641f24, 0x932c33];
export const WOOD: Tones = [0x7d5836, 0x6b4a2e, 0x5a3d25, 0x745232];
export const DARK_WOOD: Tones = [0x4a3322, 0x3e2a1c, 0x2f2016, 0x44301f];
export const PALE_WOOD: Tones = [0xb89a6c, 0xa0845a, 0x86704a, 0xac8f62];

// ─────────────────────────── 基本形狀 ───────────────────────────

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * 從 a 到 b 的錐形段：n 邊形截面，起點半徑 r0、終點半徑 r1（[X 方向, Z 方向]）。
 * phase = 0 時四邊形為菱形截面（劍身），其他為方形。
 */
export function taper(a: V3, b: V3, r0: [number, number], r1: [number, number], colors: Tones, sides = 4, seed = 0, phase = 0): Mesh {
  const d = sub(b, a);
  const len = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const m = prism(sides, 0, len, r0, r1, colors[0]!, [0, 0, 0], phase);
  const x = Math.acos(Math.max(-1, Math.min(1, d[1] / len)));
  const y = Math.hypot(d[0], d[2]) < 1e-6 ? 0 : Math.atan2(d[0], d[2]);
  return tone(placeMesh(m, [x, y, 0], a), colors, seed);
}

/** 菱形截面的刃段：四個側面依序 亮 / 中 / 暗 / 中（看得出楔形） */
export function edge(a: V3, b: V3, r0: [number, number], r1: [number, number], colors: Tones): Mesh {
  const m = taper(a, b, r0, r1, colors, 4, 0, 0);
  const sides = [colors[0], colors[1], colors[2], colors[3] ?? colors[1], colors[1], colors[1]];
  m.faces.forEach((f, i) => (f.color = sides[i] ?? colors[1]!));
  return m;
}

/** 寶石 / 球（低面數球） */
export const gem = (r: number, c: V3, color: number, scale: V3 = [1, 1, 1], lon = 6, lat = 4): Mesh => {
  const light = lighten(color, 0.35);
  const dark = darken(color, 0.3);
  return tone(lowSphere(r, color, c, lon, lat, scale), [light, color, dark, color]);
};

export function lighten(color: number, k: number): number {
  const c = (s: number) => Math.min(255, Math.round(((color >> s) & 0xff) + (255 - ((color >> s) & 0xff)) * k));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

export function darken(color: number, k: number): number {
  const c = (s: number) => Math.round(((color >> s) & 0xff) * (1 - k));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** 沿一條折線放置錐形段（半徑從 r0 漸變到 r1）：彎刀、弓臂、彎曲的杖頭 */
export function chain(points: readonly V3[], r0: [number, number], r1: [number, number], colors: Tones, diamond = true): Mesh[] {
  const n = points.length - 1;
  const lerp = (t: number): [number, number] => [r0[0] + (r1[0] - r0[0]) * t, r0[1] + (r1[1] - r0[1]) * t];
  return points.slice(0, -1).map((p, i) => {
    const a = lerp(i / n);
    const b = lerp((i + 1) / n);
    return diamond ? edge(p, points[i + 1]!, a, b, colors) : taper(p, points[i + 1]!, a, b, colors, 6, i, Math.PI / 6);
  });
}

// ─────────────────────────── 劍 ───────────────────────────

export type BladeShape = 'straight' | 'broad' | 'curved' | 'flame' | 'serrated' | 'crystal' | 'rift' | 'leaf';

export interface BladeOptions {
  shape: BladeShape;
  /** 劍身長度（不含劍尖） */
  length: number;
  /** 劍身半寬（刃到刃的一半） */
  width: number;
  colors: Tones;
  /** 劍身從 y = start 開始（護手下方） */
  start?: number;
  /** 彎刀：刃尖往 +Z 偏移的量 */
  curve?: number;
  /** 血槽（中線的顏色） */
  fuller?: number;
  /** 沿劍身的符文（發光小方塊）顏色 */
  runes?: number;
}

/** 劍身：回傳網格與劍尖位置 */
export function blade(o: BladeOptions): { meshes: Mesh[]; tip: V3 } {
  const s = o.start ?? -2.4;
  const L = o.length;
  const w = o.width;
  const t = 0.26 * Math.max(1, w / 1.3);
  const meshes: Mesh[] = [];
  let tip: V3;
  switch (o.shape) {
    case 'curved':
    case 'leaf': {
      const n = 5;
      const pts: V3[] = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const z = o.shape === 'curved' ? (o.curve ?? 3) * k * k : 0;
        pts.push([0, s - L * k, z]);
      }
      const widths = o.shape === 'leaf' ? [0.8, 1.05, 1.2, 1.1, 0.8, 0.5] : [1, 1, 0.98, 0.94, 0.88, 0.8];
      for (let i = 0; i < n; i++) meshes.push(edge(pts[i]!, pts[i + 1]!, [t, w * widths[i]!], [t * 0.95, w * widths[i + 1]!], o.colors));
      const end = pts[n]!;
      tip = [0, end[1] - 3.2, end[2] + (o.shape === 'curved' ? (o.curve ?? 3) * 0.35 : 0)];
      meshes.push(edge(end, tip, [t * 0.9, w * widths[n]!], [0.03, 0.05], o.colors));
      break;
    }
    case 'flame': {
      const n = 6;
      let prev: V3 = [0, s, 0];
      for (let i = 1; i <= n; i++) {
        const next: V3 = [0, s - (L * i) / n, i === n ? 0 : (i % 2 ? 1 : -1) * w * 0.35];
        meshes.push(edge(prev, next, [t, w * (1 - (i - 1) * 0.04)], [t, w * (1 - i * 0.04)], o.colors));
        prev = next;
      }
      tip = [0, prev[1] - 3.4, 0];
      meshes.push(edge(prev, tip, [t, w * 0.76], [0.03, 0.05], o.colors));
      break;
    }
    case 'crystal': {
      // 分段的水晶：每段之間留一點縫，最後一段是長尖
      const n = 4;
      const seg = L / n;
      for (let i = 0; i < n; i++) {
        const y0 = s - i * seg - 0.3;
        const y1 = y0 - seg + 0.6;
        meshes.push(edge([0, y0, 0], [0, (y0 + y1) / 2, 0], [t * 0.6, w * 0.7], [t * 1.3, w * 1.05], o.colors), edge([0, (y0 + y1) / 2, 0], [0, y1, 0], [t * 1.3, w * 1.05], [t * 0.6, w * 0.7], o.colors));
      }
      tip = [0, s - L - 3.6, 0];
      meshes.push(edge([0, s - L, 0], tip, [t, w * 0.8], [0.03, 0.04], o.colors));
      break;
    }
    case 'rift': {
      // 兩片平行的刃，中間裂開（裂縫由光芒填滿）
      for (const side of [1, -1]) {
        meshes.push(edge([0, s, side * w * 0.55], [0, s - L, side * w * 0.45], [t, w * 0.42], [t, w * 0.36], o.colors));
        meshes.push(edge([0, s - L, side * w * 0.45], [0, s - L - 3, side * w * 0.12], [t, w * 0.36], [0.03, 0.05], o.colors));
      }
      tip = [0, s - L - 3, 0];
      break;
    }
    default: {
      const broad = o.shape === 'broad';
      meshes.push(edge([0, s, 0], [0, s - L, 0], [t, w], [t * 0.9, w * (broad ? 0.95 : 0.85)], o.colors));
      tip = [0, s - L - (broad ? 2.4 : 3.4), 0];
      meshes.push(edge([0, s - L, 0], tip, [t * 0.9, w * (broad ? 0.95 : 0.85)], [0.03, 0.05], o.colors));
      if (o.shape === 'serrated') {
        // 背刃的鋸齒
        for (let i = 1; i <= 5; i++) {
          const y = s - (L * i) / 6;
          meshes.push(taper([0, y, -w * 0.8], [0, y + 0.6, -w * 1.45], [t * 0.8, 0.7], [0.05, 0.05], o.colors, 4, i, 0));
        }
      }
    }
  }
  if (o.fuller !== undefined) meshes.push(...detail(1, [taper([0, s - 0.6, 0], [0, s - L * 0.78, 0], [t * 1.25, 0.22], [t * 1.25, 0.14], [o.fuller, darken(o.fuller, 0.2)], 4, 0, 0)]));
  if (o.runes !== undefined) {
    for (let i = 0; i < 4; i++) {
      const y = s - 2 - (i * (L - 5)) / 3;
      meshes.push(...detail(1, [taper([0, y, 0], [0, y - 1.1, 0], [t * 1.3, 0.35], [t * 1.3, 0.35], [o.runes, lighten(o.runes, 0.3)], 4, i, Math.PI / 4)]));
    }
  }
  return { meshes, tip };
}

export type GuardShape = 'bar' | 'upturned' | 'wings' | 'crescent' | 'disc' | 'thorns' | 'claws';

/** 護手（y ≈ -1.8，往 ±Z 伸出） */
export function guard(shape: GuardShape, width: number, colors: Tones): Mesh[] {
  const y = -1.8;
  const w = width;
  switch (shape) {
    case 'upturned':
      return [taper([0, y, -w * 0.6], [0, y, w * 0.6], [0.55, 0.6], [0.55, 0.6], colors, 4, 0, Math.PI / 4), taper([0, y, w * 0.55], [0, y + 1.6, w * 1.05], [0.5, 0.5], [0.2, 0.2], colors, 4, 1, Math.PI / 4), taper([0, y, -w * 0.55], [0, y + 1.6, -w * 1.05], [0.5, 0.5], [0.2, 0.2], colors, 4, 2, Math.PI / 4)];
    case 'wings':
      return [
        taper([0, y, -w * 0.4], [0, y, w * 0.4], [0.6, 0.7], [0.6, 0.7], colors, 4, 0, Math.PI / 4),
        ...[1, -1].flatMap((sd) => [taper([0, y, sd * w * 0.35], [0, y + 2.6, sd * w * 1.2], [0.5, 0.9], [0.25, 0.3], colors, 4, 1, 0), taper([0, y + 0.4, sd * w * 0.5], [0, y + 4.2, sd * w * 0.9], [0.4, 0.5], [0.05, 0.1], colors, 4, 2, 0)]),
      ];
    case 'crescent': {
      const pts = (sd: number): V3[] => [
        [0, y, 0],
        [0, y - 0.3, sd * w * 0.6],
        [0, y + 0.6, sd * w * 1.05],
        [0, y + 2.2, sd * w * 1.25],
      ];
      return [...chain(pts(1), [0.45, 0.7], [0.12, 0.2], colors), ...chain(pts(-1), [0.45, 0.7], [0.12, 0.2], colors)];
    }
    case 'disc':
      return [tone(prism(8, y + 0.5, y - 0.5, [w * 0.55, w * 0.55], [w * 0.55, w * 0.55], colors[0]!), colors)];
    case 'thorns':
      return [taper([0, y, -w * 0.5], [0, y, w * 0.5], [0.6, 0.7], [0.6, 0.7], colors, 4, 0, Math.PI / 4), ...[1, -1].flatMap((sd) => [taper([0, y, sd * w * 0.45], [0, y - 2.2, sd * w * 1.1], [0.45, 0.45], [0.04, 0.04], colors, 4, 1, 0), taper([0, y, sd * w * 0.4], [0, y + 1.8, sd * w * 0.9], [0.4, 0.4], [0.04, 0.04], colors, 4, 2, 0)])];
    case 'claws':
      return [taper([0, y, -w * 0.45], [0, y, w * 0.45], [0.7, 0.7], [0.7, 0.7], colors, 4, 0, Math.PI / 4), ...[1, -1].flatMap((sd) => chain([[0, y, sd * w * 0.4], [0, y - 1.2, sd * w * 0.95], [0, y - 3.2, sd * w * 1.05]], [0.5, 0.6], [0.05, 0.08], colors))];
    default:
      return [taper([0, y, -w * 0.62], [0, y, w * 0.62], [0.5, 0.55], [0.5, 0.55], colors, 4, 0, Math.PI / 4)];
  }
}

export type PommelShape = 'ball' | 'gem' | 'spike' | 'ring' | 'skull';

/** 握把與柄頭（握把 y 2.7 → -1.3，柄頭在 y ≈ 3.4） */
export function hilt(pommel: PommelShape, grip: Tones, metal: Tones, gemColor?: number): Mesh[] {
  const meshes: Mesh[] = [tone(prism(6, 2.7, -1.3, [0.6, 0.6], [0.62, 0.62], grip[0]!), grip)];
  meshes.push(...detail(1, [1.8, 0.2].map((y) => tone(prism(6, y + 0.25, y - 0.25, [0.72, 0.72], [0.72, 0.72], metal[2]!), metal))));
  switch (pommel) {
    case 'gem':
      meshes.push(tone(prism(6, 2.8, 3.3, [0.8, 0.8], [0.9, 0.9], metal[0]!), metal), gem(0.95, [0, 3.9, 0], gemColor ?? 0xd03040, [1, 1.2, 1]));
      break;
    case 'spike':
      meshes.push(taper([0, 2.7, 0], [0, 5.6, 0], [0.85, 0.85], [0.05, 0.05], metal, 4, 0, Math.PI / 4));
      break;
    case 'ring':
      meshes.push(...chain([[0, 2.8, 0], [0, 3.8, 1], [0, 4.8, 0], [0, 3.8, -1], [0, 2.8, 0]], [0.3, 0.3], [0.3, 0.3], metal, false));
      break;
    case 'skull':
      meshes.push(gem(1.25, [0, 3.9, 0], BONE[0]!, [1, 1.1, 1.1]), gem(0.3, [0.2, 4, 1.05], 0x201010), gem(0.3, [-0.2, 4, 1.05], 0x201010));
      break;
    default:
      meshes.push(tone(lowSphere(1, metal[0]!, [0, 3.4, 0], 6, 3), metal));
  }
  return meshes;
}

// ─────────────────────────── 斧 ───────────────────────────

export type AxeHead = 'single' | 'double' | 'crescent' | 'bearded' | 'cleaver' | 'fang';

export interface AxeOptions {
  head: AxeHead;
  /** 斧柄長度（握點往 -Y） */
  haft: number;
  /** 斧刃大小 */
  size: number;
  haftColors: Tones;
  headColors: Tones;
  /** 斧刃邊緣（亮面） */
  edgeColor?: number;
  /** 背面的尖刺 */
  spike?: boolean;
}

/** 斧：斧柄沿 -Y，斧頭在末端往 +Z（刃）伸出；回傳網格與斧頭中心、刃的上下端 */
export function axe(o: AxeOptions): { meshes: Mesh[]; head: V3; edgeTop: V3; edgeBottom: V3 } {
  const y = -o.haft;
  const s = o.size;
  const meshes: Mesh[] = [taper([0, 3, 0], [0, y - 1.4, 0], [0.62, 0.62], [0.55, 0.55], o.haftColors, 6, 0, Math.PI / 6)];
  meshes.push(...detail(1, [2.2, 0.6, -1].map((yy) => tone(prism(6, yy + 0.22, yy - 0.22, [0.74, 0.74], [0.74, 0.74], LEATHER[0]!), LEATHER))));
  // 斧頭的套筒
  meshes.push(taper([0, y + 1.4, 0], [0, y - 1.6, 0], [0.95, 0.95], [0.95, 0.95], o.headColors, 6, 1, Math.PI / 6));
  const bladeTo = (sd: number, k: number): Mesh[] => {
    const z = sd * s * k;
    switch (o.head) {
      case 'crescent':
        return chain(
          [
            [0, y + s * 0.9, sd * s * 0.55],
            [0, y + s * 0.55, z * 0.95],
            [0, y, z * 1.08],
            [0, y - s * 0.55, z * 0.95],
            [0, y - s * 0.9, sd * s * 0.55],
          ],
          [0.2, 0.55],
          [0.2, 0.55],
          o.headColors,
        ).concat([taper([0, y, 0], [0, y, sd * s * 0.62], [0.45, s * 0.35], [0.3, s * 0.6], o.headColors, 4, 2, Math.PI / 4)]);
      case 'bearded':
        return [taper([0, y + 0.3, 0], [0, y - s * 0.2, z], [0.4, s * 0.3], [0.18, s * 0.95], o.headColors, 4, 2, Math.PI / 4), taper([0, y - s * 0.4, z * 0.6], [0, y - s * 1.1, z * 0.75], [0.2, s * 0.25], [0.1, 0.1], o.headColors, 4, 3, Math.PI / 4)];
      case 'cleaver':
        return [taper([0, y + s * 0.4, 0], [0, y + s * 0.4, z * 1.1], [0.35, s * 0.2], [0.2, s * 0.2], o.headColors, 4, 2, Math.PI / 4), taper([0, y - s * 0.3, 0], [0, y - s * 0.3, z * 1.15], [0.35, s * 0.55], [0.18, s * 0.6], o.headColors, 4, 3, Math.PI / 4)];
      case 'fang':
        return chain(
          [
            [0, y + 0.4, 0],
            [0, y + s * 0.2, z * 0.6],
            [0, y - s * 0.3, z * 1],
            [0, y - s * 1.1, z * 0.8],
          ],
          [0.5, s * 0.45],
          [0.1, 0.12],
          o.headColors,
        );
      default:
        return [taper([0, y, 0], [0, y, z], [0.45, s * 0.32], [0.2, s * 0.8], o.headColors, 4, 2, Math.PI / 4)];
    }
  };
  meshes.push(...bladeTo(1, 1));
  if (o.head === 'double' || o.head === 'crescent') meshes.push(...bladeTo(-1, o.head === 'double' ? 1 : 0.85));
  else if (o.spike) meshes.push(taper([0, y, 0], [0, y + 0.3, -s * 0.9], [0.5, 0.55], [0.05, 0.05], o.headColors, 4, 4, Math.PI / 4));
  // 刃口亮面
  if (o.edgeColor !== undefined && o.head !== 'fang') meshes.push(...detail(1, [taper([0, y + s * 0.62, s * 1.02], [0, y - s * 0.62, s * 1.02], [0.12, 0.18], [0.12, 0.18], [o.edgeColor], 4, 0, Math.PI / 4)]));
  // 斧柄末端的尖刺
  meshes.push(taper([0, y - 1.6, 0], [0, y - 3.2, 0], [0.6, 0.6], [0.05, 0.05], o.headColors, 4, 5, Math.PI / 4));
  return { meshes, head: [0, y, s * 0.5], edgeTop: [0, y + s * 0.8, s], edgeBottom: [0, y - s * 0.8, s] };
}

// ─────────────────────────── 弓 ───────────────────────────

export interface BowOptions {
  /** 弓臂長度（握點到弓梢） */
  length: number;
  /** 弓臂往 +Z 彎的深度 */
  bend: number;
  /** 反曲：弓梢往回翹的量 */
  recurve?: number;
  thickness: number;
  colors: Tones;
  grip: Tones;
  string?: number;
  /** 弓梢的刃 / 裝飾 */
  tips?: 'blade' | 'hook' | 'wing' | 'orb';
  tipColors?: Tones;
}

/** 弓：沿 ±Y 的兩片弓臂、弓弦（直線），回傳網格與上下弓梢 */
export function bow(o: BowOptions): { meshes: Mesh[]; top: V3; bottom: V3 } {
  const L = o.length;
  const b = o.bend;
  const r = o.recurve ?? 0;
  const limb = (sd: 1 | -1): { meshes: Mesh[]; tip: V3 } => {
    const pts: V3[] = [
      [0, sd * 2.2, b * 0.25],
      [0, sd * L * 0.4, b * 0.85],
      [0, sd * L * 0.72, b],
      [0, sd * L * 0.92, b * 0.7 - r * 0.3],
      [0, sd * L, b * 0.35 - r],
    ];
    return { meshes: chain(pts, [o.thickness * 0.6, o.thickness], [o.thickness * 0.35, o.thickness * 0.45], o.colors, false), tip: pts[pts.length - 1]! };
  };
  const up = limb(1);
  const down = limb(-1);
  const meshes: Mesh[] = [...up.meshes, ...down.meshes, taper([0, 2.6, b * 0.2], [0, -2.6, b * 0.2], [0.75, 0.9], [0.75, 0.9], o.grip, 6, 0, Math.PI / 6)];
  meshes.push(taper(up.tip, down.tip, [0.07, 0.07], [0.07, 0.07], [o.string ?? 0xe8e0c8], 4, 0, Math.PI / 4));
  const tc = o.tipColors ?? o.colors;
  for (const [tip, sd] of [
    [up.tip, 1],
    [down.tip, -1],
  ] as const) {
    if (o.tips === 'blade') meshes.push(edge(tip, [0, tip[1] + sd * 3.4, tip[2] + 1.6], [0.2, 0.8], [0.03, 0.04], tc));
    else if (o.tips === 'hook') meshes.push(...chain([tip, [0, tip[1] + sd * 1.6, tip[2] + 1.2], [0, tip[1] + sd * 2.2, tip[2] + 2.6]], [0.35, 0.4], [0.05, 0.05], tc, false));
    else if (o.tips === 'wing') meshes.push(taper(tip, [0, tip[1] + sd * 1.2, tip[2] - 3.4], [0.2, 1.2], [0.05, 0.2], tc, 4, 1, 0), taper(tip, [0, tip[1] + sd * 2.6, tip[2] - 1.8], [0.2, 0.9], [0.05, 0.15], tc, 4, 2, 0));
    else if (o.tips === 'orb') meshes.push(gem(0.9, [0, tip[1] + sd * 0.6, tip[2]], tc[0]!));
  }
  return { meshes, top: up.tip, bottom: down.tip };
}

// ─────────────────────────── 杖 ───────────────────────────

export type StaffHead = 'knob' | 'orb' | 'crystal' | 'rune' | 'skull' | 'prongs' | 'crescent' | 'ring' | 'cluster';

export interface StaffOptions {
  head: StaffHead;
  /** 杖頭距握點的長度（-Y 方向） */
  length: number;
  /** 握點往 +Y 的尾端長度 */
  butt: number;
  shaft: Tones;
  metal: Tones;
  /** 寶珠 / 水晶的顏色 */
  focus: number;
  /** 杖身纏繞的裝飾 */
  bands?: boolean;
}

/** 法杖：杖身沿 Y（杖頭在 -Y），回傳網格與杖頭中心（光芒聚焦點） */
export function staff(o: StaffOptions): { meshes: Mesh[]; focus: V3 } {
  const y = -o.length;
  const meshes: Mesh[] = [taper([0, o.butt, 0], [0, y + 1, 0], [0.5, 0.5], [0.62, 0.62], o.shaft, 6, 0, Math.PI / 6)];
  meshes.push(taper([0, o.butt, 0], [0, o.butt + 1.4, 0], [0.55, 0.55], [0.1, 0.1], o.metal, 4, 1, Math.PI / 4));
  if (o.bands) meshes.push(...detail(1, [0.4, 0.3, 0.55, 0.8].map((k, i) => tone(prism(6, y * k + 0.25, y * k - 0.25, [0.72, 0.72], [0.72, 0.72], o.metal[i % 2]!), o.metal))));
  const fy = y - 2.4;
  const f: V3 = [0, fy, 0];
  const fc = o.focus;
  const collar = taper([0, y + 1, 0], [0, y - 0.6, 0], [0.8, 0.8], [1.1, 1.1], o.metal, 6, 2, Math.PI / 6);
  switch (o.head) {
    case 'orb':
      meshes.push(collar, gem(1.7, f, fc, [1, 1, 1], 8, 5), ...[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return taper([Math.cos(a) * 0.8, y - 0.4, Math.sin(a) * 0.8], [Math.cos(a) * 1.7, fy - 1.6, Math.sin(a) * 1.7], [0.28, 0.28], [0.08, 0.08], o.metal, 4, i, Math.PI / 4);
      }));
      break;
    case 'crystal':
      meshes.push(collar, edge([0, y - 0.4, 0], [0, fy + 0.4, 0], [0.5, 0.5], [1, 1.1], [lighten(fc, 0.3), fc, darken(fc, 0.3), fc]), edge([0, fy + 0.4, 0], [0, fy - 3.4, 0], [1, 1.1], [0.05, 0.05], [lighten(fc, 0.3), fc, darken(fc, 0.3), fc]));
      break;
    case 'cluster':
      meshes.push(collar, ...[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        const len = i % 2 ? 3.2 : 4.4;
        return edge([Math.cos(a) * 0.4, y - 0.6, Math.sin(a) * 0.4], [Math.cos(a) * 1.5, y - 0.6 - len, Math.sin(a) * 1.5], [0.5, 0.5], [0.04, 0.04], [lighten(fc, 0.3), fc, darken(fc, 0.3), fc]);
      }));
      break;
    case 'rune':
      meshes.push(collar, tone(prism(6, y - 0.4, y - 4.6, [1.3, 1.3], [0.9, 0.9], o.metal[0]!), o.metal), ...[0, 1, 2].map((i) => gem(0.35, [Math.cos((i / 3) * Math.PI * 2) * 1.2, y - 2.5, Math.sin((i / 3) * Math.PI * 2) * 1.2], fc)));
      break;
    case 'skull':
      meshes.push(collar, gem(1.6, [0, fy, 0.2], BONE[0]!, [1, 1.1, 1.15]), gem(0.4, [0.55, fy + 0.2, 1.5], fc), gem(0.4, [-0.55, fy + 0.2, 1.5], fc), ...[1, -1].map((sd) => taper([sd * 1.2, fy - 0.6, -0.2], [sd * 2.4, fy - 2.4, -0.6], [0.35, 0.35], [0.05, 0.05], BONE, 4, 0, Math.PI / 4)));
      break;
    case 'prongs':
      meshes.push(collar, gem(1.3, f, fc), ...[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const out: V3 = [Math.cos(a) * 2, fy + 0.2, Math.sin(a) * 2];
        return chain([[Math.cos(a) * 0.7, y - 0.4, Math.sin(a) * 0.7], out, [Math.cos(a) * 1.1, fy - 2.4, Math.sin(a) * 1.1]], [0.3, 0.3], [0.08, 0.08], o.metal, false);
      }).flat());
      break;
    case 'crescent':
      meshes.push(collar, gem(1, [0, fy + 0.4, 0], fc), ...chain([[0, y - 0.3, 1.2], [0, fy + 0.5, 2.6], [0, fy - 2, 2.2], [0, fy - 3.4, 0.4]], [0.35, 0.6], [0.06, 0.1], o.metal), ...chain([[0, y - 0.3, -1.2], [0, fy + 0.5, -2.6], [0, fy - 2, -2.2], [0, fy - 3.4, -0.4]], [0.35, 0.6], [0.06, 0.1], o.metal));
      break;
    case 'ring': {
      const ring: V3[] = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return [0, fy + Math.cos(a) * 2.6, Math.sin(a) * 2.6];
      });
      meshes.push(collar, ...chain(ring, [0.32, 0.32], [0.32, 0.32], o.metal, false), gem(1.1, f, fc));
      break;
    }
    default:
      meshes.push(tone(lowSphere(1.3, o.shaft[0]!, [0, y - 0.6, 0], 6, 4, [1, 1.2, 1]), o.shaft));
  }
  return { meshes, focus: o.head === 'knob' ? [0, y - 0.6, 0] : f };
}
