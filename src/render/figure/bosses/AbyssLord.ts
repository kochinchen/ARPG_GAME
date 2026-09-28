import { seg } from '../Creatures';
import type { FigureModel, PartDef } from '../FigureModel';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { F, FF, FS, FSeg } from './BossParts';
import { bossPoses, roarEnvelope } from './BossPoses';
import { BOSS_HIP, bossRig, bossSecondary, type Side } from './BossRig';

/**
 * 30F 深淵魔王（深淵分身共用）：絕代魔王的外型。
 * 全身像厚甲一樣的紅色肌肉塊（胸肌、腹肌、斜方肌、三角肌），肌肉之間透出發光的熔岩裂紋；
 * 往上彎的黑色巨角、發光的眼、獠牙；骨金色鑲邊與巨大尖刺的肩甲；骷髏腰扣與長腰布；
 * 分節甲片的長尾（箭頭尾端）；巨大的破爛翼膜（翼骨與發光的翼脈）；黑色利爪與爪足。
 * 動作厚重：挺胸、雙臂張開、緩慢沉重的步伐，重擊時身體與膝蓋深深壓下；待機時不定期仰天怒吼（翅膀同時張開）。
 */

const RED = 0x951610;
const RED_ALT = 0xa51e16;
const RED_DARK = 0x5a0c0a;
const RED_DEEP = 0x3e0806;
const HORN = 0x2c2020;
const HORN_ALT = 0x3c2c2a;
const BONE = 0xcbb487;
const BONE_ALT = 0xb89f70;
const LAVA = 0xff6a1a;
const LAVA_HOT = 0xffb040;
const WING = 0x8a1410;
const WING_DARK = 0x5a0c0a;

const R = [RED, RED_ALT];
const RD = [RED_DARK, RED];
const BN = [BONE, BONE_ALT];
const HN = [HORN, HORN_ALT];

/** 發光的熔岩裂紋（不受光線影響的亮色細條） */
const vein = (a: V3, b: V3, r = 0.35): Mesh => seg(a, b, r * 1.6, r * 1.1, LAVA, 4);
/** 肌肉 / 甲殼塊：傾斜的方塊，細分成小三角面 */
const plate = (w: number, h: number, d: number, c: V3, tilt: V3 = [0, 0, 0], colors: readonly number[] = R, seed = 0): Mesh => FF(placeMesh(box(w, h, d, colors[0]!), tilt, c), colors, seed, 0.1);
/** 骨金色鑲邊條 */
const trim = (a: V3, b: V3, w = 0.7, seed = 0): Mesh => FSeg(a, b, w, w, BN, seed, 6);

// ─────────────────────────── 頭 ───────────────────────────

const head = (): Mesh[] => [
  // 稜角分明的頭：頭頂、額頭（往下壓的怒眉）、臉頰、口鼻
  FF(lowSphere(5.6, RED, [0, 5.8, 0.2], 10, 6, [1, 0.95, 1.05]), R, 1, 0.08),
  plate(8.4, 2.2, 3.2, [0, 7.4, 3.6], [0.35, 0, 0], RD, 2),
  ...[1, -1].map((x, i) => plate(2.6, 3.2, 3.2, [3.2 * x, 4.2, 3.2], [0, 0.35 * x, 0.2 * x], R, 3 + i)),
  plate(3.6, 3, 3.6, [0, 3.4, 4.8], [0.25, 0, 0], RD, 5),
  // 發光的眼（兩層：外圈橘、內圈亮）
  ...[1, -1].flatMap((x) => [box(2.8, 1.3, 1, LAVA, [2.3 * x, 6.2, 5.6]), box(1.6, 0.8, 1.1, LAVA_HOT, [2.3 * x, 6.2, 5.8])]),
  // 額頭中央的熔岩紋
  vein([0, 7, 5.3], [0, 9.6, 3.6]),
  // 巨角：從兩側往外、往上彎，最後尖端往內（三段）
  ...[1, -1].flatMap((x, i) => [
    FSeg([3.8 * x, 8.8, 0.4], [8.8 * x, 12.6, 0.8], 2.8, 2.1, HN, 10 + i * 5, 8),
    FSeg([8.8 * x, 12.6, 0.8], [11.4 * x, 18.6, 0], 2.1, 1.4, HN, 11 + i * 5, 8),
    FSeg([11.4 * x, 18.6, 0], [10.4 * x, 24.6, -1.4], 1.4, 0.7, HN, 12 + i * 5, 6),
    FS([10.4 * x, 24.6, -1.4], [8.2 * x, 28.6, -2.2], 0.7, HORN, 13 + i * 5),
    // 後方的小角
    FS([3 * x, 9, -2.4], [5.2 * x, 11.6, -7], 0.8, HORN, 14 + i * 5),
  ]),
];

