import { seg, spike } from './Creatures';
import type { FigureModel, Joint, PartDef, Pose, PoseSet } from './FigureModel';
import { humanoid, monsterPoses, plus, pose, skull, type Angles } from './MonsterParts';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from './Poly3D';

/**
 * 樓層魔王的多面體模型（每 5 層）。以主角的尺寸設計（referenceRadius 0.5），
 * 遊戲中依 EnemyDef.size 放大到主角的 2 倍以上。
 */
const REF = 0.5;

// ═══════════════════════════ 5F 墓穴守衛 ═══════════════════════════

const IRON = 0x4c4842;
const IRON_DARK = 0x2e2b27;
const IRON_EDGE = 0x6c665c;
const RUST = 0x7a4a2a;
const EMBER = 0xff8a3a;
const TABARD = 0x3a2a22;

/** 分層肩甲（三片由大到小往下疊）與尖刺 */
const heavyPauldron = (side: 1 | -1, color: number, dark: number, spikeColor: number): Mesh[] => [
  placeMesh(prism(10, 0, -3.6, [5.4, 5], [5.9, 5.4], color), [0, 0, 0.35 * side], [1 * side, 2.4, 0]),
  placeMesh(prism(10, 0, -3, [5, 4.6], [5.4, 5], dark), [0, 0, 0.45 * side], [1.6 * side, -0.8, 0]),
  placeMesh(prism(10, 0, -2.4, [4.4, 4], [4.7, 4.3], color), [0, 0, 0.55 * side], [2 * side, -3.2, 0]),
  spike([2.6 * side, 4.4, 0], [5.4 * side, 9, -1], 1, spikeColor),
  spike([2.2 * side, 4.2, 2.6], [4.2 * side, 7.6, 3.4], 0.7, spikeColor),
];
const plateArm = (color: number, dark: number): Mesh[] => [prism(10, -1, -10, [2.8, 2.8], [2.5, 2.5], dark), prism(10, -4.5, -5.5, [2.9, 2.9], [2.9, 2.9], color)];
const plateForearm = (color: number, dark: number, edge: number): Mesh[] => [
  lowSphere(2.9, color, [0, 0, 0.4], 8, 5, [1, 1, 1.15]),
  prism(10, -1.2, -9, [2.6, 2.6], [3.1, 3.1], color),
  prism(10, -7.2, -9, [3.2, 3.2], [3.3, 3.3], edge),
  spike([0, -3, -2.4], [0, -6, -5.4], 0.8, dark),
];
const plateGauntlet = (color: number, dark: number): Mesh[] => [
  box(4.2, 3.8, 4, dark, [0, -1.8, 0]),
  box(4.3, 1.2, 4.2, color, [0, -0.2, 0]),
  ...[-1.4, 0, 1.4].map((x) => box(1.1, 2.4, 1.3, color, [x, -4.1, 1.1])),
];

