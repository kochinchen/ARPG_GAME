import type { FigureModel } from '../FigureModel';
import { skull } from '../MonsterParts';
import { box, lowSphere, placeMesh, prism, type Mesh } from '../Poly3D';
import { capeLower, capeUpper, F, FF, fingers, FS, FSeg, gauntlet, pauldron, plateForearm, plateShin, plateThigh, plateUpperArm, sabaton, tasset, thumb, toeCap, type Metal } from './BossParts';
import { bossPoses } from './BossPoses';
import { BOSS_HIP, bossRig, bossSecondary } from './BossRig';

/**
 * 全身板甲的兩位魔王：
 * 5F 墓穴守衛（生鏽鐵甲、骷髏臉、角盔、巨錘 + 塔盾、破爛戰袍與披風）；
 * 20F 墮落騎士（黑色板甲、紫色符文與劍刃、長角頭盔、紫焰盔纓、巨劍、黑色披風）。
 */

const REF = 0.5;

// ═══════════════════════════ 5F 墓穴守衛 ═══════════════════════════

const IRON: Metal = { plate: 0x4c4842, alt: 0x57524a, dark: 0x2e2b27, edge: 0x6c665c, spike: 0x6c665c };
const RUST = 0x7a4a2a;
const EMBER = 0xff8a3a;
const TABARD = 0x3a2a22;
const TABARD_ALT = 0x45332a;
const BONE = 0xcfc4aa;

