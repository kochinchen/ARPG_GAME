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

/** 骷髏頭：頭骨、顴骨、下顎與一排牙齒、兩個黑色眼窩、鼻孔 */
export const skull = (color = BONE): Mesh[] => [
  lowSphere(5.4, color, [0, 6, 0.2], 10, 5, [1, 1.08, 1.05]),
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

/** 人形骨架（尺寸與女主角相同），各部位掛上指定零件 */
export function humanoid(o: HumanoidOptions): PartDef[] {
  const sx = o.shoulderX ?? 7;
  const fist = (): Mesh[] => [lowSphere(1.6, BONE_DARK, [0, -1.4, 0], 8, 4)];
  return [
    // 預設為骨盆：中央骶骨 + 左右兩片髂骨
    {
      joint: 'root',
      parent: null,
      offset: [0, 0, 0],
      meshes: o.root ?? [
        box(3, 3.4, 3, BONE_DARK, [0, 0.6, -0.6]),
        placeMesh(prism(8, 0, 4, [2.6, 1], [3.2, 1.2], BONE), [0, 0, -0.5], [1.6, -0.6, 0]),
        placeMesh(prism(8, 0, 4, [2.6, 1], [3.2, 1.2], BONE), [0, 0, 0.5], [-1.6, -0.6, 0]),
      ],
    },
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

export interface PoseOptions {
  attack: AttackStyle;
  cast?: CastStyle;
  /** 駝背程度（食屍鬼） */
  hunch?: number;
  /** 雙手握武器（重甲、骷髏王） */
  twoHanded?: boolean;
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
    run: (p) => {
      const s = Math.sin(p);
      return plus(ready, {
        torso: [0.1, 0.1 * s, 0],
        thighR: [-0.6 * s, 0, 0],
        thighL: [0.6 * s, 0, 0],
        shinR: [0.8 * Math.max(0, s), 0, 0],
        shinL: [0.8 * Math.max(0, -s), 0, 0],
        upperArmR: [o.twoHanded ? 0 : 0.35 * s, 0, 0],
        upperArmL: [o.twoHanded ? 0 : -0.45 * s, 0, 0],
      }, -1 + Math.abs(Math.cos(p)) * 1.2);
    },
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

