import { BEAST_MODELS } from './Beasts';
import { BOSS_MODELS } from './Bosses';
import { CREATURE_MODELS } from './Creatures';
import { SKELETON_WARRIOR } from './SkeletonWarrior';
import type { FigureModel, Pose } from './FigureModel';
import { BONE, BONE_DARK, boneLimb, humanoid, monsterPoses, pelvis, ribcage, skull } from './MonsterParts';
import { box, lowSphere, placeMesh, prism, type Mesh } from './Poly3D';

/**
 * 怪物的多面體模型（與女主角同一套關節與繪製方式）。
 * 每種怪物：外觀零件 + 一組姿勢（依攻擊方式：劈砍、爪擊、拉弓、雙手重擊、法杖施法）。
 * 模型座標：Y 向上、Z 為前方、+X 為角色的左手邊（-X 右手拿武器）。
 */

// ─────────────────────────── 共用零件 ───────────────────────────

const LEATHER = 0x4a3020;

/** 腰帶 + 前後長短不一的破布條（掛在骨盆上） */
const loincloth = (cloth: number, dark: number, lengths: readonly number[] = [8, 10, 7]): Mesh[] => [
  prism(10, 0.4, 2.6, [4.7, 3.9], [4.9, 4], LEATHER),
  box(1.8, 1.8, 0.8, 0x8a7448, [0, 1.5, 4.1]),
  ...lengths.map((len, i) => box(2.1, len, 0.6, i % 2 ? dark : cloth, [(i - 1) * 2, 0.8 - len / 2, 4.2])),
  ...lengths.map((len, i) => box(2.6, len - 1.5, 0.6, i % 2 ? cloth : dark, [(i - 1) * 2.4, 1.2 - len / 2, -4.1])),
];

