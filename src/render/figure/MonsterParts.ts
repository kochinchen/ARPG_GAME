import type { Joint, PartDef, Pose, PoseSet } from './FigureModel';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from './Poly3D';

/**
 * 人形怪物與魔王共用的零件與姿勢：骨頭、骷髏頭、胸腔、武器、人形骨架（尺寸與女主角相同）、
 * 依攻擊方式（劈砍、爪擊、拉弓、雙手重擊）與施法方式（法杖、召喚）產生的一組姿勢。
 * 模型座標：Y 向上、Z 為前方、+X 為角色的左手邊（-X 右手拿武器）。
 */

// ─────────────────────────── 共用零件 ───────────────────────────

export const BONE = 0xe2dac6;
export const BONE_DARK = 0xb4aa92;
export const SOCKET = 0x1a1414;

export type Angles = Partial<Record<Joint, V3>>;

/** 骨頭肢體：細長稜柱 + 末端的關節球 */
export const boneLimb = (length: number, r: number, color = BONE): Mesh[] => [
  prism(8, 0, -length, [r, r], [r * 0.85, r * 0.85], color),
  lowSphere(r * 1.35, BONE_DARK, [0, -length, 0], 8, 4),
];

/** 骷髏頭：頭骨（後腦較寬）、眉骨、顴骨、下顎與一排牙齒、兩個黑色眼窩、鼻孔 */
export const skull = (color = BONE): Mesh[] => [
  lowSphere(5.4, color, [0, 6, 0.2], 10, 5, [1, 1.08, 1.05]),
  lowSphere(4.6, color, [0, 6.8, -1.6], 9, 5, [1.05, 1, 1]),
  box(7.2, 1.1, 1.4, color, [0, 7.6, 4.4]),
  lowSphere(1.6, color, [3.4, 4.6, 3.4], 6, 4, [1, 0.8, 1]),
  lowSphere(1.6, color, [-3.4, 4.6, 3.4], 6, 4, [1, 0.8, 1]),
  box(6.4, 2.4, 4.4, color, [0, 1.6, 1.8]),
  box(5.6, 0.5, 0.6, SOCKET, [0, 2.4, 4.1]),
  ...[-2, -1, 0, 1, 2].map((x) => box(0.8, 1, 0.6, BONE_DARK, [x * 1.05, 3, 4.1])),
  box(1.9, 2, 1.2, SOCKET, [2, 6, 5.2]),
  box(1.9, 2, 1.2, SOCKET, [-2, 6, 5.2]),
  box(1, 1.2, 1, SOCKET, [0, 3.8, 5.4]),
];

/** 胸腔：脊椎 + 三對肋骨（前後兩片、中間鏤空） */
export const ribcage = (color = BONE): Mesh[] => [
  prism(8, 0, 15, [1.3, 1.3], [1.3, 1.3], BONE_DARK, [0, 0, -2.5]),
  ...[6, 9, 12].flatMap((y, i) => [box(10 - i * 0.6 + 1, 1.6, 1.4, color, [0, y, 2.4]), box(10 - i * 0.6 + 1, 1.6, 1.2, color, [0, y, -3]), box(1.2, 1.6, 5.4, color, [5.4 - i * 0.3, y, -0.3]), box(1.2, 1.6, 5.4, color, [-5.4 + i * 0.3, y, -0.3])]),
  box(11, 2.2, 5, color, [0, 14.4, -0.3]),
  // 胸骨、鎖骨、脊椎骨節
  box(1.4, 8, 1, BONE_DARK, [0, 9.5, 2.9]),
  placeMesh(box(6, 1, 1, color), [0, 0, 0.18], [3.2, 15.4, 1.6]),
  placeMesh(box(6, 1, 1, color), [0, 0, -0.18], [-3.2, 15.4, 1.6]),
  ...[1, 3, 5].map((y) => box(2.4, 1.2, 2, BONE_DARK, [0, y, -2.5])),
];

