import { seg } from '../Creatures';
import type { FigureModel } from '../FigureModel';
import { box, lowSphere, placeMesh, prism, type Mesh } from '../Poly3D';
import { F, FF, FS, FSeg, rivet } from './BossParts';
import { bossPoses } from './BossPoses';
import { BOSS_HIP, bossRig, bossSecondary, type Side } from './BossRig';

/**
 * 穿長袍的兩個：10F 墮落神官（深紅長袍、金色滾邊、帶角兜帽、背後尖刺光環、血光法杖、浮空的尖刺冠）
 * 與它召喚的狂熱信徒（暗紅兜帽長袍、儀式短刀、繩腰帶）。
 */

const CRIMSON = 0x7a1620;
const CRIMSON_ALT = 0x86202a;
const CRIMSON_DARK = 0x420a12;
const GOLD = 0xd4a84a;
const GOLD_ALT = 0xc49a40;
const PALE = 0xd8c8c0;
const PALE_ALT = 0xcab8b0;
const BLOOD_GLOW = 0xff3a3a;
const WOOD = 0x2a1a14;

// ═══════════════════════════ 10F 墮落神官 ═══════════════════════════

/** 法杖（weaponL 關節，沿 Y）：長柄、金環、頂端尖角框架中懸著發光的紅寶珠 */
const priestStaff = (): Mesh[] => [
  F(prism(8, 22, -24, [0.9, 0.9], [0.9, 0.9], WOOD), [WOOD, 0x352219], 1),
  ...[12, 0, -12].map((y, i) => F(prism(8, y + 0.5, y - 0.5, [1.2, 1.2], [1.2, 1.2], GOLD), [GOLD, GOLD_ALT], 2 + i)),
  F(prism(8, 18, 20, [1.8, 1.8], [2.2, 2.2], GOLD), [GOLD, GOLD_ALT], 5),
  FF(lowSphere(3, BLOOD_GLOW, [0, 25, 0], 8, 5), [BLOOD_GLOW, 0xff5a4a], 6, 0.08),
  ...[0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return F(seg([Math.cos(a) * 2, 20, Math.sin(a) * 2], [Math.cos(a) * 3.6, 29, Math.sin(a) * 3.6], 0.5, 0.15, GOLD, 5), [GOLD], 7 + i);
  }),
  F(prism(6, -24, -26, [0.9, 0.9], [0.1, 0.1], GOLD), [GOLD], 12),
];

/** 蒼白的長指（ex_fingers）：三節手指 + 紅色指尖 */
const paleFingers = (): Mesh[] =>
  [-1.1, -0.35, 0.35, 1.1].flatMap((x, i) => [F(box(0.8, 2.4, 0.9, PALE, [x, -1.1, 0]), [PALE, PALE_ALT], i), FS([x, -2.2, 0], [x * 1.1, -4.4, 0.5], 0.4, BLOOD_GLOW, i + 4)]);

/** 長袍的袖子（寬、下緣金邊） */
const sleeveUpper = (): Mesh[] => [FF(prism(14, 0, -10, [2.6, 2.6], [3.4, 3.4], CRIMSON), [CRIMSON, CRIMSON_ALT], 1, 0.08), F(prism(14, -4.6, -5.4, [3.05, 3.05], [3.1, 3.1], CRIMSON_DARK), [CRIMSON_DARK], 2)];
const sleeveLower = (): Mesh[] => [
  F(prism(14, 0, -9, [3.4, 3.4], [4.4, 4.4], CRIMSON), [CRIMSON, CRIMSON_ALT], 1),
  F(prism(14, -8, -9.2, [4.35, 4.35], [4.5, 4.5], GOLD), [GOLD, GOLD_ALT], 2),
  ...[-1, 1].map((k, i) => rivet([k * 3, -4, 3], 0.5, GOLD, 3 + i)),
];

/** 兜帽肩披（ex_pad）：金邊的弧形披片 */
const mantle = (side: Side): Mesh[] => [
  F(placeMesh(prism(14, 0, -3.4, [4.6, 4.2], [5.4, 4.8], CRIMSON), [0, 0, 0.4 * side], [0.8 * side, 1.6, 0]), [CRIMSON, CRIMSON_ALT], 1),
  F(placeMesh(prism(14, -3.4, -4.2, [5.4, 4.8], [5.5, 4.9], GOLD), [0, 0, 0.4 * side], [0.8 * side, 1.6, 0]), [GOLD, GOLD_ALT], 2),
  FS([2.4 * side, 3.2, 0], [4.6 * side, 7.4, -1.6], 0.8, GOLD, 3),
];

