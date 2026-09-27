import type { FigureModel, Pose, PartDef } from './FigureModel';
import { box, lowSphere, prism, type V3 } from './Poly3D';

/**
 * 女主角（參考設定圖：皮甲女劍士，不要披風）：
 * 棕色高馬尾（紅髮繩、分段垂下）、皮革肩甲與護臂、束腰皮甲（金屬扣環）、腰帶與側邊小包、
 * 深色短裙、過膝長襪（露出一段大腿）、綁帶皮靴、右手長劍。
 * 主要站姿是單手持劍的戒備姿勢：左腳在前、膝蓋微彎、右手握劍斜舉在胸前、左手在身前護著。
 */
const C = {
  skin: 0xf0cdb0,
  hair: 0x5a321c,
  hairLight: 0x7a4a2a,
  ribbon: 0xb8242e,
  shirt: 0xd9cfbf,
  leather: 0x7a4a28,
  leatherDark: 0x4e2e18,
  leatherLight: 0x9a6438,
  metal: 0xc0a060,
  steel: 0x9aa2ac,
  belt: 0x3c2414,
  skirt: 0x2e2632,
  skirtTrim: 0x5a2630,
  stocking: 0x221c28,
  boot: 0x4a2c18,
  bootCuff: 0x6a4224,
  lace: 0x2a1a0e,
  sole: 0x22140a,
  glove: 0x3a2214,
  eye: 0x2a1a18,
  lip: 0xc07060,
  blade: 0xe2e7ee,
  bladeEdge: 0xf6f8fb,
  guard: 0xc8a048,
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
      meshes: [
        // 上臂（白色短袖下露出手臂）
        prism(8, 0, -4.5, [2.3, 2.3], [2.1, 2.1], C.shirt),
        prism(8, -4.5, -10.5, [2, 2], [1.8, 1.8], C.skin),
        // 皮革肩甲：兩層重疊的弧片，下緣有金屬邊
        lowSphere(3.6, C.leather, [0.6 * side, 0.6, 0], 8, 4, [1.05, 0.8, 1.05], (c) => c[1] > -0.4),
        prism(8, -1.2, -2.6, [3.3, 3.3], [3.5, 3.5], C.leatherDark, [0.5 * side, 0, 0]),
        prism(8, -2.6, -3.1, [3.5, 3.5], [3.5, 3.5], C.metal, [0.5 * side, 0, 0]),
      ],
    },
    {
      joint: `forearm${s}`,
      parent: `upperArm${s}`,
      offset: [0, -10.5, 0],
      meshes: [
        prism(8, 0.4, -3, [1.9, 1.9], [1.8, 1.8], C.skin),
        // 皮革護臂（兩條綁帶）
        prism(8, -3, -9, [2.1, 2.1], [2.3, 2.3], C.leather),
        prism(8, -4.4, -5.1, [2.25, 2.25], [2.25, 2.25], C.leatherDark),
        prism(8, -7, -7.7, [2.35, 2.35], [2.35, 2.35], C.leatherDark),
      ],
    },
    {
      joint: `hand${s}`,
      parent: `forearm${s}`,
      offset: [0, -9, 0],
      meshes:
        side === -1
          ? [
              box(3.2, 3.6, 3, C.glove, [0, -1.8, 0]),
              // 右手長劍：柄頭、握柄、護手、劍身（中脊較亮）、劍尖（沿手的 -Y 方向伸出）
              lowSphere(1, C.guard, [0, 2.4, 0], 6, 3),
              prism(6, 1.5, -3, [0.8, 0.8], [0.8, 0.8], C.grip),
              box(7.4, 1.2, 1.8, C.guard, [0, -3.6, 0]),
              box(1.4, 1.4, 2.2, C.guard, [3.8, -3.6, 0]),
              box(1.4, 1.4, 2.2, C.guard, [-3.8, -3.6, 0]),
              prism(4, -4.2, -21, [1.4, 0.4], [1.1, 0.3], C.blade, [0, 0, 0], 0),
              prism(4, -4.4, -20.5, [0.35, 0.5], [0.3, 0.4], C.bladeEdge, [0, 0, 0], 0),
              prism(4, -21, -25, [1.1, 0.3], [0.08, 0.05], C.blade, [0, 0, 0], 0),
            ]
          : [box(3.2, 3.6, 3, C.glove, [0, -1.8, 0]), box(3.4, 1.2, 3.2, C.leatherDark, [0, 0.2, 0])],
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
      meshes: [
        // 過膝長襪：上緣露出一段大腿
        prism(8, 0, -5.5, [2.9, 2.9], [2.7, 2.7], C.skin),
        prism(8, -5.5, -6.4, [2.75, 2.75], [2.7, 2.7], C.skirtTrim),
        prism(8, -6.4, -13, [2.65, 2.65], [2.2, 2.2], C.stocking),
      ],
    },
    {
      joint: `shin${s}`,
      parent: `thigh${s}`,
      offset: [0, -13, 0],
      meshes: [
        // 綁帶皮靴：反折靴口、護膝、兩道綁帶
        prism(8, 1.2, -2.2, [2.9, 2.9], [2.7, 2.7], C.bootCuff),
        lowSphere(1.9, C.leatherLight, [0, 0, 1.6], 6, 3, [1, 1.1, 0.7]),
        prism(8, -2.2, -12, [2.4, 2.4], [2, 2], C.boot),
        prism(8, -5, -5.6, [2.35, 2.35], [2.3, 2.3], C.lace),
        prism(8, -8.4, -9, [2.2, 2.2], [2.15, 2.15], C.lace),
      ],
    },
    {
      joint: `foot${s}`,
      parent: `shin${s}`,
      offset: [0, -12, 0],
      meshes: [box(3.6, 2.4, 5, C.boot, [0, -1.2, 0.6]), prism(6, -0.2, -2.4, [1.8, 1.4], [1.8, 1.4], C.boot, [0, 0, 3.4]), box(3.8, 0.8, 7.6, C.sole, [0, -2.6, 1.4])],
    },
  ] as PartDef[];
};

