import { seg, spike } from '../Creatures';
import { facetize, tone } from '../Facets';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import type { Side } from './BossRig';

/**
 * 魔王共用零件（全部是多切面：先 tone 輕微色差、再 facetize 細分成小三角面）：
 * 分層肩甲、板甲上臂 / 前臂 / 護手、可動的手指與拇指、鐵靴與靴尖、腿甲片、破爛披風。
 */

/** 材質色：主色、次色（輕微色差）、暗色、邊緣亮色、尖刺色 */
export interface Metal {
  plate: number;
  alt: number;
  dark: number;
  edge: number;
  spike: number;
}

/** 多邊形面、輕微色差（bump 參數保留給需要細分的大零件：見 FF） */
export const F = (m: Mesh, colors: readonly number[], seed = 0, _bump = 0): Mesh => tone(m, colors, seed);
/** 大零件：再細分成小三角面（每個面從中心微微隆起） */
export const FF = (m: Mesh, colors: readonly number[], seed = 0, bump = 0.12): Mesh => facetize(tone(m, colors, seed), bump, seed);
export const FS = (a: V3, b: V3, r: number, color: number, seed = 0): Mesh => F(spike(a, b, r, color), [color], seed, 0.1);
/** 鉚釘 */
export const rivet = (c: V3, r: number, color: number, seed = 0): Mesh => tone(lowSphere(r, color, c, 5, 3), [color], seed);
export const FSeg = (a: V3, b: V3, r0: number, r1: number, colors: readonly number[], seed = 0, n = 8): Mesh => F(seg(a, b, r0, r1, colors[0]!, n), colors, seed, 0.1);

/** 分層肩甲（ex_pad 關節）：四片由大到小往下疊、邊緣亮條、兩根尖刺、鉚釘 */
export function pauldron(side: Side, c: Metal, size = 1): Mesh[] {
  const k = size;
  const lame = (r0: number, r1: number, h: number, x: number, y: number, tilt: number, color: number, seed: number) =>
    F(placeMesh(prism(10, 0, -h * k, [r0 * k, r0 * k * 0.92], [r1 * k, r1 * k * 0.92], color), [0, 0, tilt * side], [x * k * side, y * k, 0]), [color, c.alt], seed, 0.1);
  return [
    lame(5.4, 5.9, 3.6, 1, 2.4, 0.35, c.plate, 1),
    lame(5, 5.4, 3, 1.6, -0.8, 0.45, c.dark, 2),
    lame(4.4, 4.7, 2.4, 2, -3.2, 0.55, c.plate, 3),
    lame(3.8, 4, 1.8, 2.3, -5, 0.62, c.dark, 4),
    F(placeMesh(prism(10, 0, -0.8 * k, [5.95 * k, 5.5 * k], [6 * k, 5.5 * k], c.edge), [0, 0, 0.35 * side], [1 * k * side, -1.3 * k, 0]), [c.edge], 5, 0.05),
    FS([2.6 * k * side, 4.4 * k, 0], [5.8 * k * side, 9.4 * k, -1], 1.1 * k, c.spike, 6),
    FS([2.2 * k * side, 4.2 * k, 2.6 * k], [4.4 * k * side, 7.8 * k, 3.6 * k], 0.75 * k, c.spike, 7),
    ...[-2, 0, 2].map((z, i) => F(lowSphere(0.55 * k, c.edge, [3.6 * k * side, 2.6 * k, z * k], 5, 3), [c.edge], 8 + i, 0.05)),
  ];
}

/** 板甲上臂：臂筒 + 兩道環 */
export const plateUpperArm = (c: Metal, r = 2.8): Mesh[] => [
  F(prism(14, -1, -10, [r, r], [r * 0.9, r * 0.9], c.dark), [c.dark, c.plate], 1),
  F(prism(14, -4.5, -5.5, [r * 1.05, r * 1.05], [r * 1.05, r * 1.05], c.plate), [c.plate, c.alt], 2, 0.06),
  F(prism(14, -8, -8.8, [r * 0.97, r * 0.97], [r * 0.95, r * 0.95], c.edge), [c.edge], 3, 0.05),
  F(prism(14, -2, -2.8, [r * 1.02, r * 1.02], [r * 1.02, r * 1.02], c.dark), [c.dark], 4),
  ...[-1, 0, 1].map((k, i) => rivet([Math.sin(k * 0.7) * r * 1.05, -5, Math.cos(k * 0.7) * r * 1.05], 0.45, c.edge, 5 + i)),
];

