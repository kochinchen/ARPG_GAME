import { seg } from '../Creatures';
import type { FigureModel, PartDef, Pose } from '../FigureModel';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { F, FF, FS, FSeg } from './BossParts';
import { bossPoses, roarEnvelope } from './BossPoses';
import { BOSS_HIP, bossRig, bossSecondary, type Side } from './BossRig';

/**
 * 35F 深淵統御者（docs/ENDGAME.md 5.3）：四足半身的巨大惡魔。
 * 上半身是惡魔戰士（寬胸、厚肩、兩對往後的角、甲殼面具只露出發光的眼與口），
 * 下半身是低伏的深淵獸體：前腳（沿用人形骨架的腿）＋獸身＋後腳，四腳以對角步伐（前左＋後右）前進；
 * 背後一對大型蝙蝠翼、由多段甲節組成的長尾（尾端骨刺）。右手深淵巨劍（約主角身高的 2.5 倍）、左手獸顱巨盾。
 * 配色：黑紅肉體＋深黑甲殼＋骨金色裝甲＋熔岩橘紅裂紋，由大型切面組成。
 * 階段：第 2 階段盾牌碎裂（碎片留在地上）、第 3 階段巨劍落地（插在地上），見 phaseHidden / phaseDrops。
 */

const FLESH = 0x6e0e0c;
const FLESH_ALT = 0x82140f;
const FLESH_DARK = 0x3e0707;
const SHELL = 0x1c1418;
const SHELL_ALT = 0x2a1e24;
const BONE = 0xcdb07a;
const BONE_ALT = 0xb2955f;
const LAVA = 0xff5a14;
const LAVA_HOT = 0xffa53a;
const BLADE = 0x16121a;
const BLADE_ALT = 0x241c26;
const WING = 0x7a1010;
const WING_DARK = 0x4a0808;

const FL = [FLESH, FLESH_ALT];
const FD = [FLESH_DARK, FLESH];
const SH = [SHELL, SHELL_ALT];
const BN = [BONE, BONE_ALT];

/** 發光的熔岩裂紋 */
const vein = (a: V3, b: V3, r = 0.35): Mesh => seg(a, b, r * 1.6, r * 1.1, LAVA, 4);
/** 大型切面的方塊（肌肉、甲殼） */
const plate = (w: number, h: number, d: number, c: V3, tilt: V3 = [0, 0, 0], colors: readonly number[] = FL, seed = 0): Mesh => FF(placeMesh(box(w, h, d, colors[0]!), tilt, c), colors, seed, 0.1);
/** 沿 -z（身體後方）延伸的多邊柱：z 從 z0 到 z1 */
const alongZ = (n: number, z0: number, z1: number, r0: [number, number], r1: [number, number], color: number, at: V3): Mesh => placeMesh(prism(n, z0, z1, r0, r1, color), [Math.PI / 2, 0, 0], at);

// ─────────────────────────── 頭 ───────────────────────────

const head = (): Mesh[] => [
  // 黑紅甲殼包住的臉：頭殼、往前壓的額甲、兩側頰甲、口部
  FF(lowSphere(5.4, SHELL, [0, 5.6, 0.4], 10, 6, [1, 1, 1.1]), SH, 1, 0.08),
  plate(8.6, 2.4, 3.4, [0, 7.4, 3.8], [0.4, 0, 0], SH, 2),
  ...[1, -1].map((x, i) => plate(2.8, 4, 3.6, [3.4 * x, 3.8, 3.4], [0, 0.4 * x, 0.2 * x], FD, 3 + i)),
  plate(4, 2.6, 3.4, [0, 2.4, 5.2], [0.2, 0, 0], FD, 5),
  // 發光的眼與口（只露出這些）
  ...[1, -1].flatMap((x) => [box(2.8, 1.1, 1, LAVA, [2.2 * x, 5.8, 5.9]), box(1.6, 0.7, 1.1, LAVA_HOT, [2.2 * x, 5.8, 6.1])]),
  box(3.6, 0.7, 1, LAVA, [0, 2.2, 6.8]),
  vein([0, 7.2, 5.4], [0, 10, 3.2]),
  // 兩對往後延伸的角：主角（往後上彎）、副角（往後下）
  ...[1, -1].flatMap((x, i) => [
    FSeg([3.6 * x, 8.4, 0.4], [7.6 * x, 12.4, -3.4], 2.6, 2, SH, 10 + i * 6, 8),
    FSeg([7.6 * x, 12.4, -3.4], [9.2 * x, 16.4, -9.6], 2, 1.3, SH, 11 + i * 6, 8),
    FSeg([9.2 * x, 16.4, -9.6], [8.6 * x, 18.4, -15.4], 1.3, 0.6, SH, 12 + i * 6, 6),
    FS([8.6 * x, 18.4, -15.4], [7.8 * x, 18.8, -19], 0.6, BONE, 13 + i * 6),
    FSeg([4.4 * x, 5.4, -1.8], [7.6 * x, 4.2, -7.2], 1.5, 0.9, SH, 14 + i * 6, 6),
    FS([7.6 * x, 4.2, -7.2], [8.4 * x, 2.4, -11], 0.9, BONE, 15 + i * 6),
  ]),
];

