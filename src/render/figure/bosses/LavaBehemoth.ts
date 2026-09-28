import { seg } from '../Creatures';
import type { FigureModel } from '../FigureModel';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { F, FF, FS } from './BossParts';
import { bossPoses } from './BossPoses';
import { BOSS_HIP, bossRig, bossSecondary, type Side } from './BossRig';

/**
 * 15F 熔岩巨獸：方正厚重的岩石巨像。
 * 小方塊頭（方形發光的眼、三顆三角熔岩牙、頭頂一圈岩刺冠，其中三根頂著黃金寶石）；
 * 胸口深色岩板中央是金色多面寶石核心，熔岩裂紋從核心放射成 X 字；
 * 四肢是一節節方柱岩塊，每節有垂直的熔岩縫；巨大的岩石拳頭被熔岩裂紋包住；
 * 帶尖刺的肩上巨岩、背後一排垂直熔岩條紋；岩柱腿與往外張開的岩石腳趾。
 * 站姿直立、雙臂粗重地垂在兩側、兩腳大開。
 */

const ROCK = 0x4a3a33;
const ROCK_ALT = 0x564439;
const ROCK_DARK = 0x2e2320;
const ROCK_LIGHT = 0x6a5446;
const LAVA = 0xff7a1a;
const LAVA_HOT = 0xffb838;
const GOLD = 0xf2c230;
const GOLD_ALT = 0xdcaa22;

const RK = [ROCK, ROCK_ALT];
const RKD = [ROCK_DARK, ROCK];
const RKL = [ROCK_LIGHT, ROCK_ALT];

/** 方正的岩塊（細分成小三角面，表面有切面感） */
const block = (w: number, h: number, d: number, c: V3, tilt: V3 = [0, 0, 0], colors: readonly number[] = RK, seed = 0): Mesh => FF(placeMesh(box(w, h, d, colors[0]!), tilt, c), colors, seed, 0.07);
/** 碎岩（小塊、隨機傾斜） */
const chip = (s: number, c: V3, tilt: V3, colors: readonly number[] = RKL, seed = 0): Mesh => F(placeMesh(box(s, s * 0.8, s * 0.9, colors[0]!), tilt, c), colors, seed);
/** 熔岩裂縫（發光的細條） */
const crack = (a: V3, b: V3, r = 0.55): Mesh => seg(a, b, r, r * 0.8, LAVA, 4);
/** 垂直的熔岩縫（貼在岩塊表面） */
const seam = (x: number, y0: number, y1: number, z: number, w = 0.9): Mesh => box(w, Math.abs(y1 - y0), 0.5, LAVA, [x, (y0 + y1) / 2, z]);
/** 黃金多面寶石 */
const gem = (r: number, c: V3, seed = 0): Mesh => F(lowSphere(r, GOLD, c, 6, 4), [GOLD, GOLD_ALT], seed);

// ─────────────────────────── 頭 ───────────────────────────

const head = (): Mesh[] => [
  block(7.4, 6.6, 6.8, [0, 3.6, 0.4], [0, 0, 0], RKD, 1),
  block(8, 1.6, 7.4, [0, 7.2, 0.2], [0, 0, 0], RK, 2),
  // 方形發光的眼、三顆三角熔岩牙
  ...[1, -1].flatMap((x) => [box(2, 1.5, 0.6, LAVA_HOT, [1.8 * x, 4.6, 3.95]), box(1.2, 0.8, 0.7, 0xfff0a0, [1.8 * x, 4.6, 4.05])]),
  ...[-1.5, 0, 1.5].map((x) => placeMesh(prism(3, 0, 1.4, [0.55, 0.3], [0.05, 0.05], LAVA, [0, 0, 0], Math.PI / 2), [0, 0, 0], [x, 1.8, 3.9])),
  // 頭頂一圈岩刺冠，中間與兩側三根頂著黃金寶石
  ...[-3, -1.5, 0, 1.5, 3].map((x, i) => FS([x, 7.6, 0.6 - Math.abs(x) * 0.2], [x * 1.15, 12 - Math.abs(x) * 0.5, 0.2], 0.9, ROCK_DARK, 3 + i)),
  gem(1.3, [0, 13.4, 0.2], 8),
  gem(1.1, [3.6, 11.8, 0], 9),
  gem(1.1, [-3.6, 11.8, 0], 10),
  FS([2.6, 6.8, -3], [4, 10, -5], 0.9, ROCK_DARK, 11),
  FS([-2.6, 6.8, -3], [-4, 10, -5], 0.9, ROCK_DARK, 12),
];

