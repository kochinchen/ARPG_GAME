import { ABERRATION_MODELS } from './Aberrations';
import { BEAST_MODELS } from './Beasts';
import { BOSS_MODELS } from './Bosses';
import { CREATURE_MODELS } from './Creatures';
import { LATE_MODELS, WARDEN_GEAR } from './LateMonsters';
import { SKELETON_GEAR, SKELETON_WARRIOR } from './SkeletonWarrior';
import { houndLife, monsterAi, sixTentacles, wheelBeastLife, wormLife } from './MonsterAI';
import SKELETON_AI_DATA from './monsters/skeletonAI.json';
import FROST_SKELETON_AI_DATA from './monsters/frostSkeletonAI.json';
import ARCHER_AI_DATA from './monsters/skeletonArcherAI.json';
import GHOUL_AI_DATA from './monsters/ghoulAI.json';
import VENOM_GHOUL_AI_DATA from './monsters/venomGhoulAI.json';
import VOID_SPORE_AI_DATA from './monsters/voidSporeAI.json';
import VOID_MAW_AI_DATA from './monsters/voidMawAI.json';
import BURROWER_AI_DATA from './monsters/burrowerAI.json';
import ARMORED_AI_DATA from './monsters/armoredSkeletonAI.json';
import MAGE_AI_DATA from './monsters/skeletonMageAI.json';
import STORM_MAGE_AI_DATA from './monsters/stormMageAI.json';
import BONE_HOUND_AI_DATA from './monsters/boneHoundAI.json';
import WHEEL_SWORD_BEAST_AI_DATA from './monsters/wheelSwordBeastAI.json';
import EYE_FLOATER_AI_DATA from './monsters/eyeFloaterAI.json';
import HATCHLING_SPIDER_AI_DATA from './monsters/hatchlingSpiderAI.json';
import ACID_BEETLE_AI_DATA from './monsters/acidBeetleAI.json';
import { BONE_HAND } from './BoneHand';
import { STONE_WALKERS } from './StoneWalkers';
import type { FigureModel, Joint, Pose } from './FigureModel';
import { BONE, BONE_DARK, boneLimb, humanoid, monsterPoses, pelvis, ribcage, skull } from './MonsterParts';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from './Poly3D';
import { knightStance, skeletonStance } from './HumanoidStance';
import { bolt, fromHsl, glowEyes, iceCluster, pustule, recolor, rustSpike, toHsl, variant, type Hsl, type RecolorRule } from './Variants';
import { bugPoses, spike } from './Creatures';

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
const GHOUL: FigureModel = skeletonStance({
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
  poses: monsterPoses({ attack: 'claw', hunch: 0.65, gait: 'lope' }),
  gaitRate: 1.1,
}, { upperArmR: [-0.5, 0, -0.2], forearmR: [-0.6, 0, 0], handR: [0, 0, 0], upperArmL: [-0.5, 0, 0.2], forearmL: [-0.6, 0, 0], handL: [0, 0, 0], torso: [0.6, -0.12, 0.05] });

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
const ARCHER: FigureModel = skeletonStance({
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
  poses: monsterPoses({ attack: 'bow', gait: 'stalk' }),
  gaitRate: 0.85,
});

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
const ARMORED: FigureModel = knightStance({
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
  poses: monsterPoses({ attack: 'slam', twoHanded: true, gait: 'swagger' }),
  gaitRate: 0.7,
});

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
const MAGE: FigureModel = skeletonStance({
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
  poses: monsterPoses({ attack: 'chop', cast: 'staff', gait: 'glide' }),
  gaitRate: 0.8,
}, { handL: [1.45, 0, 0] });

// ─────────────────────────── 變種（同一個模型換色、加零件）───────────────────────────

/** 骨頭：偏暖、低飽和、較亮的顏色 */
const isBone = (c: { h: number; s: number; l: number }) => c.l > 0.32 && c.s < 0.4 && c.h > 25 && c.h < 60;
const isMetal = (c: { s: number; l: number }) => c.s < 0.2 && c.l > 0.25;

/** 冰霜骷髏：骨頭結霜成冰藍色、劍與盾泛著冰光；肩膀、背後與劍身長出冰晶，眼窩透出藍光 */
const ICE = [0xbfe8ff, 0x8ccff0] as const;
const FROST_COLOR = recolor([
  { match: isBone, h: 200, s: 0.4, l: 1.02 },
  { match: isMetal, h: 198, s: 0.35, l: 1.12 },
  { match: (c) => c.h < 20 || c.h > 340, h: 215, s: 0.45 },
  { match: () => true, h: 210, s: 0.18 },
]);
const FROST_SKELETON = variant(SKELETON_WARRIOR, {
  color: FROST_COLOR,
  add: {
    torso: [...iceCluster([3.5, 14.5, -3.4], [0.3, 0.8, -0.5], 5, 0.75, ICE), ...iceCluster([-3, 13.5, -3.6], [-0.3, 0.85, -0.5], 4.4, 0.7, ICE), ...iceCluster([0, 8, -4], [0, 0.4, -1], 3.4, 0.6, ICE)],
    upperArmL: iceCluster([1.2, 1.4, 0], [0.5, 1, -0.2], 3.6, 0.6, ICE),
    upperArmR: iceCluster([-1.2, 1.4, 0], [-0.5, 1, -0.2], 3.6, 0.6, ICE),
    head: [...glowEyes(1.7, 4.5, 4.3, 0.75, 0x9ae8ff), ...iceCluster([0, 9.4, -1.6], [0, 1, -0.4], 3.2, 0.55, ICE)],
  },
});

/** 毒液食屍鬼：青紫色的皮、背上與肩上鼓著綠色膿疱、眼睛發出毒綠光 */
const VENOM = { sac: 0x6aa82a, tip: 0xc8f060 };
const VENOM_GHOUL = variant(GHOUL, {
  color: recolor([
    { match: (c) => c.h > 70 && c.h < 110, h: 285, s: 0.16, l: 0.92 },
    { match: (c) => c.h > 45 && c.h < 65 && c.s > 0.7, h: 95, s: 0.95, l: 0.9 },
  ]),
  add: {
    torso: [
      ...([[2.6, 12.6, -4.2, 1.5], [-2.2, 11, -4.4, 1.3], [0.4, 8.4, -4, 1.6], [-3, 6.6, -3.8, 1.1], [3.2, 7.4, -3.6, 1.2], [1.2, 4.6, -3.6, 1]] as const).flatMap(([x, y, z, r]) => pustule([x, y, z], r, VENOM.sac, VENOM.tip)),
    ],
    upperArmL: pustule([1.4, -2, -0.6], 1.1, VENOM.sac, VENOM.tip),
    upperArmR: pustule([-1.4, -3, -0.6], 1, VENOM.sac, VENOM.tip),
    head: pustule([1.8, 9.6, -2.4], 1, VENOM.sac, VENOM.tip),
  },
});

/** 焦骨弓手：燒焦的黑骨頭、灰燼色的兜帽與披風；肋骨間與弓的兩端透出餘燼，眼窩燒著火 */
const EMBER = { glow: 0xff8a2a, core: 0xffd060 };
const EMBER_ARCHER = variant(ARCHER, {
  color: recolor([
    { match: isBone, h: 20, s: 0.12, l: 0.36 },
    { match: (c) => c.h > 70 && c.h < 120, h: 15, s: 0.12, l: 0.75 },
    { match: (c) => c.h < 15 || c.h > 340, h: 24, s: 0.95, l: 1.35 },
  ]),
  add: {
    torso: ([[2.6, 6, 2.4], [-2.4, 9, 2.6], [1, 12, 2.6], [-3.4, 6, -2.6], [3.6, 9.4, -2.8]] as const).map(([x, y, z], i) => lowSphere(0.7, i % 2 ? EMBER.glow : EMBER.core, [x, y, z], 5, 3)),
    head: glowEyes(2, 6, 5.5, 0.8, EMBER.glow),
    handL: [lowSphere(0.8, EMBER.glow, [0, 1.4, 13.4], 5, 3), lowSphere(0.8, EMBER.glow, [0, 1.4, -13.4], 5, 3)],
  },
});