const jaw = (): Mesh[] => [plate(5.8, 2.2, 4, [0, -0.9, 2.8], [0, 0, 0], SH, 1), ...[1, -1].map((x, i) => FS([1.8 * x, 0.2, 4.4], [2 * x, 3, 5], 0.55, BONE, 2 + i)), box(3.6, 0.5, 2, LAVA, [0, 0.2, 3.4])];

// ─────────────────────────── 上半身 ───────────────────────────

/** 骨盆：與獸身相接，外面包一圈大片甲殼 */
const pelvis = (): Mesh[] => [
  FF(prism(12, 3.4, -3.4, [8.8, 7.4], [9.6, 8], FLESH_DARK), FD, 1, 0.06),
  F(prism(12, 2.4, 4.2, [9.4, 8], [9.4, 8], BONE), BN, 2),
  ...[1, -1].map((x, i) => plate(4.6, 6, 8.6, [7.4 * x, -0.6, -1], [0, 0, 0.25 * x], SH, 3 + i)),
  // 獸身的前胸（人身底下往前凸的厚肌肉）
  FF(lowSphere(9, FLESH, [0, -6.4, 2.4], 10, 6, [1, 0.75, 0.95]), FL, 5, 0.08),
  vein([-4, -6, 10], [4, -9, 9.4]),
];

const waist = (): Mesh[] => [
  FF(prism(12, -0.5, 7.4, [8.6, 6.8], [10.8, 7.6], FLESH_DARK), FD, 1, 0.06),
  ...[1.4, 4].flatMap((y, i) => [plate(3, 2.2, 1.2, [1.8, y, 7.2], [0.05, 0.1, 0], FL, 2 + i * 2), plate(3, 2.2, 1.2, [-1.8, y, 7.2], [0.05, -0.1, 0], FL, 3 + i * 2)]),
  ...[1, -1].map((x, i) => plate(2.4, 7, 5, [8.8 * x, 3.4, 2.4], [0, 0.4 * x, 0.12 * x], SH, 7 + i)),
  vein([0, 0, 7.6], [0, 7, 8.2]),
];

const chest = (): Mesh[] => [
  FF(prism(12, 0, 7.6, [11, 7.4], [16, 9], FLESH), FL, 1, 0.06),
  F(prism(12, 7.6, 10.8, [16, 9], [10, 6.6], FLESH_DARK), FD, 2),
  // 胸甲：骨金色的兩片胸板＋中央熔岩符文
  plate(9, 6.4, 2.2, [4.8, 4.6, 8.6], [0.2, 0.2, 0.08], BN, 3),
  plate(9, 6.4, 2.2, [-4.8, 4.6, 8.6], [0.2, -0.2, -0.08], BN, 4),
  vein([0, 0.8, 9.8], [0, 8, 10.2], 0.55),
  vein([-3.4, 5.2, 10.2], [3.4, 5.2, 10.2], 0.45),
  // 斜方肌、背上的甲殼與脊刺
  ...[1, -1].map((x, i) => plate(6.6, 4.6, 6.4, [4.6 * x, 10.2, -0.8], [0, 0, -0.4 * x], FD, 5 + i)),
  plate(12, 9, 3, [0, 4.6, -8.6], [0, 0, 0], SH, 7),
  ...[2, 6, 9.4].map((y, i) => FS([0, y, -9.6], [0, y + 1.8, -13.4], 1, SHELL, 8 + i)),
];