// ─────────────────────────── 軀幹 ───────────────────────────

const pelvis = (): Mesh[] => [
  block(11, 6, 8.4, [0, 0, 0], [0, 0, 0], RKD, 1),
  block(12, 2.6, 9, [0, 2.4, 0], [0, 0, 0], RK, 2),
  // 前方垂下的岩板與熔岩裂紋
  block(5.4, 6, 1.6, [0, -3.6, 4.4], [0.1, 0, 0], RK, 3),
  crack([-2, -1, 5.3], [0, -5.6, 5.4]),
  crack([2, -1, 5.3], [0, -5.6, 5.4]),
  ...[1, -1].map((x, i) => chip(2.6, [5.4 * x, 1.4, 3], [0.3, 0.4 * x, 0.2], RKL, 4 + i)),
];

const waist = (): Mesh[] => [
  block(10, 7.6, 7.6, [0, 3.4, 0], [0, 0, 0], RK, 1),
  seam(-2, 0.6, 6.4, 3.85),
  seam(2, 0.6, 6.4, 3.85),
  seam(0, 1, 6, -3.85, 1.1),
  ...[1, -1].map((x, i) => chip(2.8, [5 * x, 4, 2], [0.4, 0.3 * x, 0.3], RKL, 2 + i)),
];

const chest = (): Mesh[] => [
  // 往上變寬的厚胸（四角錐台）與上緣的斜方岩塊
  FF(prism(4, -0.6, 9.2, [8.6, 6.6], [12.4, 8], ROCK), RK, 1, 0.06),
  FF(prism(4, 9, 11.6, [12.4, 8], [9, 6.4], ROCK_DARK), RKD, 2, 0.06),
  // 胸口深色岩板、中央金色寶石核心、放射成 X 字的熔岩裂紋
  block(11, 7.4, 1.6, [0, 4.8, 5.7], [-0.06, 0, 0], RKD, 3),
  FF(lowSphere(2.5, GOLD, [0, 5, 7], 8, 5), [GOLD, GOLD_ALT], 4, 0.08),
  ...[
    [4.8, 8.4],
    [-4.8, 8.4],
    [4.4, 1.2],
    [-4.4, 1.2],
  ].map(([x, y]) => crack([0, 5, 6.9], [x!, y!, 6.7], 0.55)),
  crack([0, 5, 6.9], [0, -0.4, 6.6], 0.5),
  crack([-1.4, 4.2, 7], [-2.8, 2.6, 7.2], 0.35),
  crack([1.4, 4.2, 7], [2.8, 2.6, 7.2], 0.35),
  // 背後一排垂直的熔岩條紋與背刺
  ...[-4.5, -1.5, 1.5, 4.5].map((x) => seam(x, 1, 9.4 - Math.abs(x) * 0.3, -6.9 - Math.abs(x) * 0.12, 1)),
  ...[-3, 0, 3].map((x, i) => FS([x, 9.6, -6.6], [x * 1.2, 14 - Math.abs(x) * 0.4, -9], 1.2, ROCK_DARK, 5 + i)),
  ...[1, -1].map((x, i) => chip(3.4, [9 * x, 5, -3.4], [0.3, 0.5 * x, 0.2], RKL, 8 + i)),
];

// ─────────────────────────── 手臂 ───────────────────────────

/** 肩上的尖刺巨岩 */
const pauldron = (side: Side): Mesh[] => [
  FF(lowSphere(6.2, ROCK, [0.8 * side, 0.8, 0], 10, 6, [1.05, 0.9, 1]), RK, 1, 0.08),
  chip(4, [3.2 * side, 3.4, 2], [0.4, 0.3, 0.5 * side], RKL, 2),
  chip(3.6, [2.4 * side, 2.4, -3.2], [0.2, -0.4, 0.3], RKD, 3),
  FS([2 * side, 4.6, -0.6], [4 * side, 10, -1.4], 1.4, ROCK_DARK, 4),
  FS([4.6 * side, 3, 1.4], [8 * side, 6, 2.4], 1, ROCK_DARK, 5),
  crack([1.4 * side, 4.8, 3.6], [4.6 * side, 0, 4.4]),
];

/** 上臂：方柱岩塊，正面與外側有垂直熔岩縫 */
const upperArm = (side: Side): Mesh[] => [
  block(7.2, 11.4, 7.2, [0, -5.6, 0], [0, 0, 0], RK, 1),
  seam(0, -1.6, -9.8, 3.7),
  seam(3.7 * side, -2, -9.4, 0.6),
  block(7.8, 2, 7.8, [0, -10.4, 0], [0, 0, 0], RKD, 2),
];