/** 雷霆法師：深藍長袍、銀色滾邊、法杖頂端是發光的青色水晶，周圍纏著雷光；眼窩透出電光 */
const STORM = { glow: 0x8ef0ff, bolt: 0xe4fbff };
const STORM_STAFF_COLOR = recolor([
  { match: (c) => c.h > 240 && c.h < 290 && c.s > 0.6 && c.l > 0.5, h: 188, s: 0.95, l: 1.15 },
  { match: (c) => c.h > 240 && c.h < 290, h: 222, s: 0.5 },
  { match: (c) => c.h > 35 && c.h < 55 && c.s > 0.4, h: 205, s: 0.12, l: 1.15 },
]);
const STORM_STAFF_BOLTS = (): Mesh[] => [...bolt([1.5, 16, 0], [5, 23, 1], 0.32, STORM.bolt, 0.9), ...bolt([-1.5, 17, 0.5], [-4.6, 22, -1.5], 0.3, STORM.glow, 0.8), lowSphere(1.2, STORM.bolt, [0, 19.4, 0], 6, 4)];
const STORM_MAGE = variant(MAGE, {
  color: STORM_STAFF_COLOR,
  add: {
    handL: STORM_STAFF_BOLTS(),
    head: glowEyes(2, 6, 5.5, 0.8, STORM.glow),
  },
});

/** 鏽蝕重甲：板甲鏽成紅褐色、盔纓褪成暗褐；肩甲與頭盔上鉚著長短不一（有的斷掉）的鏽刺 */
const RUST = { spike: 0x5a3a26, base: 0x3e2a1e };
/** 鏽刺（舊版的關節座標；AI 版也用） */
const RUST_SPIKES: Partial<Record<Joint, Mesh[]>> = {
  upperArmL: [...rustSpike([3.4, 3.6, 0], [0.5, 1, 0], 5, 0.9, RUST.spike, RUST.base), ...rustSpike([4.4, 1.4, 2], [0.8, 0.6, 0.4], 4, 0.75, RUST.spike, RUST.base, true), ...rustSpike([4, 1.6, -2.2], [0.8, 0.6, -0.4], 4, 0.75, RUST.spike, RUST.base)],
  upperArmR: [...rustSpike([-3.4, 3.6, 0], [-0.5, 1, 0], 5, 0.9, RUST.spike, RUST.base, true), ...rustSpike([-4.4, 1.4, 2], [-0.8, 0.6, 0.4], 4, 0.75, RUST.spike, RUST.base), ...rustSpike([-4, 1.6, -2.2], [-0.8, 0.6, -0.4], 4, 0.75, RUST.spike, RUST.base, true)],
  head: [...rustSpike([3.6, 9, 0], [1, 0.4, 0], 3.6, 0.7, RUST.spike, RUST.base), ...rustSpike([-3.6, 9, 0], [-1, 0.4, 0], 3.6, 0.7, RUST.spike, RUST.base, true)],
  torso: [...rustSpike([0, 14, -5], [0, 0.5, -1], 4, 0.8, RUST.spike, RUST.base), ...rustSpike([3.4, 11, -5.2], [0.3, 0.3, -1], 3, 0.7, RUST.spike, RUST.base, true), ...rustSpike([-3.4, 11, -5.2], [-0.3, 0.3, -1], 3, 0.7, RUST.spike, RUST.base)],
};
const RUSTED_KNIGHT = variant(ARMORED, {
  color: recolor([
    // 亮的甲片鏽得淺、暗的接縫鏽得深（斑駁）；斧刃保留一點金屬色
    { match: (c) => c.s < 0.2 && c.l > 0.7, h: 28, s: 0.12, l: 0.82 },
    { match: (c) => c.s < 0.2 && c.l > 0.45, h: 20, s: 0.36, l: 0.68 },
    { match: (c) => c.s < 0.2, h: 14, s: 0.42, l: 0.8 },
    { match: (c) => c.h < 15 || c.h > 340, h: 18, s: 0.4, l: 0.75 },
  ]),
  add: RUST_SPIKES,
});

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

// ─────────────────────────── AI 版（設計者生成的 3D 模型；舊版保留為 *_CLASSIC）───────────────────────────

export const SKELETON_CLASSIC = SKELETON_WARRIOR;
const paint = (meshes: readonly Mesh[], color: (c: number) => number): Mesh[] =>
  meshes.map((m) => ({
    ...m,
    faces: m.faces.map((f) => ({
      ...f,
      color: color(f.color),
      ...(f.base !== undefined ? { base: color(f.base) } : {}),
    })),
  }));
/** 食屍鬼：生成的模型本來就駝背、頭往前伸，待機就是模型的樣子（腰、頸、頭只加上舊版動作和待機的差） */
const HUNCHED = ['torso', 'neck', 'head'] as const;

/**
 * 持劍盾的骷髏：劍握在拳心、與手臂垂直（握把配合拳頭寬度，往劍尖依序是護手、rain-guard、劍身；劍身比舊版長 1.2 倍）；
 * 圓盾放大 2 倍、在拳頭外側（盾面朝外、垂直地面，不和手臂重疊）。1.3 = 舊版的劍盾放在 AI 模型上偏小，整體先放大的倍率
 */
const swordOf = (color?: (c: number) => number) => ({
  build: (grip: number) => {
    const sword = SKELETON_GEAR.sword(grip);
    return { meshes: paint(sword.meshes, color ?? ((c) => c)), tip: sword.tip };
  },
});
const shieldOf = (color?: (c: number) => number) => ({
  meshes: paint(SKELETON_GEAR.shield, color ?? ((c) => c)),
  scale: 2,
});
/**
 * 骷髏（戰士、冰霜、弓手）和女主角一樣高（設計者 2026-11-07）：ratio = 原本的高度 ÷ 女主角
 * （npm run docs:models 的 manifest.js 量的，正面待機），只放大畫面上的模型，碰撞與數值不變
 */
const asTallAsHeroine = (ratio: number, m: FigureModel): FigureModel => resized(ratio, 1, m);
/** 高度（相對女主角）從 from 調成 to：生成的模型比例和舊版不同，維持舊版在遊戲裡的大小 */
const resized = (from: number, to: number, m: FigureModel): FigureModel => ({
  ...m,
  visualScale: ((m.visualScale ?? 1) * to) / from,
});
const SKELETON_AI = asTallAsHeroine(
  0.88,
  monsterAi(SKELETON_AI_DATA, SKELETON_WARRIOR, {
    sword: swordOf(),
    shield: shieldOf(),
    heldScale: 1.3,
  }),
);
const FROST_SKELETON_AI = asTallAsHeroine(
  0.9,
  monsterAi(FROST_SKELETON_AI_DATA, FROST_SKELETON, {
    sword: swordOf(FROST_COLOR),
    shield: shieldOf(FROST_COLOR),
    heldScale: 1.3,
  }),
);
/**
 * 骷髏弓手：弓放大 2 倍、握把在左手拳心（手臂往前平舉時弓直立、弓弦朝自己）。
 * 拉弓：側身、左臂往目標平舉伸直、右手把弦拉到下巴旁（弦跟著被拉開、後半段搭上一支箭）→
 * 放箭（箭消失、由技能的投射物飛出去；弦彈回原位、右手往後彈開、左臂不動）
 */
// 角度由數值搜尋：左臂（肩 → 手）朝正前方水平、弓的長軸垂直地面、右手停在下巴前（誤差約 1.6）
const ARCHER_DRAW = {
  torso: [-0.05, -0.7, 0],
  neck: [0, 0.3, 0],
  head: [0, 0.4, 0],
  upperArmL: [-1.5, 0, 0.7],
  forearmL: [0, 0, 0],
  handL: [0, 0, 0],
  upperArmR: [-1.2, 0, 1.2],
  forearmR: [-1.1, 0, 0],
  handR: [0, 0, 0],
} as const;
const ARCHER_LOOSE = {
  ...ARCHER_DRAW,
  upperArmR: [-0.9, 0, 1.3],
  forearmR: [-0.35, 0, 0],
} as const;
const aim = (base: Pose, a: Readonly<Record<string, readonly number[]>>): Pose => ({ ...base, angles: { ...base.angles, ...(a as Pose['angles']) } });
const ARCHER_AIMED: FigureModel = {
  ...ARCHER,
  poses: {
    ...ARCHER.poses,
    attackWindup: aim(ARCHER.poses.attackWindup, ARCHER_DRAW),
    attackStrike: aim(ARCHER.poses.attackStrike, ARCHER_LOOSE),
    castWindup: aim(ARCHER.poses.castWindup, ARCHER_DRAW),
    castRelease: aim(ARCHER.poses.castRelease, ARCHER_LOOSE),
  },
};
// 弓（不含舊版的拳頭與弓弦，弦另外做成會拉開的兩段）；箭：骨白的箭桿、紅羽
const ARCHER_AI = asTallAsHeroine(
  0.99,
  monsterAi(ARCHER_AI_DATA, ARCHER_AIMED, {
    bow: {
      meshes: bow().slice(1, -1),
      grip: [0, -1.6, 0],
      scale: 2,
      string: { y: 1.4, half: 13.4, color: 0xe8e0c8 },
      arrow: { color: 0xd8d0b0, fletch: 0xa82a20, head: 0x8a8478 },
    },
  }),
);
/**
 * 重甲骷髏：雙手巨斧（暫時用舊版程式畫的斧頭，不含舊版的鐵手套；生成的斧頭之後換上）。
 * 設計者 2026-11-08：斧面比舊版放大 2 倍後再小 30%、斧柄短 40%；劈下時彎腰屈膝，斧頭砍到地面
 */