/** 巨大肩甲：黑色甲殼三層＋骨金鑲邊＋往上的骨刺 */
const pauldron = (side: Side): Mesh[] => [
  FF(lowSphere(6.4, SHELL, [0.8 * side, 0.8, 0], 10, 6, [1.1, 0.9, 1.05]), SH, 1, 0.08),
  ...[0, 1, 2].map((i) => FF(placeMesh(prism(10, 0, -2.8, [6.6 - i * 0.5, 6 - i * 0.5], [7.3 - i * 0.5, 6.6 - i * 0.5], i % 2 ? SHELL_ALT : SHELL), [0, 0, (0.4 + i * 0.12) * side], [(1.8 + i * 0.7) * side, 3 - i * 2.7, 0]), SH, 2 + i, 0.06)),
  F(placeMesh(prism(10, 0, -0.9, [7.4, 6.8], [7.5, 6.9], BONE), [0, 0, 0.4 * side], [1.8 * side, 0.3, 0]), BN, 5),
  FSeg([3 * side, 5.6, 0], [6.6 * side, 12, -1], 2, 1.3, BN, 6, 8),
  FS([6.6 * side, 12, -1], [6.8 * side, 17, -2.6], 1.3, BONE, 7),
  vein([2 * side, 1.4, 5.8], [6 * side, -1.6, 4.6]),
];

const upperArm = (side: Side): Mesh[] => [
  F(prism(12, 0, -11, [5, 5], [4.2, 4.2], FLESH_DARK), FD, 1),
  plate(4.2, 6.6, 3.4, [0, -4.6, 3.6], [0.1, 0, 0], FL, 2),
  plate(3.8, 6, 3.2, [0, -5, -3.6], [-0.1, 0, 0], FD, 3),
  vein([2.6 * side, -2, 3], [2.8 * side, -8.6, 2.2]),
];

const forearm = (): Mesh[] => [
  F(prism(12, 0, -10, [4.4, 4.4], [3.8, 3.8], FLESH_DARK), FD, 1),
  FF(prism(10, -2.4, -9.6, [5.2, 5.2], [4.6, 4.6], SHELL), SH, 2, 0.06),
  F(prism(10, -2.2, -3.2, [5.3, 5.3], [5.3, 5.3], BONE), BN, 3),
  ...[-3.8, -7].map((y, i) => FS([0, y, -4.4], [0, y + 1.8, -8.8], 1, SHELL, 4 + i)),
];

const hand = (): Mesh[] => [plate(5.8, 4, 4.8, [0, -1.8, 0.2], [0, 0, 0], FD, 1), F(prism(10, 0.6, -0.6, [4.2, 3.8], [4.3, 3.9], BONE), BN, 2)];
const claws = (): Mesh[] => [-2, -0.7, 0.7, 2].flatMap((x, i) => [F(box(1.6, 2.6, 1.7, FLESH, [x, -1.2, 0]), FL, i), FSeg([x, -2.4, 0.1], [x * 1.1, -5.2, 1.2], 0.8, 0.55, SH, i + 4, 6)]);

// ─────────────────────────── 武器：深淵巨劍、獸顱巨盾 ───────────────────────────

/** 深淵巨劍（weapon 關節，劍尖朝 -y）：黑色劍脊、赤紅熔岩裂痕、骨質鋸齒；總長約主角身高的 2.5 倍 */
const greatsword = (): Mesh[] => [
  // 握柄與骨金色護手（兩端往上彎的角）
  FSeg([0, 5, 0], [0, -2, 0], 1, 1, BN, 1, 6),
  plate(11, 2.2, 2.6, [0, -2.6, 0], [0, 0, 0], BN, 2),
  ...[1, -1].map((x, i) => FS([5.4 * x, -2.6, 0], [7.6 * x, 1.2, 0], 1, BONE, 3 + i)),
  // 劍身：往劍尖變窄的厚刃（大切面）、中央熔岩裂痕
  FF(prism(4, -3.6, -40, [4.4, 1.3], [2.6, 0.8], BLADE, [0, 0, 0], Math.PI / 4), [BLADE, BLADE_ALT], 5, 0.06),
  FF(prism(4, -40, -46, [2.6, 0.8], [0.2, 0.2], BLADE, [0, 0, 0], Math.PI / 4), [BLADE, BLADE_ALT], 6, 0.06),
  vein([0, -5, 1.2], [0, -38, 0.9], 0.5),
  vein([0.8, -12, 1.1], [2, -18, 0.9], 0.3),
  vein([-0.6, -24, 1], [-1.8, -30, 0.8], 0.3),
  // 骨質鋸齒（背側）
  ...[-8, -14, -20, -26, -32].map((y, i) => FS([-3.8, y, 0], [-6, y - 2.4, 0], 0.8, BONE, 7 + i)),
];