/** 巨錘：長柄、方形錘頭、四面尖刺 */
const greatMace = (): Mesh[] => [
  ...plateGauntlet(IRON, IRON_DARK),
  prism(8, 5, -20, [1, 1], [1, 1], RUST),
  prism(8, -20, -22, [1.4, 1.4], [1.4, 1.4], IRON_EDGE),
  box(6, 7, 6, IRON_DARK, [0, -26, 0]),
  box(6.6, 1.2, 6.6, IRON_EDGE, [0, -23, 0]),
  box(6.6, 1.2, 6.6, IRON_EDGE, [0, -29, 0]),
  ...([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([x, z]) => spike([x * 3, -26, z * 3], [x * 6.4, -26, z * 6.4], 1.2, IRON_EDGE)),
  spike([0, -29.5, 0], [0, -33, 0], 1.2, IRON_EDGE),
];

/** 塔盾：掛在左前臂外側，盾面有十字紋與鉚釘 */
const towerShield = (): Mesh[] => [
  ...plateGauntlet(IRON, IRON_DARK),
  box(1.6, 22, 13, IRON_DARK, [2.8, -4, 3]),
  box(0.6, 20, 11, RUST, [3.8, -4, 3]),
  box(0.8, 18, 2, IRON_EDGE, [4.2, -4, 3]),
  box(0.8, 2, 9, IRON_EDGE, [4.2, 1, 3]),
  ...[[4, -2], [4, 8], [-12, -2], [-12, 8]].map(([y, z]) => lowSphere(0.7, IRON_EDGE, [4.4, y!, z!], 4, 3)),
];

const CRYPT_GUARDIAN: FigureModel = {
  hipHeight: 29,
  referenceRadius: REF,
  parts: humanoid({
    shoulderX: 9.2,
    root: [
      prism(10, 3.2, 0, [7, 5.4], [7.2, 5.6], IRON_DARK),
      // 破爛的戰袍（前後兩片）與四片腿甲
      placeMesh(box(6, 16, 0.8, TABARD), [0.12, 0, 0], [0, -6, 5.8]),
      placeMesh(box(7, 14, 0.8, TABARD), [-0.12, 0, 0], [0, -5, -5.8]),
      ...[1, -1].map((x) => placeMesh(box(1.2, 8, 6.4, IRON), [0, 0, -0.25 * x], [7.2 * x, -3, 0])),
    ],
    torso: [
      prism(12, 0, 7, [7.2, 5.4], [8.4, 5.9], IRON),
      prism(12, 7, 14, [8.4, 5.9], [10, 6.4], IRON),
      prism(12, 14, 17, [10, 6.4], [7, 5], IRON_DARK),
      placeMesh(box(2, 9, 2, IRON_EDGE), [0, Math.PI / 4, 0], [0, 10.5, 6]),
      box(14, 1.2, 1.2, IRON_EDGE, [0, 7, 6]),
      box(7, 12, 0.8, TABARD, [0, 5, 6.2]),
      // 胸口的骷髏紋章
      lowSphere(1.8, 0xd8ccb0, [0, 12.5, 6.6], 6, 4, [1, 1, 0.5]),
    ],
    neck: [prism(10, -0.5, 3.5, [4.2, 4], [3.6, 3.4], IRON_DARK)],
    head: [
      ...skull(0xcfc4aa),
      // 頭盔：包住頭頂與兩側，面前開口露出骷髏臉；兩根往前彎的角
      lowSphere(6.6, IRON, [0, 6.6, -0.4], 10, 6, [1.02, 1.05, 1.04], (c) => c[2] < 2 || c[1] > 3.5),
      box(10, 1.4, 1.4, IRON_EDGE, [0, 10, 4.6]),
      spike([4.8, 9, 0], [9, 14, 4], 1.4, 0xd8ccb0),
      spike([-4.8, 9, 0], [-9, 14, 4], 1.4, 0xd8ccb0),
      box(1.9, 1.2, 1.2, EMBER, [2, 6, 5.4]),
      box(1.9, 1.2, 1.2, EMBER, [-2, 6, 5.4]),
    ],
    upperArmL: [...heavyPauldron(1, IRON, IRON_DARK, IRON_EDGE), ...plateArm(IRON, IRON_DARK)],
    upperArm: [...heavyPauldron(-1, IRON, IRON_DARK, IRON_EDGE), ...plateArm(IRON, IRON_DARK)],
    forearmL: plateForearm(IRON, IRON_DARK, IRON_EDGE),
    forearm: plateForearm(IRON, IRON_DARK, IRON_EDGE),
    handL: towerShield(),
    handR: greatMace(),
    thigh: [prism(10, 0, -12, [3.6, 3.6], [3.1, 3.1], IRON), prism(10, -4, -5, [3.7, 3.7], [3.6, 3.6], IRON_EDGE)],
    shin: [lowSphere(3.2, IRON, [0, 0, 0.6], 8, 5, [1, 1, 1.15]), prism(10, -1.4, -12.5, [3.2, 3.4], [2.8, 3], IRON_DARK), box(1.6, 9, 1, IRON_EDGE, [0, -6.5, 3.2])],
    foot: [box(5, 3, 5, IRON_DARK, [0, -1.4, 0.4]), box(4.6, 2.2, 3.4, IRON, [0, -1.8, 3.8])],
  }),
  poses: monsterPoses({ attack: 'chop', cast: 'summon' }),
};

// ═══════════════════════════ 10F 墮落神官 ═══════════════════════════

const CRIMSON = 0x7a1620;
const CRIMSON_DARK = 0x420a12;
const GOLD = 0xd4a84a;
const PALE = 0xd8c8c0;
const BLOOD_GLOW = 0xff3a3a;

/** 法杖：長柄、頂端的尖角框架中懸著發光的紅寶珠 */
const priestStaff = (): Mesh[] => [
  lowSphere(1.7, PALE, [0, -1.4, 0], 6, 4),
  prism(8, 22, -24, [0.9, 0.9], [0.9, 0.9], 0x2a1a14),
  prism(8, 18, 20, [1.8, 1.8], [2.2, 2.2], GOLD),
  lowSphere(3, BLOOD_GLOW, [0, 25, 0], 8, 5),
  ...[0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return seg([Math.cos(a) * 2, 20, Math.sin(a) * 2], [Math.cos(a) * 3.6, 29, Math.sin(a) * 3.6], 0.5, 0.15, GOLD, 5);
  }),
];

const FALLEN_PRIEST: FigureModel = {
  hipHeight: 29,
  referenceRadius: REF,
  parts: humanoid({
    shoulderX: 7.8,
    root: [
      prism(12, 4, -27, [6.2, 5], [11, 9.2], CRIMSON),
      prism(12, -27, -28.8, [11, 9.2], [11.3, 9.5], CRIMSON_DARK),
      prism(12, -20, -21.2, [9.6, 8], [9.8, 8.2], GOLD),
      box(3, 26, 1, GOLD, [0, -11, 6.4]),
    ],
    torso: [
      prism(12, 0, 15, [6.2, 5], [8.2, 5.6], CRIMSON),
      prism(12, 11, 16.5, [8.6, 6], [5.6, 4.6], CRIMSON_DARK),
      box(2.4, 15, 1, GOLD, [0, 7.5, 5.4]),
      // 胸前的倒十字與肩上的金色鎖鏈披帶
      box(5, 1.2, 1, GOLD, [0, 10, 5.8]),
      placeMesh(box(1.4, 18, 1, GOLD), [0, 0, 0.55], [0, 9, 5.6]),
      // 背後的光環（墮落的尖刺光環）
      placeMesh(prism(12, 0, 1, [9, 9], [9, 9], GOLD), [Math.PI / 2, 0, 0], [0, 22, -7]),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return spike([Math.cos(a) * 9, 22 + Math.sin(a) * 9, -7], [Math.cos(a) * 13.5, 22 + Math.sin(a) * 13.5, -7], 0.9, i % 2 ? GOLD : BLOOD_GLOW);
      }),
    ],
    head: [
      lowSphere(5.2, PALE, [0, 5.4, 0.8], 10, 6, [0.95, 1.1, 1]),
      box(1.8, 1.2, 1, BLOOD_GLOW, [1.9, 6, 5.6]),
      box(1.8, 1.2, 1, BLOOD_GLOW, [-1.9, 6, 5.6]),
      box(2.4, 0.6, 0.8, CRIMSON_DARK, [0, 2.6, 5.4]),
      // 兜帽與兩根往後彎的角
      lowSphere(7, CRIMSON, [0, 6.4, -0.6], 10, 6, [1.05, 1.12, 1.08], (c) => c[2] < 2.4 || c[1] > 4),
      spike([3.6, 10.5, 0], [6.4, 16, -5], 1.2, 0x2a1a14),
      spike([-3.6, 10.5, 0], [-6.4, 16, -5], 1.2, 0x2a1a14),
    ],
    upperArm: [prism(10, 0, -10, [2.6, 2.6], [3.4, 3.4], CRIMSON)],
    forearm: [prism(10, 0, -9, [3.4, 3.4], [4.2, 4.2], CRIMSON), prism(10, -8, -9, [4.3, 4.3], [4.3, 4.3], GOLD)],
    handL: priestStaff(),
    handR: [lowSphere(1.7, PALE, [0, -1.4, 0], 6, 4), lowSphere(1.6, BLOOD_GLOW, [0, -4.2, 0.6], 6, 4)],
  }),
  poses: monsterPoses({ attack: 'chop', cast: 'staff' }),
};

