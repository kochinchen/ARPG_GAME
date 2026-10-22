import { detail, loft, tone } from '../Facets';
import { box, lowSphere, placeMesh, prism, type Mesh } from '../Poly3D';
import { HAIR, HAIR_DEEP, SCARF } from './HeroinePalette';

/**
 * 頭髮與圍巾：髮頂、一束一束的瀏海、垂到胸前的兩側長鬢髮、後腦、紅髮帶與四段馬尾（每段是有亮 / 中 / 暗面的漸細多角體）；
 * 紅色短圍巾（繞頸一圈 + 前方的三角摺 + 兩條尾巴）。
 * 馬尾與圍巾尾巴的每一段都是獨立關節，由 PolyFigure 的次級運動延遲跟隨（慣性）。
 */

/** 瀏海的每一束：X 位置、長度、左右傾斜 */
const BANGS: [number, number, number][] = [
  [-2.6, 3.8, -0.45],
  [-1.4, 3, -0.3],
  [0, 2.6, 0.1],
  [1.3, 3, 0.3],
  [2.6, 3.8, 0.45],
];

/** 頭上的頭髮（head 關節） */
export function heroineHairOnHead(): Mesh[] {
  return [
    // hairCap：頭頂與後腦，前下方留出臉
    tone(lowSphere(4.75, HAIR[0], [0, 5.6, -0.6], 14, 8, [0.97, 1.02, 1.05], (c) => c[1] > 1.3 || c[2] < -0.9), HAIR, 1),
    // rearHair：後頸
    tone(placeMesh(prism(6, 0, -4.2, [3.6, 1.6], [2.8, 1.2], HAIR_DEEP[0]), [-0.2, 0, 0], [0, 5.4, -3.9]), [...HAIR_DEEP, HAIR[0]], 2),
    // 瀏海：一束一束往兩側撥開（中間短、露出眉眼），尾端收尖
    ...BANGS.map(([x, len, roll], i) => tone(placeMesh(prism(4, 0, -len, [0.95, 0.35], [0.08, 0.08], HAIR[i % 2]!), [-0.25, 0, roll], [x, 9.9, 3.3 - Math.abs(x) * 0.35]), HAIR, 3 + i)),
    // 兩側長鬢髮：貼著臉頰垂到胸前，尾端收尖
    ...[1, -1].map((s, i) => tone(placeMesh(prism(5, 0, -9.5, [0.95, 0.55], [0.15, 0.15], HAIR[i]!), [-0.05, 0, 0.06 * s], [3.45 * s, 8.2, 1.3]), HAIR, 10 + i)),
    ...detail(1, [tone(placeMesh(prism(4, 0, -3.4, [1.2, 0.4], [0.3, 0.3], HAIR[3]), [0.2, 0, -0.9], [2.8, 10.4, 1.6]), HAIR, 7)]),
  ];
}

/** 馬尾根部（ponytail 關節，在頭頂後方）：紅髮帶、隆起的髮束、第一段 */
export function ponytailRoot(): Mesh[] {
  return [
    tone(prism(8, 0.7, -0.7, [1.6, 1.6], [1.6, 1.6], SCARF[0]), SCARF, 1),
    ...detail(1, [box(0.9, 2.6, 0.4, SCARF[2], [0.8, -1.4, -1.6]), box(0.8, 2, 0.4, SCARF[0], [-0.6, -1.2, -1.7])]),
    tone(lowSphere(1.8, HAIR[1], [0, 0.8, 0.6], 10, 6, [1, 0.6, 1]), HAIR, 2),
    ponytailSegment(2, 2.6, 2.1, 6, 3),
  ];
}

/** 馬尾的一段（沿 -Y、長 len）：r0 → 中段 rMid → r1 的漸細多角體 */
export function ponytailSegment(r0: number, rMid: number, r1: number, len: number, seed: number): Mesh {
  return loft(
    [
      { y: 0.4, rx: r0, rz: r0 * 0.85 },
      { y: -len * 0.45, rx: rMid, rz: rMid * 0.85 },
      { y: -len, rx: r1, rz: r1 * 0.85 },
    ],
    12,
    HAIR,
    seed,
  );
}

/** 馬尾尖端：收成尖、旁邊兩撮分叉 */
export function ponytailTip(): Mesh[] {
  return [
    loft(
      [
        { y: 0.4, rx: 1.3, rz: 1.1 },
        { y: -5.6, rx: 0.15, rz: 0.15, cx: 0.2 },
      ],
      12,
      HAIR,
      5,
    ),
    ...detail(1, [
      tone(placeMesh(prism(4, 0, -3.2, [0.5, 0.4], [0.05, 0.05], HAIR[1]), [0, 0, 0.3], [0.6, -2.2, 0]), HAIR, 6),
      tone(placeMesh(prism(4, 0, -2.8, [0.45, 0.4], [0.05, 0.05], HAIR[0]), [0.2, 0, -0.35], [-0.5, -2.4, 0.2]), HAIR, 7),
    ]),
  ];
}

/** 圍巾繞頸的部分（chest 關節）：一圈紅布 + 前方往下的三角摺 */
export function scarfWrap(): Mesh[] {
  return [
    loft(
      [
        { y: 9.4, rx: 3.9, rz: 3.4, cz: -0.2 },
        { y: 11.8, rx: 3.3, rz: 2.9, cz: -0.4 },
      ],
      8,
      SCARF,
      1,
    ),
    tone(placeMesh(prism(3, 0, -3.2, [1.8, 0.5], [0.2, 0.2], SCARF[1], [0, 0, 0], Math.PI / 2), [0.15, 0, 0.1], [0.6, 10, 3.2]), SCARF, 2),
    ...detail(1, [tone(placeMesh(prism(3, 0, -2.2, [1.3, 0.4], [0.15, 0.15], SCARF[2], [0, 0, 0], Math.PI / 2), [0.2, 0, -0.35], [-1.2, 10, 3]), SCARF, 3)]),
  ];
}

/** 圍巾尾巴的一段（沿 -Y）：寬 w0 → w1；tip = 最後一段收成三角尖 */
export const scarfTail = (len: number, w0: number, w1: number, seed: number): Mesh[] => [tone(prism(4, 0.3, -len, [w0, 0.3], [w1, 0.3], SCARF[0]), SCARF, seed)];