/** 獸顱巨盾（weaponL 關節，盾面朝前 +z）：上方兩根角、眼窩透出熔岩光、厚實的切面 */
const skullShieldBase = (): Mesh[] => [
  FF(placeMesh(prism(6, -1.2, 1.2, [11, 13], [10, 12], SHELL), [Math.PI / 2, 0, 0], [0, -6, 5]), SH, 1, 0.1),
  FF(placeMesh(prism(6, 1.2, 3, [10, 12], [7.4, 9], BONE), [Math.PI / 2, 0, 0], [0, -6, 5]), BN, 2, 0.1),
  // 顱骨的額、眼窩、鼻樑與牙
  plate(9, 5, 2.4, [0, -1.6, 9.4], [0.2, 0, 0], BN, 3),
  ...[1, -1].flatMap((x, i) => [box(3, 2, 1, FLESH_DARK, [2.8 * x, -4.4, 9.2]), box(1.8, 1.1, 1.2, LAVA, [2.8 * x, -4.4, 9.6]), FS([4 * x, -12, 8.4], [3 * x, -15.4, 8.8], 0.8, BONE, 4 + i)]),
  FS([0, -6.4, 9.2], [0, -9.2, 10.4], 1, BONE, 6),
  // 上方的角
  ...[1, -1].flatMap((x, i) => [FSeg([6 * x, 2, 6], [11 * x, 8, 4.6], 1.6, 1, SH, 7 + i * 2, 6), FS([11 * x, 8, 4.6], [12.4 * x, 13, 3.4], 1, BONE, 8 + i * 2)]),
  vein([-6, -9, 8.6], [6, -9, 8.6], 0.35),
];
/** 盾牌放大 1.6 倍，往上移到胸前（左手自然下垂時，盾面擋在胸口前方） */
const SHIELD_SCALE = 1.6;
const skullShield = (): Mesh[] =>
  skullShieldBase().map((m) => ({ ...m, verts: m.verts.map(([x, y, z]) => [x * SHIELD_SCALE - 5, y * SHIELD_SCALE + 16, z * SHIELD_SCALE + 2] as V3) }));

// ─────────────────────────── 獸身、後腳、前腳 ───────────────────────────

/** 獸身（ex_barrel，從骨盆往後延伸）：厚重的肌肉桶身、背上的甲殼與骨刺、腹部與兩側的熔岩裂紋 */
const barrel = (): Mesh[] => [
  FF(alongZ(10, 0, -26, [9, 7.6], [8, 7], FLESH, [0, 0, 0]), FL, 1, 0.08),
  FF(alongZ(10, -24, -30, [8, 7], [5, 4.6], FLESH_DARK, [0, 0, 0]), FD, 2, 0.08),
  // 背上的大片甲殼（四片）與骨刺
  ...[0, 1, 2, 3].map((i) => plate(15 - i * 0.6, 3, 7, [0, 7 - i * 0.2, -3.6 - i * 6.4], [-0.08, 0, 0], SH, 3 + i)),
  ...[-2, -8.4, -14.8, -21.2].map((z, i) => FS([0, 8.4, z], [0, 13.6 - i * 0.6, z - 2.6], 1.2, BONE, 8 + i)),
  // 兩側的肋甲與熔岩裂紋、腹部
  ...[1, -1].flatMap((x, i) => [plate(2.4, 8, 18, [8.4 * x, 0.6, -12], [0, 0, 0.12 * x], SH, 12 + i), vein([8.8 * x, 4, -4], [8.4 * x, -3, -20], 0.45)]),
  plate(12, 2.4, 18, [0, -7.4, -12], [0, 0, 0], FD, 14),
];

