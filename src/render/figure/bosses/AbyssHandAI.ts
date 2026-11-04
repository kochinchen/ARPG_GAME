import { aiFigure, I3, type AiMonsterData } from '../AiRig';
import { grounded, type FigureModel, type Joint, type Pose, type PoseSet } from '../FigureModel';
import type { V3 } from '../Poly3D';
import BODY from './abyssHandAI.json';
import FOREARM from './abyssHandForearmAI.json';

/**
 * 隱藏魔王「奪界雙手」（AI 版）：兩隻一對的爬行骷髏手臂，代表「奪取的手」。
 * 上手臂橫躺當身體，四對蜘蛛腳，手肘的關節是一顆血紅眼睛，下手臂垂直朝上，手掌當頭。
 * 設計稿 → ChatGPT 四視圖 → TRELLIS，身體與手分開生成，由 scripts/monster_ai.py 接骨架（art/monsters/abyss_hand）。
 * 這裡把手接到身體上；第三階段手被打壞（phaseHidden 藏起 ex_hand），只剩身體與眼睛。
 *
 * 骨架：root（上手臂）→ ex_ball（肩膀的骨球）、ex_eye（手肘的眼睛）、ex_leg?1～4a（髖 → 膝）、b（膝 → 腳尖）；
 * ex_hand（手肘）→ ex_arm（前臂）→ ex_palm（手掌）→ ex_fing1～5a、b、c（手指，每根三節）。
 * 模型本身就是站好的姿勢，所以不轉正。右手是左手的鏡像（ABYSS_HAND_R）。
 */

/** 公尺 → 遊戲單位 */
const SCALE = 85;
/** 外觀倍率：身體連手約女主角的 3 倍高（npm run docs:models 的 manifest 量得到） */
const VISUAL = 1.2;
/** 手接在手肘上方的位置（公尺、遊戲軸向） */
const ATTACH: V3 = [0, 0.3, 0.335];

const body = BODY as unknown as AiMonsterData & { legs: number };
const forearm = FOREARM as unknown as AiMonsterData;
const LEGS = body.legs;
const SIDES = [['L', 1], ['R', -1]] as const;
const FINGERS = [1, 2, 3, 4, 5] as const;

type Key = Partial<Record<Joint, V3>>;
const pose = (angles: Key, rootY = 0, rootZ = 0): Pose => ({ rootY, rootZ, angles });

/** 把手接到身體上：頂點移到手肘上方、手的 root 改名成 ex_hand 掛在上手臂上；這些面的 region 是 ex_hand（第三階段藏起來） */
function withHand(): { data: AiMonsterData; bodyFaces: number } {
  const rename = (j: string) => (j === 'root' ? 'ex_hand' : j);
  const anchor = forearm.joints.root!;
  const move = (v: number[]) => [v[0]! - anchor[0]! + ATTACH[0], v[1]! - anchor[1]! + ATTACH[1], v[2]! - anchor[2]! + ATTACH[2]];
  const table = (from: Record<string, number[]>) => Object.fromEntries(Object.entries(from).map(([j, p]) => [rename(j), move(p)]));
  const offset = body.verts.length;
  return {
    data: {
      joints: { ...body.joints, ...table(forearm.joints) },
      tips: { ...body.tips, ...table(forearm.tips) },
      parents: { ...body.parents, ...Object.fromEntries(Object.entries(forearm.parents).map(([j, p]) => [rename(j), p === null ? 'root' : rename(p)])) },
      verts: [...body.verts, ...forearm.verts.map(move)],
      weights: [...body.weights, ...(forearm.weights as [string, number][][]).map((list) => list.map(([b, w]) => [rename(b), w]))],
      faces: [...body.faces, ...forearm.faces.map((f) => [f[0]! + offset, f[1]! + offset, f[2]! + offset, f[3]!])],
    },
    bodyFaces: body.faces.length,
  };
}

/** 左右鏡像：頂點與關節的 x 反過來、左右腳換名字，面的順序反過來才不會朝內 */
function mirrored(d: AiMonsterData): AiMonsterData {
  const flip = (p: number[]) => [-p[0]!, p[1]!, p[2]!];
  const swap = (j: string) => j.replace(/^ex_leg([LR])/, (_, s: string) => `ex_leg${s === 'L' ? 'R' : 'L'}`);
  const table = (t: Record<string, number[]>) => Object.fromEntries(Object.entries(t).map(([j, p]) => [swap(j), flip(p)]));
  return {
    joints: table(d.joints),
    tips: table(d.tips),
    parents: Object.fromEntries(Object.entries(d.parents).map(([j, p]) => [swap(j), p === null ? null : swap(p)])),
    verts: d.verts.map(flip),
    weights: (d.weights as [string, number][][]).map((list) => list.map(([b, w]) => [swap(b), w])),
    faces: d.faces.map((f) => [f[0]!, f[2]!, f[1]!, f[3]!]),
  };
}