/** YZ 平面上兩點之間的一段方條（弓臂用）：點為 [y, z] */
const segment = (a: [number, number], b: [number, number], w: number, color: number): Mesh => {
  const dy = b[0] - a[0];
  const dz = b[1] - a[1];
  return placeMesh(box(w, w * 1.1, Math.hypot(dy, dz) + 0.4, color), [Math.atan2(-dy, dz), 0, 0], [0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
};

// ─────────────────────────── 各種怪物 ───────────────────────────

/** 骷髏戰士：見 SkeletonWarrior.ts */

/** 食屍鬼：瘦骨嶙峋、嚴重駝背、灰綠皮膚、尖耳、張開的大嘴與利牙、發光的黃眼、長爪、破布腰布 */
const GHOUL_SKIN = 0x8c9c7a;
const GHOUL_DARK = 0x5c6a4e;
const GHOUL_PALE = 0xa8b290;
const CLAW = 0xe0d8c0;
const MOUTH = 0x2a1410;
const claws = (): Mesh[] => [
  box(3.4, 3, 2, GHOUL_SKIN, [0, -1.8, 0.3]),
  ...[-1, 0, 1].flatMap((i) => [
    placeMesh(prism(4, 0, -3.2, [0.5, 0.5], [0.4, 0.4], GHOUL_SKIN), [-0.35, 0, i * 0.12], [i * 1.15, -3.1, 0.4]),
    placeMesh(prism(4, -3.2, -6, [0.42, 0.42], [0.05, 0.05], CLAW), [-0.35, 0, i * 0.12], [i * 1.15, -3.1, 0.4]),
  ]),
];
const ghoulEar = (side: 1 | -1): Mesh => placeMesh(prism(4, 0, 4.2, [1.2, 0.5], [0.1, 0.1], GHOUL_SKIN), [-0.3, 0, -1.2 * side], [4.2 * side, 6.2, -0.6]);
const GHOUL: FigureModel = {
  hipHeight: 27,
  referenceRadius: 0.28,
  parts: humanoid({
    root: [
      prism(8, 1.2, -3, [4.3, 3.4], [4.8, 3.8], 0x4e3c2a),
      prism(8, 0.4, 2.2, [4.4, 3.5], [4.4, 3.5], 0x362a1e),
      ...[7, 9.5, 6].map((len, i) => box(2.2, len, 0.6, i % 2 ? 0x362a1e : 0x4e3c2a, [(i - 1) * 2.2, 0.5 - len / 2, 3.9])),
      ...[8, 6.5].map((len, i) => box(3, len, 0.6, 0x4e3c2a, [(i - 0.5) * 3, 0.5 - len / 2, -3.9])),
    ],
    torso: [
      prism(8, 0, 13, [3.8, 3], [5.6, 3.8], GHOUL_SKIN),
      prism(8, 12.5, 15.5, [5.6, 3.8], [3.4, 2.6], GHOUL_SKIN),
      // 突出的肋骨、背上一節節的脊椎與肩胛骨
      ...[6.2, 8.4, 10.6].map((y, i) => box(6 + i * 0.7, 0.7, 0.8, GHOUL_PALE, [0, y, 3.3 + i * 0.2])),
      ...[2, 4.6, 7.2, 9.8, 12.4].map((y, i) => box(1.4, 1.3, 1.4, GHOUL_PALE, [0, y, -3 - i * 0.16])),
      box(3, 3.6, 1, GHOUL_DARK, [2.5, 10.6, -3.6]),
      box(3, 3.6, 1, GHOUL_DARK, [-2.5, 10.6, -3.6]),
    ],
    neck: [prism(6, 0, 3, [1.5, 1.5], [1.5, 1.5], GHOUL_SKIN)],
    head: [
      // 往後拉長的禿頭、眉骨、發光的眼睛、鼻孔
      lowSphere(4.8, GHOUL_SKIN, [0, 6, -0.4], 10, 5, [0.95, 1.05, 1.18]),
      box(6.6, 1.3, 2, GHOUL_DARK, [0, 7.2, 3.9]),
      box(1.7, 1.1, 0.8, 0xf0e04a, [1.8, 6, 4.8]),
      box(1.7, 1.1, 0.8, 0xf0e04a, [-1.8, 6, 4.8]),
      box(1.2, 1.4, 1, GHOUL_DARK, [0, 4.8, 5.1]),
      // 張開的大嘴：上顎、口腔、上下兩排牙、往下張的下顎
      box(6, 1.6, 4.4, GHOUL_SKIN, [0, 3.5, 2.9]),
      box(5, 2.6, 3.4, MOUTH, [0, 1.9, 2.8]),
      ...[-2, -1, 0, 1, 2].map((x) => box(0.6, 1.1, 0.5, CLAW, [x * 1.05, 2.3, 4.7])),
      placeMesh(box(5.6, 1.4, 4.6, GHOUL_DARK, [0, 0, 2.2]), [0.4, 0, 0], [0, 0.6, 0.4]),
      ...[-1.5, -0.5, 0.5, 1.5].map((x) => placeMesh(box(0.6, 1, 0.5, CLAW, [x * 1.1, 1.1, 4.1]), [0.4, 0, 0], [0, 0.6, 0.4])),
      ghoulEar(1),
      ghoulEar(-1),
    ],
    upperArm: [lowSphere(2, GHOUL_SKIN, [0, 0, 0], 8, 4), prism(6, 0, -10, [1.3, 1.3], [1, 1], GHOUL_SKIN)],
    forearm: [lowSphere(1.5, GHOUL_PALE, [0, 0, 0], 7, 4), prism(6, 0, -9, [1.1, 1.1], [0.9, 0.9], GHOUL_SKIN)],
    handL: claws(),
    handR: claws(),
    thigh: [prism(6, 0, -13, [1.9, 1.9], [1.3, 1.3], GHOUL_SKIN)],
    shin: [lowSphere(1.7, GHOUL_PALE, [0, 0, 0.3], 7, 4), prism(6, 0, -12.5, [1.3, 1.3], [0.9, 0.9], GHOUL_DARK)],
    foot: [
      box(3, 1.4, 3.8, GHOUL_DARK, [0, -1.1, 1]),
      ...[-1, 0, 1].flatMap((i) => [box(0.8, 0.8, 2.4, GHOUL_SKIN, [i * 1, -1.4, 3.8]), box(0.5, 0.5, 1.2, CLAW, [i * 1, -1.5, 5.4])]),
    ],
  }),
  poses: monsterPoses({ attack: 'claw', hunch: 0.65 }),
};

/** 骷髏弓手：深綠色兜帽與破披風、斜背帶、背後紅羽箭筒、左臂皮護腕、反曲長弓 */
const HOOD = 0x3e4a32;
const HOOD_DARK = 0x2a3222;
const BOW_WOOD = 0x7a4a24;
const bow = (): Mesh[] => {
  // 弓臂由握把往兩端彎向弓手（+Y），末端再往外反曲；弓弦連接兩端
  const pts: [number, number][] = [
    [-1.6, 0],
    [-0.5, 4.6],
    [1.1, 8.8],
    [2, 11.6],
    [1.4, 13.4],
  ];
  const limb = (sign: 1 | -1) => pts.slice(1).map((p, i) => segment([pts[i]![0], pts[i]![1] * sign], [p[0], p[1] * sign], 1.15 - i * 0.15, i === 3 ? 0x5a3418 : BOW_WOOD));
  return [
    lowSphere(1.6, BONE_DARK, [0, -1.4, 0], 8, 4),
    ...limb(1),
    ...limb(-1),
    box(1.6, 1.6, 3.2, LEATHER, [0, -1.6, 0]),
    box(0.25, 0.25, 26.8, 0xe8e0c8, [0, 1.4, 0]),
  ];
};
const ARCHER: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    root: [...pelvis(), ...loincloth(HOOD, HOOD_DARK, [7, 9, 6])],
    torso: [
      ...ribcage(),
      // 短披肩、背後的破披風（下緣一條條長短不一）
      prism(12, 11, 16, [7.8, 5.6], [5.4, 4.4], HOOD),
      placeMesh(box(11, 12, 0.7, HOOD_DARK), [0.12, 0, 0], [0, 9, -4.5]),
      ...[4, 6, 3, 5].map((len, i) => box(2.6, len, 0.7, HOOD_DARK, [(i - 1.5) * 2.7, 3.2 - len / 2, -5.2])),
      // 斜背帶、箭筒與紅色箭羽
      placeMesh(box(1.2, 19, 0.6, LEATHER), [0, 0, 0.7], [0, 8.6, 3.5]),
      placeMesh(box(3.4, 12, 3, 0x6a4a2a), [0, 0, 0.35], [2.4, 9, -6.6]),
      placeMesh(box(3.8, 1.2, 3.4, LEATHER), [0, 0, 0.35], [4.1, 13.6, -6.6]),
      ...[0, 1, 2].flatMap((i) => [box(0.5, 4, 0.5, 0xd8d0b0, [1.4 + i * 0.9, 16.5, -6.8]), box(0.9, 1.8, 0.3, 0xa82a20, [1.4 + i * 0.9, 18.8, -6.8])]),
    ],
    head: [
      ...skull(),
      lowSphere(6.6, HOOD, [0, 6.4, -0.6], 11, 6, [1.05, 1.08, 1.05], (c) => c[2] < 2.2 || c[1] > 3.2),
      box(9, 2, 1.4, HOOD_DARK, [0, 10, 4.4]),
      // 兜帽尖端往後垂
      placeMesh(prism(6, 0, 5, [3, 3], [0.3, 0.3], HOOD), [-1.9, 0, 0], [0, 9.4, -4.6]),
    ],
    forearmL: [...boneLimb(9, 1), prism(8, -2.4, -7.6, [1.8, 1.8], [1.6, 1.6], LEATHER)],
    handL: bow(),
  }),
  poses: monsterPoses({ attack: 'bow' }),
};