/** 狂熱信徒（墮落神官召喚）：暗紅兜帽長袍、蒼白的臉 */
const CULTIST: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    root: [prism(10, 4, -27, [5.8, 4.6], [9.4, 8], CRIMSON_DARK), prism(10, -27, -28.4, [9.4, 8], [9.6, 8.2], 0x2a060c)],
    torso: [prism(10, 0, 15, [5.6, 4.4], [7.2, 5], CRIMSON_DARK), box(1.6, 14, 1, CRIMSON, [0, 7.5, 4.9])],
    head: [
      lowSphere(4.8, PALE, [0, 5.2, 0.8], 8, 5),
      box(1.4, 1, 1, BLOOD_GLOW, [1.7, 5.6, 5.2]),
      box(1.4, 1, 1, BLOOD_GLOW, [-1.7, 5.6, 5.2]),
      lowSphere(6.4, CRIMSON_DARK, [0, 6.2, -0.4], 10, 6, [1.05, 1.15, 1.08], (c) => c[2] < 2.2 || c[1] > 3.6),
      placeMesh(prism(6, 0, 5, [3.4, 3.4], [0.4, 0.4], CRIMSON_DARK), [-0.5, 0, 0], [0, 11, -3]),
    ],
    upperArm: [prism(8, 0, -10, [2.4, 2.4], [3, 3], CRIMSON_DARK)],
    forearm: [prism(8, 0, -9, [3, 3], [3.6, 3.6], CRIMSON_DARK)],
    handL: [lowSphere(1.6, PALE, [0, -1.4, 0], 6, 4), lowSphere(1.4, BLOOD_GLOW, [0, -3.6, 0.8], 6, 4)],
    handR: [lowSphere(1.6, PALE, [0, -1.4, 0], 6, 4)],
  }),
  poses: monsterPoses({ attack: 'chop', cast: 'staff' }),
};

// ═══════════════════════════ 15F 熔岩巨獸 ═══════════════════════════

const ROCK = 0x3c2e28;
const ROCK_DARK = 0x241a16;
const ROCK_LIGHT = 0x5a463a;
const LAVA = 0xff7020;
const LAVA_CORE = 0xffc040;

/** 岩塊：隨機傾斜的方塊，組成凹凸的岩石外皮 */
const rock = (w: number, h: number, d: number, color: number, c: V3, tilt: V3 = [0.2, 0.3, 0.1]): Mesh => placeMesh(box(w, h, d, color), tilt, c);
/** 發光的熔岩裂縫 */
const crack = (a: V3, b: V3, r = 0.7): Mesh => seg(a, b, r, r * 0.7, LAVA, 5);

const boulderFist = (): Mesh[] => [
  lowSphere(4.6, ROCK, [0, -3.4, 0.6], 8, 5, [1.1, 1, 1.1]),
  rock(3.6, 3, 3, ROCK_LIGHT, [2, -1.6, 2.6]),
  rock(3, 3.4, 3, ROCK_DARK, [-2.4, -5, 1.6], [0.4, -0.2, 0.3]),
  crack([-2, -3, 4.4], [2.4, -5, 4.2]),
];