/** 板甲前臂：肘甲（球 + 扇形護片）、護臂、手腕外翻邊、肘後尖刺 */
export const plateForearm = (c: Metal, r = 2.6): Mesh[] => [
  F(lowSphere(r * 1.12, c.plate, [0, 0, 0.4], 8, 5, [1, 1, 1.15]), [c.plate, c.alt], 1, 0.08),
  F(placeMesh(prism(5, 0, 1.6, [2.2, 2.2], [0.3, 0.3], c.dark, [0, 0, 0], 0), [-Math.PI / 2, 0, 0], [0, 0, r + 0.2]), [c.dark], 2, 0.1),
  F(prism(14, -1.2, -9, [r, r], [r * 1.18, r * 1.18], c.plate), [c.plate, c.alt], 3),
  F(prism(14, -7.2, -9, [r * 1.22, r * 1.22], [r * 1.27, r * 1.27], c.edge), [c.edge], 4, 0.06),
  FS([0, -3, -r], [0, -6, -r - 3], 0.8, c.spike, 5),
];

/** 護手掌（hand 關節）：手背板、腕環 */
export const gauntlet = (c: Metal): Mesh[] => [
  F(box(4.2, 3.2, 3.6, c.dark, [0, -1.6, 0]), [c.dark, c.plate], 1, 0.15),
  F(box(4.3, 1.2, 4.2, c.plate, [0, -0.1, 0]), [c.plate, c.alt], 2, 0.1),
  // 指節護片與腕部鉚釘
  ...[-1.35, -0.45, 0.45, 1.35].map((x, i) => F(box(1.1, 0.9, 1.3, c.edge, [x, -2.8, 1.5]), [c.edge], 3 + i)),
  rivet([1.6, -0.1, 2.1], 0.45, c.edge, 7),
  rivet([-1.6, -0.1, 2.1], 0.45, c.edge, 8),
];

/** 四根手指（ex_fingers 關節，可彎曲握拳）；claw = 指尖是利爪 */
export const fingers = (c: Metal, claw?: number): Mesh[] =>
  [-1.35, -0.45, 0.45, 1.35].flatMap((x, i) => [
    F(box(1, 2.2, 1.2, c.plate, [x, -1, 0]), [c.plate, c.alt], i, 0.12),
    ...(claw ? [FS([x, -2, 0.1], [x * 1.1, -5.4, 0.8], 0.5, claw, i + 5)] : [F(box(0.9, 1.4, 1.1, c.dark, [x, -2.7, 0.05]), [c.dark], i + 5, 0.1)]),
  ]);

/** 拇指（ex_thumb 關節） */
export const thumb = (c: Metal, claw?: number): Mesh[] => [
  F(box(1.1, 2, 1.1, c.plate, [0, -0.9, 0]), [c.plate], 1, 0.12),
  ...(claw ? [FS([0, -1.8, 0], [0, -4.2, 0.6], 0.45, claw, 2)] : []),
];

/** 板甲大腿（腿甲、膝上環） */
export const plateThigh = (c: Metal, r = 3.6): Mesh[] => [
  F(prism(14, 0, -12, [r, r], [r * 0.86, r * 0.86], c.plate), [c.plate, c.alt], 1),
  F(prism(14, -4, -5, [r * 1.03, r * 1.03], [r, r], c.edge), [c.edge], 2, 0.06),
  F(prism(14, -9, -9.8, [r * 0.93, r * 0.93], [r * 0.9, r * 0.9], c.dark), [c.dark], 3, 0.05),
  ...[-1, 0, 1].map((k, i) => rivet([Math.sin(k * 0.7) * r * 1.03, -4.5, Math.cos(k * 0.7) * r * 1.03], 0.5, c.edge, 4 + i)),
  F(box(1.4, 1.4, 0.8, c.edge, [0, -9.4, r * 0.95]), [c.edge], 7),
];

