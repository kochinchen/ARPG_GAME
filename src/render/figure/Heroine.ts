import type { FigureModel, Pose, PartDef } from './FigureModel';
import { box, lowSphere, prism, type V3 } from './Poly3D';

/**
 * 女主角（參考設定圖的女主角，不要披風）：
 * 棕色高馬尾與紅色髮帶、紅圍巾、白色上衣、棕色皮革束腰、白色短裙（紅色裙邊）、
 * 深色長襪、棕色長靴、深色手套、右手長劍。
 * 主要站姿是網球選手準備接發球的姿勢：雙腳張開、膝蓋彎曲、上身前傾、雙手握劍在身前。
 */
const C = {
  skin: 0xf2d0b0,
  hair: 0x5e3620,
  ribbon: 0xc62838,
  scarf: 0xc02a36,
  blouse: 0xeee9e0,
  corset: 0x6e4628,
  belt: 0x4a2c18,
  skirt: 0xe6e0d4,
  trim: 0xb82838,
  stocking: 0x2c2634,
  boot: 0x4e301c,
  bootCuff: 0x6a4428,
  sole: 0x2a180c,
  glove: 0x3a2418,
  eye: 0x2a1a18,
  blade: 0xdfe4ec,
  guard: 0xcaa24a,
  grip: 0x3a2414,
} as const;

// ─────────────────────────── 部位 ───────────────────────────

const arm = (side: 1 | -1): PartDef[] => {
  const s = side === 1 ? 'L' : 'R';
  return [
    {
      joint: `upperArm${s}`,
      parent: 'torso',
      offset: [7.6 * side, 14, 0],
      meshes: [prism(6, 0, -10.5, [2.1, 2.1], [1.8, 1.8], C.skin)],
    },
    {
      joint: `forearm${s}`,
      parent: `upperArm${s}`,
      offset: [0, -10.5, 0],
      // 白色袖套
      meshes: [prism(6, 0.4, -9, [2.1, 2.1], [1.9, 1.9], C.blouse)],
    },
    {
      joint: `hand${s}`,
      parent: `forearm${s}`,
      offset: [0, -9, 0],
      meshes:
        side === -1
          ? [
              box(3.2, 3.6, 3, C.glove, [0, -1.8, 0]),
              // 右手長劍：握柄、護手、劍身、劍尖（沿手的 -Y 方向伸出）
              prism(4, 1.5, -3, [0.8, 0.8], [0.8, 0.8], C.grip),
              box(7, 1.2, 1.8, C.guard, [0, -3.6, 0]),
              prism(4, -4.2, -21, [1.4, 0.4], [1.1, 0.3], C.blade, [0, 0, 0], 0),
              prism(4, -21, -25, [1.1, 0.3], [0.08, 0.05], C.blade, [0, 0, 0], 0),
            ]
          : [box(3.2, 3.6, 3, C.glove, [0, -1.8, 0])],
    },
  ] as PartDef[];
};

const leg = (side: 1 | -1): PartDef[] => {
  const s = side === 1 ? 'L' : 'R';
  return [
    {
      joint: `thigh${s}`,
      parent: 'root',
      offset: [3.4 * side, -2, 0],
      meshes: [prism(6, 0, -13, [2.9, 2.9], [2.2, 2.2], C.stocking)],
    },
    {
      joint: `shin${s}`,
      parent: `thigh${s}`,
      offset: [0, -13, 0],
      meshes: [prism(6, 0.5, -2, [2.8, 2.8], [2.6, 2.6], C.bootCuff), prism(6, -2, -12, [2.4, 2.4], [2, 2], C.boot)],
    },
    {
      joint: `foot${s}`,
      parent: `shin${s}`,
      offset: [0, -12, 0],
      meshes: [box(3.6, 2.4, 7, C.boot, [0, -1.2, 1.4]), box(3.8, 0.8, 7.4, C.sole, [0, -2.6, 1.4])],
    },
  ] as PartDef[];
};

