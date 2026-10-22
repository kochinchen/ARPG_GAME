import { bar, detail, facetize, loft, tone } from '../Facets';
import { box, lowSphere, placeMesh, prism, stretchMeshes, type Mesh } from '../Poly3D';
import { EYE, EYE_SHINE, EYE_WHITE, HAIR, IRIS, IRIS_DEEP, LIP, LIP_LOWER, PUPIL, SHIRT, SKIN, SKIN_SHADOW } from './HeroinePalette';

/**
 * 女主角的身體（皮膚與白色上衣）：每個部位由多層截面的放樣體組成，
 * 各面交錯色階（正面 / 側面 / 陰影面 / 亮面），比例約 7.3 頭身（頭較小、腿很長）。
 * 座標：Y 向上、Z 為前方、+X 為角色左手邊。各函式的原點為所屬關節。
 */

/** 頭（含頭髮、頭盔）的縮放：頭小一點，身材比例較修長 */
export const HEAD_SCALE = 0.92;
export const scaleHead = (meshes: Mesh[]): Mesh[] => stretchMeshes(meshes, [HEAD_SCALE, HEAD_SCALE, HEAD_SCALE]);
/** 上臂、前臂長（肩到肘、肘到腕） */
export const UPPER_ARM_LENGTH = 10.8;
export const FOREARM_LENGTH = 9.6;

/** 左右對稱的零件：s = 1 為角色左邊（+X）、-1 為右邊 */
const mirror = (f: (s: 1 | -1) => Mesh[]): Mesh[] => [...f(1), ...f(-1)];

/**
 * 頭（head 關節，原點在頸部上端）：半寫實的美型臉。頭骨、額頭、顴骨、蛋形下顎與窄下巴；
 * 杏仁形大眼（眼白、藍色虹膜、瞳孔、高光、上揚的上眼線）、細弧眉、挺而小的鼻子、飽滿的上下唇
 */
export function heroineHead(): Mesh[] {
  return [
    facetize(tone(lowSphere(4.2, SKIN[0], [0, 5, -0.2], 14, 8, [0.88, 1.05, 1]), SKIN, 1), 0.1, 1),
    // 額頭（上半被瀏海蓋住）
    facetize(tone(placeMesh(box(4.4, 1.8, 1.2, SKIN[0]), [-0.3, 0, 0], [0, 6.7, 2.9]), SKIN, 2), 0.18, 2),
    // 下半臉：蛋形，往窄下巴收（jaw + chin）
    loft(
      [
        { y: 4.4, rx: 3.4, rz: 3.2, cz: 0.3 },
        { y: 2.8, rx: 2.8, rz: 2.9, cz: 0.75 },
        { y: 1.4, rx: 1.6, rz: 2, cz: 1.45 },
        { y: 0.6, rx: 0.8, rz: 1, cz: 2.1 },
      ],
      20,
      SKIN,
      3,
    ),
    // 顴骨
    ...mirror((s) => [facetize(tone(placeMesh(box(2.1, 1.9, 1.1, SKIN[0]), [0.1, 0.55 * s, 0], [1.75 * s, 4.4, 3.25]), SKIN, 4 + (s > 0 ? 0 : 1)), 0.2, 4)]),
    // 太陽穴、放眼睛的平面
    ...detail(1, [
      ...mirror((s) => [
        tone(placeMesh(box(0.6, 1.8, 2, SKIN[3]), [0, 0.5 * s, 0], [2.85 * s, 5.5, 2.2]), SKIN, 6),
        tone(box(1.8, 1.3, 0.6, SKIN[0], [1.4 * s, 5.3, 3.75]), SKIN, 7),
      ]),
      // 鼻：挺而小的三角楔形
      bar([0, 5.35, 3.98], [0, 4.2, 4.48], 0.45, 0.5, SKIN, 8),
    ]),
    // 放大時才畫：眼、眉、唇
    ...detail(2, [
      ...mirror((s) => [
        box(1.4, 0.88, 0.2, EYE_WHITE, [1.4 * s, 5.3, 4.1]),
        // 虹膜：上緣深、下面淺；瞳孔與高光
        box(0.68, 0.32, 0.12, IRIS_DEEP, [1.33 * s, 5.56, 4.23]),
        box(0.68, 0.52, 0.12, IRIS, [1.33 * s, 5.15, 4.22]),
        box(0.3, 0.42, 0.08, PUPIL, [1.33 * s, 5.3, 4.3]),
        box(0.18, 0.18, 0.06, EYE_SHINE, [1.16 * s, 5.5, 4.34]),
        // 上眼線：內眼角 → 外眼角，尾端上揚；下眼瞼的淡陰影
        bar([0.66 * s, 5.7, 4.24], [2.14 * s, 5.8, 3.98], 0.2, 0.2, [EYE]),
        bar([2.1 * s, 5.78, 3.98], [2.52 * s, 5.98, 3.7], 0.14, 0.12, [EYE]),
        bar([0.95 * s, 4.84, 4.2], [1.95 * s, 4.87, 4.05], 0.1, 0.08, [SKIN_SHADOW[0]]),
        // 細弧眉：眉頭 → 眉峰 → 眉尾
        bar([0.7 * s, 6.3, 3.95], [1.6 * s, 6.55, 3.88], 0.2, 0.14, HAIR),
        bar([1.6 * s, 6.55, 3.88], [2.45 * s, 6.4, 3.55], 0.16, 0.11, HAIR),
      ]),
      box(1.15, 0.26, 0.34, LIP, [0, 2.92, 3.8]),
      box(1, 0.36, 0.38, LIP_LOWER, [0, 2.6, 3.76]),
    ]),
  ];
}