const LAVA_BEHEMOTH: FigureModel = {
  hipHeight: 29,
  referenceRadius: REF,
  parts: humanoid({
    shoulderX: 11,
    root: [
      lowSphere(8, ROCK, [0, 0, 0], 10, 6, [1, 0.6, 0.85]),
      crack([-5, -1, 5.4], [4, 1, 6]),
      crack([0, -2, -6.4], [5, 1, -5]),
    ],
    torso: [
      // 巨大的岩石胸膛：往上變寬、前傾
      lowSphere(11, ROCK, [0, 11, 0.6], 12, 7, [1.05, 0.95, 0.8]),
      rock(8, 6, 5, ROCK_LIGHT, [5, 16, 3], [0.3, 0.4, -0.3]),
      rock(7, 6, 5, ROCK_DARK, [-5.4, 15, 3.4], [0.2, -0.3, 0.3]),
      rock(9, 5, 6, ROCK_DARK, [0, 20.5, -2], [0.4, 0, 0.1]),
      rock(6, 7, 5, ROCK_LIGHT, [4, 7, -6], [-0.2, 0.3, 0.2]),
      rock(6, 6, 5, ROCK, [-5, 8, -6.2], [-0.1, -0.4, -0.2]),
      // 胸口的熔岩核心與裂縫
      lowSphere(3, LAVA_CORE, [0, 11, 9], 8, 5, [1, 1, 0.5]),
      crack([0, 11, 9], [5, 16, 7.6]),
      crack([0, 11, 9], [-5.6, 15, 7.4]),
      crack([0, 11, 9], [-2, 4, 8.4]),
      crack([4, 3, 7], [8, 9, 5]),
      // 背上噴出熔岩的岩柱
      spike([3, 18, -6], [5, 27, -9], 2, ROCK_DARK),
      spike([-3.4, 18, -6], [-5, 25, -9.6], 1.8, ROCK_DARK),
      lowSphere(1.2, LAVA_CORE, [5, 27, -9], 5, 3),
      lowSphere(1.1, LAVA_CORE, [-5, 25, -9.6], 5, 3),
    ],
    neck: [lowSphere(3.4, ROCK_DARK, [0, 1, 1], 8, 4)],
    head: [
      // 小小的頭縮在肩膀之間
      rock(8, 6.4, 7, ROCK, [0, 3, 1.4], [0, 0, 0]),
      rock(9, 2, 7.4, ROCK_DARK, [0, 6.6, 1], [0.1, 0, 0]),
      box(2, 1.2, 1, LAVA_CORE, [2, 3.6, 5]),
      box(2, 1.2, 1, LAVA_CORE, [-2, 3.6, 5]),
      box(4.4, 1, 1, LAVA, [0, 0.6, 5]),
    ],
    upperArm: [lowSphere(5.4, ROCK, [0, 0, 0], 8, 5), rock(6, 4, 5, ROCK_LIGHT, [2.6 * -1, 3, 0], [0, 0, 0.4]), prism(10, -2, -10, [3.8, 3.8], [3.4, 3.4], ROCK_DARK), crack([0, -3, 3.4], [0, -9, 3.2])],
    upperArmL: [lowSphere(5.4, ROCK, [0, 0, 0], 8, 5), rock(6, 4, 5, ROCK_LIGHT, [2.6, 3, 0], [0, 0, -0.4]), prism(10, -2, -10, [3.8, 3.8], [3.4, 3.4], ROCK_DARK), crack([0, -3, 3.4], [0, -9, 3.2])],
    forearm: [prism(10, 0, -9, [3.6, 3.6], [4.2, 4.2], ROCK), rock(4, 5, 4, ROCK_DARK, [2.6, -4, -1], [0.2, 0, 0.3]), crack([-1, -2, 3.6], [1, -8, 4])],
    handL: boulderFist(),
    handR: boulderFist(),
    thigh: [prism(10, 0, -12, [4.4, 4.4], [3.8, 3.8], ROCK), crack([0, -3, 4.2], [1, -10, 3.6])],
    shin: [prism(10, 0, -12.5, [3.8, 3.8], [4.2, 4.2], ROCK_DARK), rock(4, 4, 4, ROCK_LIGHT, [0, -1, 3], [0.3, 0.2, 0])],
    foot: [rock(6.4, 3, 7, ROCK, [0, -1.4, 1.4], [0, 0, 0])],
  }),
  poses: monsterPoses({ attack: 'slam', cast: 'summon', hunch: 0.35 }),
};

// ═══════════════════════════ 20F 墮落騎士 ═══════════════════════════

const BLACK = 0x2c2a36;
const BLACK_DARK = 0x17161e;
const BLACK_EDGE = 0x4a4658;
const VOID_GLOW = 0xa066ff;
const CAPE_DARK = 0x221a2e;

/** 巨劍：暗色劍身、紫色發光的劍刃中線、帶尖角的護手 */
const darkGreatsword = (): Mesh[] => [
  ...plateGauntlet(BLACK, BLACK_DARK),
  prism(8, 3, -3.4, [0.9, 0.9], [0.9, 0.9], 0x2a1a24),
  lowSphere(1.3, VOID_GLOW, [0, 3.6, 0], 6, 4),
  box(11, 1.6, 2.2, BLACK_EDGE, [0, -4, 0]),
  spike([5, -4, 0], [7.4, -1, 0], 0.8, BLACK_EDGE),
  spike([-5, -4, 0], [-7.4, -1, 0], 0.8, BLACK_EDGE),
  prism(4, -4.8, -32, [2, 0.5], [1.7, 0.4], BLACK, [0, 0, 0], 0),
  prism(4, -5, -31, [0.5, 0.6], [0.4, 0.5], VOID_GLOW, [0, 0, 0], 0),
  prism(4, -32, -37, [1.7, 0.4], [0.08, 0.05], BLACK, [0, 0, 0], 0),
];