const priestHead = (): Mesh[] => [
  FF(lowSphere(5.2, PALE, [0, 5.4, 0.8], 10, 6, [0.95, 1.1, 1]), [PALE, PALE_ALT], 1, 0.06),
  box(1.8, 1.2, 1, BLOOD_GLOW, [1.9, 6, 5.6]),
  box(1.8, 1.2, 1, BLOOD_GLOW, [-1.9, 6, 5.6]),
  // 眼下的血淚、額頭的倒十字
  ...[1.9, -1.9].map((x) => box(0.4, 2, 0.4, CRIMSON, [x, 4.2, 5.7])),
  box(0.6, 2.2, 0.4, GOLD, [0, 8.2, 5.8]),
  box(1.8, 0.5, 0.4, GOLD, [0, 7.6, 5.8]),
  // 兜帽（金邊開口）與兩根往後彎的角
  F(lowSphere(7, CRIMSON, [0, 6.4, -0.6], 16, 8, [1.05, 1.12, 1.08], (c) => c[2] < 2.4 || c[1] > 4), [CRIMSON, CRIMSON_ALT], 2),
  F(box(9.6, 1.2, 1.2, GOLD, [0, 10.6, 4.4]), [GOLD], 3),
  ...[1, -1].flatMap((x, i) => [FSeg([3.6 * x, 10.5, 0], [5.4 * x, 14, -2.6], 1.3, 0.9, [WOOD, 0x352219], 4 + i * 2), FS([5.4 * x, 14, -2.6], [6.8 * x, 17, -6.4], 0.9, WOOD, 5 + i * 2)]),
];

const priestJaw = (): Mesh[] => [F(box(4.2, 1.4, 3, PALE, [0, -0.9, 2.8]), [PALE, PALE_ALT], 1), box(2.4, 0.5, 0.6, CRIMSON_DARK, [0, -0.2, 4.2])];

/** 背後的尖刺光環（胸口關節上） */
const halo = (): Mesh[] => [
  F(placeMesh(prism(28, 0, 1, [9, 9], [9, 9], GOLD), [Math.PI / 2, 0, 0], [0, 15, -7]), [GOLD, GOLD_ALT], 1),
  F(placeMesh(prism(28, 0, 1.2, [7.6, 7.6], [7.6, 7.6], CRIMSON_DARK), [Math.PI / 2, 0, 0], [0, 15, -7.1]), [CRIMSON_DARK], 2),
  ...Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return FS([Math.cos(a) * 9, 15 + Math.sin(a) * 9, -7], [Math.cos(a) * 13.8, 15 + Math.sin(a) * 13.8, -7], 0.9, i % 2 ? GOLD : BLOOD_GLOW, 3 + i);
  }),
];