const PARTS: PartDef[] = [
  {
    joint: 'root',
    parent: null,
    offset: [0, 0, 0],
    meshes: [
      // 腰帶與白色短裙（紅色裙邊）
      prism(8, 3, 5, [6.8, 5.2], [6.8, 5.2], C.belt),
      prism(8, 3, -8, [6.6, 5.1], [10, 8], C.skirt),
      prism(8, -8, -9.6, [10, 8], [10.3, 8.3], C.trim),
    ],
  },
  {
    joint: 'torso',
    parent: 'root',
    offset: [0, 5, 0],
    meshes: [
      prism(8, 0, 8.5, [6, 4.4], [6.8, 4.8], C.corset),
      prism(8, 8.5, 15, [6.8, 4.8], [7.4, 4.5], C.blouse),
      // 紅圍巾：繞頸一圈，尾端垂在背後
      prism(8, 14, 18, [5.2, 4.4], [4.2, 3.8], C.scarf),
      box(3, 8, 1.2, C.scarf, [1.6, 11.5, -4.8]),
    ],
  },
  { joint: 'neck', parent: 'torso', offset: [0, 16.5, 0], meshes: [prism(6, 0, 3, [2, 2], [1.8, 1.8], C.skin)] },
  {
    joint: 'head',
    parent: 'neck',
    offset: [0, 3, 0],
    meshes: [
      lowSphere(5.8, C.skin, [0, 5.4, 0.3], 8, 5, [1, 1.12, 1]),
      // 眼睛（只在面向鏡頭時看得到）
      box(1.3, 1.9, 0.8, C.eye, [2.1, 5.6, 5.8]),
      box(1.3, 1.9, 0.8, C.eye, [-2.1, 5.6, 5.8]),
      // 頭髮：頭頂與後腦、瀏海、兩側鬢髮
      lowSphere(6.4, C.hair, [0, 6.4, -0.5], 8, 5, [1.02, 1.05, 1.02], (c) => c[1] > 1.2 || c[2] < -1.5),
      box(9.5, 2.4, 1.8, C.hair, [0, 9.4, 4.8]),
      box(1.4, 7, 3, C.hair, [5.6, 4.6, 1.8]),
      box(1.4, 7, 3, C.hair, [-5.6, 4.6, 1.8]),
    ],
  },
  {
    joint: 'ponytail',
    parent: 'head',
    offset: [0, 10, -5.6],
    meshes: [box(4.2, 2.6, 2.4, C.ribbon, [0, 0, 0]), prism(6, -0.5, -16, [2.7, 2.7], [0.8, 0.8], C.hair, [0, 0, -0.8])],
  },
  ...arm(1),
  ...arm(-1),
  ...leg(1),
  ...leg(-1),
];

// ─────────────────────────── 姿勢 ───────────────────────────

/** 網球接發球的準備姿勢：雙腳張開、膝蓋彎曲、上身前傾、雙手握劍在身前（劍尖朝前上方） */
const READY: Pose = {
  rootY: -7,
  angles: {
    torso: [0.45, 0, 0],
    neck: [-0.25, 0, 0],
    head: [-0.2, 0, 0],
    ponytail: [0.4, 0, 0],
    // 雙腳張開比肩寬、膝蓋明顯彎曲、腳尖朝外
    thighL: [-0.85, -0.25, 0.42],
    thighR: [-0.85, 0.25, -0.42],
    shinL: [1.35, 0, -0.1],
    shinR: [1.35, 0, 0.1],
    footL: [-0.5, 0.3, -0.3],
    footR: [-0.5, -0.3, 0.3],
    upperArmR: [-0.8, 0, 0.35],
    forearmR: [-0.8, 0, 0],
    handR: [-0.55, 0, 0],
    upperArmL: [-0.8, 0, -0.5],
    forearmL: [-0.95, 0, 0],
    handL: [-0.3, 0, 0],
  },
};

const add = (pose: Pose, extra: Partial<Record<keyof Pose['angles'], V3>>, rootY = pose.rootY): Pose => {
  const angles = { ...pose.angles };
  for (const [j, v] of Object.entries(extra) as [keyof Pose['angles'], V3][]) {
    const base = angles[j] ?? [0, 0, 0];
    angles[j] = [base[0] + v[0], base[1] + v[1], base[2] + v[2]];
  }
  return { rootY, angles };
};