const FALLEN_KNIGHT: FigureModel = {
  hipHeight: 29,
  referenceRadius: REF,
  parts: humanoid({
    shoulderX: 9.4,
    root: [
      prism(12, 3.2, 0, [7, 5.4], [7.2, 5.6], BLACK_DARK),
      ...[1, -1].map((x) => placeMesh(box(1.2, 8, 6.4, BLACK), [0, 0, -0.25 * x], [7.2 * x, -3, 0])),
      placeMesh(box(7, 8, 1.2, BLACK), [0.2, 0, 0], [0, -3, 5.6]),
      placeMesh(box(7, 8, 1.2, BLACK_EDGE), [-0.2, 0, 0], [0, -3, -5.6]),
    ],
    torso: [
      prism(12, 0, 3, [7.2, 5.4], [7.6, 5.6], BLACK),
      prism(12, 2.8, 6, [7.6, 5.6], [8.1, 5.8], BLACK_DARK),
      prism(12, 6, 13.8, [8.1, 5.8], [9.6, 6.2], BLACK),
      prism(12, 13.8, 16.5, [9.6, 6.2], [7, 5], BLACK_DARK),
      placeMesh(box(1.8, 9, 1.8, BLACK_EDGE), [0, Math.PI / 4, 0], [0, 10, 5.8]),
      // 胸口發光的紫色符文
      box(1, 4, 0.6, VOID_GLOW, [0, 10.5, 6.4]),
      box(4, 1, 0.6, VOID_GLOW, [0, 11.5, 6.3]),
      // 破爛的披風
      placeMesh(prism(4, 0, -30, [9, 1], [12, 1.2], CAPE_DARK, [0, 0, 0], Math.PI / 4), [-0.12, 0, 0], [0, 16, -6.2]),
      ...[-6, -1, 4].map((x) => placeMesh(box(3.2, 4, 0.6, CAPE_DARK), [0, 0, 0.3], [x * 1.4, -12.5, -9.5])),
    ],
    neck: [prism(12, -0.5, 3.5, [4, 3.8], [3.4, 3.2], BLACK_DARK)],
    head: [
      prism(12, 0, 9, [5, 5.2], [5.3, 5.4], BLACK),
      lowSphere(5.35, BLACK, [0, 9, 0], 12, 5, [1, 0.8, 1.02], (c) => c[1] > 0.1),
      placeMesh(box(4.6, 7, 1.4, BLACK_DARK), [0, 0.45, 0], [2, 4.4, 4.8]),
      placeMesh(box(4.6, 7, 1.4, BLACK_DARK), [0, -0.45, 0], [-2, 4.4, 4.8]),
      box(8, 1, 1.2, VOID_GLOW, [0, 6, 5.6]),
      // 往後彎的長角
      seg([4, 9, 0], [8, 13, -2], 1.3, 0.8, BLACK_EDGE),
      spike([8, 13, -2], [9, 18, -7], 0.8, BLACK_EDGE),
      seg([-4, 9, 0], [-8, 13, -2], 1.3, 0.8, BLACK_EDGE),
      spike([-8, 13, -2], [-9, 18, -7], 0.8, BLACK_EDGE),
    ],
    upperArmL: [...heavyPauldron(1, BLACK, BLACK_DARK, BLACK_EDGE), ...plateArm(BLACK, BLACK_DARK)],
    upperArm: [...heavyPauldron(-1, BLACK, BLACK_DARK, BLACK_EDGE), ...plateArm(BLACK, BLACK_DARK)],
    forearmL: plateForearm(BLACK, BLACK_DARK, BLACK_EDGE),
    forearm: plateForearm(BLACK, BLACK_DARK, BLACK_EDGE),
    handL: plateGauntlet(BLACK, BLACK_DARK),
    handR: darkGreatsword(),
    thigh: [prism(10, 0, -12, [3.4, 3.4], [3, 3], BLACK), prism(10, -4, -5, [3.5, 3.5], [3.4, 3.4], BLACK_EDGE)],
    shin: [lowSphere(3.1, BLACK, [0, 0, 0.6], 8, 5, [1, 1, 1.15]), spike([0, 0.6, 3], [0, 2.4, 6], 0.8, BLACK_EDGE), prism(10, -1.4, -12.5, [3, 3.2], [2.6, 2.8], BLACK_DARK)],
    foot: [box(4.8, 2.8, 4.8, BLACK_DARK, [0, -1.4, 0.4]), box(4.4, 2, 3.4, BLACK, [0, -1.8, 3.8]), spike([0, -1.4, 5.4], [0, -2, 7.6], 0.8, BLACK_EDGE)],
  }),
  poses: monsterPoses({ attack: 'chop' }),
};

// ═══════════════════════════ 25F 蜘蛛女王 ═══════════════════════════

const CHITIN = 0x2c1e30;
const CHITIN_LIGHT = 0x4a3452;
const QUEEN_SKIN = 0xb49aae;
const VENOM = 0x7aff5a;
const QUEEN_HAIR = 0x1a1020;

/** 女王的六隻腳（掛在身體上的關節）與身體兩側不動的兩隻 */
const QUEEN_LEGS: [Joint, 1 | -1, number][] = [
  ['thighL', 1, 6],
  ['shinL', 1, 1],
  ['footL', 1, -4],
  ['thighR', -1, 6],
  ['shinR', -1, 1],
  ['footR', -1, -4],
];
const QUEEN_HIP = 16;
const spiderLeg = (side: 1 | -1, spread: number): Mesh[] => {
  const knee: V3 = [side * 11, 12, spread * 3];
  const foot: V3 = [side * 24, -QUEEN_HIP, spread * 9];
  return [
    seg([0, 0, 0], knee, 1.8, 1.4, CHITIN, 8),
    lowSphere(1.9, CHITIN_LIGHT, knee, 6, 4),
    seg(knee, [side * 18, 2, spread * 6], 1.4, 1.1, CHITIN, 8),
    seg([side * 18, 2, spread * 6], foot, 1.1, 0.2, CHITIN_LIGHT, 6),
  ];
};

