import { detail, loft, tone } from '../Facets';
import { lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { GOLD, HAIR, HAIR_DEEP, LEATHER_DARK } from './HeroinePalette';

/**
 * 頭髮（照設定圖）：深緋紅、髮量多。頭頂與後腦、往她左邊撥的側分長瀏海、垂到胸前的兩側長鬢髮、後頸，
 * 頭頂的高馬尾（皮革髮束 + 金環）一路垂到腰，每段外圍再加幾束粗髮絲，形成蓬鬆、一束一束的體積。
 * 馬尾的每一段都是獨立關節，由 PolyFigure 的次級運動延遲跟隨（慣性）。
 */

/** 瀏海的每一束：X 位置、長度、往她左邊（+X）傾斜的角度。從右側髮旋分開，越往左越長、越斜 */
const BANGS: [number, number, number][] = [
  [-2.8, 4.6, -0.3],
  [-1.6, 3.1, 0.12],
  [-0.4, 3.3, 0.32],
  [0.9, 3.7, 0.48],
  [2.1, 4.4, 0.58],
  [3.0, 5.3, 0.5],
];

/** 頭上的頭髮（head 關節） */
export function heroineHairOnHead(): Mesh[] {
  const lock = (x: number, y: number, z: number, len: number, w: number, rot: V3, i: number) =>
    tone(placeMesh(prism(5, 0, -len, [w, w * 0.6], [0.15, 0.15], HAIR[i % 3]!), rot, [x, y, z]), HAIR, 10 + i);
  return [
    // hairCap：頭頂與後腦，前下方留出臉（比頭骨大一圈：髮量多）
    tone(lowSphere(4.85, HAIR[0], [0, 5.7, -0.6], 14, 8, [0.98, 1.03, 1.06], (c) => c[1] > 1.3 || c[2] < -0.9), HAIR, 1),
    // rearHair：後頸
    tone(placeMesh(prism(6, 0, -4.4, [3.7, 1.7], [2.9, 1.3], HAIR_DEEP[0]), [-0.2, 0, 0], [0, 5.4, -3.9]), [...HAIR_DEEP, HAIR[0]], 2),
    // 側分瀏海：一束一束往她左邊撥，尾端收尖
    ...BANGS.map(([x, len, roll], i) => tone(placeMesh(prism(4, 0, -len, [1.05, 0.38], [0.08, 0.08], HAIR[i % 2]!), [-0.28, 0, roll], [x, 10, 3.3 - Math.abs(x) * 0.33]), HAIR, 3 + i)),
    // 兩側長鬢髮：貼著臉頰垂到胸前，外側再一束較細的
    lock(3.45, 8.2, 1.3, 10, 1.05, [-0.05, 0, 0.06], 0),
    lock(-3.45, 8.2, 1.3, 10.5, 1.05, [-0.05, 0, -0.06], 1),
    ...detail(1, [
      lock(3.7, 7.8, -0.2, 8.5, 0.8, [0.05, 0, 0.12], 2),
      lock(-3.7, 7.8, -0.2, 8, 0.8, [0.05, 0, -0.12], 3),
      // 分線旁隆起的髮束、往後梳向馬尾的髮流
      tone(placeMesh(prism(4, 0, -3.4, [1.2, 0.4], [0.3, 0.3], HAIR[3]), [0.2, 0, -0.9], [2.8, 10.4, 1.6]), HAIR, 7),
      ...[-1.6, 0, 1.6].map((x, i) => tone(placeMesh(prism(4, 0, -6, [0.9, 0.35], [0.5, 0.3], HAIR[(i + 1) % 3]!), [1.2, 0, x * 0.05], [x, 10.6, 1.8]), HAIR, 20 + i)),
    ]),
  ];
}

/** 馬尾根部（ponytail 關節，在頭頂後方）：皮革髮束與金環、隆起的髮束、第一段 */
export function ponytailRoot(): Mesh[] {
  return [
    tone(prism(8, 0.7, -0.7, [1.7, 1.7], [1.7, 1.7], LEATHER_DARK[0]), LEATHER_DARK, 1),
    ...detail(1, [tone(prism(8, 0.15, -0.15, [1.85, 1.85], [1.85, 1.85], GOLD[0]), GOLD, 1)]),
    tone(lowSphere(2.1, HAIR[1], [0, 0.9, 0.6], 10, 6, [1, 0.62, 1]), HAIR, 2),
    ...ponytailSegment(2.3, 3, 2.5, 6, 3),
  ];
}

/** 馬尾的一段（沿 -Y、長 len）：r0 → 中段 rMid → r1 的漸細多角體，外圍三束粗髮絲（蓬鬆的體積） */
export function ponytailSegment(r0: number, rMid: number, r1: number, len: number, seed: number): Mesh[] {
  return [
    loft(
      [
        { y: 0.4, rx: r0, rz: r0 * 0.85 },
        { y: -len * 0.45, rx: rMid, rz: rMid * 0.85 },
        { y: -len, rx: r1, rz: r1 * 0.85 },
      ],
      12,
      HAIR,
      seed,
    ),
    ...detail(
      1,
      [0.4, 2.5, 4.6].map((a, i) => {
        const r = rMid * 0.72;
        return tone(placeMesh(prism(5, 0, -len * 0.95, [rMid * 0.42, rMid * 0.3], [r1 * 0.2, r1 * 0.15], HAIR[(seed + i) % 4]!), [0, a, 0.12], [Math.sin(a) * r, 0.2, Math.cos(a) * r - 0.3]), HAIR, seed * 10 + i);
      }),
    ),
  ];
}

/** 馬尾尖端：收成尖、分成幾撮往外散開 */
export function ponytailTip(): Mesh[] {
  return [
    loft(
      [
        { y: 0.4, rx: 2.1, rz: 1.8 },
        { y: -3.5, rx: 1.3, rz: 1.1 },
        { y: -7, rx: 0.15, rz: 0.15, cx: 0.2 },
      ],
      12,
      HAIR,
      5,
    ),
    ...detail(1, [
      tone(placeMesh(prism(4, 0, -4.2, [0.7, 0.5], [0.05, 0.05], HAIR[1]), [0, 0, 0.35], [0.9, -2.6, 0]), HAIR, 6),
      tone(placeMesh(prism(4, 0, -3.8, [0.65, 0.5], [0.05, 0.05], HAIR[0]), [0.2, 0, -0.4], [-0.8, -2.8, 0.2]), HAIR, 7),
      tone(placeMesh(prism(4, 0, -3.4, [0.6, 0.45], [0.05, 0.05], HAIR[3]), [-0.35, 0, 0.1], [0.1, -3, -0.9]), HAIR, 8),
    ]),
  ];
}