/** 前臂：往拳頭變粗的方柱，熔岩縫與一圈裂紋 */
const forearm = (side: Side): Mesh[] => [
  FF(prism(4, 0.6, -10.4, [5.4, 5.4], [6.6, 6.6], ROCK), RK, 1, 0.06),
  seam(0, -1.6, -8.6, 4.8),
  seam(-4.8 * side, -2, -8, 0.4),
  crack([-4.4, -8.6, 4.4], [4.4, -8.6, 4.4], 0.45),
  chip(3, [4.6 * side, -4, -2.4], [0.4, 0.3, 0.2], RKL, 2),
];

/** 巨大的岩石拳頭（熔岩裂紋包住拳頭） */
const fist = (): Mesh[] => [
  block(9.2, 8, 8.4, [0, -4, 0.4], [0, 0, 0], RK, 1),
  ...[-3, -1, 1, 3].map((x, i) => block(2.2, 2.4, 2.6, [x, -7, 4.2], [0.1, 0, 0], RKL, 2 + i)),
  crack([-4.8, -1.4, 4.8], [4.8, -1.4, 4.8], 0.5),
  crack([4.8, -1.4, 4.8], [4.9, -7.6, 3], 0.45),
  crack([-4.8, -2, 4.6], [-4.9, -8, 2.6], 0.45),
  crack([-3.4, -7.8, 5.6], [3.4, -7.8, 5.6], 0.4),
];

// ─────────────────────────── 腿 ───────────────────────────

const thigh = (side: Side): Mesh[] => [block(8.4, 13, 8.4, [0, -6.4, 0], [0, 0, 0], RK, 1), seam(0, -2, -11, 4.3, 1.1), seam(4.3 * side, -3, -10, 0.4), chip(3, [-3.6 * side, -4, 3], [0.3, 0.3, 0.4], RKL, 2)];

const shin = (): Mesh[] => [
  block(9, 4, 9, [0, 0, 0.6], [0, 0, 0], RKD, 1),
  FF(prism(4, -1.6, -12.8, [6.2, 6.2], [6.8, 6.8], ROCK), RK, 2, 0.06),
  seam(0, -3, -11.4, 4.9, 1.2),
  seam(-3.2, -4, -10, 4.2, 0.7),
  chip(3, [0, 1.4, 4.4], [0.4, 0, 0.3], RKL, 3),
];

/** 岩石腳掌與往外張開的四根岩趾 */
const foot = (): Mesh[] => [block(10.4, 4, 9, [0, -1.8, 0.8], [0, 0, 0], RKD, 1), crack([-4.6, -0.2, 5.4], [4.6, -0.2, 5.4], 0.4)];
const toes = (): Mesh[] =>
  [-3.6, -1.2, 1.2, 3.6].map((x, i) => FF(placeMesh(prism(4, 0, 4.6, [1.3, 1], [0.5, 0.4], ROCK_LIGHT, [0, 0, 0], Math.PI / 4), [Math.PI / 2 - 0.15, x * 0.1, 0], [x, -0.6, 1.6]), RKL, 1 + i, 0.06));

const PARTS = bossRig({
  shoulderX: 12.6,
  hipX: 5,
  upperArmLen: 11.4,
  forearmLen: 10.4,
  root: pelvis(),
  waist: waist(),
  chest: chest(),
  neck: [block(5, 3.4, 5, [0, 1.4, 0], [0, 0, 0], RKD, 1)],
  head: head(),
  clavicle: (side) => [block(6.4, 3, 6, [3.2 * side, 0.6, 0], [0, 0, -0.18 * side], RKD, 1)],
  pad: pauldron,
  upperArm,
  forearm,
  hand: fist,
  tasset: (side) => [block(2.4, 7, 7, [1 * side, -3.4, 0.4], [0, 0, -0.14 * side], RKD, 1), seam(2.3 * side, -1, -6, 1.6, 0.6)],
  thigh,
  shin,
  foot,
  toe: toes,
});

export const LAVA_BEHEMOTH: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: 0.5,
  parts: PARTS,
  poses: bossPoses(PARTS, { weapon: 'fists', hunch: 0.12, cast: 'roar' }),
  secondary: bossSecondary(PARTS),
  gaitRate: 0.52,
  dynamicShadow: true,
};