const queenArm = (side: 1 | -1): PartDef[] => {
  const s = side === 1 ? 'L' : 'R';
  return [
    { joint: `upperArm${s}`, parent: 'torso', offset: [6.4 * side, 13, 0], meshes: [lowSphere(2.6, CHITIN, [0.6 * side, 0.6, 0], 8, 4), prism(10, 0, -10, [1.8, 1.8], [1.5, 1.5], QUEEN_SKIN)] },
    { joint: `forearm${s}`, parent: `upperArm${s}`, offset: [0, -10, 0], meshes: [prism(10, 0, -9, [1.8, 1.8], [2.2, 2.2], CHITIN), spike([1.4 * side, -3, -1], [3.4 * side, -1, -3], 0.6, CHITIN_LIGHT)] },
    {
      joint: `hand${s}`,
      parent: `forearm${s}`,
      offset: [0, -9, 0],
      // 鐮刀狀的長爪
      meshes: [lowSphere(1.6, CHITIN, [0, -1, 0], 6, 4), ...[-1, 0, 1].map((i) => spike([i * 0.8, -1.6, 0.6], [i * 1.4, -7, 2.6], 0.5, VENOM))],
    },
  ] as PartDef[];
};

const SPIDER_QUEEN: FigureModel = {
  hipHeight: QUEEN_HIP,
  referenceRadius: REF,
  parts: [
    {
      joint: 'root',
      parent: null,
      offset: [0, 0, 0],
      meshes: [
        // 頭胸部與身體後方兩隻不動的腳
        lowSphere(8, CHITIN, [0, 0, 2], 12, 7, [1, 0.62, 1.25]),
        lowSphere(8.3, CHITIN_LIGHT, [0, 1.4, 2], 12, 7, [0.9, 0.5, 1.15], (c) => c[1] > 1.5),
        ...spiderLeg(1, -1.6).map((m) => placeMesh(m, [0, 0, 0], [5, 0, -7])),
        ...spiderLeg(-1, -1.6).map((m) => placeMesh(m, [0, 0, 0], [-5, 0, -7])),
      ],
    },
    {
      joint: 'ponytail',
      parent: 'root',
      offset: [0, 2, -7],
      meshes: [
        // 巨大的腹部：發光的毒液斑紋與背刺
        lowSphere(13, CHITIN, [0, 4, -11], 12, 7, [1, 0.85, 1.15]),
        box(2, 1.4, 20, VENOM, [0, 15.4, -11]),
        ...[-4, -10, -16].map((z) => box(14, 1.2, 1.6, VENOM, [0, 14 - Math.abs(z + 10) * 0.3, z])),
        ...[-6, -12, -18].map((z) => spike([0, 14, z], [0, 20, z - 3], 1.4, CHITIN_LIGHT)),
        lowSphere(2.4, CHITIN_LIGHT, [0, 0, -25.5], 6, 4),
      ],
    },
    ...QUEEN_LEGS.map(([joint, side, z]): PartDef => ({ joint, parent: 'root', offset: [side * 5.6, 0, z], meshes: spiderLeg(side, z / 4) })),
    {
      joint: 'torso',
      parent: 'root',
      offset: [0, 4, 7],
      meshes: [
        // 人形上半身：甲殼束腹、胸甲
        prism(12, 0, 7, [5, 4], [5.6, 4.2], CHITIN),
        prism(12, 7, 13, [5.6, 4.2], [6.6, 4.6], QUEEN_SKIN),
        prism(12, 8.5, 12, [6.2, 4.6], [6.6, 4.8], CHITIN_LIGHT),
        prism(12, 13, 15.5, [6.6, 4.6], [4.4, 3.8], QUEEN_SKIN),
        ...[1.5, 4.5].map((y) => box(9, 0.8, 0.6, VENOM, [0, y, 4.4])),
        spike([5, 14, -2], [9, 21, -6], 1, CHITIN_LIGHT),
        spike([-5, 14, -2], [-9, 21, -6], 1, CHITIN_LIGHT),
      ],
    },
    { joint: 'neck', parent: 'torso', offset: [0, 15, 0], meshes: [prism(10, 0, 3, [1.8, 1.8], [1.7, 1.7], QUEEN_SKIN)] },
    {
      joint: 'head',
      parent: 'neck',
      offset: [0, 3, 0],
      meshes: [
        lowSphere(5, QUEEN_SKIN, [0, 5, 0.6], 10, 6, [0.92, 1.1, 1]),
        ...[2, -2].map((x) => box(1.4, 1, 0.8, VENOM, [x, 5.6, 5.2])),
        ...[1, -1].map((x) => box(0.8, 0.8, 0.8, VENOM, [x * 1, 7.2, 5])),
        // 長髮與尖刺王冠
        lowSphere(5.8, QUEEN_HAIR, [0, 5.8, -0.8], 10, 6, [1, 1.08, 1.05], (c) => c[1] > 1.4 || c[2] < -1),
        placeMesh(prism(8, 0, -16, [5, 3], [2, 1], QUEEN_HAIR), [0.25, 0, 0], [0, 6, -4]),
        ...Array.from({ length: 5 }, (_, i) => {
          const a = ((i - 2) / 2) * 0.9;
          return spike([Math.sin(a) * 4, 9.6, Math.cos(a) * 1.6], [Math.sin(a) * 6.4, 16 - Math.abs(i - 2), Math.cos(a) * 1.6 - 1], 0.9, i === 2 ? VENOM : CHITIN_LIGHT);
        }),
      ],
    },
    ...queenArm(1),
    ...queenArm(-1),
  ],
  poses: (() => {
    const legs = (swing: (i: number) => number, lift: (i: number) => number): Angles => {
      const a: Angles = {};
      QUEEN_LEGS.forEach(([joint, side], i) => (a[joint] = [0, swing(i), lift(i) * side]));
      return a;
    };
    const arms: Angles = { upperArmL: [-0.4, 0, -0.3], upperArmR: [-0.4, 0, 0.3], forearmL: [-0.9, 0, 0], forearmR: [-0.9, 0, 0] };
    const base: Pose = pose(0, { torso: [-0.1, 0, 0], ...arms });
    const set: PoseSet = {
      ready: (t) => plus(base, { ...legs((i) => Math.sin(t * 2 + i) * 0.03, () => 0), torso: [Math.sin(t * 1.6) * 0.05, Math.sin(t * 0.8) * 0.12, 0], ponytail: [Math.sin(t * 1.4) * 0.05, 0, 0] }, Math.sin(t * 2) * 0.5),
      run: (p) =>
        plus(base, { ...legs((i) => Math.sin(p + (i % 2) * Math.PI + (i >= 3 ? Math.PI : 0)) * 0.3, (i) => Math.max(0, Math.cos(p + (i % 2) * Math.PI + (i >= 3 ? Math.PI : 0))) * 0.25), torso: [0.15, 0, 0] }, Math.abs(Math.sin(p)) * 0.8),
      // 雙爪高舉 → 往前劈下
      attackWindup: plus(base, { torso: [-0.45, 0, 0], upperArmL: [-2, 0, 0.3], upperArmR: [-2, 0, -0.3], forearmL: [0.5, 0, 0], forearmR: [0.5, 0, 0], ...legs((i) => (i % 3 === 0 ? -0.2 : 0), (i) => (i % 3 === 0 ? 0.5 : 0)) }, 2),
      attackStrike: plus(base, { torso: [0.5, 0, 0], upperArmL: [0.2, 0, 0.3], upperArmR: [0.2, 0, -0.3], forearmL: [0.6, 0, 0], forearmR: [0.6, 0, 0] }, -1),
      // 施法：雙手張開、腹部翹起
      castWindup: plus(base, { torso: [-0.3, 0, 0], head: [-0.3, 0, 0], ponytail: [0.4, 0, 0], upperArmL: [-2.4, 0, -0.8], upperArmR: [-2.4, 0, 0.8] }, 1),
      castRelease: plus(base, { torso: [0.2, 0, 0], ponytail: [-0.1, 0, 0], upperArmL: [-1.3, 0, 0.2], upperArmR: [-1.3, 0, -0.2], forearmL: [0.2, 0, 0], forearmR: [0.2, 0, 0] }),
      hit: plus(base, { torso: [-0.4, 0, 0.15], head: [-0.3, 0, 0], ...legs(() => 0, () => 0.2) }, 1),
      dead: pose(-QUEEN_HIP * 0.6, { torso: [0.9, 0, 0.2], head: [0.4, 0, 0], upperArmL: [0.4, 0, 0.8], upperArmR: [0.4, 0, -0.8], ponytail: [-0.2, 0, 0], ...legs(() => 0, () => -0.5) }),
    };
    return set;
  })(),
};