const PRIEST_PARTS = bossRig({
  shoulderX: 7.8,
  root: [
    // 長袍下擺：往下張開、金色滾邊、前方金色長條
    F(prism(22, 4, -12, [6.2, 5], [8.8, 7.4], CRIMSON), [CRIMSON, CRIMSON_ALT], 1),
    F(prism(22, -12, -27, [8.8, 7.4], [11, 9.2], CRIMSON), [CRIMSON, CRIMSON_ALT], 2),
    F(prism(22, -27, -28.8, [11, 9.2], [11.3, 9.5], CRIMSON_DARK), [CRIMSON_DARK], 3),
    F(prism(22, -20, -21.2, [10.3, 8.6], [10.5, 8.8], GOLD), [GOLD, GOLD_ALT], 4),
    F(prism(22, 2.6, 4.2, [6.4, 5.2], [6.3, 5.1], GOLD), [GOLD, GOLD_ALT], 5),
    ...[-4, 0, 4].map((x, i) => rivet([x, 3.4, 5.4], 0.7, BLOOD_GLOW, 6 + i)),
  ],
  waist: [F(prism(18, 0, 7.2, [6.2, 5], [7, 5.3], CRIMSON), [CRIMSON, CRIMSON_ALT], 1), F(box(2.4, 7.2, 1, GOLD, [0, 3.6, 5.2]), [GOLD], 2)],
  chest: [
    F(prism(18, 0, 8, [7, 5.3], [8.2, 5.6], CRIMSON), [CRIMSON, CRIMSON_ALT], 1),
    F(prism(18, 4.5, 9.5, [8.6, 6], [5.6, 4.6], CRIMSON_DARK), [CRIMSON_DARK], 2),
    F(box(2.4, 8, 1, GOLD, [0, 4, 5.4]), [GOLD], 3),
    F(box(5, 1.2, 1, GOLD, [0, 3, 5.8]), [GOLD], 4),
    F(placeMesh(box(1.4, 18, 1, GOLD), [0, 0, 0.55], [0, 2, 5.6]), [GOLD], 5),
    // 肩上的金色鎖鏈披帶
    ...Array.from({ length: 6 }, (_, i) => F(placeMesh(prism(6, 0.5, -0.5, [0.7, 0.3], [0.7, 0.3], GOLD), [0, 0, Math.PI / 2 + (i % 2) * 0.6], [-4 + i * 1.6, 7.5 - Math.sin((i / 5) * Math.PI) * 2, 5.6]), [GOLD], 10 + i)),
    ...halo(),
  ],
  neck: [F(prism(10, -0.5, 3.4, [2.4, 2.2], [2.2, 2], PALE), [PALE], 1), F(prism(18, -0.4, 1.4, [4.4, 4], [3.6, 3.2], GOLD), [GOLD, GOLD_ALT], 2)],
  head: priestHead(),
  jaw: priestJaw(),
  // 頭頂浮空的尖刺冠
  crest: [F(prism(10, 0, 0.8, [3.4, 3.4], [3.4, 3.4], GOLD), [GOLD, GOLD_ALT], 1), ...Array.from({ length: 5 }, (_, i) => FS([Math.cos(i * 1.257) * 3, 0.8, Math.sin(i * 1.257) * 3], [Math.cos(i * 1.257) * 3.6, 4, Math.sin(i * 1.257) * 3.6], 0.6, i % 2 ? GOLD : BLOOD_GLOW, 2 + i))],
  clavicle: (side) => [F(placeMesh(box(4.6, 1.6, 4, CRIMSON_DARK), [0, 0, -0.15 * side], [2.4 * side, 0.3, 0]), [CRIMSON_DARK], 1)],
  pad: mantle,
  upperArm: sleeveUpper,
  forearm: sleeveLower,
  hand: () => [F(box(2.8, 2.6, 2, PALE, [0, -1.3, 0]), [PALE, PALE_ALT], 1), F(lowSphere(1.6, BLOOD_GLOW, [0, -4.6, 1.4], 6, 4), [BLOOD_GLOW], 2)],
  fingers: paleFingers,
  thumb: () => [F(box(0.9, 2, 0.9, PALE, [0, -0.9, 0]), [PALE], 1), FS([0, -1.8, 0], [0, -3.4, 0.5], 0.4, BLOOD_GLOW, 2)],
  weaponL: priestStaff(),
  // 長袍兩側的開衩片
  tasset: (side) => [F(placeMesh(prism(4, 0, -16, [2.4, 0.5], [3.4, 0.5], CRIMSON), [0, (Math.PI / 2) * side, 0.1 * side], [0.8 * side, -1, 0]), [CRIMSON, CRIMSON_ALT], 1), F(placeMesh(prism(4, -16, -17, [3.4, 0.55], [3.5, 0.55], GOLD), [0, (Math.PI / 2) * side, 0.1 * side], [0.8 * side, -1, 0]), [GOLD], 2)],
  thigh: () => [F(prism(8, 0, -13, [2.6, 2.6], [2.2, 2.2], CRIMSON_DARK), [CRIMSON_DARK], 1)],
  shin: () => [F(prism(8, 0, -12.5, [2.2, 2.2], [1.8, 1.8], CRIMSON_DARK), [CRIMSON_DARK], 1)],
  foot: () => [F(box(3.2, 2, 5, 0x1a0e0c, [0, -1.2, 1.2]), [0x1a0e0c], 1)],
  toe: () => [F(prism(4, 0, 2.6, [1.4, 0.8], [0.1, 0.1], 0x1a0e0c, [0, 0, 0]), [0x1a0e0c], 1)],
  cloth: [F(prism(4, 0, -26, [3.2, 0.5], [4.2, 0.5], CRIMSON_DARK), [CRIMSON_DARK, CRIMSON], 1), F(prism(4, -26, -27.5, [4.2, 0.55], [4.3, 0.55], GOLD), [GOLD], 2), F(lowSphere(1.3, BLOOD_GLOW, [0, -8, 0.7], 6, 4, [1, 1, 0.5]), [BLOOD_GLOW], 3)],
  clothBack: [F(prism(4, 0, -27, [4.4, 0.5], [5.4, 0.5], CRIMSON_DARK), [CRIMSON_DARK, CRIMSON], 1)],
  cape: {
    upper: (col) => [F(placeMesh(prism(4, 0.5, -11.3, [3.2, 0.5], [3.7, 0.5], CRIMSON), [0, col * -0.2, col * 0.1], [0, 0, 0]), [CRIMSON, CRIMSON_ALT], 1 + col)],
    lower: (col) => [
      F(placeMesh(prism(4, 0.4, -12, [3.7, 0.5], [4.2, 0.5], CRIMSON), [0, col * -0.2, col * 0.12], [0, 0, 0]), [CRIMSON, CRIMSON_ALT], 4 + col),
      F(placeMesh(prism(4, -12, -13, [4.2, 0.55], [4.3, 0.55], GOLD), [0, col * -0.2, col * 0.12], [0, 0, 0]), [GOLD], 7 + col),
    ],
  },
});