/**
 * 重甲骷髏：全身板甲（多片構面）。
 * 頭盔（十角柱 + 圓頂 + 斜面面甲與視縫 + 紅色盔纓）、護頸、胸甲（中央稜線 + 三層腹甲）、
 * 三層肩甲、肘甲、臂甲、四片腿裙與前後紅色罩袍布、膝甲（含扇形護片）、脛甲、分節鐵靴、雙刃巨斧。
 */
const STEEL = 0x8a909a;
const STEEL_DARK = 0x565c66;
const STEEL_EDGE = 0x3c4048;
const RIVET = 0xb8963c;
const PLUME = 0x9a2a1e;
const pauldron = (side: 1 | -1): Mesh[] => [
  // 三層肩甲：由大到小往下疊
  placeMesh(prism(12, 0, -3.2, [4.6, 4.2], [5, 4.6], STEEL), [0, 0, 0.35 * side], [0.8 * side, 2.2, 0]),
  placeMesh(prism(12, 0, -2.6, [4.3, 3.9], [4.6, 4.2], STEEL_DARK), [0, 0, 0.45 * side], [1.3 * side, -0.6, 0]),
  placeMesh(prism(12, 0, -2.2, [3.8, 3.5], [4, 3.7], STEEL), [0, 0, 0.55 * side], [1.7 * side, -2.8, 0]),
  lowSphere(0.6, RIVET, [1.6 * side, 1.4, 3.6], 7, 3),
];
const armoredArm = (side: 1 | -1): Mesh[] => [...pauldron(side), prism(12, -1, -10, [2.5, 2.5], [2.2, 2.2], STEEL_DARK)];
const armoredForearm: Mesh[] = [
  lowSphere(2.6, STEEL, [0, 0, 0.4], 9, 5, [1, 1, 1.15]),
  placeMesh(prism(3, 0, 1.2, [1.8, 1.8], [0.3, 0.3], STEEL_DARK, [0, 0, 0], 0), [-Math.PI / 2, 0, 0], [0, 0, 2.2]),
  prism(12, -1.2, -9, [2.3, 2.3], [2.7, 2.7], STEEL),
  prism(12, -7.4, -9, [2.8, 2.8], [2.9, 2.9], STEEL_EDGE),
];
const gauntlet = (): Mesh[] => [
  box(3.8, 3.4, 3.6, STEEL_DARK, [0, -1.6, 0]),
  box(3.9, 1.1, 3.8, STEEL, [0, -0.2, 0]),
  ...[-1.2, 0, 1.2].map((x) => box(1, 2.2, 1.2, STEEL_EDGE, [x, -3.8, 1])),
];
const greatAxe = (): Mesh[] => [
  ...gauntlet(),
  prism(9, 7, -26, [1, 1], [1, 1], LEATHER),
  ...[3, -2, -7].map((y) => prism(9, y, y - 1, [1.3, 1.3], [1.3, 1.3], STEEL_EDGE)),
  // 雙刃斧頭：前後各一片，由窄到寬的楔形
  placeMesh(prism(4, 0, 6.4, [0.5, 3.6], [0.3, 6], 0xc4c9d2, [0, 0, 0], 0), [Math.PI / 2, 0, 0], [0, -23, 1.2]),
  placeMesh(prism(4, 0, 6.4, [0.5, 3.6], [0.3, 6], 0xc4c9d2, [0, 0, 0], 0), [-Math.PI / 2, 0, 0], [0, -23, -1.2]),
  box(2.4, 5, 2.4, STEEL_DARK, [0, -23, 0]),
  prism(4, -26, -30, [1, 1], [0.1, 0.1], STEEL),
];
const ARMORED: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    shoulderX: 8.6,
    root: [
      prism(10, 3.2, 0, [6.6, 5], [6.8, 5.2], LEATHER),
      box(2, 2, 1, RIVET, [0, 1.6, 5.3]),
      // 四片腿裙
      placeMesh(box(6.4, 7, 1.2, STEEL), [0.2, 0, 0], [0, -3, 5.2]),
      placeMesh(box(6.4, 7, 1.2, STEEL_DARK), [-0.2, 0, 0], [0, -3, -5.2]),
      placeMesh(box(1.2, 6.4, 5.6, STEEL_DARK), [0, 0, -0.2], [6.8, -2.8, 0]),
      placeMesh(box(1.2, 6.4, 5.6, STEEL_DARK), [0, 0, 0.2], [-6.8, -2.8, 0]),
      // 前後的紅色罩袍布
      placeMesh(box(3.8, 13, 0.5, PLUME), [0.16, 0, 0], [0, -3.6, 6.4]),
      placeMesh(box(4.4, 12, 0.5, PLUME), [-0.16, 0, 0], [0, -3.2, -6.4]),
    ],
    torso: [
      // 三層腹甲
      prism(10, 0, 2.6, [6.8, 5], [7.1, 5.2], STEEL),
      prism(10, 2.4, 5, [7.1, 5.2], [7.5, 5.4], STEEL_DARK),
      prism(10, 4.8, 7.4, [7.5, 5.4], [8, 5.6], STEEL),
      // 胸甲：往上變寬，中央有稜線
      prism(10, 7.4, 13.5, [8, 5.6], [8.8, 5.6], STEEL),
      prism(10, 13.5, 16, [8.8, 5.6], [6.4, 4.6], STEEL_DARK),
      placeMesh(box(1.8, 8, 1.8, STEEL), [0, Math.PI / 4, 0], [0, 10.5, 5.3]),
      ...[-5, 5].map((x) => lowSphere(0.6, RIVET, [x, 12.6, 5.1], 7, 3)),
      box(12, 1, 1, STEEL_EDGE, [0, 7.4, 5.4]),
    ],
    neck: [prism(10, -0.5, 3.5, [3.6, 3.4], [3, 2.8], STEEL_DARK), prism(10, 1.4, 2.4, [3.9, 3.7], [3.9, 3.7], STEEL_EDGE)],
    head: [
      prism(10, 0, 8.6, [4.7, 4.9], [5, 5.1], STEEL),
      lowSphere(5.05, STEEL, [0, 8.6, 0], 12, 5, [1, 0.75, 1.02], (c) => c[1] > 0.1),
      // 斜面面甲：左右兩片在中央相接，中間是視縫
      placeMesh(box(4.4, 6.6, 1.4, STEEL_DARK), [0, 0.45, 0], [1.9, 4.2, 4.6]),
      placeMesh(box(4.4, 6.6, 1.4, STEEL_DARK), [0, -0.45, 0], [-1.9, 4.2, 4.6]),
      box(7.6, 0.9, 1.2, 0x120e0e, [0, 5.8, 5.4]),
      ...[2.2, 3.4].map((y) => box(0.5, 0.6, 1, 0x120e0e, [1.4, y, 5.6])),
      ...[2.2, 3.4].map((y) => box(0.5, 0.6, 1, 0x120e0e, [-1.4, y, 5.6])),
      // 紅色盔纓：沿頭頂由前往後三段
      ...[2, -0.8, -3.4].map((z, i) => placeMesh(prism(4, 0, 3.2 - i * 0.6, [1, 1.6], [0.7, 1.2], PLUME), [-0.4 - i * 0.25, 0, 0], [0, 12, z])),
    ],
    upperArmL: armoredArm(1),
    upperArm: armoredArm(-1),
    forearmL: armoredForearm,
    forearm: armoredForearm,
    handL: gauntlet(),
    handR: greatAxe(),
    thigh: [prism(12, 0, -12, [3.2, 3.2], [2.8, 2.8], STEEL), prism(12, -4, -5, [3.3, 3.3], [3.2, 3.2], STEEL_EDGE)],
    shin: [
      // 膝甲（多面球）與扇形護片
      lowSphere(2.9, STEEL, [0, 0, 0.5], 9, 5, [1, 1, 1.15]),
      placeMesh(prism(3, 0, 1, [2.2, 2.2], [0.3, 0.3], STEEL_DARK, [0, 0, 0], 0), [-Math.PI / 2, 0, 0], [0, 0, 2.6]),
      prism(12, -1.4, -12.5, [2.8, 3], [2.4, 2.6], STEEL),
      box(1.4, 9, 1, STEEL_EDGE, [0, -6.5, 2.9]),
    ],
    foot: [box(4.4, 2.6, 4.4, STEEL_DARK, [0, -1.3, 0.4]), box(4, 2, 3, STEEL, [0, -1.6, 3.4]), box(3.4, 1.6, 2, STEEL_DARK, [0, -1.9, 5.6])],
  }),
  poses: monsterPoses({ attack: 'slam', twoHanded: true }),
};


