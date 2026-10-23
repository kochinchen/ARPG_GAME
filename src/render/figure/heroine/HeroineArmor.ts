import { bar, detail, facetize, loft, tone } from '../Facets';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { THIGH_LENGTH } from './HeroineBody';
import { BOOT, GOLD, LEATHER, LEATHER_DARK, METAL, METAL_DARK, RED_CLOTH, SKIRT } from './HeroinePalette';

/**
 * 女主角的皮甲與配件：胸下束腰皮甲、兩側皮甲、肩帶與斜背帶、腰帶（金扣）與小腰包、
 * 深色短褲與側邊裙片、紅色腰布（前 / 側 / 後，可擺動）、多片金屬肩甲、護腕、長靴（靴筒、護膝、脛甲、靴底）。
 */

// ─────────────────────────── 上半身 ───────────────────────────

/** 胸前皮甲（chest 關節）：胸下束腰皮帶（金扣）、兩側皮甲、從兩肩往胸前收成 V 字的皮帶與金環、背後的交叉帶 */
export function chestArmor(): Mesh[] {
  return [
    // 胸下的束腰皮帶
    loft(
      [
        { y: -0.3, rx: 4.3, rz: 3.2 },
        { y: 3.3, rx: 5.3, rz: 3.95, cz: 0.1 },
      ],
      16,
      LEATHER,
      1,
    ),
    tone(box(1.5, 1.3, 0.6, GOLD[0], [0, 1.5, 3.85]), GOLD, 2),
    // 兩側皮甲
    tone(placeMesh(box(1, 6.4, 4.4, LEATHER[1]), [0, 0, 0.08], [5.2, 5.4, -0.3]), LEATHER, 2),
    tone(placeMesh(box(1, 6.4, 4.4, LEATHER[1]), [0, 0, -0.08], [-5.2, 5.4, -0.3]), LEATHER, 3),
    // V 字皮帶：兩肩 → 胸口的金環；過肩往後接到背後
    bar([3.9, 10.2, 1], [1.1, 8.1, 3.95], 1.1, 0.5, LEATHER_DARK, 1),
    bar([-3.9, 10.2, 1], [-1.1, 8.1, 3.95], 1.1, 0.5, LEATHER_DARK, 2),
    bar([3.5, 10, 0.8], [3, 3.5, -3.5], 1.1, 0.5, LEATHER_DARK, 3),
    bar([-3.5, 10, 0.8], [-3, 3.5, -3.5], 1.1, 0.5, LEATHER_DARK, 4),
    // 胸口的金環（正面朝前）
    tone(placeMesh(prism(8, 0.3, -0.3, [0.95, 0.95], [0.95, 0.95], GOLD[1]), [Math.PI / 2, 0, 0], [0, 8, 4.05]), GOLD, 1),
    // 背後的交叉帶
    ...detail(1, [bar([-3, 9.2, -3.2], [3.4, 2, -3.7], 1, 0.5, LEATHER_DARK, 7)]),
  ];
}

/** 肩甲（upperArm 關節）：由大到小往下疊的三片有稜角的鋼板 + 上緣翻起的護頸邊 + 皮帶與金鉚釘 */
export function pauldron(side: 1 | -1): Mesh[] {
  const plate = (r0: number, r1: number, h: number, x: number, y: number, tilt: number, seed: number) =>
    facetize(tone(placeMesh(prism(14, 0, -h, [r0, r0 * 0.9], [r1, r1 * 0.9], METAL[0], [0, 0, 0], 0.3), [0, 0, -tilt * side], [x * side, y, 0]), METAL, seed), 0.16, seed);
  return [
    plate(2.7, 3.5, 2.4, 0.7, 1.8, 0.35, 1),
    plate(2.85, 3.3, 2, 1.3, -0.2, 0.5, 2),
    plate(2.5, 2.85, 1.8, 1.75, -2, 0.62, 3),
    ...detail(1, [
      tone(prism(16, -3, -4, [2.2, 2.1], [2.15, 2.05], LEATHER_DARK[0]), LEATHER_DARK, 4),
      facetize(tone(placeMesh(box(0.5, 1.4, 4.6, METAL[1]), [0, 0, -0.5 * side], [0.9 * side, 2.9, 0]), METAL, 5), 0.16, 5),
    ]),
    ...detail(2, [box(0.6, 0.6, 0.6, GOLD[0], [1.9 * side, 0.7, 2.4]), box(0.5, 0.5, 0.5, GOLD[0], [2.7 * side, -1, 2.1])]),
  ];
}

