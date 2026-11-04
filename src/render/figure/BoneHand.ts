import { aiFigure, I3, type AiMonsterData } from './AiRig';
import { grounded, type FigureModel, type Joint, type Pose } from './FigureModel';
import type { V3 } from './Poly3D';
import DATA from './monsters/boneHandAI.json';

/**
 * 骸手爬行者：設計者生成的骷髏手蜘蛛（art/monsters/bone_hand），由 scripts/monster_ai.py 減面、綁骨架。
 * 身體是一顆骨球（後面是血紅的眼睛），手臂斜往前上，手掌朝前；每邊 9 隻腳，最後兩隻短、腳尖不著地。
 * 模型本身就是站好的姿勢，所以不轉正：所有角度為 0 就是模型的樣子，動作從這裡轉出去。
 * 動作：蜘蛛爬行（兩組腳交替）、手掌往下拍地、橫掃、往前抓；手指待機時會慢慢張合。
 */

const data = DATA as unknown as AiMonsterData & { legs: number };

/** 公尺 → 遊戲單位 */
const SCALE = 85;
const SIDES = [
  ['L', 1],
  ['R', -1],
] as const;

type Key = Partial<Record<Joint, V3>>;
const pose = (angles: Key, rootY = 0, rootZ = 0): Pose => ({ rootY, rootZ, angles });

/** 每隻腳的角度：swing = 往前擺（+ 前）、lift = 抬起（+ 上）、bend = 膝蓋往內彎 */
function legs(fn: (side: 1 | -1, i: number) => { swing?: number; lift?: number; bend?: number }): Key {
  const a: Key = {};
  for (const [s, side] of SIDES) {
    for (let i = 0; i < data.legs; i++) {
      const { swing = 0, lift = 0, bend = 0 } = fn(side, i);
      a[`ex_leg${s}${i + 1}a`] = [0, -side * swing, lift * side];
      a[`ex_leg${s}${i + 1}b`] = [0, 0, -bend * side];
    }
  }
  return a;
}

/** 手指：curl = 往掌心彎（+ 握、- 張開） */
function fingers(curl: number): Key {
  const a: Key = {
    ex_fingCa: [curl * 0.6, 0, 0],
    ex_fingCb: [curl, 0, 0],
  };
  for (const [s] of SIDES) {
    for (const n of ['I', 'O']) {
      a[`ex_fing${n}${s}a`] = [curl * 0.6, 0, 0];
      a[`ex_fing${n}${s}b`] = [curl, 0, 0];
    }
    a[`ex_thumb${s}`] = [curl * 0.5, 0, 0];
  }
  return a;
}

/** 手臂與手掌：arm、palm 都是往前下壓（+）；fist = 手指彎曲程度 */
const hand = (arm: number, palm: number, fist: number, yaw = 0): Key => ({ ex_arm: [arm, yaw, 0], ex_palm: [palm, 0, 0], ...fingers(fist) });

/** 兩組腳交替的爬行：amp = 步幅 */
function crawl(phase: number, amp: number): Pose {
  const s = Math.sin(phase);
  return pose(
    {
      ...legs((side, i) => {
        const p = (i + (side === 1 ? 0 : 1)) % 2 === 0 ? phase : phase + Math.PI;
        return { swing: 0.3 * Math.sin(p) * amp, lift: 0.28 * Math.max(0, Math.cos(p)) * amp, bend: 0.12 * Math.max(0, Math.cos(p)) * amp };
      }),
      root: [0.02, 0.05 * s * amp, 0],
      ex_ball: [0, -0.1 * s * amp, 0],
      ...hand(0.05 * Math.sin(phase * 2) * amp, 0.08 * Math.sin(phase * 2 + 1) * amp, 0.1 + 0.08 * s * amp, 0.1 * s * amp),
    },
    0.8 * amp * Math.abs(Math.cos(phase)),
  );
}

const { parts, skin, hip } = aiFigure(data, { scale: SCALE }, () => I3);

/** 會著地的腳（最後兩隻短腳懸空，不算）：出招時身體前傾，讓最低的腳尖剛好踩在地上 */
const FEET: Joint[] = SIDES.flatMap(([s]) => Array.from({ length: data.legs - 2 }, (_, i): Joint => `ex_leg${s}${i + 1}b`));
const stand = (angles: Key, rootZ = 0): Pose => grounded(parts, hip, { rootY: 0, rootZ, angles }, FEET);

/** 蹲低蓄力時的腳 */
const CROUCH = legs(() => ({ bend: -0.12, lift: -0.12 }));
/** 打出去時前腳往前撐 */
const BRACE = legs((_, i) => (i < 3 ? { swing: 0.25, lift: 0.1 } : { swing: -0.1 }));