/** 骷髏法師：紫色長袍（金色滾邊）、尖兜帽、腰帶與小袋、喇叭袖、左手法杖（頂端紫色水晶 + 金色爪座） */
const ROBE = 0x4e3c7a;
const ROBE_DARK = 0x33284f;
const GOLD = 0xc8a24a;
const CRYSTAL = 0xa86cf0;
const staff = (): Mesh[] => [
  lowSphere(1.6, BONE_DARK, [0, -1.4, 0], 8, 4),
  prism(8, 15, -22, [0.8, 0.8], [0.8, 0.8], 0x5a3a22),
  prism(8, 13.6, 15.4, [1.3, 1.3], [1.8, 1.8], GOLD),
  // 水晶：拉長的八面體，外圍三根金爪
  prism(4, 15.4, 17.6, [0.3, 0.3], [2, 2], CRYSTAL, [0, 0, 0], 0),
  prism(4, 17.6, 22.6, [2, 2], [0.1, 0.1], CRYSTAL, [0, 0, 0], 0),
  ...[0, 1, 2].map((i) => placeMesh(box(0.5, 4.4, 0.5, GOLD, [0, 2, 0]), [0.35, (i * Math.PI * 2) / 3, 0], [0, 15, 0])),
];
const MAGE: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    root: [
      prism(12, 4, -26.6, [5.8, 4.6], [10, 8.4], ROBE),
      prism(12, -26.6, -28.5, [10, 8.4], [10.2, 8.6], GOLD),
      // 前襟的金色滾邊（沿長袍斜面）
      placeMesh(box(1.4, 30, 0.6, GOLD), [-0.122, 0, 0], [0, -11.4, 6.3]),
      prism(12, 2.2, 4.4, [5.9, 4.7], [6, 4.8], LEATHER),
      box(1.8, 1.8, 0.8, GOLD, [0, 3.3, 4.9]),
      box(2.6, 3.2, 2, 0x5a3a22, [4.8, 1.2, 2.6]),
    ],
    torso: [
      prism(12, 0, 15, [5.8, 4.6], [7.6, 5], ROBE),
      box(1.8, 14, 1, GOLD, [0, 7.5, 4.9]),
      prism(12, 13, 16, [7.8, 5.4], [5, 4], ROBE_DARK),
      prism(12, 11.6, 13, [7.9, 5.5], [7.9, 5.5], GOLD),
    ],
    head: [
      ...skull(),
      // 尖兜帽：包住後腦、前方露出骷髏臉，尖端往後翹；開口上緣金邊
      lowSphere(6.8, ROBE, [0, 6.4, -0.8], 12, 6, [1.02, 1.1, 1.05], (c) => c[2] < 2.4 || c[1] > 3.4),
      placeMesh(prism(8, 0, 8.5, [3.8, 3.4], [0.2, 0.2], ROBE), [-0.6, 0, 0], [0, 11.4, -2.6]),
      box(7.4, 1.2, 1.2, GOLD, [0, 10.4, 4.4]),
      ...[1, -1].map((side) => placeMesh(box(1.2, 6, 1.2, GOLD), [0, 0, 0.2 * side], [4.6 * side, 7, 3.4])),
    ],
    upperArm: [prism(9, 0, -10, [2.4, 2.4], [2.8, 2.8], ROBE)],
    forearm: [prism(9, 0, -8, [2.8, 2.8], [3.6, 3.6], ROBE), prism(9, -8, -9.2, [3.6, 3.6], [3.7, 3.7], GOLD), ...boneLimb(1, 0.9)],
    handL: staff(),
    // 腿藏在長袍裡（不畫，避免膝蓋穿出袍子），只露出腳尖
    thigh: [],
    shin: [],
    foot: [box(2.8, 1.4, 3, BONE, [0, -1.4, 2.6])],
  }),
  poses: monsterPoses({ attack: 'chop', cast: 'staff' }),
};