const hindThigh = (side: Side): Mesh[] => [
  FF(lowSphere(6.4, FLESH, [0, -2, 0], 10, 6, [0.9, 1.2, 1.1]), FL, 1, 0.08),
  F(prism(10, -2, -13, [5.6, 5.8], [4.4, 4.6], FLESH_DARK), FD, 2),
  plate(3, 8, 7, [4.6 * side, -5.4, 0], [0, 0, 0.1 * side], SH, 3),
  vein([5.4 * side, -2, 2], [5 * side, -10, 1]),
];
const hindShin = (): Mesh[] => [FF(lowSphere(4, FLESH_DARK, [0, 0, -0.6], 8, 5), FD, 1, 0.08), F(prism(10, -1, -12.5, [4, 4.2], [3.4, 3.6], FLESH_DARK), FD, 2), plate(2.4, 8, 3, [0, -6, -3.4], [0.1, 0, 0], SH, 3)];
/** 巨大爪趾的獸掌（前後腳共用） */
const paw = (): Mesh[] => [
  FF(box(7.4, 3.6, 8.4, FLESH_DARK, [0, -1.8, 1.4]), FD, 1, 0.1),
  F(prism(10, 0.6, -0.6, [4.4, 4.6], [4.5, 4.7], BONE), BN, 2),
  ...[-2.6, 0, 2.6].map((x, i) => FS([x, -2.4, 5.4], [x * 1.2, -3.4, 9.4], 1, BONE, 3 + i)),
  FS([0, -1.4, -2.6], [0, -2.6, -5.6], 0.9, BONE, 6),
];

/** 前腳（人形骨架的 thigh / shin）：比後腳粗、帶骨金色護膝 */
const foreThigh = (side: Side): Mesh[] => [F(prism(10, 0, -13, [5.8, 5.8], [4.8, 4.8], FLESH_DARK), FD, 1), plate(4.4, 8, 3.4, [0, -5, 4.6], [0.1, 0, 0], FL, 2), plate(3.4, 7, 3.4, [4.2 * side, -5.6, 0], [0, 0, 0.1 * side], SH, 3)];
const foreShin = (): Mesh[] => [
  FF(lowSphere(4.8, SHELL, [0, 0, 1], 10, 6, [1, 1, 1.15]), SH, 1, 0.08),
  FSeg([0, 0.6, 4.8], [0, 4.4, 8.4], 1.6, 1, BN, 2, 8),
  FF(prism(10, -1.4, -12.8, [5, 5.2], [4.2, 4.4], FLESH_DARK), FD, 3, 0.05),
  F(prism(10, -9.6, -10.6, [4.6, 4.8], [4.5, 4.7], BONE), BN, 4),
];

// ─────────────────────────── 翅膀、尾巴 ───────────────────────────

const membrane = (a: V3, b: V3, c: V3, color = WING): Mesh => ({
  verts: [a, b, c],
  faces: [
    { idx: [0, 1, 2], color },
    { idx: [0, 2, 1], color },
  ],
});
const WING_SCALE = 1.5;
const scaled = (meshes: Mesh[]): Mesh[] => meshes.map((m) => ({ ...m, verts: m.verts.map(([x, y, z]) => [x * WING_SCALE, y * WING_SCALE, z * WING_SCALE] as V3) }));
const wingUpper = (side: Side): Mesh[] => {
  const elbow: V3 = [side * 12, 11, -5];
  return [
    FSeg([0, 0, 0], elbow, 2, 1.4, FD, 1, 8),
    FF(lowSphere(2.2, SHELL, elbow, 8, 5), SH, 2, 0.08),
    FS(elbow, [side * 14, 20, -7], 0.9, BONE, 3),
    membrane([0, 0, 0], elbow, [side * 8, -8, -3]),
    membrane([0, 0, 0], [side * 8, -8, -3], [side * 1.4, -10, -1], WING_DARK),
    vein([side * 1, 0, -0.4], [side * 11, 10, -4.8], 0.3),
  ];
};
const wingLower = (side: Side): Mesh[] => {
  const tips: V3[] = [
    [side * 17, 9, -3],
    [side * 16, -8, -3],
    [side * 11, -21, -2],
    [side * 3, -25, -1],
  ];
  const base: V3 = [0, 0, 0];
  const mid = (a: V3, b: V3, k: number, drop: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - drop, a[2] + (b[2] - a[2]) * k];
  return [
    ...tips.map((tip, i) => FSeg(base, tip, 1.1 - i * 0.1, 0.3, SH, 1 + i, 6)),
    ...tips.map((tip, i) => FS(tip, [tip[0] * 1.08, tip[1] - 2.4, tip[2]], 0.4, BONE, 5 + i)),
    ...tips.slice(0, 3).flatMap((tip, i) => {
      const next = tips[i + 1]!;
      const notch = mid(tip, next, 0.5, 3 + i);
      return [membrane(base, tip, notch, i % 2 ? WING_DARK : WING), membrane(base, notch, next, i % 2 ? WING : WING_DARK)];
    }),
    membrane(base, tips[3]!, [side * -4, -22, 0.5], WING_DARK),
    ...tips.slice(0, 3).map((tip) => vein(mid(base, tip, 0.2, 0), mid(base, tip, 0.85, 0), 0.24)),
  ];
};