const PARTS: PartDef[] = [
  {
    joint: 'root',
    parent: null,
    offset: [0, 0, 0],
    meshes: [
      // 腰帶（金屬扣）、深色短裙（分片、暗紅裙邊）、右側小包、左側劍鞘扣環
      prism(10, 2.6, 5, [6.9, 5.3], [6.8, 5.2], C.belt),
      box(2.4, 2, 1, C.metal, [0, 3.8, 5.4]),
      prism(10, 2.6, -6.5, [6.7, 5.2], [9.4, 7.6], C.skirt),
      prism(10, -6.5, -7.6, [9.4, 7.6], [9.7, 7.8], C.skirtTrim),
      box(3.2, 3.6, 2.4, C.leatherDark, [-6.6, 1.6, 1.6]),
      box(3.4, 0.9, 2.6, C.leather, [-6.6, 3.2, 1.6]),
      box(2.6, 3, 2.2, C.leatherDark, [6.4, 1.8, -2]),
    ],
  },
  {
    joint: 'torso',
    parent: 'root',
    offset: [0, 5, 0],
    meshes: [
      // 束腰皮甲：腰身收窄、胸前較寬，正面兩排金屬扣
      prism(10, 0, 9.5, [5.8, 4.3], [6.9, 4.9], C.leather),
      prism(10, 1.2, 1.9, [6, 4.45], [6.1, 4.5], C.leatherDark),
      prism(10, 5.2, 5.9, [6.45, 4.7], [6.5, 4.7], C.leatherDark),
      box(0.9, 0.9, 0.5, C.metal, [1.5, 3.6, 4.7]),
      box(0.9, 0.9, 0.5, C.metal, [-1.5, 3.6, 4.7]),
      box(0.9, 0.9, 0.5, C.metal, [1.6, 7.6, 5]),
      box(0.9, 0.9, 0.5, C.metal, [-1.6, 7.6, 5]),
      // 白色上衣的胸口與肩膀、皮甲背帶
      prism(10, 9.5, 15, [6.9, 4.9], [7.3, 4.5], C.shirt),
      prism(10, 9.5, 11.8, [7, 5], [7.1, 4.9], C.leatherLight, [0, 0, -0.2]),
      box(1.6, 6, 0.8, C.leatherDark, [3.4, 11.5, -4.5]),
      box(1.6, 6, 0.8, C.leatherDark, [-3.4, 11.5, -4.5]),
      // 皮革護頸
      prism(10, 14.2, 17.2, [4.8, 4], [4, 3.4], C.leatherDark),
    ],
  },
  { joint: 'neck', parent: 'torso', offset: [0, 16.5, 0], meshes: [prism(8, 0, 3, [2, 2], [1.8, 1.8], C.skin)] },
  {
    joint: 'head',
    parent: 'neck',
    offset: [0, 3, 0],
    meshes: [
      lowSphere(5.8, C.skin, [0, 5.4, 0.3], 10, 6, [0.96, 1.12, 1]),
      // 眼睛、嘴唇（只在面向鏡頭時看得到）
      box(1.3, 1.9, 0.8, C.eye, [2, 5.8, 5.6]),
      box(1.3, 1.9, 0.8, C.eye, [-2, 5.8, 5.6]),
      box(1.8, 0.6, 0.6, C.lip, [0, 2.4, 5.6]),
      // 頭髮：頭頂與後腦、分邊的瀏海、兩側垂下的鬢髮
      lowSphere(6.4, C.hair, [0, 6.4, -0.5], 10, 6, [1, 1.05, 1.02], (c) => c[1] > 1.2 || c[2] < -1.5),
      box(5.2, 2.6, 1.8, C.hair, [-2, 9.3, 4.8]),
      box(4, 2, 1.6, C.hairLight, [2.8, 9.8, 4.6]),
      prism(6, 7, -1, [0.9, 1.6], [0.5, 0.9], C.hair, [5.3, 0, 2]),
      prism(6, 7, -1, [0.9, 1.6], [0.5, 0.9], C.hair, [-5.3, 0, 2]),
    ],
  },
  {
    joint: 'ponytail',
    parent: 'head',
    offset: [0, 10.5, -5.4],
    meshes: [
      // 高馬尾：紅髮繩 + 三段漸細的髮束
      prism(8, 0.9, -1.1, [2.4, 2.4], [2.4, 2.4], C.ribbon),
      lowSphere(2.9, C.hair, [0, -3, -0.8], 8, 4, [1, 1.2, 1]),
      prism(8, -4, -10, [2.8, 2.6], [2.3, 2.1], C.hair, [0, 0, -1.2]),
      prism(8, -10, -15, [2.3, 2.1], [1.4, 1.3], C.hairLight, [0, 0, -1.4]),
      prism(6, -15, -19, [1.4, 1.3], [0.3, 0.3], C.hair, [0, 0, -1.4]),
    ],
  },
  ...arm(1),
  ...arm(-1),
  ...leg(1),
  ...leg(-1),
];