/** 下顎與獠牙（怒吼時大張） */
const jaw = (): Mesh[] => [
  plate(6.4, 2.4, 4.2, [0, -0.9, 2.8], [0, 0, 0], RD, 1),
  ...[1, -1].map((x, i) => FS([1.9 * x, 0.2, 4.6], [2.1 * x, 3.4, 5.2], 0.6, BONE, 2 + i)),
  ...[-0.7, 0.7].map((x, i) => FS([x, 0.1, 4.6], [x, 1.8, 4.9], 0.35, BONE, 4 + i)),
  box(4, 0.6, 2, LAVA, [0, 0.2, 3.4]),
];

// ─────────────────────────── 軀幹 ───────────────────────────

const pelvis = (): Mesh[] => [
  FF(prism(14, 3.4, -2.6, [8.4, 6.4], [8.8, 6.7], RED_DARK), RD, 1, 0.06),
  // 骨金色腰帶與骷髏腰扣（眼窩透出熔岩光、兩根小角）
  F(prism(14, 2.2, 3.8, [8.9, 6.8], [8.9, 6.8], BONE), BN, 2),
  FF(lowSphere(2.4, BONE, [0, 2.4, 7], 8, 5, [1, 1.1, 0.8]), BN, 3, 0.08),
  ...[1, -1].flatMap((x, i) => [box(0.8, 0.8, 0.5, LAVA_HOT, [0.9 * x, 2.8, 8.8]), FS([1.8 * x, 3.6, 7], [3.4 * x, 5.4, 7.4], 0.5, BONE, 4 + i)]),
  // 腰帶兩側的骨片
  ...[1, -1].map((x, i) => plate(2.4, 3, 1.4, [6.4 * x, 1.6, 4.8], [0, 0.6 * x, 0], BN, 6 + i)),
];

const waist = (): Mesh[] => [
  FF(prism(14, -0.5, 7.4, [8.4, 6.2], [10.4, 7], RED_DARK), RD, 1, 0.06),
  // 腹肌三排、兩側的腹斜肌，肌肉之間的熔岩紋
  ...[1.2, 3.5, 5.8].flatMap((y, i) => [plate(2.8, 2, 1.2, [1.7, y, 6.6 + i * 0.2], [0.05, 0.1, 0], R, 2 + i * 2), plate(2.8, 2, 1.2, [-1.7, y, 6.6 + i * 0.2], [0.05, -0.1, 0], R, 3 + i * 2)]),
  ...[1, -1].map((x, i) => plate(2, 6.6, 4.4, [8 * x, 3.6, 2.8], [0, 0.4 * x, 0.12 * x], RD, 8 + i)),
  vein([0, 0, 7.1], [0, 7, 7.8]),
];