/** 護腕（forearm 關節）：皮革筒 + 兩條綁帶 + 外側金屬條 */
export const bracer = (side: 1 | -1): Mesh[] => [
  loft(
    [
      { y: -3.2, rx: 1.9, rz: 1.85 },
      { y: -8.9, rx: 1.5, rz: 1.45 },
    ],
    14,
    LEATHER,
    2,
  ),
  ...detail(1, [
    tone(prism(14, -4.3, -4.9, [1.95, 1.9], [1.9, 1.85], LEATHER_DARK[0]), LEATHER_DARK),
    tone(prism(14, -7.3, -7.9, [1.7, 1.65], [1.65, 1.6], LEATHER_DARK[0]), LEATHER_DARK),
    tone(box(0.5, 5, 1, METAL_DARK[0], [1.75 * side, -6, 0]), METAL_DARK),
  ]),
];

// ─────────────────────────── 腰部 ───────────────────────────

/**
 * 骨盆（root 關節）：深藍灰短褲與短裙片、兩條腰帶（水平的一條方形金扣、斜掛的一條在左胯有金扣）、
 * 兩側小腰包、左後腰橫掛的短劍
 */
export function pelvisArmor(): Mesh[] {
  const panel = (x: number, z: number, yaw: number, w: number, len: number, seed: number) =>
    tone(placeMesh(prism(4, 0, -len, [w, 0.3], [w * 1.15, 0.3], SKIRT[0]), [0, yaw, 0.18 * Math.sign(x || 1) * (z === 0 ? 1 : 0)], [x, 2.4, z]), SKIRT, seed);
  return [
    loft(
      [
        { y: -3.8, rx: 5.5, rz: 3.9 },
        { y: 0, rx: 6.3, rz: 4.15 },
        { y: 3.6, rx: 5, rz: 3.7 },
      ],
      16,
      SKIRT,
      1,
    ),
    // 臀部：往後、往上翹的兩個圓弧體積（短褲）
    facetize(tone(lowSphere(3.3, SKIRT[0], [2.5, -0.6, -2.75], 11, 7, [0.95, 0.9, 0.85]), SKIRT, 11), 0.08, 11),
    facetize(tone(lowSphere(3.3, SKIRT[0], [-2.5, -0.6, -2.75], 11, 7, [0.95, 0.9, 0.85]), SKIRT, 12), 0.08, 12),
    // 水平腰帶與方形金扣
    loft(
      [
        { y: 2.1, rx: 5.65, rz: 4.05 },
        { y: 3.9, rx: 5.3, rz: 3.9 },
      ],
      18,
      LEATHER_DARK,
      2,
    ),
    tone(box(2.2, 2, 0.8, GOLD[0], [0, 3, 4]), GOLD, 1),
    // 斜掛的第二條腰帶（右高左低）與左胯的金扣
    tone(placeMesh(prism(18, 0.55, -0.55, [6.05, 4.35], [6.05, 4.35], LEATHER[0]), [0.06, 0, 0.14], [0, 1, 0]), LEATHER, 5),
    tone(placeMesh(box(1.6, 1.5, 0.6, GOLD[0]), [0, 0.5, 0.14], [3.3, 0.6, 3.5]), GOLD, 3),
    // 兩側小腰包（含蓋片）
    tone(box(2.4, 2.8, 2, LEATHER[0], [-5.6, 0.8, 1.6]), LEATHER, 3),
    tone(box(2.1, 2.4, 1.8, LEATHER[0], [5.7, 0.2, -1]), LEATHER, 13),
    ...detail(1, [
      tone(box(2.6, 1, 2.2, LEATHER[1], [-5.6, 2.3, 1.6]), LEATHER, 4),
      tone(box(2.3, 0.9, 2, LEATHER[1], [5.7, 1.5, -1]), LEATHER, 14),
      bar([5.65, 2.4, 1.5], [6.15, -2.6, 1.8], 0.8, 0.5, LEATHER_DARK, 6),
    ]),
    ...dagger(),
    // 深藍灰短裙片：兩側、右前與後方
    panel(5.6, 0, Math.PI / 2, 2.4, 7, 7),
    panel(-5.6, 0, -Math.PI / 2, 2.2, 6.5, 8),
    tone(placeMesh(prism(4, 0, -6, [2.2, 0.3], [2.5, 0.3], SKIRT[1]), [0.05, -0.35, 0], [-3.1, 2.4, 3.7]), SKIRT, 10),
    tone(placeMesh(prism(4, 0, -7.5, [3, 0.3], [3.45, 0.3], SKIRT[0]), [-0.3, 0, 0], [0, 2.4, -4.6]), SKIRT, 9),
  ];
}