// ─────────────────────────── 姿勢 ───────────────────────────

/** 戒備姿勢：左腳在前的側身站姿、膝蓋微彎，右手單手握劍斜舉在胸前（劍尖朝前上方），左手在身前護著 */
const READY: Pose = {
  rootY: -3,
  angles: {
    torso: [0.12, -0.3, 0],
    neck: [-0.05, 0.2, 0],
    head: [-0.05, 0.1, 0],
    ponytail: [0.4, 0, 0],
    thighL: [-0.5, -0.2, 0.14],
    shinL: [0.55, 0, 0],
    footL: [-0.05, 0.25, 0],
    thighR: [0.3, 0.3, -0.16],
    shinR: [0.4, 0, 0],
    footR: [-0.7, -0.35, 0],
    upperArmR: [-0.4, 0, -0.3],
    forearmR: [-1.35, 0, 0.3],
    handR: [-0.95, 0, 0.1],
    upperArmL: [-0.5, 0, -0.2],
    forearmL: [-1.1, 0, 0],
    handL: [0.2, 0, 0],
  },
};

/** 以 base 為底，覆寫指定關節的角度 */
const set = (base: Pose, override: Partial<Record<keyof Pose['angles'], V3>>, rootY = base.rootY): Pose => ({
  rootY,
  angles: { ...base.angles, ...override },
});

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
  referenceRadius: 0.3,
  weaponTip: [0, -23, 0],
  poses: {
    /** 待機：戒備姿勢 + 輕微呼吸、劍尖微微晃動 */
    ready: (t) => {
      const b = Math.sin(t * 2.2);
      return add(
        READY,
        { torso: [b * 0.03, Math.sin(t * 0.9) * 0.05, 0], forearmR: [Math.sin(t * 1.7) * 0.05, 0, 0], ponytail: [b * 0.05, 0, 0], shinL: [b * 0.03, 0, 0] },
        READY.rootY + b * 0.4,
      );
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
          upperArmR: [-0.4 + 0.3 * s, 0, -0.2],
          forearmR: [-0.9, 0, 0.2],
          handR: [-0.4, 0, 0],
          upperArmL: [-0.2 - 0.6 * s, 0, -0.1],
          forearmL: [-0.7, 0, 0],
        },
      };
    },
    /** 攻擊前搖：劍舉過右肩、上身稍微往右轉 */
    attackWindup: set(READY, {
      torso: [0, -0.6, 0],
      head: [0, 0.35, 0],
      upperArmR: [-2.5, 0, -0.35],
      forearmR: [-0.7, 0, 0],
      handR: [-0.2, 0, 0],
      upperArmL: [-0.8, 0, -0.1],
      forearmL: [-0.9, 0, 0],
    }),
    /** 攻擊揮出：由右上往左下斜劈、上身轉向左前方、左腳踏步 */
    attackStrike: set(READY, {
      torso: [0.35, 0.45, 0],
      head: [0, -0.3, 0],
      upperArmR: [-0.9, 0, 0.55],
      forearmR: [-0.15, 0, 0],
      handR: [-0.9, 0, 0],
      upperArmL: [0.25, 0, -0.45],
      forearmL: [-0.5, 0, 0],
      thighL: [-0.75, -0.2, 0.14],
      shinL: [0.75, 0, 0],
    }, -4),
    /** 施法蓄力：左手收到胸前、上身後仰，右手的劍放低 */
    castWindup: set(READY, {
      torso: [-0.2, 0.1, 0],
      upperArmL: [-0.3, 0, -0.6],
      forearmL: [-2, 0, 0],
      upperArmR: [-0.2, 0, -0.35],
      forearmR: [-0.5, 0, 0],
      handR: [-0.8, 0, 0],
    }),
    /** 施法放出：左手筆直往前推出，右手的劍放低 */
    castRelease: set(READY, {
      torso: [0.15, -0.45, 0],
      upperArmL: [-1.55, 0, 0.1],
      forearmL: [-0.05, 0, 0],
      handL: [-0.2, 0, 0],
      upperArmR: [-0.2, 0, -0.35],
      forearmR: [-0.5, 0, 0],
      handR: [-0.8, 0, 0],
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