const chest = (): Mesh[] => [
  FF(prism(14, 0, 7.2, [10.4, 7], [14.4, 8.2], RED), R, 1, 0.06),
  F(prism(14, 7.2, 10.4, [14.4, 8.2], [9, 6.2], RED_DARK), RD, 2),
  // 巨大的胸肌（左右各一塊，往前下壓）
  plate(8.4, 6, 2.4, [4.4, 4.6, 7.6], [0.2, 0.18, 0.08], R, 3),
  plate(8.4, 6, 2.4, [-4.4, 4.6, 7.6], [0.2, -0.18, -0.08], R, 4),
  // 胸口中央發光的十字符文
  vein([0, 0.6, 8.4], [0, 7.6, 8.9], 0.5),
  vein([-3, 5, 8.9], [3, 5, 8.9], 0.45),
  // 斜方肌（連到脖子的厚肌肉）
  ...[1, -1].map((x, i) => plate(6, 4.2, 6, [4.2 * x, 9.8, -0.6], [0, 0, -0.4 * x], RD, 5 + i)),
  // 背闊肌與背上的骨金菱形符文、沿脊椎的尖刺
  ...[1, -1].map((x, i) => plate(3.4, 8, 5.4, [11.4 * x, 2.8, -1.8], [0, 0, 0.25 * x], RD, 7 + i)),
  plate(3.8, 3.8, 0.8, [0, 5.4, -8.2], [0, 0, Math.PI / 4], BN, 9),
  box(1.6, 1.6, 0.8, LAVA_HOT, [0, 5.4, -8.5]),
  vein([0, 0, -7.6], [0, 10, -7.4], 0.4),
  ...[1.6, 8.4].map((y, i) => FS([0, y, -7.6], [0, y + 1.6, -10.6], 0.9, HORN, 10 + i)),
];

// ─────────────────────────── 手臂 ───────────────────────────

/** 巨大的肩甲：三層紅甲 + 骨金鑲邊 + 一根往上彎的骨金大刺 + 一根黑刺 */
const pauldron = (side: Side): Mesh[] => [
  FF(lowSphere(5.6, RED, [0.8 * side, 0.6, 0], 10, 6, [1.1, 0.9, 1.05]), R, 1, 0.08),
  ...[0, 1, 2].map((i) => FF(placeMesh(prism(12, 0, -2.6, [6 - i * 0.5, 5.5 - i * 0.5], [6.7 - i * 0.5, 6.1 - i * 0.5], i % 2 ? RED_DARK : RED), [0, 0, (0.4 + i * 0.12) * side], [(1.7 + i * 0.7) * side, 2.9 - i * 2.6, 0]), i % 2 ? RD : R, 2 + i, 0.06)),
  F(placeMesh(prism(12, 0, -0.8, [6.8, 6.2], [6.9, 6.3], BONE), [0, 0, 0.4 * side], [1.7 * side, 0.3, 0]), BN, 5),
  FSeg([2.8 * side, 5.2, 0], [6 * side, 10.8, -0.6], 1.8, 1.2, BN, 6, 8),
  FS([6 * side, 10.8, -0.6], [6.2 * side, 15.6, -2.2], 1.2, BONE, 7),
  FS([4 * side, 4, 3.4], [8.2 * side, 6.6, 5.8], 1.1, HORN, 8),
  vein([1.9 * side, 1.2, 5.3], [5.5 * side, -1.6, 4.3]),
];

const upperArm = (side: Side): Mesh[] => [
  F(prism(14, 0, -10.5, [4.6, 4.6], [3.8, 3.8], RED_DARK), RD, 1),
  // 二頭肌、三頭肌
  plate(3.8, 6, 3.2, [0, -4.4, 3.4], [0.1, 0, 0], R, 2),
  plate(3.4, 5.6, 3, [0, -4.8, -3.4], [-0.1, 0, 0], RD, 3),
  vein([2.4 * side, -2, 2.8], [2.6 * side, -8, 2]),
];