/** 巨錘（weapon 關節，沿 -Y）：長柄、握把纏帶、方形錘頭（上下兩道環）、四面與底部尖刺 */
const greatMace = (): Mesh[] => [
  F(prism(8, 5, -20, [1, 1], [1, 1], RUST), [RUST, 0x6a3e22], 1, 0.08),
  ...[2, -1, -4].map((y, i) => F(prism(8, y + 0.5, y - 0.5, [1.25, 1.25], [1.25, 1.25], IRON.dark), [IRON.dark], 2 + i, 0.05)),
  F(prism(8, -20, -22, [1.4, 1.4], [1.4, 1.4], IRON.edge), [IRON.edge], 5, 0.06),
  FF(box(6, 7, 6, IRON.dark, [0, -26, 0]), [IRON.dark, IRON.plate], 6, 0.15),
  F(box(6.6, 1.2, 6.6, IRON.edge, [0, -23, 0]), [IRON.edge], 7, 0.06),
  F(box(6.6, 1.2, 6.6, IRON.edge, [0, -29, 0]), [IRON.edge], 8, 0.06),
  ...([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([x, z], i) => FS([x * 3, -26, z * 3], [x * 6.6, -26, z * 6.6], 1.2, IRON.edge, 9 + i)),
  FS([0, -29.5, 0], [0, -33.5, 0], 1.2, IRON.edge, 14),
  F(lowSphere(1.3, IRON.edge, [0, 5.6, 0], 6, 4), [IRON.edge], 15, 0.08),
];

/**
 * 塔盾（weaponL 關節）：握在左手外側，盾面十字紋、鉚釘、盾緣、中央骷髏徽。
 * 先沿 Y 建出，再轉 90° 讓長邊順著手的 Z（前臂往前平舉時盾牌直立擋在身前）。
 */
const towerShield = (): Mesh[] => towerShieldMeshes().map((m) => placeMesh(m, [Math.PI / 2, 0, 0], [0, 2, 5]));
const towerShieldMeshes = (): Mesh[] => [
  F(box(1.6, 22, 13, IRON.dark, [2.8, -3, 3]), [IRON.dark, IRON.plate], 1, 0.08),
  FF(box(0.6, 20, 11, RUST, [3.8, -3, 3]), [RUST, 0x6a3e22], 2, 0.06),
  F(box(0.8, 18, 2, IRON.edge, [4.2, -3, 3]), [IRON.edge], 3, 0.08),
  F(box(0.8, 2, 9, IRON.edge, [4.2, 2, 3]), [IRON.edge], 4, 0.08),
  ...[
    [5, -2],
    [5, 8],
    [-11, -2],
    [-11, 8],
    [-3, -2.5],
    [-3, 8.5],
  ].map(([y, z], i) => F(lowSphere(0.7, IRON.edge, [4.4, y!, z!], 5, 3), [IRON.edge], 5 + i, 0.05)),
  ...[-14, 8].map((y, i) => F(box(1.8, 1, 13.4, IRON.edge, [2.9, y, 3]), [IRON.edge], 12 + i, 0.05)),
  F(lowSphere(1.8, BONE, [4.6, 2, 3], 6, 4, [0.5, 1, 1]), [BONE], 14, 0.08),
];

const guardianHead = (): Mesh[] => [
  ...skull(BONE),
  // 頭盔：包住頭頂與兩側、面前開口露出骷髏臉；眉緣、護頰、兩根往前彎的角
  FF(lowSphere(6.6, IRON.plate, [0, 6.6, -0.4], 12, 7, [1.02, 1.05, 1.04], (c) => c[2] < 2 || c[1] > 3.5), [IRON.plate, IRON.alt], 1, 0.06),
  F(box(10, 1.4, 1.4, IRON.edge, [0, 10, 4.6]), [IRON.edge], 2, 0.08),
  ...[1, -1].map((x, i) => F(placeMesh(box(1.4, 5, 3.4, IRON.dark), [0, 0, 0.1 * x], [5.6 * x, 4.4, 2.4]), [IRON.dark], 3 + i, 0.12)),
  FSeg([4.8, 9, 0], [8, 12.4, 2], 1.5, 1.1, [BONE, 0xbdb298], 5),
  FS([8, 12.4, 2], [9.4, 15.6, 5], 1.1, BONE, 6),
  FSeg([-4.8, 9, 0], [-8, 12.4, 2], 1.5, 1.1, [BONE, 0xbdb298], 7),
  FS([-8, 12.4, 2], [-9.4, 15.6, 5], 1.1, BONE, 8),
  box(1.9, 1.2, 1.2, EMBER, [2, 6, 5.4]),
  box(1.9, 1.2, 1.2, EMBER, [-2, 6, 5.4]),
];

/** 骷髏下顎（jaw 關節） */
const boneJaw = (): Mesh[] => [F(box(5.6, 1.6, 3.4, BONE, [0, -1.4, 2.4]), [BONE, 0xbdb298], 1, 0.12), ...[-1.8, -0.6, 0.6, 1.8].map((x, i) => box(0.8, 0.9, 0.6, 0xe8dcc0, [x, -0.4, 3.9 + i * 0]))];

const CRYPT_PARTS = bossRig({
  shoulderX: 9.2,
  root: [
    F(prism(10, 3.2, 0, [7, 5.4], [7.2, 5.6], IRON.dark), [IRON.dark, IRON.plate], 1),
    F(prism(10, 0.4, -2.4, [7.3, 5.7], [7.6, 5.9], IRON.plate), [IRON.plate, IRON.alt], 2),
    F(box(2.4, 2.4, 1, RUST, [0, 1.6, 5.8]), [RUST], 3, 0.15),
    ...[-3, 3].map((x, i) => F(lowSphere(0.7, IRON.edge, [x, 1.6, 5.7], 5, 3), [IRON.edge], 4 + i, 0.05)),
    // 腰間掛著的骷髏戰利品與鐵鏈
    ...[
      [5.8, 3.4],
      [6.8, 0],
      [-5.8, 3.4],
      [-6.8, 0],
    ].flatMap(([x, z], i) => [F(lowSphere(1.5, BONE, [x!, -1.2, z!], 8, 5, [0.95, 1.05, 1]), [BONE, 0xbdb298], 10 + i), box(1.4, 0.5, 0.6, 0x1a1512, [x!, -1, z! + Math.sign(z! || 1) * 1.3])]),
    ...Array.from({ length: 6 }, (_, i) => F(placeMesh(prism(6, 0.5, -0.5, [0.8, 0.35], [0.8, 0.35], IRON.edge), [0, (i * Math.PI) / 3, Math.PI / 2], [Math.cos(i * 0.52 - 1.3) * 7.6, -0.2 - Math.abs(i - 2.5) * 0.35, Math.sin(i * 0.52 - 1.3) * 6]), [IRON.edge], 20 + i)),
  ],
  waist: [F(prism(12, 0, 7.2, [7.2, 5.4], [8.4, 5.9], IRON.plate), [IRON.plate, IRON.alt], 1), ...[1.8, 4.2].map((y, i) => F(prism(12, y, y + 0.9, [7.6, 5.6], [8, 5.8], IRON.edge), [IRON.edge], 2 + i, 0.04))],
  chest: [
    FF(prism(12, 0, 7, [8.4, 5.9], [10, 6.4], IRON.plate), [IRON.plate, IRON.alt], 1, 0.08),
    F(prism(12, 7, 10, [10, 6.4], [7, 5], IRON.dark), [IRON.dark], 2),
    F(placeMesh(box(2, 9, 2, IRON.edge), [0, Math.PI / 4, 0], [0, 3.5, 6]), [IRON.edge], 3, 0.1),
    F(box(14, 1.2, 1.2, IRON.edge, [0, 0, 6]), [IRON.edge], 4, 0.06),
    F(box(7, 10, 0.8, TABARD, [0, -1.6, 6.3]), [TABARD, TABARD_ALT], 5, 0.1),
    F(lowSphere(1.8, BONE, [0, 5.5, 6.6], 6, 4, [1, 1, 0.5]), [BONE], 6, 0.1),
    ...[-4, 4].map((x, i) => F(lowSphere(0.7, IRON.edge, [x, 4.4, 6.2], 5, 3), [IRON.edge], 7 + i, 0.05)),
    // 背後的鎖鏈與骨頭掛飾
    ...[-3, 0, 3].map((x, i) => F(lowSphere(0.9, BONE, [x, 6, -6.2], 5, 3), [BONE], 9 + i, 0.08)),
  ],
  neck: [F(prism(10, -0.5, 3.5, [4.2, 4], [3.6, 3.4], IRON.dark), [IRON.dark], 1, 0.08)],
  head: guardianHead(),
  jaw: boneJaw(),
  // 頭頂：冒著餘燼的鐵冠
  crest: [F(prism(6, 0, 1.4, [2.2, 2.2], [2.6, 2.6], IRON.edge), [IRON.edge], 1, 0.1), ...[0, 1, 2].map((i) => FS([Math.cos(i * 2.1) * 1.6, 1.2, Math.sin(i * 2.1) * 1.6], [Math.cos(i * 2.1) * 2.2, 4.6, Math.sin(i * 2.1) * 2.2], 0.5, EMBER, 2 + i))],
  clavicle: (side) => [F(placeMesh(box(5, 1.8, 4, IRON.dark), [0, 0, -0.15 * side], [2.6 * side, 0.4, 0]), [IRON.dark, IRON.plate], 1, 0.12)],
  pad: (side) => pauldron(side, IRON),
  upperArm: () => plateUpperArm(IRON),
  forearm: () => plateForearm(IRON),
  hand: () => gauntlet(IRON),
  fingers: () => fingers(IRON),
  thumb: () => thumb(IRON),
  weapon: greatMace(),
  weaponL: towerShield(),
  tasset: (side) => tasset(side, IRON),
  thigh: () => plateThigh(IRON),
  shin: () => plateShin(IRON),
  foot: () => sabaton(IRON),
  toe: () => toeCap(IRON, IRON.edge),
  cloth: [F(prism(4, 0, -15, [3.4, 0.5], [3.9, 0.5], TABARD), [TABARD, TABARD_ALT], 1, 0.08), ...[-1, 1].map((k, i) => F(placeMesh(prism(3, -15, -18, [1.3, 0.4], [0.05, 0.05], TABARD), [0, 0, 0], [k * 1.6, 0, 0]), [TABARD], 2 + i, 0.08))],
  clothBack: [F(prism(4, 0, -13, [4, 0.5], [4.4, 0.5], TABARD), [TABARD, TABARD_ALT], 1, 0.08)],
  cape: { upper: (col) => capeUpper(col, 0x2a2420, 0x332b26), lower: (col) => capeLower(col, 0x2a2420, 0x332b26) },
});

const CRYPT_GUARDIAN: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: REF,
  parts: CRYPT_PARTS,
  poses: bossPoses(CRYPT_PARTS, { weapon: 'mace', cast: 'roar' }),
  secondary: bossSecondary(CRYPT_PARTS),
  gaitRate: 0.62,
  dynamicShadow: true,
};