const AXE_HEAD_Y = -23;
const shortAxe = (): Mesh[] =>
  greatAxe()
    // 去掉舊版的鐵手套（5 個零件）
    .slice(gauntlet().length)
    .map((m, i) => ({
      ...m,
      verts: m.verts.map((v): V3 =>
        // 第一個是斧柄：整根縮短；其他（握環除外）是斧頭：移到縮短後的位置、以斧頭中心縮小 30%
        i === 0 || (i >= 1 && i <= 3) ? [v[0], v[1] * 0.6, v[2]] : [v[0] * 0.7, AXE_HEAD_Y * 0.6 + (v[1] - AXE_HEAD_Y) * 0.7, v[2] * 0.7],
      ),
    }));
const plusAngles = (base: Pose, d: Readonly<Record<string, readonly number[]>>, dy = 0): Pose => {
  const angles = { ...base.angles } as Record<string, V3>;
  for (const [j, a] of Object.entries(d)) {
    const b = angles[j] ?? [0, 0, 0];
    angles[j] = [b[0] + a[0]!, b[1] + a[1]!, b[2] + a[2]!];
  }
  return { ...base, rootY: base.rootY + dy, angles: angles as Pose['angles'] };
};
const AXE_CARRY = { upperArmR: [0.66, -0.18, -0.75], forearmR: [-0.36, 0, 0], handR: [1.35, -0.81, 0] } as const;
/** 扛斧的右手臂（走路步伐正中間的角度；待機、受傷也用） */
const carryArm = (): Pose['angles'] => {
  const walk = plusAngles(ARMORED.poses.run(0), AXE_CARRY).angles;
  return { upperArmR: walk.upperArmR!, forearmR: walk.forearmR!, handR: walk.handR! };
};
const ARMORED_SLAM: FigureModel = {
  ...ARMORED,
  poses: {
    ...ARMORED.poses,
    // 走路時把斧頭扛在右肩上（設計者 2026-11-08）：握點在右肩前方，斧柄往後上方斜過肩膀，斧頭在頭的後上方（角度由數值搜尋）
    run: (p) => plusAngles(ARMORED.poses.run(p), AXE_CARRY),
    // 待機時斧頭的位置和走路一致：右手臂用走路（步伐正中間）的角度
    ready: (t) => {
      const r = ARMORED.poses.ready(t);
      return { ...r, angles: { ...r.angles, ...carryArm() } };
    },
    // 受傷時斧頭也維持扛在肩上
    hit: { ...ARMORED.poses.hit, angles: { ...ARMORED.poses.hit.angles, ...carryArm() } },
    // 舉斧：手腕往後翻，斧頭朝後上方高舉在頭的後面（設計者 2026-11-08：原本斧頭垂在背後、砍進背裡）
    attackWindup: plusAngles(ARMORED.poses.attackWindup, { handR: [2.2, 0, 0] }),
    attackStrike: plusAngles(
      ARMORED.poses.attackStrike,
      { torso: [0.35, 0, 0], thighL: [-0.45, 0, 0], thighR: [-0.45, 0, 0], shinL: [0.8, 0, 0], shinR: [0.8, 0, 0], footL: [-0.35, 0, 0], footR: [-0.35, 0, 0], upperArmR: [0.2, 0, 0], upperArmL: [0.2, 0, 0], handR: [1.6, 0, 0] },
      -3,
    ),
  },
};
// 斧柄與手臂垂直、握在拳心（設計者 2026-11-08，同骷髏的劍）：手臂往兩側平舉、手心朝下時斧柄朝前、斧刃往兩側（與手臂同一個平面）；握點在斧柄從尾端算起約 40% 的地方
const AXE_GRIP = 5;
const ARMORED_AI = monsterAi(ARMORED_AI_DATA, ARMORED_SLAM, {
  sword: {
    build: () => ({ meshes: shortAxe().map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0], v[1] + AXE_GRIP, v[2]]) })), tip: AXE_HEAD_Y * 0.6 + AXE_GRIP }),
  },
  heldScale: 2,
});
/**
 * 重甲骷髏的換色版本（鏽蝕重甲、三種屬性重甲）：同一個 AI 模型與動作，換板甲、骨頭、盔纓、前襬、眼窩的顏色，
 * 斧刃換色並在刃口加一條發亮的細邊，肩甲、頭盔、背上可以長出鏽刺或冰晶
 */
interface ArmorLook {
  /** 板甲（spot = 交錯的斑點，讓顏色斑駁） */
  armor: (c: Hsl, spot: boolean) => Hsl;
  bone?: (c: Hsl) => Hsl;
  /** 頭上的盔纓 */
  plume?: (c: Hsl) => Hsl;
  /** 腰前的布 */
  cloth?: (c: Hsl) => Hsl;
  /** 眼窩（發光） */
  eye?: number;
}
function armorSkin(m: FigureModel, look: ArmorLook): FigureModel {
  const skin = m.skin!;
  const headY = skin.rest.head![1];
  return {
    ...m,
    skin: {
      ...skin,
      faces: skin.faces.map((f, n) => {
        if (f.color === ARMORED_EYE) return look.eye === undefined ? f : { ...f, color: look.eye };
        const c = toHsl(f.color);
        const paint = (fn: ((c: Hsl) => Hsl) | undefined) => (fn ? { ...f, color: fromHsl(fn(c)) } : f);
        if ((c.h >= 330 || c.h < 12) && c.s >= 0.45) return paint(f.idx.every((i) => skin.verts[i]![1] > headY) ? look.plume : look.cloth);
        if (c.h >= 30 && c.h < 50 && c.s < 0.25 && c.l > 0.5) return paint(look.bone);
        if (c.h > 190 && c.h < 240) return { ...f, color: fromHsl(look.armor(c, (n * 2654435761) % 7 < 2)) };
        return f;
      }),
    },
  };
}
/** 重甲骷髏的眼窩（monster_ai.py 塗的深黑） */
const ARMORED_EYE = 0x0a0808;
const AXE_BLADES = [4, 5];
/** 斧頭：鐵的部分換色（iron），每片斧刃最外緣一條比斧刃厚一點的發亮細邊（兩面都看得到） */
const edgedAxe = (iron: (c: number) => number, edge: number): Mesh[] => {
  const axe = shortAxe();
  const edges = AXE_BLADES.map((i) => {
    const vs = axe[i]!.verts;
    const zMax = Math.max(...vs.map((v) => Math.abs(v[2])));
    const far = vs.filter((v) => Math.abs(v[2]) > zMax * 0.97);
    const ys = far.map((v) => v[1]);
    const side = Math.sign(far[0]![2]);
    return box(0.7, Math.max(...ys) - Math.min(...ys) + 0.2, 0.5, edge, [0, (Math.max(...ys) + Math.min(...ys)) / 2, side * (zMax - 0.1)]);
  });
  return [...axe.map((m) => ({ ...m, faces: m.faces.map((f) => ({ ...f, color: iron(f.color) })) })), ...edges];
};
/**
 * 長在生成模型表面的尖刺：在跟著該關節的頂點裡找最往 dir 方向凸出的一點當底座（稍微埋進去），沿 dir 長出去。
 * [關節, 方向, 長度, 粗細, 斷掉]（舊版的單位）
 */