const forearm = (side: Side): Mesh[] => [
  F(prism(14, 0, -9.5, [4, 4], [3.5, 3.5], RED_DARK), RD, 1),
  // 厚重的護臂甲（紅甲 + 骨金邊）與往後的尖刺
  FF(prism(12, -2.4, -9.2, [4.7, 4.7], [4.2, 4.2], RED), R, 2, 0.06),
  F(prism(12, -2.2, -3.1, [4.8, 4.8], [4.8, 4.8], BONE), BN, 3),
  ...[-3.6, -6.6].map((y, i) => FS([0, y, -4], [0, y + 1.6, -8.2], 1, HORN, 4 + i)),
  vein([-2.6 * side, -3.6, 3.2], [-2.2 * side, -8, 2.8]),
];

const hand = (): Mesh[] => [plate(5.4, 3.8, 4.4, [0, -1.7, 0.2], [0, 0, 0], RD, 1), F(prism(12, 0.6, -0.6, [3.8, 3.5], [3.9, 3.6], BONE), BN, 2)];

/** 黑色長爪（四根手指，每根兩節） */
const claws = (): Mesh[] =>
  [-1.9, -0.65, 0.65, 1.9].flatMap((x, i) => [F(box(1.5, 2.6, 1.6, RED, [x, -1.2, 0]), R, i), FSeg([x, -2.4, 0.1], [x * 1.1, -5, 1.1], 0.75, 0.55, HN, i + 4, 6), FS([x * 1.1, -5, 1.1], [x * 1.2, -8.4, 2.6], 0.55, HORN, i + 8)]);

// ─────────────────────────── 腿 ───────────────────────────

const thigh = (side: Side): Mesh[] => [
  F(prism(14, 0, -13, [5.2, 5.2], [4.2, 4.2], RED_DARK), RD, 1),
  plate(4, 7.6, 3, [0, -5, 4.2], [0.1, 0, 0], R, 2),
  plate(3, 6.6, 3, [3.8 * side, -5.6, 0], [0, 0, 0.1 * side], RD, 3),
  vein([0, -2, 5.4], [0.6, -10, 4.6]),
];

/** 厚重的脛甲：骨金色的護膝尖刺、紅甲、骨金邊 */
const shin = (): Mesh[] => [
  FF(lowSphere(4.4, RED, [0, 0, 1], 10, 6, [1, 1, 1.15]), R, 1, 0.08),
  FSeg([0, 0.6, 4.4], [0, 4, 7.8], 1.5, 0.9, BN, 2, 8),
  FS([0, 4, 7.8], [0, 6.8, 9], 0.9, BONE, 3),
  FF(prism(14, -1.4, -12.8, [4.7, 5], [4, 4.3], RED_DARK), RD, 4, 0.05),
  F(prism(14, -9.6, -10.6, [4.35, 4.65], [4.25, 4.55], BONE), BN, 5),
  plate(3, 8, 1.6, [0, -6, 4.7], [-0.05, 0, 0], R, 6),
  vein([-2.6, -3, 3.6], [-2.8, -9, 3.2]),
];

const foot = (): Mesh[] => [FF(box(6.8, 3.4, 7.2, RED_DARK, [0, -1.6, 0.8]), RD, 1, 0.1), F(prism(12, 0.8, -0.6, [4.4, 4.6], [4.5, 4.7], BONE), BN, 2), FS([0, -1.2, -2.2], [0, -2.4, -5], 0.9, HORN, 3)];
const toes = (): Mesh[] => [-2.2, 0, 2.2].flatMap((x, i) => [F(box(1.8, 1.8, 2.4, RED, [x, -0.4, 1]), R, i), FS([x, -0.5, 2], [x * 1.15, -1.5, 5.4], 0.9, HORN, i + 3)]);

// ─────────────────────────── 翅膀與尾巴 ───────────────────────────

/** 翼膜：雙面三角形（兩種頂點順序各一面） */
const membrane = (a: V3, b: V3, c: V3, color = WING): Mesh => ({
  verts: [a, b, c],
  faces: [
    { idx: [0, 1, 2], color },
    { idx: [0, 2, 1], color },
  ],
});