// ═══════════════════════════ 20F 墮落騎士 ═══════════════════════════

const BLACK: Metal = { plate: 0x2c2a36, alt: 0x34313f, dark: 0x17161e, edge: 0x4a4658, spike: 0x4a4658 };
const VOID_GLOW = 0xa066ff;
const CAPE = 0x221a2e;
const CAPE_ALT = 0x2a2138;

/** 巨劍（weapon 關節，沿 -Y）：柄頭寶珠、握把、帶尖角的護手、暗色劍身與紫色發光中線、劍尖 */
const darkGreatsword = (): Mesh[] => [
  F(prism(8, 3, -3.4, [0.9, 0.9], [0.9, 0.9], 0x2a1a24), [0x2a1a24], 1, 0.08),
  F(lowSphere(1.3, VOID_GLOW, [0, 3.6, 0], 6, 4), [VOID_GLOW], 2, 0.06),
  F(box(11, 1.6, 2.2, BLACK.edge, [0, -4, 0]), [BLACK.edge, BLACK.plate], 3, 0.12),
  FS([5, -4, 0], [7.6, -0.6, 0], 0.8, BLACK.edge, 4),
  FS([-5, -4, 0], [-7.6, -0.6, 0], 0.8, BLACK.edge, 5),
  F(prism(4, -4.8, -18, [2, 0.5], [1.85, 0.45], BLACK.plate, [0, 0, 0], 0), [BLACK.plate, BLACK.alt], 6, 0.05),
  F(prism(4, -18, -32, [1.85, 0.45], [1.7, 0.4], BLACK.plate, [0, 0, 0], 0), [BLACK.plate, BLACK.alt], 7, 0.05),
  prism(4, -5, -31, [0.5, 0.6], [0.4, 0.5], VOID_GLOW, [0, 0, 0], 0),
  F(prism(4, -32, -37, [1.7, 0.4], [0.08, 0.05], BLACK.plate, [0, 0, 0], 0), [BLACK.plate], 8, 0.05),
];

