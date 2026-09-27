import { BOSS_MODELS } from './Bosses';
import { CREATURE_MODELS } from './Creatures';
import type { FigureModel, Pose } from './FigureModel';
import { BONE, BONE_DARK, boneLimb, humanoid, monsterPoses, ribcage, skull, sword } from './MonsterParts';
import { box, lowSphere, placeMesh, prism, type Mesh } from './Poly3D';

/**
 * 怪物的多面體模型（與女主角同一套關節與繪製方式）。
 * 每種怪物：外觀零件 + 一組姿勢（依攻擊方式：劈砍、爪擊、拉弓、雙手重擊、法杖施法）。
 * 模型座標：Y 向上、Z 為前方、+X 為角色的左手邊（-X 右手拿武器）。
 */

// ─────────────────────────── 各種怪物 ───────────────────────────

/** 骷髏戰士：骨架、生鏽的劍 */
const SKELETON: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.32,
  parts: humanoid({ torso: ribcage(), head: skull(), handR: sword(17, 0xa8998a) }),
  poses: monsterPoses({ attack: 'chop' }),
};

/** 食屍鬼：駝背、灰綠皮膚、大嘴、發光的眼睛、長爪 */
const GHOUL_SKIN = 0x8c9c7a;
const GHOUL_DARK = 0x5c6a4e;
const claws = (): Mesh[] => [
  lowSphere(1.9, GHOUL_SKIN, [0, -1.4, 0], 8, 4),
  ...[-1, 0, 1].map((i) => placeMesh(prism(4, 0, -4.5, [0.45, 0.45], [0.05, 0.05], 0xe0d8c0), [0.3, 0, i * 0.3], [i * 1.1, -2.6, 0.6])),
];
const GHOUL: FigureModel = {
  hipHeight: 27,
  referenceRadius: 0.28,
  parts: humanoid({
    root: [prism(9, 2, -6, [5.2, 4], [6.4, 4.8], 0x4a3a2a)],
    torso: [prism(10, 0, 14, [5, 3.8], [7, 5], GHOUL_SKIN), box(8, 2, 3, GHOUL_DARK, [0, 12, -3.6])],
    neck: [prism(8, 0, 3, [1.8, 1.8], [1.8, 1.8], GHOUL_SKIN)],
    head: [
      lowSphere(5, GHOUL_SKIN, [0, 5, 1], 10, 5, [1, 0.95, 1.1]),
      box(7, 3.4, 5, GHOUL_DARK, [0, 1.4, 3]),
      box(5.4, 0.8, 1, 0x2a1a14, [0, 2, 5.6]),
      box(1.6, 1.2, 1, 0xd8e05a, [2, 6, 5.6]),
      box(1.6, 1.2, 1, 0xd8e05a, [-2, 6, 5.6]),
    ],
    upperArm: [prism(8, 0, -11, [1.8, 1.8], [1.4, 1.4], GHOUL_SKIN)],
    forearm: [prism(8, 0, -11, [1.4, 1.4], [1.2, 1.2], GHOUL_SKIN)],
    handL: claws(),
    handR: claws(),
    thigh: [prism(8, 0, -12, [2.2, 2.2], [1.6, 1.6], GHOUL_SKIN)],
    shin: [prism(8, 0, -12, [1.6, 1.6], [1.3, 1.3], GHOUL_DARK)],
    foot: [box(3.4, 1.8, 6, GHOUL_DARK, [0, -1.2, 1.5])],
  }),
  poses: monsterPoses({ attack: 'claw', hunch: 0.65 }),
};