/** 尾巴的一節（Polygon 甲節）：黑甲、背上一片骨金鱗與骨刺、兩側的熔岩紋 */
const tailSegment = (r0: number, r1: number, len: number, seed: number): Mesh[] => [
  FSeg([0, 0, 0], [0, -len, 0], r0, r1, FL, seed, 8),
  plate(r0 * 1.9, len * 0.7, r0 * 1.4, [0, -len * 0.45, -r0 * 0.5], [0.1, 0, 0], SH, seed + 1),
  FS([0, -len * 0.55, -r0 * 1.1], [0, -len * 0.55 - 1.4, -r0 - 3], 0.8, BONE, seed + 2),
  vein([r0 * 0.9, -0.5, 0], [r1 * 0.9, -len + 0.5, 0], 0.24),
];
const tailTip = (): Mesh[] => [
  FSeg([0, 0, 0], [0, -5, 0], 1.4, 1, SH, 1, 8),
  FF(placeMesh(prism(4, 0, -9, [3.6, 0.8], [0.1, 0.1], BONE), [0, 0, 0], [0, -5, 0]), BN, 2, 0.06),
  ...[1, -1].map((x, i) => FS([x * 1.6, -6, 0], [x * 4.6, -4.4, 0], 0.7, BONE, 3 + i)),
];

/** 前腳髖關節離中心的距離（hipX）與獸身長度：後腳掛在獸身尾端，與前腳同高 */
const BARREL_LEN = 26;

const EXTRA: PartDef[] = [
  { joint: 'ex_barrel', parent: 'root', offset: [0, -1, -4], meshes: barrel() },
  ...([1, -1] as const).flatMap((side): PartDef[] => {
    const S = side === 1 ? 'L' : 'R';
    return [
      { joint: `ex_hthigh${S}`, parent: 'ex_barrel', offset: [6.4 * side, 0, -(BARREL_LEN - 4)], meshes: hindThigh(side) },
      { joint: `ex_hshin${S}`, parent: `ex_hthigh${S}`, offset: [0, -13, 0], meshes: hindShin() },
      { joint: `ex_hfoot${S}`, parent: `ex_hshin${S}`, offset: [0, -12.5, 0], meshes: paw() },
    ];
  }),
  { joint: 'ex_wingL1', parent: 'chest', offset: [5, 8.8, -7.4], meshes: scaled(wingUpper(1)) },
  { joint: 'ex_wingL2', parent: 'ex_wingL1', offset: [12 * WING_SCALE, 11 * WING_SCALE, -5 * WING_SCALE], meshes: scaled(wingLower(1)) },
  { joint: 'ex_wingR1', parent: 'chest', offset: [-5, 8.8, -7.4], meshes: scaled(wingUpper(-1)) },
  { joint: 'ex_wingR2', parent: 'ex_wingR1', offset: [-12 * WING_SCALE, 11 * WING_SCALE, -5 * WING_SCALE], meshes: scaled(wingLower(-1)) },
  { joint: 'ex_tail1', parent: 'ex_barrel', offset: [0, 2, -BARREL_LEN - 2], meshes: tailSegment(3.2, 2.7, 9, 1) },
  { joint: 'ex_tail2', parent: 'ex_tail1', offset: [0, -9, 0], meshes: tailSegment(2.7, 2.2, 8.5, 5) },
  { joint: 'ex_tail3', parent: 'ex_tail2', offset: [0, -8.5, 0], meshes: tailSegment(2.2, 1.8, 8, 9) },
  { joint: 'ex_tail4', parent: 'ex_tail3', offset: [0, -8, 0], meshes: tailSegment(1.8, 1.4, 7.5, 13) },
  { joint: 'ex_tail5', parent: 'ex_tail4', offset: [0, -7.5, 0], meshes: tailTip() },
];