/** 翅膀上段（ex_wing?1）：從肩胛往外上到翼肘的粗翼骨、翼肘的骨金尖刺 */
const wingUpper = (side: Side): Mesh[] => {
  const elbow: V3 = [side * 12, 11, -5];
  return [
    FSeg([0, 0, 0], elbow, 1.9, 1.3, RD, 1, 8),
    FF(lowSphere(2, RED_DARK, elbow, 8, 5), RD, 2, 0.08),
    FSeg(elbow, [side * 13.6, 16, -6], 1.1, 0.6, BN, 3, 6),
    FS([side * 13.6, 16, -6], [side * 13.4, 20, -7], 0.6, BONE, 4),
    FS([side * 5, 4.6, -2], [side * 5.8, 8, -3.6], 0.6, HORN, 5),
    membrane([0, 0, 0], elbow, [side * 8, -8, -3]),
    membrane([0, 0, 0], [side * 8, -8, -3], [side * 1.4, -10, -1], WING_DARK),
    vein([side * 1, 0, -0.4], [side * 11, 10, -4.8], 0.3),
  ];
};

/** 翅膀下段（ex_wing?2，翼肘）：四根翼指、翼指之間的翼膜（下緣破爛成鋸齒）、發光翼脈 */
const wingLower = (side: Side): Mesh[] => {
  const tips: V3[] = [
    [side * 16, 8, -3],
    [side * 15, -8, -3],
    [side * 10, -20, -2],
    [side * 3, -24, -1],
  ];
  const base: V3 = [0, 0, 0];
  const mid = (a: V3, b: V3, k: number, drop: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - drop, a[2] + (b[2] - a[2]) * k];
  return [
    ...tips.map((tip, i) => FSeg(base, tip, 1 - i * 0.1, 0.25, RD, 1 + i, 6)),
    ...tips.map((tip, i) => FS(tip, [tip[0] * 1.08, tip[1] - 2, tip[2]], 0.35, HORN, 5 + i)),
    // 翼膜：每兩根翼指之間兩片，下緣往內凹成破爛的鋸齒
    ...tips.slice(0, 3).flatMap((tip, i) => {
      const next = tips[i + 1]!;
      const notch = mid(tip, next, 0.5, 3 + i);
      return [membrane(base, tip, notch, i % 2 ? WING_DARK : WING), membrane(base, notch, next, i % 2 ? WING : WING_DARK)];
    }),
    membrane(base, tips[3]!, [side * -4, -22, 0.5], WING_DARK),
    membrane([side * 12, 1, -3.2], tips[0]!, tips[1]!, WING_DARK),
    // 翼脈（發光）
    ...tips.slice(0, 3).map((tip) => vein(mid(base, tip, 0.2, 0), mid(base, tip, 0.85, 0), 0.22)),
  ];
};

/** 尾巴的一段：分節的紅甲、每節背上一片骨金色的鱗、兩側的熔岩紋 */
const tailSegment = (r0: number, r1: number, len: number, seed: number): Mesh[] => [
  FSeg([0, 0, 0], [0, -len, 0], r0, r1, R, seed, 10),
  plate(r0 * 1.2, len * 0.55, 0.8, [0, -len * 0.4, -r0 * 0.95], [0.12, 0, 0], BN, seed + 1),
  FS([0, -len * 0.6, -r0 * 0.9], [0, -len * 0.6 - 1, -r0 - 2], 0.6, HORN, seed + 2),
  vein([r0 * 0.9, -0.5, 0], [r1 * 0.9, -len + 0.5, 0], 0.22),
];
/** 尾巴尖端：箭頭狀的紅甲尖刃（兩側倒鉤） */
const tailTip = (): Mesh[] => [
  FSeg([0, 0, 0], [0, -4, 0], 1.1, 0.8, R, 1, 8),
  FF(placeMesh(prism(4, 0, -7, [3, 0.7], [0.1, 0.1], RED), [0, 0, 0], [0, -4, 0]), R, 2, 0.06),
  ...[1, -1].map((x, i) => FS([x * 1.4, -5, 0], [x * 3.8, -3.6, 0], 0.6, HORN, 3 + i)),
  vein([0, -4, 0.8], [0, -10, 0.2], 0.25),
];