/** 武器（沿手的 -Y 方向伸出）：劍、斧、大劍 */
export const sword = (length: number, blade: number, width = 1.3): Mesh[] => [
  prism(4, 1.5, -3, [0.8, 0.8], [0.8, 0.8], 0x3a2414),
  box(width * 5, 1.2, 1.8, 0x8a7a5a, [0, -3.6, 0]),
  prism(4, -4.2, -length, [width, width * 0.3], [width * 0.85, width * 0.25], blade, [0, 0, 0], 0),
  prism(4, -length, -length - 3.5, [width * 0.85, width * 0.25], [0.06, 0.05], blade, [0, 0, 0], 0),
];

export interface HumanoidOptions {
  hip?: number;
  torso: Mesh[];
  head: Mesh[];
  root?: Mesh[];
  neck?: Mesh[];
  upperArm?: Mesh[];
  forearm?: Mesh[];
  handR?: Mesh[];
  handL?: Mesh[];
  thigh?: Mesh[];
  shin?: Mesh[];
  foot?: Mesh[];
  /** 左右肢體不同（例如左手護手）時覆寫 */
  upperArmL?: Mesh[];
  forearmL?: Mesh[];
  shoulderX?: number;
}

/** 骨盆：中央骶骨 + 左右兩片髂骨 */
export const pelvis = (): Mesh[] => [
  box(3, 3.4, 3, BONE_DARK, [0, 0.6, -0.6]),
  placeMesh(prism(8, 0, 4, [2.6, 1], [3.2, 1.2], BONE), [0, 0, -0.5], [1.6, -0.6, 0]),
  placeMesh(prism(8, 0, 4, [2.6, 1], [3.2, 1.2], BONE), [0, 0, 0.5], [-1.6, -0.6, 0]),
];

/** 人形骨架（尺寸與女主角相同），各部位掛上指定零件 */
export function humanoid(o: HumanoidOptions): PartDef[] {
  const sx = o.shoulderX ?? 7;
  const fist = (): Mesh[] => [lowSphere(1.6, BONE_DARK, [0, -1.4, 0], 8, 4)];
  return [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: o.root ?? pelvis() },
    { joint: 'torso', parent: 'root', offset: [0, 2.5, 0], meshes: o.torso },
    { joint: 'neck', parent: 'torso', offset: [0, 15.5, -0.8], meshes: o.neck ?? [prism(8, 0, 3, [1.2, 1.2], [1.2, 1.2], BONE_DARK)] },
    { joint: 'head', parent: 'neck', offset: [0, 2.5, 0.6], meshes: o.head },
    { joint: 'upperArmL', parent: 'torso', offset: [sx, 13.5, -0.3], meshes: o.upperArmL ?? o.upperArm ?? boneLimb(10, 1.1) },
    { joint: 'forearmL', parent: 'upperArmL', offset: [0, -10, 0], meshes: o.forearmL ?? o.forearm ?? boneLimb(9, 1) },
    { joint: 'handL', parent: 'forearmL', offset: [0, -9, 0], meshes: o.handL ?? fist() },
    { joint: 'upperArmR', parent: 'torso', offset: [-sx, 13.5, -0.3], meshes: o.upperArm ?? boneLimb(10, 1.1) },
    { joint: 'forearmR', parent: 'upperArmR', offset: [0, -10, 0], meshes: o.forearm ?? boneLimb(9, 1) },
    { joint: 'handR', parent: 'forearmR', offset: [0, -9, 0], meshes: [...fist(), ...(o.handR ?? [])] },
    ...([1, -1] as const).flatMap((side): PartDef[] => {
      const s = side === 1 ? 'L' : 'R';
      return [
        { joint: `thigh${s}`, parent: 'root', offset: [3.2 * side, -1, 0], meshes: o.thigh ?? boneLimb(13, 1.3) },
        { joint: `shin${s}`, parent: `thigh${s}`, offset: [0, -13, 0], meshes: o.shin ?? boneLimb(12.5, 1.15) },
        { joint: `foot${s}`, parent: `shin${s}`, offset: [0, -12.5, 0], meshes: o.foot ?? [box(3.2, 1.8, 6, BONE, [0, -1.2, 1.5])] },
      ] as PartDef[];
    }),
  ];
}