type SurfaceSpike = [Joint[], V3, number, number, boolean];
const ARMOR_SPIKES: SurfaceSpike[] = [
  ...([1, -1] as const).flatMap((s): SurfaceSpike[] => {
    const arm: Joint[] = s > 0 ? ['ex_clavL', 'upperArmL'] : ['ex_clavR', 'upperArmR'];
    return [
      [arm, [0.45 * s, 1, 0], 6, 1.1, s < 0],
      [arm, [0.8 * s, 0.7, 0.45], 4.6, 0.9, s > 0],
      [arm, [0.8 * s, 0.7, -0.45], 4.6, 0.9, false],
    ];
  }),
  [['head'], [0.9, 0.6, -0.2], 4, 0.8, false],
  [['head'], [-0.9, 0.6, -0.2], 4, 0.8, true],
  [['torso'], [0, 0.55, -1], 5, 1, false],
  [['torso'], [0.45, 0.2, -1], 4, 0.85, true],
  [['torso'], [-0.45, 0.2, -1], 4, 0.85, false],
];
function withSurfaceSpikes(m: FigureModel, spikes: readonly SurfaceSpike[], build: (c: V3, d: V3, len: number, r: number, broken: boolean) => Mesh[]): FigureModel {
  const skin = m.skin!;
  const add = new Map<Joint, Mesh[]>();
  for (const [joints, dir, len, r, broken] of spikes) {
    const n = Math.hypot(...dir);
    const d: V3 = [dir[0] / n, dir[1] / n, dir[2] / n];
    const owner = joints[joints.length - 1]!;
    const at = skin.rest[owner]!;
    let best: V3 | null = null;
    let bestDot = -Infinity;
    skin.verts.forEach((v, i) => {
      if (!skin.infl[i]!.some((x) => joints.includes(x.joint) && x.w > 0.5)) return;
      const dot = (v[0] - at[0]) * d[0] + (v[1] - at[1]) * d[1] + (v[2] - at[2]) * d[2];
      if (dot > bestDot) [bestDot, best] = [dot, v];
    });
    if (!best) continue;
    const b = best as V3;
    const k = 1.3;
    const c: V3 = [b[0] - at[0] - d[0] * r * 0.6, b[1] - at[1] - d[1] * r * 0.6, b[2] - at[2] - d[2] * r * 0.6];
    add.set(owner, [...(add.get(owner) ?? []), ...build(c, d, len * k, r * k, broken)]);
  }
  return { ...m, parts: m.parts.map((p) => (add.has(p.joint) ? { ...p, meshes: [...p.meshes, ...add.get(p.joint)!] } : p)) };
}
const armoredVariant = (classic: FigureModel, axe: Mesh[], look: ArmorLook): FigureModel =>
  armorSkin(
    monsterAi(ARMORED_AI_DATA, { ...classic, poses: ARMORED_SLAM.poses }, {
      sword: { build: () => ({ meshes: axe.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0], v[1] + AXE_GRIP, v[2]]) })), tip: AXE_HEAD_Y * 0.6 + AXE_GRIP }) },
      heldScale: 2,
    }),
    look,
  );

/**
 * 鏽蝕重甲（設計者 2026-11-08）：板甲是斑駁的鏽色（亮處橙褐、暗處深紅褐），盔纓是深黑色、前襬褪成暗紅褐；
 * 肩甲、頭盔、背上長著鏽刺；斧刃鏽成暗紅、刃口泛著血光
 */
const RUSTED_KNIGHT_AI = withSurfaceSpikes(
  armoredVariant(RUSTED_KNIGHT, edgedAxe(recolor([{ match: (c) => c.s < 0.25, h: 16, s: 0.32, l: 0.62 }]), 0xff3a2a), {
    armor: (c, spot) => (c.l > 0.42 ? { h: spot ? 22 : 12, s: spot ? 0.5 : 0.42, l: c.l * (spot ? 0.82 : 0.7) } : { h: spot ? 18 : 8, s: 0.38, l: c.l * 0.62 }),
    plume: (c) => ({ h: 0, s: 0.08, l: 0.05 + c.l * 0.12 }),
    cloth: (c) => ({ h: 10, s: 0.45, l: c.l * 0.75 }),
  }),
  ARMOR_SPIKES,
  (c, d, len, r, broken) => rustSpike(c, d, len, r, RUST.spike, RUST.base, broken),
);

/**
 * 三種屬性的重甲（設計者 2026-11-08，攻擊附帶該屬性 20% 傷害）：
 * 熔鐵 = 燒黑的板甲、接縫透出橘紅的熔光，斧刃燒紅；霜鎧 = 結霜的青白板甲、肩上與背上長著冰晶，斧刃是冰；
 * 雷殛 = 帶紫的深灰板甲、接縫透出紫色電光，斧刃有電光。眼窩都發出該屬性的光
 */
const MOLTEN_ARMOR_AI = armoredVariant(ARMORED, edgedAxe(recolor([{ match: (c) => c.s < 0.25, h: 12, s: 0.25, l: 0.45 }]), 0xffa030), {
  // 亮的甲片燒黑、暗的接縫是熔光
  armor: (c, spot) => (c.l < 0.32 ? { h: spot ? 30 : 18, s: 1, l: 0.5 } : { h: 12, s: 0.18, l: c.l * (spot ? 0.45 : 0.36) }),
  bone: (c) => ({ h: 28, s: 0.18, l: c.l * 0.72 }),
  plume: (c) => ({ h: 24, s: 1, l: Math.min(0.62, c.l * 1.4) }),
  cloth: (c) => ({ h: 6, s: 0.6, l: c.l * 0.7 }),
  eye: 0xff8a20,
});
const FROST_SHARD = [0xd8f4ff, 0x8ecff0] as const;
const FROST_ARMOR_AI = withSurfaceSpikes(
  armoredVariant(ARMORED, edgedAxe(recolor([{ match: (c) => c.s < 0.25, h: 200, s: 0.4, l: 1.15 }]), 0xeaffff), {
    armor: (c, spot) => ({ h: spot ? 195 : 205, s: spot ? 0.35 : 0.28, l: Math.min(0.85, c.l * 1.25) }),
    bone: (c) => ({ h: 200, s: 0.25, l: c.l }),
    plume: (c) => ({ h: 200, s: 0.75, l: Math.min(0.75, c.l * 1.8) }),
    cloth: (c) => ({ h: 215, s: 0.55, l: c.l * 0.9 }),
    eye: 0x7ae0ff,
  }),
  // 冰晶比鏽刺短一點、不會斷
  ARMOR_SPIKES.map(([j, d, len, r]): SurfaceSpike => [j, d, len * 0.85, r, false]),
  (c, d, len, r) => iceCluster(c, d, len, r, FROST_SHARD),
);
const STORM_ARMOR_AI = armoredVariant(ARMORED, edgedAxe(recolor([{ match: (c) => c.s < 0.25, h: 260, s: 0.12, l: 0.7 }]), 0xd8a8ff), {
  armor: (c, spot) => (c.l < 0.34 ? { h: 275, s: 0.85, l: spot ? 0.66 : 0.55 } : { h: 255, s: 0.14, l: c.l * (spot ? 0.75 : 0.62) }),
  bone: (c) => ({ h: 265, s: 0.12, l: c.l * 0.92 }),
  plume: (c) => ({ h: 280, s: 0.8, l: Math.min(0.62, c.l * 1.5) }),
  cloth: (c) => ({ h: 265, s: 0.5, l: c.l * 0.8 }),
  eye: 0xc890ff,
});
/**
 * 骷髏法師（設計者 2026-11-08）：左手前臂往前平舉、法杖直立（同主角拿法杖），杖身握在從下算起約 2/3 的地方；
 * 普通攻擊和施法都是舉起法杖再往前指
 */
const MAGE_GRIP = 2.7;
const MAGE_HOLD = { upperArmL: [-0.35, 0, 0.7], forearmL: [-1.22, 0, 0], handL: [-0.18, 0.7, 0] } as const;
const MAGE_RAISE = aim(MAGE.poses.castWindup, { upperArmL: [-1.75, 0, -0.1], forearmL: [-0.15, 0, 0], handL: [0.3, 0, 0], upperArmR: [-0.75, 0, -0.2], forearmR: [-0.5, 0, 0] });
const MAGE_POINT = aim(MAGE.poses.castRelease, { upperArmL: [-1.15, 0, -0.1], forearmL: [-0.25, 0, 0], handL: [0.75, 0, 0], upperArmR: [-1.35, 0, -0.15], forearmR: [-0.05, 0, 0] });
const MAGE_STAFF: FigureModel = {
  ...MAGE,
  poses: {
    ...MAGE.poses,
    ready: (t) => aim(MAGE.poses.ready(t), MAGE_HOLD),
    run: (p) => aim(MAGE.poses.run(p), MAGE_HOLD),
    hit: aim(MAGE.poses.hit, MAGE_HOLD),
    attackWindup: MAGE_RAISE,
    attackStrike: MAGE_POINT,
    castWindup: MAGE_RAISE,
    castRelease: MAGE_POINT,
  },
};
/** 舊版的法杖（不含舊版的拳頭）轉成杖頭朝 -Y、握點在原點 */
const staffMeshes = (meshes: readonly Mesh[]): Mesh[] => meshes.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0], -(v[1] - MAGE_GRIP), -v[2]]) }));
/**
 * 法師的袍色（設計者 2026-11-08）：系別由袍色決定。模型的長袍、發光的紋路、雙眼與法杖的水晶換色，其他（骨頭、飾邊、皮帶、角）不變
 */