export const HEROINE: FigureModel = {
  parts: PARTS,
  hipHeight: 30,
  poses: {
    /** 待機：準備姿勢 + 腳尖輕輕彈動 */
    ready: (t) => {
      const b = Math.sin(t * 5);
      return add(READY, { shinL: [b * 0.05, 0, 0], shinR: [b * 0.05, 0, 0], torso: [0, Math.sin(t * 1.3) * 0.06, 0], ponytail: [b * 0.05, 0, 0] }, READY.rootY + b * 0.7);
    },
    /** 跑步：雙腳交替、右手握劍放低、左手擺動、馬尾往後飄 */
    run: (p) => {
      const s = Math.sin(p);
      return {
        rootY: -2 + Math.abs(Math.cos(p)) * 1.4,
        angles: {
          torso: [0.3, 0.12 * s, 0],
          neck: [-0.1, -0.12 * s, 0],
          head: [-0.1, 0, 0],
          ponytail: [0.95 + 0.15 * Math.sin(p * 2), 0.2 * s, 0],
          thighR: [-0.25 - 0.65 * s, 0, -0.06],
          thighL: [-0.25 + 0.65 * s, 0, 0.06],
          shinR: [0.35 + 0.9 * Math.max(0, s), 0, 0],
          shinL: [0.35 + 0.9 * Math.max(0, -s), 0, 0],
          footR: [-0.1, 0, 0],
          footL: [-0.1, 0, 0],
          upperArmR: [-0.45 + 0.4 * s, 0, 0.15],
          forearmR: [-0.9, 0, 0],
          handR: [-0.2, 0, 0],
          upperArmL: [-0.2 - 0.6 * s, 0, -0.1],
          forearmL: [-0.7, 0, 0],
        },
      };
    },
    /** 攻擊前搖（網球正拍引拍）：上身轉向右後方，右手把劍拉到身後側上方 */
    attackWindup: add(READY, {
      torso: [-0.05, -0.95, 0],
      head: [0, 0.6, 0],
      upperArmR: [0.6, 0, -1.7],
      forearmR: [-0.3, 0, 0],
      handR: [0.1, 0, 0],
      upperArmL: [-0.5, 0, 0.3],
      thighR: [0.15, 0, 0],
      thighL: [-0.15, 0, 0],
    }),
    /** 攻擊揮出：上身轉向左前方，右手由右後方橫掃到左前方 */
    attackStrike: add(READY, {
      torso: [0.1, 1.0, 0],
      head: [0, -0.5, 0],
      upperArmR: [-0.6, 0, 1.0],
      forearmR: [0.5, 0, 0],
      handR: [-0.2, 0, 0],
      upperArmL: [0.5, 0, -0.4],
      forearmL: [0.5, 0, 0],
      thighR: [-0.2, 0, 0],
      thighL: [0.2, 0, 0],
    }),
    /** 施法蓄力：左手收到胸前、上身後仰 */
    castWindup: add(READY, {
      torso: [-0.4, 0.4, 0],
      upperArmL: [0.2, 0, -0.9],
      forearmL: [-1.2, 0, 0],
      upperArmR: [0.6, 0, -0.2],
      forearmR: [0.3, 0, 0],
    }),
    /** 施法放出：左手筆直往前推出、上身前傾 */
    castRelease: add(READY, {
      torso: [-0.3, -0.35, 0],
      upperArmL: [-1.25, 0, 0.45],
      forearmL: [0.95, 0, 0],
      handL: [-0.2, 0, 0],
      upperArmR: [0.6, 0, -0.25],
      forearmR: [0.35, 0, 0],
    }),
    /** 受傷：上身往後仰、頭往後 */
    hit: add(READY, { torso: [-0.55, 0, 0.15], head: [-0.35, 0, 0], upperArmL: [0.4, 0, 0.4], upperArmR: [0.4, 0, -0.3] }, READY.rootY - 1),
    /** 倒地：往後倒在地上，手腳攤開 */
    dead: {
      rootY: -23,
      angles: {
        root: [-1.45, 0, 0.1],
        torso: [-0.05, 0, 0],
        head: [-0.2, 0.4, 0],
        ponytail: [0.2, 0, 0],
        thighL: [-0.5, 0, 0.3],
        thighR: [-0.2, 0, -0.2],
        shinL: [0.7, 0, 0],
        shinR: [0.2, 0, 0],
        upperArmL: [0, 0, 1.3],
        upperArmR: [0.2, 0, -1.1],
        forearmL: [-0.3, 0, 0],
        forearmR: [-0.2, 0, 0],
      },
    },
  },
};