/** 骷髏弓手：深綠色兜帽與短披肩、背後箭筒、左手長弓 */
const HOOD = 0x3e4a32;
const HOOD_DARK = 0x2a3222;
const bow = (): Mesh[] => [
  lowSphere(1.6, BONE_DARK, [0, -1.4, 0], 8, 4),
  // 弓身：三段往前彎（沿手的 Z 軸上下延伸），弓弦在後方
  box(1.2, 1.4, 7, 0x7a4a24, [0, -2.6, 0]),
  placeMesh(box(1.1, 1.2, 7, 0x7a4a24), [0.45, 0, 0], [0, -1.2, 6.2]),
  placeMesh(box(1.1, 1.2, 7, 0x7a4a24), [-0.45, 0, 0], [0, -1.2, -6.2]),
  box(0.3, 0.3, 19, 0xe8e0c8, [0, 0.9, 0]),
];
const ARCHER: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    torso: [
      ...ribcage(),
      // 短披肩與箭筒
      prism(12, 11, 16, [7.8, 5.6], [5.4, 4.4], HOOD),
      placeMesh(box(3.4, 12, 3, 0x6a4a2a), [0, 0, 0.35], [2.4, 9, -5]),
      ...[0, 1, 2].map((i) => box(0.5, 4, 0.5, 0xd8d0b0, [1.4 + i * 0.9, 16.5, -5.2])),
    ],
    head: [...skull(), lowSphere(6.6, HOOD, [0, 6.4, -0.6], 11, 6, [1.05, 1.08, 1.05], (c) => c[2] < 2.2 || c[1] > 3.2), box(9, 2, 1.4, HOOD_DARK, [0, 10, 4.4])],
    handL: bow(),
  }),
  poses: monsterPoses({ attack: 'bow' }),
};

/**
 * 重甲骷髏：全身板甲（多片構面）。
 * 頭盔（十角柱 + 圓頂 + 斜面面甲與視縫 + 紅色盔纓）、護頸、胸甲（中央稜線 + 三層腹甲）、
 * 三層肩甲、肘甲、臂甲、四片腿裙、膝甲（含扇形護片）、脛甲、分節鐵靴、雙刃巨斧。
 */
const STEEL = 0x8a909a;
const STEEL_DARK = 0x565c66;
const STEEL_EDGE = 0x3c4048;
const RIVET = 0xb8963c;
const PLUME = 0x9a2a1e;
const LEATHER = 0x4a3020;
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

/** 骷髏法師：紫色長袍、尖帽、左手法杖（頂端發光的寶珠） */
const ROBE = 0x4e3c7a;
const ROBE_DARK = 0x33284f;
const staff = (): Mesh[] => [
  lowSphere(1.6, BONE_DARK, [0, -1.4, 0], 8, 4),
  prism(8, 16, -22, [0.8, 0.8], [0.8, 0.8], 0x5a3a22),
  lowSphere(2.6, 0x6ad8ff, [0, 18.4, 0], 9, 5),
  prism(8, 14.5, 16.2, [1.6, 1.6], [2, 2], 0xc8a24a),
];
const MAGE: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    root: [prism(12, 4, -27, [5.8, 4.6], [10, 8.4], ROBE), prism(12, -27, -28.5, [10, 8.4], [10.2, 8.6], ROBE_DARK)],
    torso: [prism(12, 0, 15, [5.8, 4.6], [7.6, 5], ROBE), box(2, 14, 1, 0xc8a24a, [0, 7.5, 4.9]), prism(12, 13, 16, [7.8, 5.4], [5, 4], ROBE_DARK)],
    head: [
      ...skull(),
      prism(12, 9, 10.4, [8.6, 8.6], [8.6, 8.6], ROBE_DARK),
      prism(9, 10.4, 22, [5.2, 5.2], [0.3, 0.3], ROBE),
    ],
    upperArm: [prism(9, 0, -10, [2.4, 2.4], [2.8, 2.8], ROBE)],
    forearm: [prism(9, 0, -9, [2.8, 2.8], [3.2, 3.2], ROBE), ...boneLimb(1, 0.9)],
    handL: staff(),
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
  'enemy.skeleton': SKELETON,
  'enemy.ghoul': GHOUL,
  'enemy.skeleton_archer': ARCHER,
  'enemy.armored_skeleton': ARMORED,
  'enemy.skeleton_mage': MAGE,
  'enemy.training_dummy': DUMMY,
  ...CREATURE_MODELS,
  ...BOSS_MODELS,
};

export const DEFAULT_MONSTER_MODEL = SKELETON;