interface RobeLook {
  robe: (c: Hsl) => Hsl;
  /** 長袍上發光的電光紋 */
  glow?: (c: Hsl) => Hsl;
  /** 雙眼（中心、外圈） */
  eyes: readonly [number, number];
}
/** 骷髏法師（紫袍）：長袍的色相範圍、monster_ai.py 畫的雙眼 */
const MAGE_ROBE = { isRobe: (c: Hsl) => c.h >= 275 && c.h < 352 && c.s >= 0.3, isGlow: () => false, eyes: [0xf0a0ff, 0xb040f0] as const };
/** 雷霆法師（深藍袍） */
const STORM_ROBE = { isRobe: (c: Hsl) => c.h >= 205 && c.h < 262 && c.s >= 0.25, isGlow: (c: Hsl) => c.h >= 165 && c.h < 205 && c.s >= 0.3, eyes: [0xd0ffff, 0x40d8f0] as const };
function robeSkin(m: FigureModel, base: typeof MAGE_ROBE | typeof STORM_ROBE, look: RobeLook): FigureModel {
  const skin = m.skin!;
  return {
    ...m,
    skin: {
      ...skin,
      faces: skin.faces.map((f) => {
        if (f.color === base.eyes[0]) return { ...f, color: look.eyes[0] };
        if (f.color === base.eyes[1]) return { ...f, color: look.eyes[1] };
        const c = toHsl(f.color);
        if (base.isGlow(c)) return look.glow ? { ...f, color: fromHsl(look.glow(c)) } : f;
        return base.isRobe(c) ? { ...f, color: fromHsl(look.robe(c)) } : f;
      }),
    },
  };
}
/** 法杖的杖頭（水晶、金座、三根金爪）跟該屬性同色系，並以金座為中心放大 1.5 倍（設計者 2026-11-08）；杖身不變 */
const STAFF_HEAD_BASE = 13.6;
const STAFF_HEAD_SCALE = 1.5;
const biggerHead = (meshes: readonly Mesh[]): Mesh[] =>
  meshes.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0] * STAFF_HEAD_SCALE, STAFF_HEAD_BASE + (v[1] - STAFF_HEAD_BASE) * STAFF_HEAD_SCALE, v[2] * STAFF_HEAD_SCALE]) }));
const headColor = (hue: number) =>
  recolor([
    { match: (c) => c.h > 180 && c.h < 290 && c.s > 0.6 && c.l > 0.45, h: hue, s: 0.95, l: 1.1 },
    { match: (c) => c.h > 35 && c.h < 55 && c.s > 0.4, h: hue, s: 0.6, l: 0.85 },
  ]);
const mageStaffOf = (hue: number, extra: readonly Mesh[] = []): Mesh[] => {
  const [shaft, ...head] = staff().slice(1);
  return staffMeshes([shaft!, ...biggerHead([...paint(head, headColor(hue)), ...extra])]);
};
// 和女主角一樣高（同其他骷髏）
const tallMage = (data: unknown, classic: FigureModel, meshes: Mesh[]) => asTallAsHeroine(0.88, monsterAi(data, classic, { staff: { meshes }, heldScale: 1.7 }));
const lowMage = (hue: number, look: RobeLook | null) => {
  const m = tallMage(MAGE_AI_DATA, MAGE_STAFF, mageStaffOf(hue));
  return look ? robeSkin(m, MAGE_ROBE, look) : m;
};
// 骷髏法師：紫袍 = 雷、紅袍 = 火、藍袍 = 冰、白袍 = 三系
const MAGE_AI = lowMage(275, null);
const MAGE_FIRE_AI = lowMage(18, { robe: (c) => ({ h: 6, s: 0.72, l: c.l * 1.05 }), eyes: [0xffd080, 0xff6020] });
const MAGE_FROST_AI = lowMage(195, { robe: (c) => ({ h: 205, s: 0.65, l: c.l * 1.15 }), eyes: [0xd8f4ff, 0x50b8ff] });
const MAGE_WHITE_AI = lowMage(48, { robe: (c) => ({ h: 45, s: 0.08, l: Math.min(0.9, 0.5 + c.l * 1.2) }), eyes: [0xffffff, 0xffe080] });
const stormMage = (hue: number, look: RobeLook | null): FigureModel => {
  const m = tallMage(STORM_MAGE_AI_DATA, { ...STORM_MAGE, poses: MAGE_STAFF.poses }, mageStaffOf(hue, look ? [] : STORM_STAFF_BOLTS()));
  return look ? robeSkin(m, STORM_ROBE, look) : m;
};
/** 中階法師（設計者 2026-11-08）：自己的模型（肩上彎角、電光紋）；法杖同骷髏法師。深藍袍 = 雷、紅袍 = 火、冰藍袍 = 冰、金袍 = 三系 */
const STORM_MAGE_AI = stormMage(190, null);
const STORM_MAGE_FIRE_AI = stormMage(18, { robe: (c) => ({ h: 6, s: 0.7, l: c.l * 1.05 }), glow: (c) => ({ h: 28, s: 0.95, l: c.l }), eyes: [0xffd080, 0xff6020] });
const STORM_MAGE_FROST_AI = stormMage(195, { robe: (c) => ({ h: 195, s: 0.5, l: Math.min(0.8, c.l * 1.7) }), eyes: [0xffffff, 0x90e0ff] });
const STORM_MAGE_GOLD_AI = stormMage(48, { robe: (c) => ({ h: 45, s: 0.8, l: Math.min(0.72, c.l * 1.9) }), glow: (c) => ({ h: 52, s: 1, l: c.l }), eyes: [0xffffff, 0xffd050] });
/** 飛斧重甲（設計者 2026-11-08）：重甲骷髏換成帶藍的鋼灰板甲、深藍盔纓與前襬；斧頭丟出去時手上不畫（Renderer） */
const AXE_THROWER_AI = armoredVariant(ARMORED, edgedAxe(recolor([{ match: (c) => c.s < 0.25, h: 215, s: 0.12, l: 1.05 }]), 0xe8eef8), {
  armor: (c, spot) => ({ h: 215, s: spot ? 0.2 : 0.16, l: c.l * (spot ? 1.05 : 0.95) }),
  plume: (c) => ({ h: 222, s: 0.6, l: c.l * 0.75 }),
  cloth: (c) => ({ h: 222, s: 0.5, l: c.l * 0.7 }),
});
const GHOUL_AI = monsterAi(GHOUL_AI_DATA, GHOUL, { modeled: HUNCHED });
const VENOM_GHOUL_AI = monsterAi(VENOM_GHOUL_AI_DATA, VENOM_GHOUL, {
  modeled: HUNCHED,
  fit: 'height',
});

// ─────────────────────────── AI 版的屬性變種（同一個模型換色；設計者 2026-11-07）───────────────────────────

/** 只換蒙皮網格（生成的身體）的顏色；手上的武器另外換 */
const paintSkin = (m: FigureModel, color: (c: number) => number): FigureModel => ({
  ...m,
  skin: {
    ...m.skin!,
    faces: m.skin!.faces.map((f) => ({ ...f, color: color(f.color) })),
  },
});

/**
 * 冰霜骷髏的換色（生成的顏色：骨頭是低飽和的藍灰、冰晶是高飽和的亮青、腰布是深藍）：
 * 冰晶 → 火焰 / 紫電、腰布 → 深紅 / 靛紫、骨頭 → 燒焦的暖灰 / 帶紫的灰
 */
const frostRecolor = (crystal: Omit<RecolorRule, 'match'>, cloth: Omit<RecolorRule, 'match'>, bone: Omit<RecolorRule, 'match'>) =>
  recolor([
    { match: (c) => c.s >= 0.5 && c.l >= 0.38, ...crystal },
    { match: (c) => c.h >= 208 && c.s >= 0.3, ...cloth },
    { match: () => true, ...bone },
  ]);