const PARTS = bossRig({
  shoulderX: 14,
  hipX: 6.4,
  upperArmLen: 11,
  forearmLen: 10,
  root: pelvis(),
  waist: waist(),
  chest: chest(),
  neck: [F(prism(12, -0.4, 3.4, [5.4, 5], [4.8, 4.4], FLESH_DARK), FD, 1), ...[1, -1].map((x, i) => plate(2.2, 4.4, 3.2, [3.8 * x, 1.6, 0.6], [0, 0, -0.3 * x], SH, 2 + i))],
  head: head(),
  jaw: jaw(),
  clavicle: (side) => [plate(7.4, 3.4, 6, [3.8 * side, 0.4, 0], [0, 0, -0.2 * side], FD, 1)],
  pad: pauldron,
  upperArm,
  forearm,
  hand,
  fingers: claws,
  thumb: () => [F(box(1.4, 2.1, 1.4, FLESH, [0, -0.9, 0]), FL, 1), FS([0, -1.9, 0], [0, -5, 1.2], 0.6, SHELL, 2)],
  weapon: greatsword(),
  weaponL: skullShield(),
  thigh: foreThigh,
  shin: foreShin,
  foot: paw,
  extra: EXTRA,
});

// ─────────────────────────── 動作 ───────────────────────────

/** 低吼（抬頭、翅膀稍微張開）：每 8 秒一次、持續 2 秒 */
const ROAR = { period: 8, duration: 2 };

/** 待機時巨劍往前下方傾斜的角度 */
const SWORD_LOWER = 2.55;

/** 後腳站立的基本角度：稍微往後張、膝蓋微彎（低伏） */
const HIND_STAND = { thigh: 0.18, shin: -0.1 };

const hindLegs = (swingL: number, swingR: number, liftL = 0, liftR = 0): Record<string, V3> => ({
  ex_hthighL: [HIND_STAND.thigh + swingL, 0, 0.06],
  ex_hshinL: [HIND_STAND.shin + liftL, 0, 0],
  ex_hfootL: [-(HIND_STAND.thigh + HIND_STAND.shin + swingL + liftL), 0, 0],
  ex_hthighR: [HIND_STAND.thigh + swingR, 0, -0.06],
  ex_hshinR: [HIND_STAND.shin + liftR, 0, 0],
  ex_hfootR: [-(HIND_STAND.thigh + HIND_STAND.shin + swingR + liftR), 0, 0],
});