/** 訓練木樁：木柱、橫桿、草包（不會動，被打時晃一下） */
const WOOD = 0x8c5a3c;
const SACK = 0xc8a878;
const DUMMY_POSE: Pose = { rootY: 0, angles: {} };
const DUMMY_HIT: Pose = { rootY: 0, angles: { torso: [-0.15, 0, 0.2] } };
const DUMMY: FigureModel = {
  hipHeight: 26,
  referenceRadius: 0.35,
  parts: [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: [prism(9, 2, -26, [1.8, 1.8], [2.2, 2.2], WOOD), prism(9, -24, -26, [5, 5], [5.6, 5.6], 0x5a3a22)] },
    {
      joint: 'torso',
      parent: 'root',
      offset: [0, 2, 0],
      meshes: [prism(10, 0, 16, [5.4, 4.6], [6.2, 5], SACK), box(22, 2, 2, WOOD, [0, 13, 0]), box(3, 3, 3, SACK, [10.5, 12, 0]), box(3, 3, 3, SACK, [-10.5, 12, 0])],
    },
    { joint: 'head', parent: 'torso', offset: [0, 16, 0], meshes: [lowSphere(5, SACK, [0, 5, 0], 10, 5), box(4, 0.8, 0.8, 0x6a4a2a, [0, 5, 4.8]), box(0.8, 4, 0.8, 0x6a4a2a, [0, 5, 4.8])] },
  ],
  poses: {
    ready: () => DUMMY_POSE,
    run: () => DUMMY_POSE,
    attackWindup: DUMMY_POSE,
    attackStrike: DUMMY_POSE,
    castWindup: DUMMY_POSE,
    castRelease: DUMMY_POSE,
    hit: DUMMY_HIT,
    dead: { rootY: -20, angles: { root: [1.4, 0, 0] } },
  },
};

/** EnemyDef ID → 模型（沒有對應時 ActorView 使用骷髏戰士） */
export const MONSTER_MODELS: Record<string, FigureModel> = {
  'enemy.skeleton': SKELETON_WARRIOR,
  'enemy.ghoul': GHOUL,
  'enemy.skeleton_archer': ARCHER,
  'enemy.armored_skeleton': ARMORED,
  'enemy.skeleton_mage': MAGE,
  'enemy.training_dummy': DUMMY,
  ...CREATURE_MODELS,
  ...BEAST_MODELS,
  ...BOSS_MODELS,
};

export const DEFAULT_MONSTER_MODEL = SKELETON_WARRIOR;