const FLAME_SKIN = frostRecolor({ h: 20, s: 0.95, l: 1.05 }, { h: 356, s: 0.6, l: 0.95 }, { h: 25, s: 0.1, l: 0.82 });
const STORM_SKIN = frostRecolor({ h: 280, s: 0.9, l: 1.05 }, { h: 262, s: 0.5 }, { h: 262, s: 0.07, l: 0.92 });
/** 劍與盾（舊版的顏色：金屬、皮革、木頭） */
const FLAME_GEAR = recolor([
  { match: isMetal, h: 12, s: 0.32 },
  { match: () => true, h: 4, s: 0.5, l: 0.9 },
]);
const STORM_GEAR = recolor([
  { match: isMetal, h: 268, s: 0.25 },
  { match: () => true, h: 270, s: 0.4, l: 0.9 },
]);
const flameOrStorm = (gear: (c: number) => number, skin: (c: number) => number) =>
  asTallAsHeroine(
    0.9,
    paintSkin(
      monsterAi(FROST_SKELETON_AI_DATA, FROST_SKELETON, {
        sword: swordOf(gear),
        shield: shieldOf(gear),
        heldScale: 1.3,
      }),
      skin,
    ),
  );
const FLAME_SKELETON_AI = flameOrStorm(FLAME_GEAR, FLAME_SKIN);
const STORM_SKELETON_AI = flameOrStorm(STORM_GEAR, STORM_SKIN);

/**
 * 骷髏弓手的換色（生成的顏色：骨頭是淡黃白、兜帽是深橄欖綠、皮革是褐色）：
 * 焦骨 = 燒焦的骨頭、灰燼色兜帽、暗褐皮革；凍骨 = 冰白的骨頭、冰藍兜帽、灰藍皮革；猛毒 = 毒綠的骨頭、紫色兜帽、暗紫皮革
 */
const archerRecolor = (bone: Omit<RecolorRule, 'match'>, hood: Omit<RecolorRule, 'match'>, leather: Omit<RecolorRule, 'match'>) =>
  recolor([
    {
      match: (c) => c.h >= 28 && c.h < 70 && c.l >= 0.34 && c.s < 0.5,
      ...bone,
    },
    { match: (c) => c.h >= 42 && c.h < 130 && c.l < 0.34, ...hood },
    { match: () => true, ...leather },
  ]);
const archerBow = (string: number, arrow: number, fletch: number, head: number) => ({
  bow: {
    meshes: bow().slice(1, -1),
    grip: [0, -1.6, 0] as V3,
    scale: 2,
    string: { y: 1.4, half: 13.4, color: string },
    arrow: { color: arrow, fletch, head },
  },
});
const ember = monsterAi(ARCHER_AI_DATA, ARCHER_AIMED, archerBow(0xffb070, 0x3a2a22, 0xff8a2a, 0xffd060));
const EMBER_ARCHER_AI = asTallAsHeroine(0.99, paintSkin(ember, archerRecolor({ h: 20, s: 0.12, l: 0.5 }, { h: 15, s: 0.1, l: 0.9 }, { h: 14, s: 0.45, l: 0.8 })));
const frostArcher = monsterAi(ARCHER_AI_DATA, ARCHER_AIMED, archerBow(0xe8f6ff, 0xc8e4f0, 0x9ad8ff, 0xeaf8ff));
const FROST_ARCHER_AI = asTallAsHeroine(0.99, paintSkin(frostArcher, archerRecolor({ h: 205, s: 0.35, l: 1.1 }, { h: 205, s: 0.45, l: 1.25 }, { h: 212, s: 0.22, l: 0.95 })));
const venomArcher = monsterAi(ARCHER_AI_DATA, ARCHER_AIMED, archerBow(0xd8f0a0, 0x5a7a2a, 0x8ed04a, 0xc8ff60));
const VENOM_ARCHER_AI = asTallAsHeroine(0.99, paintSkin(venomArcher, archerRecolor({ h: 78, s: 0.35, l: 0.95 }, { h: 285, s: 0.32, l: 1.15 }, { h: 300, s: 0.2, l: 0.8 })));

/**
 * 鎖鏈獄卒：骷髏戰士的模型（設計者 2026-11-07）＋舊版的鐵籠面罩、發光的眼、胸前的鎖鏈、手銬、左手的燈籠、右手的鐵鉤
 * （鐵鉤握在拳心、與手臂垂直，同骷髏的劍）。燈籠照舊版一直晃
 */
// 高度和舊版一樣（女主角的 1.13 倍），不用調
const CHAIN_WARDEN_AI = monsterAi(SKELETON_AI_DATA, LATE_MODELS['enemy.chain_warden']!, {
  // 鐵鉤放大 2 倍、鉤尖朝地板（設計者 2026-11-07）：舊版的鉤子往前彎，握成與手臂垂直後「前」會變成上方，所以前後翻過來（鏡像後面的頂點順序也要反過來）
  sword: { build: () => ({ meshes: WARDEN_GEAR.hook().map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0] * 2, (v[1] + 3.2) * 2, -v[2] * 2]), faces: m.faces.map((f) => ({ ...f, idx: [...f.idx].reverse() })) })), tip: -11.8 * 2 }) },
  held: {
    head: [...WARDEN_GEAR.cage(), ...WARDEN_GEAR.eyes()],
    torso: WARDEN_GEAR.chains(),
    forearmL: WARDEN_GEAR.manacle(),
    forearmR: WARDEN_GEAR.manacle(),
  },
  heldScale: 1.15,
  // 燈籠放大 2 倍（設計者 2026-11-07），掛在左手腕、一直朝下垂著
  hang: { joint: 'ex_lantern', parent: 'handL', meshes: WARDEN_GEAR.lantern(), scale: 2 },
});

/**
 * 鑽地寄生蟲的外觀（設計者 2026-11-07，照舊版）：虛空吞噬者的紫黑換成大地的土色（環節縫是深褐、唇是暗紅、牙與嘴裡的黑洞不變），
 * 頭上剩下的紫色寶石變成橘色的眼睛，身上每一節長幾根往後斜的微刺
 */
const BURROWER_LOOK = { eye: 0xff8040, spike: 0x5a4234 };
function burrowerLook(m: FigureModel): FigureModel {
  const skin = m.skin!;
  const headZ = skin.rest.head![2];
  const earth = recolor([
    // 沒有大獠牙（設計者 2026-11-08）：壓平的牙齒換成肉色的口緣；嘴裡的黑洞不變
    { match: (c) => c.s < 0.3 && c.l > 0.35, h: 12, s: 0.3, l: 0.7 },
    { match: (c) => c.l < 0.04 },
    { match: (c) => (c.h >= 330 || c.h < 15) && c.s >= 0.5, h: 8, s: 0.45, l: 1.15 },
    { match: (c) => c.h >= 260 && c.h < 295 && c.s >= 0.5, h: 22, s: 0.3, l: 1.35 },
    { match: () => true, h: 18, s: 0.24, l: 2.4 },
  ]);
  const faces = skin.faces.map((f) => {
    const z = (skin.verts[f.idx[0]]![2] + skin.verts[f.idx[1]]![2] + skin.verts[f.idx[2]]![2]) / 3;
    const c = toHsl(f.color);
    const gem = c.h >= 255 && c.h < 310 && c.s >= 0.45 && c.l >= 0.38;
    return { ...f, color: gem && z > headZ - 2 ? BURROWER_LOOK.eye : earth(f.color) };
  });
  // 微刺：每一節（身體的關節）上半圈 5 根，插在那一節中段的表面上（往那個方向最外面的頂點），往後斜
  const segs: Joint[] = ['neck', 'torso', 'root', 'ponytail', 'thighL', 'shinL', 'footL'];
  const parts = m.parts.map((p) => {
    if (!segs.includes(p.joint)) return p;
    const at = skin.rest[p.joint]!;
    const mine = skin.verts.filter((_, i) => skin.infl[i]![0]?.joint === p.joint).map((v): V3 => [v[0] - at[0], v[1] - at[1], v[2] - at[2]]);
    if (!mine.length) return p;
    const mid = mine.reduce((sum, v) => sum + v[2], 0) / mine.length;
    const spikes = [-1.3, -0.65, 0, 0.65, 1.3].flatMap((a, i) => {
      const near = mine.filter((v) => Math.abs(Math.atan2(v[0], v[1]) - a) < 0.3 && Math.abs(v[2] - mid) < 1.6);
      if (!near.length) return [];
      const r = Math.max(...near.map((v) => Math.hypot(v[0], v[1])));
      const dir: V3 = [Math.sin(a), Math.cos(a), 0];
      const len = r * (0.16 + (i % 2) * 0.07);
      return [spike([dir[0] * r * 0.9, dir[1] * r * 0.9, mid], [dir[0] * (r + len), dir[1] * (r + len), mid - len * 0.5], r * 0.06, BURROWER_LOOK.spike)];
    });
    return { ...p, meshes: [...p.meshes, ...spikes] };
  });
  return { ...m, parts, skin: { ...skin, faces } };
}