// ─────────────────────────── 姿勢 ───────────────────────────

export type AttackStyle = 'chop' | 'claw' | 'bow' | 'slam';
export type CastStyle = 'staff' | 'summon';
/**
 * 走路的樣子：
 * - stride：一般的步伐（雙手垂在身側小幅擺動）
 * - swagger：重甲的豪邁大步（右手單手拎著武器、左手大幅外擺、肩膀左右晃、每一步重重踩下）
 * - lope：食屍鬼的彎腰小跑（雙手垂在前面晃盪、頭一點一點、步伐大而有彈性）
 * - stalk：弓手的潛行（半蹲、弓拿低在身前、上身斜向一側、頭穩定地看著前方）
 * - glide：法師的滑行（上身挺直、起伏很小、法杖隨步伐往前點地、長袍下擺晃動）
 * - march：持盾騎士的行軍（盾牌舉在身前、上身挺直、步伐穩重，武器垂在身側小幅晃）
 * - hover：沒有腳的影魔（上身前傾、雙爪往後拖、身體上下飄浮）
 */
export type Gait = 'stride' | 'swagger' | 'lope' | 'stalk' | 'glide' | 'march' | 'hover';

export interface PoseOptions {
  attack: AttackStyle;
  cast?: CastStyle;
  /** 駝背程度（食屍鬼） */
  hunch?: number;
  /** 雙手握武器（重甲、骷髏王） */
  twoHanded?: boolean;
  /** 走路的樣子（省略 = stride） */
  gait?: Gait;
}

export const pose = (rootY: number, angles: Angles): Pose => ({ rootY, angles });
export const plus = (base: Pose, extra: Angles, rootY = base.rootY): Pose => {
  const angles: Angles = { ...base.angles };
  for (const [j, v] of Object.entries(extra) as [Joint, V3][]) {
    const b = angles[j] ?? [0, 0, 0];
    angles[j] = [b[0] + v[0], b[1] + v[1], b[2] + v[2]];
  }
  return { rootY, angles };
};