const FALLEN_PRIEST: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: 0.5,
  parts: PRIEST_PARTS,
  poses: bossPoses(PRIEST_PARTS, { weapon: 'staff', cast: 'staff' }),
  secondary: bossSecondary(PRIEST_PARTS, { ex_crest: { rate: 4, gravity: 0 } }),
  gaitRate: 0.7,
  dynamicShadow: true,
};

// ═══════════════════════════ 狂熱信徒 ═══════════════════════════

const ROBE = CRIMSON_DARK;
const ROBE_ALT = 0x4e0e18;
const ROPE = 0x6a5a3a;

/** 儀式短刀（weapon 關節，沿 -Y） */
const ritualDagger = (): Mesh[] => [
  F(prism(6, 1.6, -1.6, [0.5, 0.5], [0.5, 0.5], WOOD), [WOOD], 1),
  F(box(3, 0.6, 0.9, GOLD, [0, -1.8, 0]), [GOLD], 2),
  F(prism(4, -2, -7.6, [0.25, 0.9], [0.2, 0.3], 0xb8b0b0, [0, 0, 0], 0), [0xb8b0b0, 0xa8a0a0], 3),
];

const CULTIST_PARTS = bossRig({
  shoulderX: 7,
  root: [
    FF(prism(16, 4, -27, [5.8, 4.6], [9.4, 8], ROBE), [ROBE, ROBE_ALT], 1, 0.06),
    F(prism(16, -27, -28.4, [9.4, 8], [9.6, 8.2], 0x2a060c), [0x2a060c], 2),
    F(prism(16, 2.4, 3.6, [6, 4.8], [6, 4.8], ROPE), [ROPE], 3),
    // 繩結與撕裂的下擺
    F(lowSphere(1, ROPE, [2.4, 2.6, 4.6], 6, 4), [ROPE], 4),
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      return F(placeMesh(prism(3, 0, -2.4 - (i % 3), [1.6, 0.3], [0.05, 0.05], 0x2a060c), [0, -a + Math.PI / 2, 0], [Math.cos(a) * 9.3, -28.2, Math.sin(a) * 7.9]), [0x2a060c, ROBE], 5 + i);
    }),
  ],
  waist: [F(prism(16, 0, 7, [5.6, 4.4], [6.4, 4.7], ROBE), [ROBE, ROBE_ALT], 1)],
  chest: [
    F(prism(24, 0, 8.5, [6.4, 4.7], [7.2, 5], ROBE), [ROBE, ROBE_ALT], 1),
    F(box(1.6, 8, 1, CRIMSON, [0, 4, 4.9]), [CRIMSON], 2),
    // 骨珠項鍊與血色吊墜
    ...Array.from({ length: 9 }, (_, i) => {
      const a = ((i - 4) / 4) * 1.1;
      return F(lowSphere(0.55, 0xcfc4aa, [Math.sin(a) * 4, 8.2 - Math.cos(a) * 2.6, 4.2 + Math.cos(a) * 0.9], 6, 4), [0xcfc4aa], 3 + i);
    }),
    F(placeMesh(prism(4, 0, -2.4, [1, 0.4], [0.1, 0.1], BLOOD_GLOW, [0, 0, 0], 0), [0.1, 0, 0], [0, 5.6, 5.4]), [BLOOD_GLOW], 12),
  ],
  neck: [F(prism(8, 0, 3, [1.4, 1.4], [1.3, 1.3], PALE), [PALE], 1)],
  head: [
    F(lowSphere(4.8, PALE, [0, 5.2, 0.8], 12, 7), [PALE, PALE_ALT], 1),
    box(1.4, 1, 1, BLOOD_GLOW, [1.7, 5.6, 5.2]),
    box(1.4, 1, 1, BLOOD_GLOW, [-1.7, 5.6, 5.2]),
    FF(lowSphere(6.4, ROBE, [0, 6.2, -0.4], 14, 7, [1.05, 1.15, 1.08], (c) => c[2] < 2.2 || c[1] > 3.6), [ROBE, ROBE_ALT], 2),
  ],
  jaw: [F(box(3.4, 1, 2.2, PALE, [0, -0.8, 2.6]), [PALE], 1)],
  crest: [F(placeMesh(prism(6, 0, 5, [3.4, 3.4], [0.4, 0.4], ROBE), [-0.5, 0, 0], [0, 1, -2]), [ROBE, ROBE_ALT], 1)],
  pad: (side) => [F(placeMesh(prism(12, 0, -2.6, [3.4, 3], [4, 3.6], ROBE), [0, 0, 0.4 * side], [0.6 * side, 1.2, 0]), [ROBE, ROBE_ALT], 1), F(placeMesh(prism(12, -2.6, -3.2, [4, 3.6], [4.05, 3.65], CRIMSON), [0, 0, 0.4 * side], [0.6 * side, 1.2, 0]), [CRIMSON], 2)],
  upperArm: () => [F(prism(12, 0, -10, [2.4, 2.4], [3, 3], ROBE), [ROBE, ROBE_ALT], 1)],
  forearm: () => [F(prism(20, 0, -9, [3, 3], [3.6, 3.6], ROBE), [ROBE, ROBE_ALT], 1), F(prism(20, -8, -9.2, [3.55, 3.55], [3.7, 3.7], CRIMSON), [CRIMSON], 2)],
  hand: () => [F(box(2.6, 2.4, 1.8, PALE, [0, -1.2, 0]), [PALE], 1)],
  fingers: () => [-0.9, 0, 0.9].map((x, i) => F(box(0.7, 2, 0.8, PALE, [x, -1, 0]), [PALE, PALE_ALT], i)),
  thumb: () => [F(box(0.8, 1.6, 0.8, PALE, [0, -0.8, 0]), [PALE], 1)],
  weapon: ritualDagger(),
  thigh: () => [F(prism(12, 0, -13, [2.4, 2.4], [2, 2], ROBE), [ROBE], 1)],
  shin: () => [F(prism(12, 0, -12.5, [2, 2], [1.6, 1.6], ROBE), [ROBE], 1)],
  foot: () => [F(box(3, 1.8, 4.6, 0x1a0e0c, [0, -1.1, 1.2]), [0x1a0e0c], 1)],
  cloth: [F(prism(4, 0, -9, [1, 0.3], [1.1, 0.3], ROPE, [1.8, 0, 0]), [ROPE], 1), F(prism(4, 0, -7, [1, 0.3], [1.1, 0.3], ROPE, [-1.4, 0, 0]), [ROPE], 2)],
  cape: {
    upper: (col) => [F(placeMesh(prism(4, 0.5, -9, [2.8, 0.4], [3.1, 0.4], ROBE), [0, col * -0.2, col * 0.1], [0, 0, 0]), [ROBE, ROBE_ALT], 1 + col)],
    lower: (col) => [F(placeMesh(prism(3, 0.4, -5 - Math.abs(col), [3, 0.4], [0.1, 0.1], ROBE), [0, col * -0.2, col * 0.1], [0, 2, 0]), [ROBE], 4 + col)],
  },
});

const CULTIST: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: 0.3,
  parts: CULTIST_PARTS,
  poses: bossPoses(CULTIST_PARTS, { weapon: 'dagger', hunch: 0.15, cast: 'roar' }),
  secondary: bossSecondary(CULTIST_PARTS),
  gaitRate: 0.85,
  dynamicShadow: true,
};

export const ROBED_BOSSES: Record<string, FigureModel> = {
  'enemy.fallen_priest': FALLEN_PRIEST,
  'enemy.cultist': CULTIST,
};