/** 左後腰的短劍：皮鞘、金護手、纏皮握把、柄頭（握把朝前上方，劍鞘往後下斜） */
function dagger(): Mesh[] {
  const at: V3 = [6.2, 0.6, -3];
  const rot: V3 = [0.5, 0, -0.35];
  const piece = (m: Mesh) => placeMesh(m, rot, at);
  return [
    piece(tone(prism(4, 0, -7, [0.75, 0.45], [0.35, 0.3], LEATHER_DARK[0], [0, 0, 0], 0), LEATHER_DARK, 1)),
    piece(tone(box(0.7, 0.6, 2.6, GOLD[0], [0, 0.3, 0]), GOLD, 2)),
    ...detail(1, [piece(tone(prism(6, 0.6, 3, [0.36, 0.36], [0.32, 0.32], LEATHER[2]), LEATHER, 3)), piece(tone(lowSphere(0.5, GOLD[1], [0, 3.3, 0], 6, 3), GOLD))]),
  ];
}

/** 紅色腰布前片（cloth 關節）：左前方一長片（垂到膝上）+ 左側一片，下緣撕裂成尖角 */
export function frontCloth(): Mesh[] {
  const flap = (x: number, z: number, yaw: number, w: number, len: number, tip: number, seed: number): Mesh[] => [
    tone(placeMesh(prism(4, 0, -len, [w, 0.3], [w * 0.9, 0.3], RED_CLOTH[0]), [0.04, yaw, 0], [x, 0, z]), RED_CLOTH, seed),
    tone(placeMesh(prism(4, -len, -len - tip, [w * 0.9, 0.3], [w * 0.2, 0.2], RED_CLOTH[0]), [0.1, yaw, 0.1], [x, 0, z]), RED_CLOTH, seed + 1),
  ];
  return [...flap(1.6, 4.3, 0, 2.7, 9.5, 3.8, 1), ...flap(4.7, 2, 1, 1.9, 7, 2.8, 3)];
}

/** 紅色腰布後片（clothBack 關節） */
export function backCloth(): Mesh[] {
  return [
    tone(placeMesh(prism(4, 0, -9, [2.8, 0.3], [2.4, 0.3], RED_CLOTH[0]), [-0.28, 0, 0], [0.5, 0, -4.9]), RED_CLOTH, 1),
    tone(placeMesh(prism(4, -9, -12.5, [2.4, 0.3], [0.5, 0.2], RED_CLOTH[0]), [-0.2, 0, 0.12], [0.5, 0, -4.9]), RED_CLOTH, 2),
  ];
}

// ─────────────────────────── 腿 ───────────────────────────

/** 靴筒上緣（thigh 關節，膝上）：反折的靴口 */
export const bootCuff = (): Mesh[] => [
  loft(
    [
      { y: 3.6 - THIGH_LENGTH, rx: 2.6, rz: 2.7, cz: 0.2 },
      { y: -0.2 - THIGH_LENGTH, rx: 2.2, rz: 2.35 },
    ],
    14,
    BOOT,
    1,
  ),
  ...detail(1, [facetize(tone(prism(14, 3.8 - THIGH_LENGTH, 3 - THIGH_LENGTH, [2.7, 2.8], [2.65, 2.75], LEATHER[1], [0, 0, 0.2]), LEATHER, 2), 0.14, 21)]),
];