/** 四足獸的四肢關節 */
const QUAD_LIMBS: Joint[] = ['thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR'];

/** EnemyDef ID → 模型（沒有對應時 ActorView 使用骷髏戰士） */
/**
 * 非人形怪物的外觀倍率（只放大畫面，不影響碰撞與數值）。
 * 目標高度（基準體型、相對女主角）：掠界獸 0.9、甲殼與節肢 0.7、噴吐異種 0.7、
 * 寄生變異體 1.2、漂浮異體 0.9、巨獸 2.1；部分樓層魔王另外指定。倍率 = 目標 ÷ 模型原本的高度比。
 */
const VISUAL_SCALE: Record<string, number> = {
  // 掠界獸系 → 0.9
  'enemy.bone_hound': 1.64,
  'enemy.blood_lizard': 1.76,
  // 鐵輪劍獸（沿用暗影獵豹的 ID）：設計稿的高度是女主角 1.2 倍
  'enemy.shadow_panther': 1.14,
  // 甲殼與節肢系 → 0.7
  'enemy.acid_beetle': 2.26,
  'enemy.hatchling_spider': 2.8,
  'enemy.hook_claw': 2.06,
  // 噴吐異種 → 0.7
  'enemy.poison_spitter': 2.19,
  'enemy.fire_crawler': 2,
  'enemy.frost_sporeling': 1.43,
  // 寄生變異體 → 1.2
  'enemy.egg_matron': 2,
  'enemy.soul_flower': 2.03,
  'enemy.burrower': 3.64,
  // 漂浮異體 → 0.9
  'enemy.eye_floater': 1.22,
  'enemy.brain_floater': 1.29,
  'enemy.void_spore': 1.8,
  // 巨獸系 → 2.1
  'enemy.horned_brute': 3.18,
  'enemy.molten_brute': 3.28,
  'enemy.quake_beast': 3.39,
  // 23～35 樓：晶刺織網蛛 → 0.9、虛空吞噬者 → 1.6（比鑽地寄生蟲大一圈）、要塞魔像 → 1.8
  'enemy.crystal_weaver': 2.3,
  'enemy.void_maw': 2.87,
  'enemy.rampart_golem': 1.28,
  // 樓層魔王（相對女主角的高度，含遊戲中的體型倍率）：蜘蛛女王 3.2、熔岩巨獸 4、深淵魔王 3.8（深淵分身不放大）
  'enemy.spider_queen': 1.51,
  'enemy.lava_behemoth': 1.62,
  'enemy.abyss_lord': 1.18,
  'enemy.abyss_sovereign': 1.18,
};

const scaled = (models: Record<string, FigureModel>): Record<string, FigureModel> =>
  Object.fromEntries(Object.entries(models).map(([id, m]) => [id, VISUAL_SCALE[id] ? { ...m, visualScale: VISUAL_SCALE[id] } : m]));

// ── 鐵輪劍獸與單眼浮體的變化型（設計者 2026-11-09）：同一個模型換色；鋸輪加鋸齒、三瞳把頭上的小眼放大 ──
type RecolorTo = { h: number; s: number; l: number };
const inHue = (c: { h: number }, from: number, to: number) => c.h >= from && c.h <= to;
const WHEEL_BEAST = (): FigureModel => wheelBeastLife(monsterAi(WHEEL_SWORD_BEAST_AI_DATA, scaled(BEAST_MODELS)['enemy.shadow_panther']!, { rest: 'asModeled', hip: 14, ground: 'none' }));
const EYE_BEAST = (): FigureModel => sixTentacles(monsterAi(EYE_FLOATER_AI_DATA, scaled(ABERRATION_MODELS)['enemy.eye_floater']!, { rest: 'asModeled', ground: 'none', lift: 6 }));
const wheelRecolor = (crystal: RecolorTo, shoulder: RecolorTo, wood: RecolorTo, chest?: RecolorTo) =>
  recolor([
    { match: (c) => inHue(c, 150, 215) && c.s > 0.12, ...crystal },
    { match: (c) => inHue(c, 55, 110) && c.s > 0.2, ...shoulder },
    { match: (c) => inHue(c, 12, 50) && c.s > 0.28 && c.l < 0.5, ...wood },
    ...(chest ? [{ match: (c: { h: number; s: number }) => (c.h >= 335 || c.h < 8) && c.s > 0.45, ...chest }] : []),
  ]);
const eyeRecolor = (flesh: RecolorTo, vein: RecolorTo, star: RecolorTo) =>
  recolor([
    { match: (c) => inHue(c, 38, 62) && c.s > 0.6 && c.l > 0.5, ...star },
    { match: (c) => (c.h >= 340 || c.h < 20) && c.s > 0.5 && c.l > 0.32, ...vein },
    { match: (c) => inHue(c, 300, 360) && c.s > 0.3, ...flesh },
  ]);
const EMBER_WHEEL_AI = paintSkin(WHEEL_BEAST(), wheelRecolor({ h: 26, s: 0.95, l: 1.5 }, { h: 12, s: 0.45, l: 0.55 }, { h: 12, s: 0.9, l: 1.5 }));
const FROST_WHEEL_AI = paintSkin(WHEEL_BEAST(), wheelRecolor({ h: 200, s: 0.8, l: 1.35 }, { h: 205, s: 0.4, l: 1.35 }, { h: 205, s: 0.28, l: 1.5 }, { h: 215, s: 0.6, l: 1 }));
/** 鋸齒：一圈往旋轉方向彎的尖齒，掛在輪子的關節上 */
const sawTeeth = (): Mesh[] =>
  Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return spike([0, Math.cos(a) * 12, Math.sin(a) * 12], [0, Math.cos(a + 0.3) * 18, Math.sin(a + 0.3) * 18], 3.4, i % 2 ? 0xb8c2cc : 0x8d97a3);
  });
const withParts = (m: FigureModel, add: Partial<Record<Joint, readonly Mesh[]>>): FigureModel => ({ ...m, parts: m.parts.map((p) => (add[p.joint] ? { ...p, meshes: [...p.meshes, ...add[p.joint]!] } : p)) });
const SAW_WHEEL_AI = withParts(paintSkin(WHEEL_BEAST(), wheelRecolor({ h: 210, s: 0.2, l: 1.25 }, { h: 24, s: 0.4, l: 0.7 }, { h: 215, s: 0.1, l: 0.85 })), { thighL: sawTeeth(), thighR: sawTeeth() });
/** 三瞳：頭上三隻小眼放大（身體座標） */
const bigStalkEyes = (): Mesh[] =>
  ([[12.3, 24, 5], [-12.3, 24, 5], [0, 32, 5]] as V3[]).flatMap((c) => [lowSphere(6.6, 0xf2eadf, c, 9, 6), lowSphere(3.6, 0xff3a24, [c[0], c[1], c[2] + 4.4], 8, 4), lowSphere(1.7, 0x140808, [c[0], c[1], c[2] + 7], 6, 3)]);
const TRI_EYE_AI = withParts(paintSkin(EYE_BEAST(), eyeRecolor({ h: 278, s: 0.5, l: 1.05 }, { h: 300, s: 0.9, l: 1.25 }, { h: 190, s: 0.95, l: 1 })), { root: bigStalkEyes() });
const GAZER_AI = paintSkin(EYE_BEAST(), eyeRecolor({ h: 238, s: 0.42, l: 0.9 }, { h: 258, s: 0.85, l: 1.3 }, { h: 240, s: 0.4, l: 1.25 }));
const EMBER_EYE_AI = paintSkin(EYE_BEAST(), eyeRecolor({ h: 15, s: 0.3, l: 0.55 }, { h: 26, s: 0.98, l: 1.25 }, { h: 26, s: 0.98, l: 1 }));

