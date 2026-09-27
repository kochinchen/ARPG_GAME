import type { FigureModel, Pose } from './FigureModel';
import { box, lowSphere, placeMesh, prism } from './Poly3D';

/**
 * 商人（多面體）：站在小攤後面的商人（頭巾、灰鬍子、棕色長袍與圍裙），
 * 身前是擺著藥水與貨物的櫃台，後面兩根柱子撐起紅白條紋的布篷。
 * 攤位掛在 root 上，所以商人待機時只有上半身與手在動，攤位不會晃。
 */
const ROBE = 0x6e4a2c;
const APRON = 0xd8c8a4;
const TURBAN = 0x2e5e8a;
const SKIN = 0xe0b890;
const BEARD = 0x9a948a;
const WOOD = 0x6a4428;
const WOOD_DARK = 0x4a2e1a;
const CLOTH_RED = 0xb8342a;
const CLOTH_CREAM = 0xe8dcc0;

const STALL = [
  // 櫃台（在商人前方）
  box(24, 11, 7, WOOD, [0, -21.5, 8.5]),
  box(25, 1.4, 8, WOOD_DARK, [0, -15.4, 8.5]),
  // 貨物：藥水瓶、布包、金色小盒
  ...[-6, -2.5, 1].map((x) => prism(6, -14.6, -10.5, [1.2, 1.2], [1, 1], 0xc83a30, [x, 0, 8.5])),
  box(4, 3, 3, 0x8a6a4a, [5.5, -13.2, 8.2]),
  box(2.4, 2, 2.4, 0xd4a84a, [7.5, -13.6, 10.2]),
  // 布篷：兩根柱子 + 紅白條紋的頂
  prism(5, -29, 39, [0.9, 0.9], [0.9, 0.9], WOOD_DARK, [-12.5, 0, -5]),
  prism(5, -29, 39, [0.9, 0.9], [0.9, 0.9], WOOD_DARK, [12.5, 0, -5]),
  // 布篷在頭頂上方，往前斜下
  ...[-11.2, -5.6, 0, 5.6, 11.2].map((x, i) => placeMesh(box(5.6, 1, 18, i % 2 ? CLOTH_CREAM : CLOTH_RED), [0.18, 0, 0], [x, 39, 2])),
];

const REST: Pose = {
  rootY: 0,
  angles: {
    torso: [0.08, 0, 0],
    head: [-0.05, 0, 0],
    // 雙手交叉在胸前
    upperArmL: [-0.55, 0, -0.45],
    forearmL: [-1.7, 0, 0.4],
    upperArmR: [-0.55, 0, 0.45],
    forearmR: [-1.7, 0, -0.4],
  },
};

const wave = (t: number): Pose => ({
  rootY: 0,
  angles: {
    ...REST.angles,
    torso: [0.08 + Math.sin(t * 1.6) * 0.03, Math.sin(t * 0.6) * 0.12, 0],
    head: [-0.05, Math.sin(t * 0.8) * 0.35, 0],
    // 每隔一段時間舉起右手招呼客人
    ...(Math.sin(t * 0.7) > 0.75
      ? { upperArmR: [-2.4, 0, 0.5] as const, forearmR: [-0.4 + Math.sin(t * 9) * 0.35, 0, 0] as const }
      : {}),
  },
});

export const MERCHANT: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: [prism(8, 3, -28, [6, 4.8], [8, 6.4], ROBE), ...STALL] },
    {
      joint: 'torso',
      parent: 'root',
      offset: [0, 3, 0],
      meshes: [prism(8, 0, 15, [6.2, 4.8], [7.2, 5], ROBE), placeMesh(box(8, 14, 1, APRON), [0.05, 0, 0], [0, 6, 4.6]), box(13, 1.6, 10, 0x4a2e1a, [0, 1, 0])],
    },
    { joint: 'neck', parent: 'torso', offset: [0, 15, 0], meshes: [prism(6, 0, 2.5, [2, 2], [2, 2], SKIN)] },
    {
      joint: 'head',
      parent: 'neck',
      offset: [0, 2.5, 0],
      meshes: [
        lowSphere(5.4, SKIN, [0, 5.2, 0.2], 8, 5),
        // 頭巾
        lowSphere(6, TURBAN, [0, 7.4, -0.3], 8, 4, [1, 0.8, 1], (c) => c[1] > -0.6),
        box(2, 2, 1.4, 0xd4a84a, [0, 8.6, 5.6]),
        // 鬍子與眼睛
        placeMesh(prism(5, 0, -5, [3.4, 2], [1.2, 0.8], BEARD), [0.35, 0, 0], [0, 3, 3.8]),
        box(1.1, 1.3, 0.8, 0x2a1a14, [1.9, 5.8, 5.2]),
        box(1.1, 1.3, 0.8, 0x2a1a14, [-1.9, 5.8, 5.2]),
      ],
    },
    { joint: 'upperArmL', parent: 'torso', offset: [7.3, 13.5, 0], meshes: [prism(6, 0, -10, [2.3, 2.3], [2.1, 2.1], ROBE)] },
    { joint: 'forearmL', parent: 'upperArmL', offset: [0, -10, 0], meshes: [prism(6, 0, -8, [2.2, 2.2], [2.4, 2.4], ROBE), lowSphere(1.7, SKIN, [0, -9.2, 0], 5, 3)] },
    { joint: 'upperArmR', parent: 'torso', offset: [-7.3, 13.5, 0], meshes: [prism(6, 0, -10, [2.3, 2.3], [2.1, 2.1], ROBE)] },
    { joint: 'forearmR', parent: 'upperArmR', offset: [0, -10, 0], meshes: [prism(6, 0, -8, [2.2, 2.2], [2.4, 2.4], ROBE), lowSphere(1.7, SKIN, [0, -9.2, 0], 5, 3)] },
  ],
  poses: {
    ready: wave,
    run: () => REST,
    attackWindup: REST,
    attackStrike: REST,
    castWindup: REST,
    castRelease: REST,
    hit: REST,
    dead: REST,
  },
};