/** 小腿（shin 關節）：長靴（小腿肚、腳踝）、有稜角的鋼護膝（兩側翼片）、上下兩片鋼脛甲、兩條綁帶與金扣 */
export const bootShin = (): Mesh[] => [
  loft(
    [
      { y: 0.6, rx: 2.2, rz: 2.35 },
      { y: -4, rx: 2.35, rz: 2.45, cz: -0.15 },
      { y: -10.4, rx: 1.75, rz: 1.85 },
      { y: -12.6, rx: 1.85, rz: 2 },
    ],
    14,
    BOOT,
    3,
  ),
  // 護膝：前方的楔形鋼殼 + 往兩側張開的翼片
  facetize(tone(placeMesh(prism(6, 1.4, -3.2, [2.2, 1.25], [1.5, 0.9], METAL[0]), [-0.14, 0, 0], [0, 0, 2]), METAL, 4), 0.16, 22),
  ...[1, -1].map((s) => facetize(tone(placeMesh(box(0.5, 2.6, 2.4, METAL[1]), [0, 0.45 * s, 0.25 * s], [1.95 * s, -0.4, 1.2]), METAL, 6 + (s > 0 ? 0 : 1)), 0.16, 31)),
  // 鋼脛甲（上下兩片，上片疊在下片外面）
  facetize(tone(placeMesh(prism(4, -3, -7, [1.45, 0.6], [1.2, 0.55], METAL[0], [0, 0, 0], 0), [0.08, 0, 0], [0, 0, 2.25]), METAL, 5), 0.14, 23),
  facetize(tone(placeMesh(prism(4, -6.6, -10, [1.15, 0.5], [0.95, 0.45], METAL[2], [0, 0, 0], 0), [0.04, 0, 0], [0, 0, 2.05]), METAL, 8), 0.14, 32),
  ...detail(1, [
    facetize(tone(prism(14, -5.6, -6.2, [2.4, 2.5], [2.35, 2.45], LEATHER_DARK[0], [0, 0, -0.1]), LEATHER_DARK), 0.14, 24),
    facetize(tone(prism(14, -9.4, -10, [2.05, 2.15], [2, 2.1], LEATHER_DARK[0], [0, 0, -0.05]), LEATHER_DARK), 0.14, 25),
    box(0.7, 0.8, 0.4, GOLD[0], [2.3, -5.9, 0.2]),
    box(0.7, 0.8, 0.4, GOLD[0], [2, -9.7, 0.2]),
  ]),
];

/** 靴子（foot 關節）：靴跟（加高的方跟）、腳背、楔形靴尖、靴底、腳踝綁帶與金扣 */
export const bootFoot = (): Mesh[] => [
  facetize(tone(box(3.2, 2.3, 2.8, BOOT[0], [0, -1.3, -0.6]), BOOT, 1), 0.14, 26),
  facetize(tone(placeMesh(box(3.3, 1.9, 4, BOOT[1]), [0.12, 0, 0], [0, -1.35, 2]), BOOT, 2), 0.14, 27),
  facetize(tone(placeMesh(prism(5, 0, 2.2, [1.6, 1], [0.9, 0.6], BOOT[0], [0, 0, 0], 0.3), [Math.PI / 2, 0, 0], [0, -1.7, 3.9]), BOOT, 3), 0.14, 28),
  // 靴底保持平的（貼地）；腳跟下方是加高的方跟
  tone(box(3.5, 0.7, 7.6, LEATHER_DARK[2], [0, -2.55, 1.4]), LEATHER_DARK),
  tone(box(2.6, 1.1, 2.3, LEATHER_DARK[0], [0, -2.5, -1.2]), LEATHER_DARK, 2),
  ...detail(1, [facetize(tone(prism(14, 0.2, -0.5, [2.05, 2.15], [2.1, 2.2], LEATHER_DARK[0]), LEATHER_DARK), 0.14, 30)]),
  ...detail(2, [box(0.8, 0.8, 0.4, GOLD[0], [1.9, 0, 0.6])]),
];