/** 頸（neck 關節） */
export const heroineNeck = (): Mesh[] => [
  loft(
    [
      { y: -0.4, rx: 1.8, rz: 1.75 },
      { y: 3, rx: 1.5, rz: 1.5, cz: 0.2 },
    ],
    14,
    SKIN,
    1,
  ),
];

/** 胸（chest 關節，0～10.6）：白色內衣（胸廓往上變寬到肩膀）與豐滿的胸部 */
export function heroineChest(): Mesh[] {
  return [
    loft(
      [
        { y: 0, rx: 4.1, rz: 3 },
        { y: 2.5, rx: 5, rz: 3.6 },
        { y: 5.2, rx: 5.5, rz: 3.9, cz: 0.2 },
        { y: 8.2, rx: 5.9, rz: 3.7 },
        { y: 10.2, rx: 4.2, rz: 3, cz: -0.3 },
      ],
      16,
      SHIRT,
      1,
    ),
    // 胸部：往前明顯隆起（上緣較平、下緣較圓）
    facetize(tone(lowSphere(3.05, SHIRT[0], [2, 5.1, 3.3], 11, 7, [1, 0.95, 0.9]), SHIRT, 2), 0.08, 2),
    facetize(tone(lowSphere(3.05, SHIRT[0], [-2, 5.1, 3.3], 11, 7, [1, 0.95, 0.9]), SHIRT, 3), 0.08, 3),
  ];
}

/** 腰（torso 關節，0～6.4）：露出的腰身（分成上下兩段，腰部明顯收窄成沙漏形） */
export function heroineWaist(): Mesh[] {
  return [
    loft(
      [
        { y: -0.2, rx: 4.9, rz: 3.6 },
        { y: 3, rx: 3.35, rz: 2.75, cz: 0.1 },
      ],
      16,
      SKIN,
      1,
    ),
    loft(
      [
        { y: 3, rx: 3.35, rz: 2.75, cz: 0.1 },
        { y: 6.6, rx: 4.1, rz: 3.05 },
      ],
      16,
      SKIN,
      2,
    ),
    ...detail(2, [box(0.5, 0.8, 0.4, SKIN_SHADOW[0], [0, 1.6, 3.55])]),
  ];
}

/** 上臂（肩到肘）：三角肌的隆起往下收 */
export const heroineUpperArm = (seed: number): Mesh[] => [
  loft(
    [
      { y: 0.8, rx: 1.8, rz: 1.8 },
      { y: -2.5, rx: 1.9, rz: 1.85 },
      { y: -6.4, rx: 1.6, rz: 1.55 },
      { y: -UPPER_ARM_LENGTH, rx: 1.35, rz: 1.3 },
    ],
    14,
    SKIN,
    seed,
  ),
];

/** 前臂（肘到腕）：靠肘處較粗、往手腕收細 */
export const heroineForearm = (seed: number): Mesh[] => [
  loft(
    [
      { y: 0.5, rx: 1.38, rz: 1.34 },
      { y: -3, rx: 1.5, rz: 1.42 },
      { y: -FOREARM_LENGTH + 0.2, rx: 0.98, rz: 0.94 },
    ],
    14,
    SKIN,
    seed,
  ),
];

/** 大腿長（髖到膝）、小腿長（膝到腳踝）：長腿，腿長超過身高一半 */
export const THIGH_LENGTH = 15.6;
export const SHIN_LENGTH = 14.2;
/** 靴筒原本是照 12.6 長的小腿做的：沿 Y 拉長到新的小腿長 */
export const BOOT_STRETCH = SHIN_LENGTH / 12.6;

/** 大腿（髖到膝）：正面、外側、內側的陰影面 */
export const heroineThigh = (seed: number): Mesh[] => [
  loft(
    [
      { y: 0.8, rx: 3.2, rz: 3.15, cz: 0.2 },
      { y: -4.8, rx: 3.05, rz: 3, cz: 0.35 },
      { y: -10.8, rx: 2.35, rz: 2.45, cz: 0.2 },
      { y: -THIGH_LENGTH, rx: 1.8, rz: 1.9 },
    ],
    14,
    SKIN,
    seed,
  ),
];

/** 手（皮手套）：right = 握劍（手指包住握把），否則為半握 */
export function heroineHand(right: boolean, colors: readonly number[]): Mesh[] {
  const palm = tone(box(2.5, 2.8, 1.5, colors[0]!, [0, -1.6, 0.1]), colors, 1);
  if (right) {
    return [
      palm,
      ...[-0.75, 0, 0.75].map((x, i) => bar([x, -2.4, 0.7], [x, -3.4, 1.4], 0.75, 0.8, colors, i)),
      ...detail(1, [bar([1.1, -1.4, 0.8], [0.6, -2.3, 1.8], 0.7, 0.7, colors, 4)]),
    ];
  }
  return [palm, ...[-0.75, 0, 0.75].map((x, i) => bar([x, -2.8, 0.2], [x * 1.1, -4.4, 0.9], 0.7, 0.7, colors, i)), ...detail(1, [prism(5, -0.9, -2.6, [0.5, 0.5], [0.4, 0.4], colors[0]!, [1.3, 0, 0.6])])];
}