const knightHead = (): Mesh[] => [
  FF(prism(12, 0, 9, [5, 5.2], [5.3, 5.4], BLACK.plate), [BLACK.plate, BLACK.alt], 1, 0.06),
  FF(lowSphere(5.35, BLACK.plate, [0, 9, 0], 12, 5, [1, 0.8, 1.02], (c) => c[1] > 0.1), [BLACK.plate, BLACK.alt], 2, 0.06),
  F(placeMesh(box(4.6, 7, 1.4, BLACK.dark), [0, 0.45, 0], [2, 4.4, 4.8]), [BLACK.dark], 3, 0.12),
  F(placeMesh(box(4.6, 7, 1.4, BLACK.dark), [0, -0.45, 0], [-2, 4.4, 4.8]), [BLACK.dark], 4, 0.12),
  box(8, 1, 1.2, VOID_GLOW, [0, 6, 5.6]),
  ...[1, -1].flatMap((x, i) => [FSeg([4 * x, 9, 0], [8 * x, 13, -2], 1.4, 0.9, [BLACK.edge], 5 + i * 3), FSeg([8 * x, 13, -2], [9.4 * x, 17, -5], 0.9, 0.5, [BLACK.edge], 6 + i * 3), FS([9.4 * x, 17, -5], [9.6 * x, 20, -9], 0.5, BLACK.edge, 7 + i * 3)]),
  // 面甲上的氣孔
  ...[2.2, 3.4].flatMap((y) => [box(0.5, 0.6, 1, 0x0c0b10, [1.4, y, 5.6]), box(0.5, 0.6, 1, 0x0c0b10, [-1.4, y, 5.6])]),
];