/** 板甲小腿：膝甲（球 + 扇形護片 + 尖刺）、脛甲、前緣稜線 */
export const plateShin = (c: Metal, r = 3.2): Mesh[] => [
  F(lowSphere(r, c.plate, [0, 0, 0.6], 8, 5, [1, 1, 1.15]), [c.plate, c.alt], 1, 0.08),
  F(placeMesh(prism(5, 0, 1.4, [2.6, 2.6], [0.3, 0.3], c.dark, [0, 0, 0], 0), [-Math.PI / 2, 0, 0], [0, 0, r + 0.6]), [c.dark], 2, 0.1),
  FS([0, 0.6, r], [0, 2.6, r + 3], 0.8, c.spike, 3),
  F(prism(14, -1.4, -12.5, [r, r * 1.06], [r * 0.87, r * 0.93], c.dark), [c.dark, c.plate], 4),
  F(box(1.6, 9, 1, c.edge, [0, -6.5, r]), [c.edge], 5, 0.08),
  ...[-4.5, -9].map((y, i) => F(prism(14, y + 0.4, y - 0.4, [r * 0.99, r * 1.05], [r * 0.97, r * 1.03], c.plate), [c.plate], 6 + i)),
  ...[-4.5, -9].map((y, i) => F(box(1.2, 1.2, 0.8, c.edge, [r * 0.8, y, r * 0.6]), [c.edge], 8 + i)),
];

/** 鐵靴（foot 關節）：腳背、腳跟、腳踝環 */
export const sabaton = (c: Metal): Mesh[] => [
  F(box(5, 3, 5, c.dark, [0, -1.4, 0.4]), [c.dark, c.plate], 1, 0.12),
  F(box(4.4, 1.6, 2.4, c.plate, [0, -1, -2.2]), [c.plate], 2, 0.12),
  F(prism(10, 0.6, -0.6, [3.3, 3.5], [3.4, 3.6], c.edge), [c.edge], 3, 0.05),
  // 腳背上一片片疊起的甲片
  ...[0, 1, 2].map((i) => F(placeMesh(prism(8, 0, -0.9, [2.5 - i * 0.15, 1.5], [2.6 - i * 0.15, 1.6], i % 2 ? c.plate : c.alt), [Math.PI / 2 - 0.35, 0, 0], [0, 0.2 - i * 0.7, 1 + i * 1.1]), [c.plate, c.alt], 4 + i)),
];

/** 靴尖（ex_toe 關節） */
export const toeCap = (c: Metal, spikeColor?: number): Mesh[] => [
  F(box(4.6, 2.2, 3.4, c.plate, [0, -0.2, 0.9]), [c.plate, c.alt], 1, 0.12),
  ...(spikeColor ? [FS([0, -0.2, 2.4], [0, -0.6, 4.8], 0.8, spikeColor, 2)] : []),
];

/** 腿甲片（ex_tasset 關節，掛在骨盆兩側）：兩片往下疊 */
export const tasset = (side: Side, c: Metal): Mesh[] => [
  F(placeMesh(box(1.4, 7, 6.6, c.plate), [0, 0, -0.18 * side], [0.6 * side, -3.4, 0]), [c.plate, c.alt], 1, 0.12),
  F(placeMesh(box(1.3, 4, 6.2, c.dark), [0, 0, -0.25 * side], [1.3 * side, -7.6, 0]), [c.dark], 2, 0.12),
];

/** 破爛披風：上段（ex_cape?1）與撕裂成尖角的下段（ex_cape?2） */
export const capeUpper = (col: -1 | 0 | 1, color: number, alt: number, width = 3.2): Mesh[] => [
  F(placeMesh(prism(4, 0.5, -11.3, [width, 0.5], [width * 1.12, 0.5], color), [0, col * -0.18, col * 0.08], [0, 0, 0]), [color, alt], 1 + col, 0.08),
];
export const capeLower = (col: -1 | 0 | 1, color: number, alt: number, width = 3.6): Mesh[] => [
  F(placeMesh(prism(4, 0.4, -7, [width, 0.5], [width * 1.05, 0.5], color), [0, col * -0.18, col * 0.1], [0, 0, 0]), [color, alt], 4 + col, 0.08),
  ...[-1, 0, 1].map((k) => F(placeMesh(prism(3, -7, -10.5 - Math.abs(k + col) * 0.8, [width * 0.35, 0.4], [0.05, 0.05], color), [0.05, col * -0.18, k * 0.08], [k * width * 0.62, 0, 0]), [color, alt], 7 + k, 0.08)),
];