/** 拍地：手臂往後高舉、手指張開 → 整隻手往前下拍在地上 */
const SLAM = {
  windup: [stand({ ...CROUCH, ...hand(-0.25, -0.15, -0.1), root: [-0.05, 0, 0] }, -0.5), stand({ ...CROUCH, ...hand(-0.6, -0.4, -0.35), root: [-0.15, 0, 0] }, -1.5), stand({ ...CROUCH, ...hand(-0.72, -0.5, -0.4), root: [-0.18, 0, 0] }, -1.8)],
  strike: [stand({ ...BRACE, ...hand(0.98, 0.3, -0.2), root: [0.12, 0, 0] }, 3), stand({ ...BRACE, ...hand(0.9, 0.28, 0.15), root: [0.1, 0, 0] }, 2.5)],
};
/** 橫掃：手臂往右扭到底 → 往左掃過去 */
const SWEEP = {
  windup: [stand({ ...hand(-0.1, -0.1, -0.1, -0.5), root: [0, -0.2, 0] }, -0.5), stand({ ...hand(-0.2, -0.15, -0.3, -0.95), root: [0, -0.4, 0] }, -0.8)],
  strike: [stand({ ...BRACE, ...hand(0.55, 0.15, 0, 0.8), root: [0.05, 0.4, 0] }, 2), stand({ ...BRACE, ...hand(0.5, 0.15, 0.2, 1), root: [0.05, 0.45, 0] }, 1.8)],
};
/** 抓：手縮回、五指張開 → 往前伸、握起來 */
const GRAB = {
  windup: [stand({ ...CROUCH, ...hand(-0.35, 0.3, -0.25) }, -1), stand({ ...CROUCH, ...hand(-0.5, 0.45, -0.45) }, -2)],
  strike: [stand({ ...BRACE, ...hand(0.72, -0.25, 0.55), root: [0.1, 0, 0] }, 6), stand({ ...BRACE, ...hand(0.62, -0.2, 0.8), root: [0.08, 0, 0] }, 5)],
};

const onGround = (angles: Key, rootZ = 0): Pose => grounded(parts, hip, { rootY: 0, rootZ, angles }, 'all');
/** 倒下：手臂往旁邊垂到地上，腳全部往內收（蜘蛛死掉的樣子） */
const deathKeys = [
  pose({ ...hand(-0.35, -0.2, -0.3, 0.2), root: [-0.1, 0, 0.05] }, 0.5, -1),
  onGround({ ...legs(() => ({ lift: -0.2, bend: 0.5 })), ...hand(0.6, 0.3, 0.3, 0.4), root: [0.1, 0, 0.12] }, 1),
  onGround({ ...legs((_, i) => ({ lift: 0.25, bend: 1.05, swing: i < 4 ? -0.1 : 0.1 })), ...hand(0.8, 0.3, 0.9, 0.5), root: [0.05, 0, 0.3] }, 2),
];

export const BONE_HAND: FigureModel = {
  hipHeight: hip,
  referenceRadius: 0.5,
  // 外觀比女主角高一點（×1.22，npm run docs:models 的 manifest 量得到）
  visualScale: 1.5,
  parts,
  skin,
  poses: {
    // 手臂輕輕晃、手指慢慢張合，像在摸索
    ready: (t) => pose({ ...hand(0.04 * Math.sin(t * 0.9), 0.07 * Math.sin(t * 0.7), 0.12 + 0.18 * Math.sin(t * 1.1), 0.12 * Math.sin(t * 0.4)), ex_ball: [0.03 * Math.sin(t * 1.3), 0, 0] }, 0.25 * Math.sin(t * 1.3)),
    walk: (phase) => crawl(phase, 1),
    run: (phase) => crawl(phase, 1.35),
    attackWindup: SLAM.windup[2]!,
    attackStrike: SLAM.strike[0]!,
    attackChain: SLAM,
    attackVariants: { overhead: SLAM, slash: SWEEP, thrust: GRAB },
    castWindup: SLAM.windup[2]!,
    castRelease: SLAM.strike[0]!,
    hit: pose({ ...hand(-0.25, -0.2, -0.3), root: [-0.08, 0, 0] }, 0, -0.8),
    hitKeys: [pose(hand(-0.15, -0.3, -0.35)), pose({ ...hand(-0.25, -0.2, -0.3), root: [-0.08, 0, 0] }, 0, -0.8), pose(hand(-0.08, -0.05, 0), -0.3, -0.3)],
    dead: deathKeys[2]!,
    deathKeys,
  },
  gaitRate: 0.8,
  dynamicShadow: true,
  softLight: true,
  rimLight: 0.2,
};