/** 翅膀整體放大 */
const WING_SCALE = 1.25;
const scaled = (meshes: Mesh[]): Mesh[] => meshes.map((m) => ({ ...m, verts: m.verts.map(([x, y, z]) => [x * WING_SCALE, y * WING_SCALE, z * WING_SCALE] as V3) }));

const EXTRA: PartDef[] = [
  { joint: 'ex_wingL1', parent: 'chest', offset: [4.6, 8.6, -6.8], meshes: scaled(wingUpper(1)) },
  { joint: 'ex_wingL2', parent: 'ex_wingL1', offset: [12 * WING_SCALE, 11 * WING_SCALE, -5 * WING_SCALE], meshes: scaled(wingLower(1)) },
  { joint: 'ex_wingR1', parent: 'chest', offset: [-4.6, 8.6, -6.8], meshes: scaled(wingUpper(-1)) },
  { joint: 'ex_wingR2', parent: 'ex_wingR1', offset: [-12 * WING_SCALE, 11 * WING_SCALE, -5 * WING_SCALE], meshes: scaled(wingLower(-1)) },
  { joint: 'ex_tail1', parent: 'root', offset: [0, -0.4, -6.4], meshes: tailSegment(2.4, 2, 8, 1) },
  { joint: 'ex_tail2', parent: 'ex_tail1', offset: [0, -8, 0], meshes: tailSegment(2, 1.6, 7.5, 5) },
  { joint: 'ex_tail3', parent: 'ex_tail2', offset: [0, -7.5, 0], meshes: tailSegment(1.6, 1.2, 7, 9) },
  { joint: 'ex_tail4', parent: 'ex_tail3', offset: [0, -7, 0], meshes: tailTip() },
];

const PARTS = bossRig({
  shoulderX: 13.2,
  hipX: 4.6,
  upperArmLen: 10.5,
  forearmLen: 9.5,
  root: pelvis(),
  waist: waist(),
  chest: chest(),
  neck: [F(prism(14, -0.4, 3.4, [5, 4.6], [4.4, 4], RED_DARK), RD, 1), ...[1, -1].map((x, i) => plate(2, 4.2, 3, [3.6 * x, 1.6, 0.6], [0, 0, -0.3 * x], R, 2 + i))],
  head: head(),
  jaw: jaw(),
  // 頭頂一圈小尖刺（冠）
  crest: Array.from({ length: 5 }, (_, i) => FS([(i - 2) * 1.3, -1.2, 1.4 - Math.abs(i - 2) * 0.7], [(i - 2) * 1.7, 2.6 - Math.abs(i - 2) * 0.6, 0.6 - Math.abs(i - 2) * 0.9], 0.6, HORN, 1 + i)),
  clavicle: (side) => [plate(7, 3.2, 5.6, [3.6 * side, 0.4, 0], [0, 0, -0.2 * side], RD, 1)],
  pad: pauldron,
  upperArm,
  forearm,
  hand,
  fingers: claws,
  thumb: () => [F(box(1.3, 2, 1.3, RED, [0, -0.9, 0]), R, 1), FS([0, -1.8, 0], [0, -5, 1.2], 0.55, HORN, 2)],
  // 腿甲片：紅甲 + 骨金邊
  tasset: (side) => [plate(1.8, 8.6, 7.4, [1.6 * side, -3.6, 0.4], [0, 0, -0.16 * side], R, 1), trim([2.8 * side, -7.9, 3.9], [2.8 * side, -7.9, -3.1], 0.55, 2)],
  thigh,
  shin,
  foot,
  toe: toes,
  // 前方長腰布（下緣破成尖角、骨金邊）、後方短腰布
  cloth: [
    FF(prism(4, 0, -15, [3.6, 0.5], [4, 0.5], RED_DEEP), [RED_DEEP, RED_DARK], 1, 0.06),
    ...[-1, 0, 1].map((k, i) => F(placeMesh(prism(3, -15, -19 - Math.abs(k) * -1.4, [1.6, 0.4], [0.05, 0.05], RED_DEEP), [0, 0, 0], [k * 1.8, 0, 0]), [RED_DEEP], 2 + i)),
    ...[1, -1].map((x, i) => trim([2.7 * x, -0.4, 0.5], [3 * x, -14.4, 0.5], 0.45, 5 + i)),
  ],
  clothBack: [FF(prism(4, 0, -11, [4, 0.5], [4.4, 0.5], RED_DEEP), [RED_DEEP, RED_DARK], 1, 0.06)],
  extra: EXTRA,
});