export function monsterPoses(o: PoseOptions): PoseSet {
  const hunch = o.hunch ?? 0;
  const armsR: Angles = o.twoHanded
    ? { upperArmR: [-0.6, 0, 0.45], forearmR: [-0.7, 0, 0], handR: [-0.3, 0, 0], upperArmL: [-0.6, 0, -0.45], forearmL: [-0.8, 0, 0] }
    : { upperArmR: [-0.35, 0, 0.1], forearmR: [-0.55, 0, 0], handR: [-0.45, 0, 0], upperArmL: [-0.15, 0, -0.18], forearmL: [-0.35, 0, 0] };
  const ready = pose(-2, {
    torso: [0.15 + hunch, 0, 0],
    neck: [-0.1 - hunch * 0.6, 0, 0],
    head: [-0.1 - hunch * 0.4, 0, 0],
    thighL: [-0.3, 0, 0.14],
    thighR: [-0.3, 0, -0.14],
    shinL: [0.5, 0, 0],
    shinR: [0.5, 0, 0],
    footL: [-0.2, 0, 0],
    footR: [-0.2, 0, 0],
    ...armsR,
    ...(o.attack === 'claw' ? { upperArmR: [-0.5, 0, 0.2], upperArmL: [-0.5, 0, -0.2], forearmR: [-0.6, 0, 0], forearmL: [-0.6, 0, 0] } : {}),
    ...(o.attack === 'bow' ? { upperArmL: [-0.35, 0, -0.1], forearmL: [-0.3, 0, 0], upperArmR: [-0.1, 0, 0.1], forearmR: [-0.3, 0, 0] } : {}),
  });

  const attack: Record<AttackStyle, [Angles, Angles]> = {
    // 高舉過頭 → 往前下劈
    chop: [
      { torso: [-0.15, -0.35, 0], upperArmR: [-2.3, 0, -0.3], forearmR: [0, 0, 0], handR: [-0.4, 0, 0] },
      { torso: [0.35, 0.25, 0], upperArmR: [-0.55, 0, -0.1], forearmR: [0.45, 0, 0], handR: [-0.5, 0, 0] },
    ],
    // 雙手往後舉 → 往前撲抓
    claw: [
      { torso: [-0.3, 0, 0], upperArmR: [-1.7, 0, -0.5], upperArmL: [-1.7, 0, 0.5], forearmR: [0.3, 0, 0], forearmL: [0.3, 0, 0] },
      { torso: [0.35, 0, 0], upperArmR: [-0.4, 0, 0.3], upperArmL: [-0.4, 0, -0.3], forearmR: [0.5, 0, 0], forearmL: [0.5, 0, 0] },
    ],
    // 側身、左手持弓向前、右手拉弦到耳邊 → 放箭（右手往後彈開）
    bow: [
      { torso: [-0.1, 0.55, 0], head: [0, -0.5, 0], upperArmL: [-1.25, 0, 0.35], forearmL: [0.3, 0, 0], upperArmR: [-1.2, 0, 0.7], forearmR: [-1.6, 0, 0] },
      { torso: [-0.1, 0.55, 0], head: [0, -0.5, 0], upperArmL: [-1.25, 0, 0.35], forearmL: [0.3, 0, 0], upperArmR: [-0.9, 0, 0.3], forearmR: [-0.3, 0, 0] },
    ],
    // 雙手高舉 → 重重砸下
    slam: [
      { torso: [-0.3, 0, 0], upperArmR: [-2.4, 0, -0.45], upperArmL: [-2.4, 0, 0.45], forearmR: [0, 0, 0], forearmL: [0, 0, 0], handR: [-0.5, 0, 0] },
      { torso: [0.55, 0, 0], upperArmR: [-0.5, 0, -0.45], upperArmL: [-0.5, 0, 0.45], forearmR: [0.3, 0, 0], forearmL: [0.3, 0, 0], handR: [-0.9, 0, 0] },
    ],
  };
  const cast: Record<CastStyle, [Angles, Angles]> = {
    // 法杖（左手）高舉 → 往前指
    staff: [
      { torso: [-0.3, 0, 0], upperArmL: [-2.4, 0, 0.3], forearmL: [0.2, 0, 0], upperArmR: [-1.4, 0, 0.3], forearmR: [-0.4, 0, 0] },
      { torso: [0.25, 0, 0], upperArmL: [-1.2, 0, 0.1], forearmL: [0.1, 0, 0], upperArmR: [-1.1, 0, 0.3], forearmR: [-0.2, 0, 0] },
    ],
    // 召喚：雙手高舉、仰頭
    summon: [
      { torso: [-0.35, 0, 0], head: [-0.4, 0, 0], upperArmR: [-2.6, 0, -0.7], upperArmL: [-2.6, 0, 0.7], forearmR: [0.2, 0, 0], forearmL: [0.2, 0, 0] },
      { torso: [-0.45, 0, 0], head: [-0.5, 0, 0], upperArmR: [-2.9, 0, -1.1], upperArmL: [-2.9, 0, 1.1], forearmR: [0, 0, 0], forearmL: [0, 0, 0] },
    ],
  };
  const [aw, as] = attack[o.attack];
  const [cw, cr] = o.cast ? cast[o.cast] : attack[o.attack];

  return {
    ready: (t) => plus(ready, { torso: [Math.sin(t * 2) * 0.03, Math.sin(t * 1.1) * 0.05, 0], head: [0, Math.sin(t * 0.7) * 0.15, 0] }, ready.rootY + Math.sin(t * 2) * 0.4),
    run: (p) => gaitPose(o.gait ?? 'stride', p, ready, hunch, !!o.twoHanded),
    attackWindup: plus(ready, aw),
    attackStrike: plus(ready, as),
    castWindup: plus(ready, cw),
    castRelease: plus(ready, cr),
    hit: plus(ready, { torso: [-0.5, 0, 0.2], head: [-0.4, 0, 0], upperArmR: [0.4, 0, -0.3], upperArmL: [0.4, 0, 0.3] }, ready.rootY - 1),
    dead: pose(-24, {
      root: [1.45, 0.3, 0.1],
      torso: [0.1, 0, 0],
      head: [0.4, 0.5, 0.3],
      thighL: [-0.9, 0, 0.3],
      thighR: [-0.5, 0, -0.3],
      shinL: [1.1, 0, 0],
      shinR: [0.6, 0, 0],
      upperArmL: [-1.2, 0, 1],
      upperArmR: [-0.6, 0, -1.2],
    }),
  };
}