/** 每隻腳的角度：swing = 往前擺（+ 前）、lift = 抬起（+ 上）、bend = 膝蓋往內彎 */
function legs(fn: (side: 1 | -1, i: number) => { swing?: number; lift?: number; bend?: number }): Key {
  const a: Key = {};
  for (const [s, side] of SIDES) {
    for (let i = 0; i < LEGS; i++) {
      const { swing = 0, lift = 0, bend = 0 } = fn(side, i);
      a[`ex_leg${s}${i + 1}a`] = [0, -side * swing, lift * side];
      a[`ex_leg${s}${i + 1}b`] = [0, 0, -bend * side];
    }
  }
  return a;
}

/** 手指：curl = 往掌心彎（+ 握、- 反張） */
function fingers(curl: number): Key {
  const a: Key = {};
  for (const n of FINGERS) {
    a[`ex_fing${n}a`] = [curl * 0.45, 0, 0];
    a[`ex_fing${n}b`] = [curl * 0.8, 0, 0];
    a[`ex_fing${n}c`] = [curl * 0.6, 0, 0];
  }
  return a;
}

/** 手：arm = 整條下手臂往前壓（+，π/2 = 平行地面）、palm = 手腕往前彎、curl = 手指 */
const hand = (arm: number, palm: number, curl: number, yaw = 0): Key => ({ ex_hand: [arm, yaw, 0], ex_palm: [palm, 0, 0], ...fingers(curl) });

const IDLE_CURL = 0.4;