// ═══════════════════════════ 30F 深淵魔王 ═══════════════════════════

const DEMON = 0x8a1e1a;
const DEMON_DARK = 0x4a0e0c;
const HORN = 0x1e1414;
const HELL = 0xff6a2a;
const WING = 0x3a0c10;

/** 蝙蝠翼：三根翼骨 + 之間的翼膜（掛在背後，side = 1 左翼） */
const wing = (side: 1 | -1): Mesh[] => {
  const root: V3 = [side * 4, 14, -5];
  const elbow: V3 = [side * 13, 22, -9];
  const tips: V3[] = [
    [side * 26, 26, -12],
    [side * 24, 12, -12],
    [side * 18, 2, -10],
  ];
  /** 翼膜：雙面的三角形（兩種頂點順序各一面，從哪一側看都畫得出來） */
  const membrane = (a: V3, b: V3, c: V3): Mesh => ({
    verts: [a, b, c],
    faces: [
      { idx: [0, 1, 2], color: WING },
      { idx: [0, 2, 1], color: WING },
    ],
  });
  return [
    seg(root, elbow, 1.4, 1, DEMON_DARK, 8),
    ...tips.map((tip) => seg(elbow, tip, 0.9, 0.2, DEMON_DARK, 6)),
    spike(elbow, [side * 14, 27, -10], 0.8, HORN),
    membrane(root, elbow, tips[2]!),
    membrane(elbow, tips[0]!, tips[1]!),
    membrane(elbow, tips[1]!, tips[2]!),
  ];
};

const demonClaws = (): Mesh[] => [lowSphere(2.2, DEMON, [0, -1.4, 0], 8, 5), ...[-1, 0, 1].map((i) => spike([i * 1.2, -2.6, 0.8], [i * 1.8, -8, 2.4], 0.6, HORN))];