const KNIGHT_PARTS = bossRig({
  shoulderX: 9.4,
  root: [
    F(prism(12, 3.2, 0, [7, 5.4], [7.2, 5.6], BLACK.dark), [BLACK.dark, BLACK.plate], 1),
    F(prism(12, 0.4, -2.4, [7.3, 5.7], [7.6, 5.9], BLACK.plate), [BLACK.plate, BLACK.alt], 2),
    F(box(2.6, 2.2, 1, BLACK.edge, [0, 1.6, 5.8]), [BLACK.edge], 3, 0.15),
    box(1, 1.4, 0.4, VOID_GLOW, [0, 1.6, 6.3]),
    // 兩側腰間的圓形紋章
    ...[1, -1].map((x, i) => F(placeMesh(prism(16, 0, 0.8, [2.2, 2.2], [1.9, 1.9], BLACK.edge), [0, 0, (-Math.PI / 2) * x], [7.4 * x, 1.4, 0]), [BLACK.edge, BLACK.plate], 30 + i)),
  ],
  waist: [
    F(prism(12, 0, 3, [7.2, 5.4], [7.6, 5.6], BLACK.plate), [BLACK.plate, BLACK.alt], 1),
    F(prism(12, 2.8, 5.2, [7.6, 5.6], [8, 5.8], BLACK.dark), [BLACK.dark], 2),
    F(prism(12, 5, 7.2, [8, 5.8], [8.2, 5.9], BLACK.plate), [BLACK.plate, BLACK.alt], 3),
  ],
  chest: [
    FF(prism(12, 0, 6.8, [8.2, 5.9], [9.6, 6.2], BLACK.plate), [BLACK.plate, BLACK.alt], 1, 0.08),
    F(prism(12, 6.8, 9.5, [9.6, 6.2], [7, 5], BLACK.dark), [BLACK.dark], 2),
    F(placeMesh(box(1.8, 9, 1.8, BLACK.edge), [0, Math.PI / 4, 0], [0, 3, 5.8]), [BLACK.edge], 3, 0.1),
    box(1, 4, 0.6, VOID_GLOW, [0, 3.5, 6.4]),
    // 胸前左右的圓形護片
    ...[1, -1].map((x, i) => F(placeMesh(prism(16, 0, 0.8, [2.4, 2.4], [2, 2], BLACK.edge), [Math.PI / 2, 0, 0], [4.4 * x, 5.4, 5.9]), [BLACK.edge, BLACK.plate], 32 + i)),
    box(4, 1, 0.6, VOID_GLOW, [0, 4.5, 6.3]),
    ...[-4.2, 4.2].map((x, i) => F(lowSphere(0.7, BLACK.edge, [x, 5.2, 5.9], 5, 3), [BLACK.edge], 4 + i, 0.05)),
    // 背後的披風扣環、扣環之間的鎖鏈、背甲上的符文板
    ...[-4.6, 4.6].map((x, i) => F(lowSphere(1.2, BLACK.edge, [x, 8.6, -5.4], 6, 4), [BLACK.edge], 6 + i, 0.06)),
    ...Array.from({ length: 7 }, (_, i) => F(placeMesh(prism(6, 0.5, -0.5, [0.7, 0.3], [0.7, 0.3], BLACK.edge), [0, 0, Math.PI / 2 + (i % 2) * 0.6], [-3.6 + i * 1.2, 9.3 - Math.sin((i / 6) * Math.PI) * 1.4, -5.8]), [BLACK.edge], 10 + i)),
    ...[1.5, 4, 6.5].flatMap((y, i) => [F(box(6.6 - i * 0.4, 1.8, 0.8, BLACK.dark, [0, y, -6.1]), [BLACK.dark], 20 + i), box(2.6, 0.4, 0.4, VOID_GLOW, [0, y, -6.6])]),
  ],
  neck: [F(prism(12, -0.5, 3.5, [4, 3.8], [3.4, 3.2], BLACK.dark), [BLACK.dark], 1, 0.08)],
  head: knightHead(),
  // 紫焰盔纓（ex_crest，會隨動作延遲擺動）
  crest: [...[0, -2.2, -4.4].map((z, i) => F(placeMesh(prism(4, 0, 4.4 - i * 0.8, [1, 1.6], [0.5, 1], i === 0 ? VOID_GLOW : 0x7a44cc), [-0.35 - i * 0.2, 0, 0], [0, -0.6, z + 2]), [i === 0 ? VOID_GLOW : 0x7a44cc], 1 + i, 0.1))],
  clavicle: (side) => [F(placeMesh(box(5, 1.8, 4, BLACK.dark), [0, 0, -0.15 * side], [2.6 * side, 0.4, 0]), [BLACK.dark, BLACK.plate], 1, 0.12)],
  pad: (side) => pauldron(side, BLACK),
  upperArm: () => plateUpperArm(BLACK),
  forearm: () => plateForearm(BLACK),
  hand: () => gauntlet(BLACK),
  fingers: () => fingers(BLACK),
  thumb: () => thumb(BLACK),
  weapon: darkGreatsword(),
  tasset: (side) => tasset(side, BLACK),
  thigh: () => plateThigh(BLACK, 3.4),
  shin: () => plateShin(BLACK, 3.1),
  foot: () => sabaton(BLACK),
  toe: () => toeCap(BLACK, BLACK.edge),
  cloth: [F(prism(4, 0, -12, [3, 0.5], [3.4, 0.5], CAPE), [CAPE, CAPE_ALT], 1, 0.08), F(placeMesh(prism(3, -12, -15, [1.6, 0.4], [0.05, 0.05], CAPE), [0, 0, 0], [0, 0, 0]), [CAPE], 2, 0.08)],
  cape: { upper: (col) => capeUpper(col, CAPE, CAPE_ALT, 3.4), lower: (col) => capeLower(col, CAPE, CAPE_ALT, 3.9) },
});

const FALLEN_KNIGHT: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: REF,
  parts: KNIGHT_PARTS,
  poses: bossPoses(KNIGHT_PARTS, { weapon: 'greatsword', cast: 'roar' }),
  secondary: bossSecondary(KNIGHT_PARTS),
  gaitRate: 0.68,
  weaponJoint: 'weapon',
  weaponTip: [0, -37, 0],
  dynamicShadow: true,
};

export const ARMORED_BOSSES: Record<string, FigureModel> = {
  'enemy.crypt_guardian': CRYPT_GUARDIAN,
  'enemy.fallen_knight': FALLEN_KNIGHT,
};