/**
 * 走路的一個瞬間（p = 步伐相位，弧度）。s = sin(p)：s > 0 時左腳在前、右手在前。
 * 擺動中的那條腿膝蓋彎起（抬腳），身體在兩腳交錯時最高、踩地時最低。
 */
function gaitPose(gait: Gait, p: number, ready: Pose, hunch: number, twoHanded: boolean): Pose {
  const s = Math.sin(p);
  const c = Math.cos(p);
  /** 腿：stride = 步幅、knee = 抬腳時膝蓋彎多少、bend = 一直保持的屈膝、spread = 兩腳外開 */
  const legs = (stride: number, knee: number, bend = 0, spread = 0): Angles => ({
    thighL: [-0.1 - bend - stride * s, 0, spread],
    thighR: [-0.1 - bend + stride * s, 0, -spread],
    shinL: [0.15 + bend * 1.6 + knee * Math.max(0, c), 0, 0],
    shinR: [0.15 + bend * 1.6 + knee * Math.max(0, -c), 0, 0],
    footL: [-0.1, 0, 0],
    footR: [-0.1, 0, 0],
  });
  switch (gait) {
    case 'swagger': {
      // 重甲：骨盆與肩膀反向大幅扭轉、重心左右移到踩地的那隻腳；胸口挺出、頭維持朝前
      const stomp = Math.abs(c);
      return pose(-2.2 + stomp * 1.8, {
        root: [0.04, -0.2 * s, 0.07 * s],
        torso: [-0.06, 0.42 * s, -0.08 * s],
        neck: [0.04, -0.12 * s, 0.04 * s],
        head: [0, -0.1 * s, 0],
        ...legs(0.5, 0.95, 0.08, 0.16),
        // 右手把巨斧扛在肩上（斧柄往後斜上、斧頭在背後），隨步伐上下顛；左手握拳往外大幅擺動
        upperArmR: [-0.9 + 0.06 * s, 0, -0.12],
        forearmR: [-2.3 + 0.05 * stomp, 0, 0],
        handR: [-1.3, 0, 0],
        upperArmL: [-0.05 + 0.55 * s, 0, 0.38],
        forearmL: [-0.45 - 0.35 * Math.max(0, -s), 0, 0],
        handL: [0, 0, 0],
      });
    }
    case 'lope': {
      // 食屍鬼：彎腰前衝，雙手垂在身前、比步伐慢半拍地晃盪；頭一點一點
      const bob = Math.cos(p * 2);
      return pose(-3 + Math.abs(c) * 2, {
        torso: [0.25 + hunch + bob * 0.05, 0.16 * s, 0.05 * c],
        neck: [-0.25 - hunch * 0.6 - bob * 0.08, -0.08 * s, 0],
        head: [-0.15 - hunch * 0.4 + bob * 0.1, -0.08 * s, 0],
        ...legs(0.7, 1.15, 0.22, 0.12),
        upperArmR: [-0.45 - 0.55 * Math.sin(p - 0.6), 0, 0.15],
        upperArmL: [-0.45 + 0.55 * Math.sin(p - 0.6), 0, -0.15],
        forearmR: [-0.5 - 0.35 * Math.max(0, Math.sin(p - 1.1)), 0, 0],
        forearmL: [-0.5 - 0.35 * Math.max(0, -Math.sin(p - 1.1)), 0, 0],
      });
    }
    case 'stalk':
      // 弓手：半蹲、上身轉向持弓的一側，弓拿低在身前；右手靠近箭筒、幾乎不擺
      return pose(-3 + Math.abs(c) * 0.9, {
        torso: [0.22, 0.25 + 0.05 * s, 0],
        neck: [-0.1, -0.12, 0],
        head: [-0.12, -0.13 - 0.05 * s, 0],
        ...legs(0.42, 0.75, 0.2, 0.1),
        upperArmL: [-0.55 + 0.08 * s, 0, -0.08],
        forearmL: [-0.55, 0, 0],
        upperArmR: [-0.05 - 0.12 * s, 0, 0.15],
        forearmR: [-0.7, 0, 0],
      });
    case 'glide':
      // 法師：上身挺直、幾乎沒有起伏；法杖（左手）保持直立、隨步伐往前點地，右手收在胸前
      return pose(-1.2 + Math.cos(p * 2) * 0.25, {
        torso: [0.06, 0.08 * s, 0.03 * c],
        neck: [-0.04, -0.06 * s, 0],
        head: [-0.04, -0.04 * s, 0],
        // 腿藏在長袍裡：步幅小，腳尖不會露到袍子外
        ...legs(0.18, 0.25),
        upperArmL: [-0.55 - 0.3 * s, 0, -0.05],
        forearmL: [-0.3 + 0.15 * s, 0, 0],
        handL: [0.95 + 0.1 * s, 0, 0],
        upperArmR: [-0.35, 0, 0.12],
        forearmR: [-1.2, 0, 0],
      });
    case 'march':
      // 持盾騎士：左手的盾一直舉在身前、上身挺直；右手武器垂在身側隨步伐小幅晃；步伐穩重
      return pose(-1.8 + Math.abs(c) * 1.2, {
        root: [0.04, -0.12 * s, 0.04 * s],
        torso: [0.04, 0.18 * s, -0.04 * s],
        neck: [0, -0.06 * s, 0],
        head: [0, -0.06 * s, 0],
        ...legs(0.4, 0.8, 0.06, 0.1),
        upperArmL: [-0.55, 0, -0.1],
        forearmL: [-0.9, 0, 0],
        handL: [0.3, 0, 0],
        upperArmR: [-0.1 - 0.25 * s, 0, -0.18],
        forearmR: [-0.35, 0, 0],
        handR: [-0.2 + 0.2 * Math.sin(p - 0.7), 0, 0],
      });
    case 'hover':
      // 影魔：沒有腳，上身前傾、雙爪往後拖並交替擺動；身體上下飄浮、左右擺
      return pose(Math.sin(p * 2) * 1.2, {
        root: [0.2, 0.1 * s, 0.05 * c],
        torso: [0.25, -0.12 * s, 0],
        neck: [-0.25, 0.05 * s, 0],
        head: [-0.2, 0, 0],
        upperArmR: [0.55 + 0.25 * s, 0, -0.25],
        upperArmL: [0.55 - 0.25 * s, 0, 0.25],
        forearmR: [-0.35, 0, 0],
        forearmL: [-0.35, 0, 0],
      });
    default:
      return plus(
        ready,
        {
          torso: [0.1, 0.1 * s, 0],
          thighR: [-0.6 * s, 0, 0],
          thighL: [0.6 * s, 0, 0],
          shinR: [0.8 * Math.max(0, s), 0, 0],
          shinL: [0.8 * Math.max(0, -s), 0, 0],
          upperArmR: [twoHanded ? 0 : 0.35 * s, 0, 0],
          upperArmL: [twoHanded ? 0 : -0.45 * s, 0, 0],
        },
        -1 + Math.abs(c) * 1.2,
      );
  }
}