const LORD_PARTS: PartDef[] = [
  ...humanoid({
    shoulderX: 9.6,
    root: [
      prism(12, 3.4, -2, [7.2, 5.6], [7.6, 6], DEMON_DARK),
      // 腰布與骨頭腰飾
      placeMesh(box(7, 12, 0.8, 0x2a0a08), [0.12, 0, 0], [0, -6, 6]),
      ...[-4, 0, 4].map((x) => lowSphere(1.3, 0xd8ccb0, [x, 1.4, 6.4], 6, 4)),
    ],
    torso: [
      // 結實的上身：腹肌、胸肌、肩膀
      prism(12, 0, 7, [7.2, 5.6], [8.6, 6.2], DEMON),
      prism(12, 7, 14, [8.6, 6.2], [11, 6.8], DEMON),
      prism(12, 14, 17, [11, 6.8], [7.6, 5.4], DEMON_DARK),
      ...[2, 4.6].flatMap((y) => [box(2.6, 2, 1, DEMON_DARK, [1.6, y, 6]), box(2.6, 2, 1, DEMON_DARK, [-1.6, y, 6])]),
      box(6, 3.4, 1.2, DEMON_DARK, [3.4, 11, 6.2]),
      box(6, 3.4, 1.2, DEMON_DARK, [-3.4, 11, 6.2]),
      // 胸口發光的符文
      box(1, 5, 0.6, HELL, [0, 8.4, 6.6]),
      box(4.4, 1, 0.6, HELL, [0, 9.6, 6.5]),
      ...wing(1),
      ...wing(-1),
      ...[-4, 0, 4].map((x) => spike([x, 15, -5.4], [x * 1.3, 20, -9], 1, HORN)),
    ],
    neck: [prism(10, 0, 3.4, [3.6, 3.4], [3.2, 3], DEMON_DARK)],
    head: [
      lowSphere(5.6, DEMON, [0, 5.4, 0.8], 10, 6, [1, 1, 1.05]),
      box(8, 2, 3, DEMON_DARK, [0, 7.2, 4.2]),
      box(2, 1.2, 1, HELL, [2.1, 5.8, 5.8]),
      box(2, 1.2, 1, HELL, [-2.1, 5.8, 5.8]),
      // 下顎與獠牙
      box(6.4, 2.6, 4, DEMON_DARK, [0, 1.6, 3.4]),
      spike([1.6, 1.2, 5.4], [1.8, -1.4, 5.8], 0.5, 0xe8dcc0),
      spike([-1.6, 1.2, 5.4], [-1.8, -1.4, 5.8], 0.5, 0xe8dcc0),
      // 兩對大角：往上、往後彎
      seg([4, 8, 0], [8, 12, 1], 1.6, 1.1, HORN),
      spike([8, 12, 1], [9.6, 19, -2], 1.1, HORN),
      seg([-4, 8, 0], [-8, 12, 1], 1.6, 1.1, HORN),
      spike([-8, 12, 1], [-9.6, 19, -2], 1.1, HORN),
      spike([2.4, 10, -2], [4, 13, -8], 0.9, HORN),
      spike([-2.4, 10, -2], [-4, 13, -8], 0.9, HORN),
    ],
    upperArm: [lowSphere(4, DEMON, [0, 0, 0], 8, 5), spike([-2, 2, 0], [-5, 6, -1], 0.9, HORN), prism(10, -1, -10, [3.2, 3.2], [2.8, 2.8], DEMON)],
    upperArmL: [lowSphere(4, DEMON, [0, 0, 0], 8, 5), spike([2, 2, 0], [5, 6, -1], 0.9, HORN), prism(10, -1, -10, [3.2, 3.2], [2.8, 2.8], DEMON)],
    forearm: [prism(10, 0, -9, [2.8, 2.8], [2.5, 2.5], DEMON_DARK), box(4.4, 5, 4.4, HORN, [0, -6, 0])],
    handL: demonClaws(),
    handR: demonClaws(),
    thigh: [prism(10, 0, -13, [3.8, 3.8], [3, 3], DEMON)],
    // 反曲的惡魔腿
    shin: [prism(10, 0, -12.5, [3, 3], [2.4, 2.4], DEMON_DARK), spike([0, 0, -2.4], [0, 1, -5.6], 0.8, HORN)],
    foot: [box(4.4, 2.4, 6, HORN, [0, -1.4, 1.6]), ...[-1.4, 1.4].map((x) => spike([x, -1.6, 4.4], [x, -2.2, 7], 0.6, HORN))],
  }),
  {
    joint: 'ponytail',
    parent: 'root',
    offset: [0, 0, -5],
    // 尾巴：往後下垂、末端是箭頭狀的尖刺
    meshes: [seg([0, 0, 0], [0, -8, -10], 1.8, 1.2, DEMON, 8), seg([0, -8, -10], [0, -14, -20], 1.2, 0.7, DEMON_DARK, 8), spike([0, -14, -20], [0, -16, -25], 1.4, HORN)],
  },
];

const ABYSS_LORD: FigureModel = {
  hipHeight: 29,
  referenceRadius: REF,
  parts: LORD_PARTS,
  poses: monsterPoses({ attack: 'claw', cast: 'summon' }),
};

/** EnemyDef ID → 魔王與眷屬的模型（深淵分身與深淵魔王同一個模型，體型較小） */
export const BOSS_MODELS: Record<string, FigureModel> = {
  'enemy.crypt_guardian': CRYPT_GUARDIAN,
  'enemy.fallen_priest': FALLEN_PRIEST,
  'enemy.cultist': CULTIST,
  'enemy.lava_behemoth': LAVA_BEHEMOTH,
  'enemy.fallen_knight': FALLEN_KNIGHT,
  'enemy.spider_queen': SPIDER_QUEEN,
  'enemy.abyss_lord': ABYSS_LORD,
  'enemy.abyss_shade': ABYSS_LORD,
};