const poses = bossPoses(PARTS, {
  weapon: 'greatsword',
  cast: 'roar',
  hunch: 0.1,
  idleRoar: ROAR,
  // 後腳、翅膀、尾巴：待機時尾巴慢慢擺、翅膀偶爾張開；走路時四足對角步伐（前左＋後右），
  // 出招前翅膀往外張開蓄力、命中時完全張開，尾巴往反方向甩（慣性）
  accent: (kind, x) => {
    const roar = kind === 'idle' ? roarEnvelope(x, ROAR.period, ROAR.duration) : 0;
    const spread = kind === 'windup' ? 0.35 + x * 0.14 : kind === 'strike' ? 0.75 - x * 0.2 : roar * 0.6;
    const flap = kind === 'walk' ? Math.sin(x * 2) * 0.08 : kind === 'idle' ? Math.sin(x * 0.7) * 0.05 : 0;
    const sway = kind === 'walk' ? Math.sin(x - 0.8) * 0.3 : kind === 'idle' ? Math.sin(x * 0.5) * 0.25 : kind === 'strike' ? -0.5 : 0.2;
    // 對角步伐：後右腳與前左腳同相（前左腳的擺動 = -0.45 sin p），後左腳與前右腳同相
    const s = kind === 'walk' ? Math.sin(x) : 0;
    const legs = hindLegs(0.42 * s, -0.42 * s, kind === 'walk' ? -0.7 * Math.max(0, -Math.cos(x)) : 0, kind === 'walk' ? -0.7 * Math.max(0, Math.cos(x)) : 0);
    // 待機與走路：巨劍斜向地面（出招時照原本的揮劍動作）
    const lowered: Record<string, V3> = kind === 'idle' || kind === 'walk' ? { weapon: [SWORD_LOWER, 0, 0] } : {};
    return {
      ...legs,
      ...lowered,
      ex_barrel: [kind === 'strike' ? -0.06 : 0, 0, 0],
      ex_wingL1: [0.15, -0.35 + spread, -0.05 - flap - spread * 0.55],
      ex_wingR1: [0.15, 0.35 - spread, 0.05 + flap + spread * 0.55],
      ex_wingL2: [0, 0.2 - spread * 0.4, -flap - spread * 0.25],
      ex_wingR2: [0, -0.2 + spread * 0.4, flap + spread * 0.25],
      ex_tail1: [1.45, sway * 0.35, 0],
      ex_tail2: [-0.2, sway * 0.3, 0],
      ex_tail3: [-0.18, sway * 0.3, 0],
      ex_tail4: [-0.15, sway * 0.25, 0],
      ex_tail5: [-0.1, sway * 0.2, 0],
    };
  },
});

export const ABYSS_SOVEREIGN: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: 0.5,
  parts: PARTS,
  idleRoar: ROAR,
  poses,
  secondary: bossSecondary(PARTS, {
    ex_wingL2: { rate: 7, gravity: 0 },
    ex_wingR2: { rate: 7, gravity: 0 },
    ex_tail2: { rate: 7, gravity: 0.25 },
    ex_tail3: { rate: 6, gravity: 0.3 },
    ex_tail4: { rate: 5, gravity: 0.35 },
    ex_tail5: { rate: 4, gravity: 0.4 },
  }),
  gaitRate: 0.5,
  dynamicShadow: true,
  // 第 2 階段（index 1）盾牌碎裂；第 3 階段（index 2）巨劍也落地
  phaseHidden: [[], ['weaponL'], ['weaponL', 'weapon']],
};

// ─────────────────────────── 掉在地上的盾與劍 ───────────────────────────

const still = (meshes: Mesh[]): FigureModel => {
  const pose: Pose = { rootY: 0, angles: {} };
  return {
    hipHeight: 0,
    referenceRadius: 0.5,
    parts: [{ joint: 'root', parent: null, offset: [0, 0, 0], meshes }],
    poses: { ready: () => pose, run: () => pose, attackWindup: pose, attackStrike: pose, castWindup: pose, castRelease: pose, hit: pose, dead: pose },
  };
};

/** 碎裂的盾牌：三大塊平躺在地上（盾面朝上） */
const SHIELD_SHARDS = still(
  [
    { at: [-7, 0.8, 2] as V3, spin: 0.4, tilt: 0.12 },
    { at: [6, 0.8, -3] as V3, spin: -0.9, tilt: -0.1 },
    { at: [1, 0.8, 8] as V3, spin: 2.2, tilt: 0.08 },
  ].flatMap(({ at, spin, tilt }, i) =>
    skullShieldBase()
      .slice(0, 3)
      .map((m): Mesh => {
        const placed = placeMesh({ ...m, verts: m.verts.map(([x, y, z]) => [x * 0.55, y * 0.55, z * 0.55] as V3) }, [-Math.PI / 2 + tilt, spin, 0], at);
        return i > 1 ? { ...placed, lod: 1 } : placed;
      }),
  ),
);

/** 插在地上的巨劍：劍尖朝下插入地面、微微傾斜 */
const PLANTED_SWORD = still(greatsword().map((m) => placeMesh(m, [0.18, 0.5, 0.12], [0, 34, 0])));

ABYSS_SOVEREIGN.phaseDrops = [null, { model: SHIELD_SHARDS, offset: [1.4, 1.2] }, { model: PLANTED_SWORD, offset: [-1.6, 0.8] }];