export const MONSTER_MODELS: Record<string, FigureModel> = {
  'enemy.skeleton': SKELETON_AI,
  'enemy.ghoul': GHOUL_AI,
  'enemy.skeleton_archer': ARCHER_AI,
  'enemy.armored_skeleton': ARMORED_AI,
  'enemy.skeleton_mage': MAGE_AI,
  'enemy.skeleton_mage_fire': MAGE_FIRE_AI,
  'enemy.skeleton_mage_frost': MAGE_FROST_AI,
  'enemy.skeleton_mage_white': MAGE_WHITE_AI,
  'enemy.training_dummy': DUMMY,
  'enemy.frost_skeleton': FROST_SKELETON_AI,
  'enemy.venom_ghoul': VENOM_GHOUL_AI,
  'enemy.storm_mage': STORM_MAGE_AI,
  'enemy.storm_mage_fire': STORM_MAGE_FIRE_AI,
  'enemy.storm_mage_frost': STORM_MAGE_FROST_AI,
  'enemy.storm_mage_gold': STORM_MAGE_GOLD_AI,
  'enemy.rusted_knight': RUSTED_KNIGHT_AI,
  'enemy.molten_armor': MOLTEN_ARMOR_AI,
  'enemy.frost_armor': FROST_ARMOR_AI,
  'enemy.storm_armor': STORM_ARMOR_AI,
  'enemy.axe_thrower': AXE_THROWER_AI,
  ...scaled(CREATURE_MODELS),
  ...scaled(BEAST_MODELS),
  ...scaled(ABERRATION_MODELS),
  ...scaled(LATE_MODELS),
  ...scaled(BOSS_MODELS),
  ...STONE_WALKERS,
  'enemy.bone_hand': BONE_HAND,
  // 虛空孢子：舊版的觸手末端離地約 6
  'enemy.void_spore': monsterAi(VOID_SPORE_AI_DATA, scaled(ABERRATION_MODELS)['enemy.void_spore']!, { rest: 'asModeled', ground: 'none', lift: 6 }),
  'enemy.eye_floater': EYE_BEAST(),
  'enemy.tri_eye': TRI_EYE_AI,
  'enemy.gazer': GAZER_AI,
  'enemy.ember_eye': EMBER_EYE_AI,
  // 虛空吞噬者、鑽地寄生蟲：維持舊版的高度（女主角的 1.79、1.28 倍）
  'enemy.void_maw': resized(
    1.13,
    1.79,
    wormLife(
      monsterAi(VOID_MAW_AI_DATA, scaled(LATE_MODELS)['enemy.void_maw']!, {
        rest: 'asModeled',
        ground: 'all',
      }),
      { amp: 0.22, rate: 11 },
    ),
  ),
  // 骨刺獵獸：生成的模型本來就是獵食者的站姿（四肢彎曲），動作只加上舊版和待機的差
  'enemy.bone_hound': houndLife(monsterAi(BONE_HOUND_AI_DATA, scaled(BEAST_MODELS)['enemy.bone_hound']!, { rest: 'asModeled', modeled: QUAD_LIMBS, hip: 18.09, ground: 'paws' })),
  'enemy.shadow_panther': WHEEL_BEAST(),
  'enemy.ember_wheel': EMBER_WHEEL_AI,
  'enemy.frost_wheel': FROST_WHEEL_AI,
  'enemy.saw_wheel': SAW_WHEEL_AI,
  // 酸液甲蟲：生成的模型有八隻腳（舊版六隻）
  'enemy.acid_beetle': monsterAi(ACID_BEETLE_AI_DATA, { ...scaled(CREATURE_MODELS)['enemy.acid_beetle']!, poses: bugPoses({ legs: 8, hip: 7 }) }, { rest: 'asModeled', ground: 'all', fit: 'height' }),
  'enemy.hatchling_spider': monsterAi(HATCHLING_SPIDER_AI_DATA, scaled(CREATURE_MODELS)['enemy.hatchling_spider']!, { rest: 'asModeled', ground: 'all', fit: 'height' }),
  'enemy.flame_skeleton': FLAME_SKELETON_AI,
  'enemy.storm_skeleton': STORM_SKELETON_AI,
  'enemy.ember_archer': EMBER_ARCHER_AI,
  'enemy.frost_archer': FROST_ARCHER_AI,
  'enemy.venom_archer': VENOM_ARCHER_AI,
  'enemy.chain_warden': CHAIN_WARDEN_AI,
  // 鑽地寄生蟲：虛空吞噬者的模型，身上的寶石拿掉大部分（scripts/monster_ai.py 的 burrower），換成舊版的土色、橘眼、微刺；動作照舊版
  'enemy.burrower': resized(0.71, 1.28, burrowerLook(wormLife(monsterAi(BURROWER_AI_DATA, scaled(ABERRATION_MODELS)['enemy.burrower']!, { rest: 'asModeled', ground: 'all' }), { amp: 0.28, rate: 15 }))),
};

/**
 * 飛行中的 3D 投射物（技能 ID → 模型）：迴旋飛斧用飛斧重甲手上那把斧頭，放平（斧刃水平）、以斧柄中點為圓心水平旋轉
 */
function flyingWeapon(thrower: FigureModel): FigureModel {
  const meshes = thrower.parts.find((p) => p.joint === 'weapon')!.meshes;
  const zs = meshes.flatMap((m) => m.verts.map((v) => v[2]));
  const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
  const still: Pose = { rootY: 0, angles: {} };
  return {
    parts: [{ joint: 'root', parent: null, offset: [0, 0, 0], meshes: meshes.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [-v[1], v[0], v[2] - mid]) })) }],
    hipHeight: 20,
    referenceRadius: thrower.referenceRadius,
    ...(thrower.visualScale ? { visualScale: thrower.visualScale } : {}),
    poses: { ready: () => still, run: () => still, attackWindup: still, attackStrike: still, castWindup: still, castRelease: still, hit: still, dead: still },
  };
}
export const PROJECTILE_MODELS: Record<string, FigureModel> = { 'enemy.axe_throw': flyingWeapon(AXE_THROWER_AI) };

/** 換成 AI 版的一般怪（魔王動作預覽列出這些） */
export const AI_MONSTERS = [
  'enemy.skeleton',
  'enemy.ghoul',
  'enemy.venom_ghoul',
  'enemy.frost_skeleton',
  'enemy.skeleton_archer',
  'enemy.void_spore',
  'enemy.void_maw',
  'enemy.flame_skeleton',
  'enemy.storm_skeleton',
  'enemy.ember_archer',
  'enemy.frost_archer',
  'enemy.venom_archer',
  'enemy.chain_warden',
  'enemy.burrower',
  'enemy.armored_skeleton',
  'enemy.rusted_knight',
  'enemy.frost_armor',
  'enemy.molten_armor',
  'enemy.storm_armor',
  'enemy.axe_thrower',
  'enemy.skeleton_mage',
  'enemy.storm_mage',
  'enemy.skeleton_mage_fire',
  'enemy.skeleton_mage_frost',
  'enemy.skeleton_mage_white',
  'enemy.storm_mage_fire',
  'enemy.storm_mage_frost',
  'enemy.storm_mage_gold',
  'enemy.bone_hound',
  'enemy.shadow_panther',
  'enemy.acid_beetle',
  'enemy.hatchling_spider',
  'enemy.eye_floater',
  'enemy.ember_wheel',
  'enemy.frost_wheel',
  'enemy.saw_wheel',
  'enemy.tri_eye',
  'enemy.gazer',
  'enemy.ember_eye',
];

/** 換成 AI 版之前的舊版模型（比較面數、效能用） */
export const CLASSIC_MODELS: Record<string, FigureModel> = {
  'enemy.armored_skeleton': ARMORED,
  'enemy.rusted_knight': RUSTED_KNIGHT,
  'enemy.skeleton_mage': MAGE,
  'enemy.storm_mage': STORM_MAGE,
  'enemy.skeleton': SKELETON_WARRIOR,
  'enemy.ghoul': GHOUL,
  'enemy.venom_ghoul': VENOM_GHOUL,
  'enemy.frost_skeleton': FROST_SKELETON,
  'enemy.skeleton_archer': ARCHER,
  'enemy.void_spore': ABERRATION_MODELS['enemy.void_spore']!,
  'enemy.void_maw': LATE_MODELS['enemy.void_maw']!,
  'enemy.ember_archer': EMBER_ARCHER,
  'enemy.chain_warden': LATE_MODELS['enemy.chain_warden']!,
  'enemy.burrower': ABERRATION_MODELS['enemy.burrower']!,
  'enemy.bone_hound': BEAST_MODELS['enemy.bone_hound']!,
  'enemy.shadow_panther': BEAST_MODELS['enemy.shadow_panther']!,
  'enemy.acid_beetle': CREATURE_MODELS['enemy.acid_beetle']!,
  'enemy.hatchling_spider': CREATURE_MODELS['enemy.hatchling_spider']!,
  'enemy.eye_floater': ABERRATION_MODELS['enemy.eye_floater']!,
};

export const DEFAULT_MONSTER_MODEL = SKELETON_WARRIOR;