function poseSet(data: AiMonsterData, armed: boolean): { poses: PoseSet; parts: ReturnType<typeof aiFigure>['parts']; skin: ReturnType<typeof aiFigure>['skin']; hip: number } {
  const { parts, skin, hip } = aiFigure(data, { scale: SCALE }, () => I3);
  const FEET: Joint[] = SIDES.flatMap(([s]) => Array.from({ length: LEGS }, (_, i): Joint => `ex_leg${s}${i + 1}b`));
  const stand = (angles: Key, rootZ = 0): Pose => grounded(parts, hip, { rootY: 0, rootZ, angles }, FEET);
  const onGround = (angles: Key, rootZ = 0): Pose => grounded(parts, hip, { rootY: 0, rootZ, angles }, 'all');
  const arm = (k: Key): Key => (armed ? k : {});

  const CROUCH = legs(() => ({ bend: -0.1, lift: -0.1 }));
  const BRACE = legs((_, i) => (i < 2 ? { swing: 0.2, lift: 0.08 } : { swing: -0.08 }));

  const crawl = (phase: number, amp: number): Pose => {
    const s = Math.sin(phase);
    return pose(
      {
        ...legs((side, i) => {
          const p = (i + (side === 1 ? 0 : 1)) % 2 === 0 ? phase : phase + Math.PI;
          return { swing: 0.28 * Math.sin(p) * amp, lift: 0.26 * Math.max(0, Math.cos(p)) * amp, bend: 0.1 * Math.max(0, Math.cos(p)) * amp };
        }),
        root: [0.015, 0.04 * s * amp, 0],
        ex_ball: [0, -0.1 * s * amp, 0],
        ex_eye: [0, 0.05 * s * amp, 0],
        ...arm(hand(0.04 * Math.sin(phase * 2) * amp, 0.1 + 0.08 * Math.sin(phase * 2 + 1) * amp, IDLE_CURL + 0.08 * s * amp, 0.08 * s * amp)),
      },
      0.8 * amp * Math.abs(Math.cos(phase)),
    );
  };

  /** 拍地：手臂往後高舉、五指張開 → 整隻手往前下拍在地上（手掌平貼地面） */
  const SLAM = {
    windup: [stand({ ...CROUCH, ...arm(hand(-0.2, -0.3, -0.05)), root: [-0.04, 0, 0] }, -0.5), stand({ ...CROUCH, ...arm(hand(-0.42, -0.55, -0.15)), root: [-0.1, 0, 0] }, -1.5)],
    strike: [stand({ ...BRACE, ...arm(hand(2, 0.25, -0.1)), root: [0.08, 0, 0] }, 2), stand({ ...BRACE, ...arm(hand(1.9, 0.25, 0.1)), root: [0.06, 0, 0] }, 1.5)],
  };
  /** 合擊：手掌平伸往前打（兩隻從兩側夾起來） */
  const CLAP = {
    windup: [stand({ ...CROUCH, ...arm(hand(0.5, -0.2, -0.1, -0.5)) }, -0.5), stand({ ...CROUCH, ...arm(hand(0.95, -0.3, -0.15, -0.85)) }, -1)],
    strike: [stand({ ...BRACE, ...arm(hand(1.5, 0.05, 0, 0.1)), root: [0.05, 0, 0] }, 4), stand({ ...BRACE, ...arm(hand(1.45, 0.05, 0.1, 0.15)), root: [0.05, 0, 0] }, 3.5)],
  };
  /** 奪取之握：手縮回、五指張開 → 往前伸、握起來 */
  const GRAB = {
    windup: [stand({ ...CROUCH, ...arm(hand(-0.1, 0.25, -0.15)) }, -1), stand({ ...CROUCH, ...arm(hand(-0.25, 0.4, -0.25)) }, -2)],
    strike: [stand({ ...BRACE, ...arm(hand(1.45, -0.1, 0.5)), root: [0.06, 0, 0] }, 6), stand({ ...BRACE, ...arm(hand(1.4, -0.1, 1.1)), root: [0.05, 0, 0] }, 5)],
  };
  /** 斷掌之後：前面兩對腳舉起來往前刺 */
  const raise = (k: number): Key => legs((_, i) => (i < 2 ? { swing: 0.35 * k, lift: 0.55 * k, bend: -0.2 * k } : { swing: -0.1 * k }));
  const STAB = {
    windup: [stand({ ...raise(0.5), root: [-0.1, 0, 0] }, -0.5), stand({ ...raise(1), root: [-0.2, 0, 0] }, -1.5)],
    strike: [stand({ ...legs((_, i) => (i < 2 ? { swing: 0.5, lift: -0.05, bend: 0.1 } : { swing: -0.15 })), root: [0.1, 0, 0] }, 3), stand({ ...legs((_, i) => (i < 2 ? { swing: 0.4 } : { swing: -0.1 })), root: [0.06, 0, 0] }, 2)],
  };
  const melee = armed ? { overhead: SLAM, slash: CLAP, thrust: GRAB } : { overhead: STAB, slash: STAB, thrust: STAB };
  const main = armed ? SLAM : STAB;

  /** 唯一的魔法：手臂伸直平行地面、五指張開伸直；斷掌之後是眼睛往前頂 */
  const castWindup = armed ? stand({ ...CROUCH, ...hand(1.5, 0, -0.1) }, 0) : stand({ ...raise(0.3), root: [-0.12, 0, 0], ex_eye: [-0.15, 0, 0] }, -1);
  const castRelease = armed ? stand({ ...BRACE, ...hand(1.57, 0, -0.2) }, 1.5) : stand({ ...BRACE, root: [0.1, 0, 0], ex_eye: [0.1, 0, 0] }, 2.5);

  const deathKeys = [
    pose({ ...arm(hand(-0.3, -0.2, -0.2, 0.2)), root: [-0.08, 0, 0.04] }, 0.5, -1),
    onGround({ ...legs(() => ({ lift: -0.15, bend: 0.45 })), ...arm(hand(0.9, 0.3, 0.3, 0.4)), root: [0.08, 0, 0.1] }, 1),
    onGround({ ...legs((_, i) => ({ lift: 0.2, bend: 0.95, swing: i < 2 ? -0.1 : 0.1 })), ...arm(hand(1.6, 0.3, 1, 0.5)), root: [0.04, 0, 0.26] }, 2),
  ];
  const hitPose = pose({ ...arm(hand(-0.2, -0.2, 0)), root: [-0.06, 0, 0] }, 0, -0.8);

  return {
    parts,
    skin,
    hip,
    poses: {
      // 手指慢慢張合，手臂輕輕晃，像在摸索；眼睛四處看
      ready: (t) => pose({ ...arm(hand(0.03 * Math.sin(t * 0.9), 0.1 + 0.05 * Math.sin(t * 0.7), IDLE_CURL + 0.2 * Math.sin(t * 1.1), 0.1 * Math.sin(t * 0.4))), ex_eye: [0.04 * Math.sin(t * 0.8), 0.08 * Math.sin(t * 0.5), 0] }, 0.25 * Math.sin(t * 1.3)),
      walk: (phase) => crawl(phase, 1),
      run: (phase) => crawl(phase, 1.3),
      attackWindup: main.windup[1]!,
      attackStrike: main.strike[0]!,
      attackChain: main,
      attackVariants: melee,
      castWindup,
      castRelease,
      hit: hitPose,
      hitKeys: [pose({ ...arm(hand(-0.1, -0.25, 0.1)) }), hitPose, pose({ ...arm(hand(-0.05, 0, IDLE_CURL)) }, -0.3, -0.3)],
      dead: deathKeys[2]!,
      deathKeys,
    },
  };
}

function model(data: AiMonsterData, bodyFaces: number): FigureModel {
  const whole = poseSet(data, true);
  const stump = poseSet(data, false);
  // 手的面：phaseHidden 依 region 不畫
  whole.skin.faces.forEach((f, i) => {
    if (i >= bodyFaces) f.region = 'ex_hand';
  });
  return {
    hipHeight: whole.hip,
    referenceRadius: 0.5,
    visualScale: VISUAL,
    parts: whole.parts,
    poses: whole.poses,
    skin: whole.skin,
    gaitRate: 0.8,
    dynamicShadow: true,
    softLight: true,
    rimLight: 0.2,
    // 階段 0、1 手都在；階段 2（30%）手被打壞
    phasePoses: [whole.poses, whole.poses, stump.poses],
    phaseHidden: [[], [], ['ex_hand']],
    phaseBlendTime: 0.5,
  };
}

const merged = withHand();
export const ABYSS_HAND: FigureModel = model(merged.data, merged.bodyFaces);
export const ABYSS_HAND_R: FigureModel = model(mirrored(merged.data), merged.bodyFaces);
