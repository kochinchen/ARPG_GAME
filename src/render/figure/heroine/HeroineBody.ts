import { bar, detail, loft, tone } from '../Facets';
import { box, lowSphere, placeMesh, prism, type Mesh } from '../Poly3D';
import { EYE, HAIR_DEEP, LIP, SHIRT, SKIN, SKIN_SHADOW } from './HeroinePalette';

/**
 * 女主角的身體（皮膚與白色上衣）：每個部位由多層截面的放樣體組成，
 * 各面交錯色階（正面 / 側面 / 陰影面 / 亮面），比例約 6.3 頭身。
 * 座標：Y 向上、Z 為前方、+X 為角色左手邊。各函式的原點為所屬關節。
 */

/** 頭（head 關節，原點在頸部上端）：頭骨、臉的各個平面（額頭、太陽穴、雙頰、鼻、下顎、下巴）、眼、眉、唇 */
export function heroineHead(): Mesh[] {
  return [
    tone(lowSphere(4.2, SKIN[0], [0, 5, -0.2], 8, 5, [0.9, 1.05, 1]), SKIN, 1),
    // 額頭（上半被瀏海蓋住）
    tone(placeMesh(box(4.4, 1.8, 1.2, SKIN[0]), [-0.3, 0, 0], [0, 6.7, 2.9]), SKIN, 2),
    // 下半臉：往下巴收窄、往前突出的放樣體（jaw + chin）
    loft(
      [
        { y: 4.4, rx: 3.5, rz: 3.2, cz: 0.3 },
        { y: 2.6, rx: 3, rz: 2.9, cz: 0.7 },
        { y: 1.1, rx: 1.8, rz: 2.1, cz: 1.4 },
        { y: 0.3, rx: 0.9, rz: 1.1, cz: 2.1 },
      ],
      8,
      SKIN,
      3,
    ),
    // 雙頰（往外斜的平面）
    tone(placeMesh(box(2.3, 2.4, 1.2, SKIN[0]), [0.1, 0.55, 0], [1.8, 4.3, 3.3]), SKIN, 4),
    tone(placeMesh(box(2.3, 2.4, 1.2, SKIN[0]), [0.1, -0.55, 0], [-1.8, 4.3, 3.3]), SKIN, 5),
    // 太陽穴、眼窩的陰影面
    ...detail(1, [
      tone(placeMesh(box(0.6, 1.8, 2, SKIN[3]), [0, 0.5, 0], [2.9, 5.6, 2.2]), SKIN, 6),
      tone(placeMesh(box(0.6, 1.8, 2, SKIN[3]), [0, -0.5, 0], [-2.9, 5.6, 2.2]), SKIN, 7),
      box(1.5, 0.9, 0.6, SKIN_SHADOW[0], [1.45, 5.5, 3.75]),
      box(1.5, 0.9, 0.6, SKIN_SHADOW[0], [-1.45, 5.5, 3.75]),
      // 鼻：三角楔形
      bar([0, 5.6, 4], [0, 4.1, 4.65], 0.75, 0.85, SKIN, 8),
    ]),
    // 放大時才畫：眼睛（只是暗色的一小塊）、眉、唇
    ...detail(2, [
      box(1.1, 0.5, 0.5, EYE, [1.45, 5.45, 4.05]),
      box(1.1, 0.5, 0.5, EYE, [-1.45, 5.45, 4.05]),
      bar([0.6, 6.4, 4.1], [2.4, 6.6, 3.5], 0.45, 0.35, HAIR_DEEP),
      bar([-0.6, 6.4, 4.1], [-2.4, 6.5, 3.5], 0.45, 0.35, HAIR_DEEP),
      box(1.5, 0.45, 0.5, LIP, [0, 2.6, 4.1]),
    ]),
  ];
}

/** 頸（neck 關節） */
export const heroineNeck = (): Mesh[] => [
  loft(
    [
      { y: -0.4, rx: 2, rz: 1.9 },
      { y: 3, rx: 1.75, rz: 1.7, cz: 0.2 },
    ],
    7,
    SKIN,
    1,
  ),
];

/** 胸（chest 關節，0～10.6）：白色內衣（胸廓往上變寬到肩膀）與胸部的體積 */
export function heroineChest(): Mesh[] {
  return [
    loft(
      [
        { y: 0, rx: 4.5, rz: 3.2 },
        { y: 2.5, rx: 5, rz: 3.6 },
        { y: 5.2, rx: 5.5, rz: 3.9, cz: 0.2 },
        { y: 8.2, rx: 5.9, rz: 3.7 },
        { y: 10.2, rx: 4.2, rz: 3, cz: -0.3 },
      ],
      8,
      SHIRT,
      1,
    ),
    tone(lowSphere(2.3, SHIRT[0], [1.9, 5.2, 2.6], 6, 4, [1, 0.85, 0.75]), SHIRT, 2),
    tone(lowSphere(2.3, SHIRT[0], [-1.9, 5.2, 2.6], 6, 4, [1, 0.85, 0.75]), SHIRT, 3),
  ];
}

/** 腰（torso 關節，0～6.4）：露出的腰身（分成上下兩段，腰部收窄但不誇張） */
export function heroineWaist(): Mesh[] {
  return [
    loft(
      [
        { y: -0.2, rx: 4.9, rz: 3.6 },
        { y: 3, rx: 4.3, rz: 3.2, cz: 0.1 },
      ],
      8,
      SKIN,
      1,
    ),
    loft(
      [
        { y: 3, rx: 4.3, rz: 3.2, cz: 0.1 },
        { y: 6.6, rx: 4.6, rz: 3.3 },
      ],
      8,
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
      { y: 0.8, rx: 1.9, rz: 1.9 },
      { y: -2.5, rx: 2.1, rz: 2 },
      { y: -6, rx: 1.8, rz: 1.75 },
      { y: -10, rx: 1.5, rz: 1.45 },
    ],
    7,
    SKIN,
    seed,
  ),
];

/** 前臂（肘到腕）：靠肘處較粗、往手腕收細 */
export const heroineForearm = (seed: number): Mesh[] => [
  loft(
    [
      { y: 0.5, rx: 1.5, rz: 1.45 },
      { y: -3, rx: 1.65, rz: 1.55 },
      { y: -8.8, rx: 1.1, rz: 1.05 },
    ],
    7,
    SKIN,
    seed,
  ),
];

/** 大腿（髖到膝）：正面、外側、內側的陰影面 */
export const heroineThigh = (seed: number): Mesh[] => [
  loft(
    [
      { y: 0.8, rx: 3, rz: 3.1, cz: 0.2 },
      { y: -4, rx: 2.95, rz: 3, cz: 0.3 },
      { y: -9, rx: 2.35, rz: 2.45, cz: 0.2 },
      { y: -13, rx: 1.8, rz: 1.9 },
    ],
    7,
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