/** 怒吼的節奏（翅膀與身體同步）：每 9 秒一次、持續 2.2 秒 */
const ROAR = { period: 9, duration: 2.2 };

export const ABYSS_LORD: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: 0.5,
  parts: PARTS,
  idleRoar: ROAR,
  poses: bossPoses(PARTS, {
    weapon: 'claws',
    cast: 'roar',
    idleRoar: ROAR,
    // 翅膀：平時半張往上、走路時隨步伐輕拍、出招時大張、怒吼時完全張開；尾巴：拖在身後，左右甩動
    // 重擊命中時膝蓋與身體再往下壓（重挫感）
    accent: (kind, x) => {
      const roar = kind === 'idle' ? roarEnvelope(x, ROAR.period, ROAR.duration) : 0;
      const spread = kind === 'windup' ? 0.3 + x * 0.12 : kind === 'strike' ? 0.6 - x * 0.2 : roar * 0.55;
      const flap = kind === 'walk' ? Math.sin(x * 2) * 0.12 : kind === 'idle' ? Math.sin(x * 0.8) * 0.05 : 0;
      const sway = kind === 'walk' ? Math.sin(x - 0.8) * 0.35 : kind === 'idle' ? Math.sin(x * 0.6) * 0.18 : kind === 'strike' ? 0.45 : 0;
      const slam: Record<string, [number, number, number]> =
        kind === 'strike' && x === 0 ? { chest: [0.12, 0, 0], torso: [0.08, 0, 0], shinL: [0.25, 0, 0], shinR: [0.25, 0, 0], thighL: [-0.12, 0, 0], thighR: [-0.12, 0, 0] } : {};
      return {
        ...slam,
        ex_wingL1: [0.15, -0.3 + spread, -0.05 - flap - spread * 0.55],
        ex_wingR1: [0.15, 0.3 - spread, 0.05 + flap + spread * 0.55],
        ex_wingL2: [0, 0.15 - spread * 0.35, -flap - spread * 0.2],
        ex_wingR2: [0, -0.15 + spread * 0.35, flap + spread * 0.2],
        ex_tail1: [1.15, sway * 0.4, 0],
        ex_tail2: [-0.35, sway * 0.3, 0],
        ex_tail3: [-0.3, sway * 0.3, 0],
        ex_tail4: [-0.25, sway * 0.2, 0],
      };
    },
  }),
  secondary: bossSecondary(PARTS, {
    ex_wingL2: { rate: 8, gravity: 0 },
    ex_wingR2: { rate: 8, gravity: 0 },
    ex_tail2: { rate: 8, gravity: 0.3 },
    ex_tail3: { rate: 6, gravity: 0.35 },
    ex_tail4: { rate: 5, gravity: 0.4 },
  }),
  gaitRate: 0.6,
  dynamicShadow: true,
};
