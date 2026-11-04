import { aiFigure, aiPoints, alignTo, I3, sub, type AiMonsterData } from '../AiRig';
import { grounded, type FigureModel, type Joint, type PartDef, type Pose, type PoseSet } from '../FigureModel';
import type { M3, V3 } from '../Poly3D';
import BODY from './abyssDragonAI.json';
import TAIL from './abyssDragonTailAI.json';

/**
 * 隱藏魔王「噬界足眼」（AI 版）：一般怪物代表口，牠代表眼。超大的血紅眼球、瞳孔是圓形鋸齒深口，周圍八根花瓣爪，
 * 粗腿的腳掌是人手，翅膀尖端都是眼睛，背後是統御者的尖刺重甲，尾巴尖端是一張女性的臉。
 * 設計稿 → ChatGPT 四視圖 → TRELLIS，由 scripts/monster_ai.py 放大翅膀、挖深瞳孔、接骨架（art/monsters/abyss_dragon）。
 * 尾巴另外生成（中段重複成好幾節），第三階段脫離成獨立的怪物：這裡接在本體上，脫離後用 ABYSS_TAIL。
 *
 * 骨架：root → chest（背甲）→ head（眼球）→ 八根爪（ex_claw?a 根部、ex_claw?b 爪尖）與深口的一圈骨頭（ex_mouth?，吸氣吐氣）；腿 thigh / shin / foot / ex_toe（手指）；
 * 翅膀 ex_wing?1（肩胛 → 翼肘）、ex_wing?2～5（翼指）；尾巴 ex_tailRoot、ex_tail1～6、ex_tailHead（臉）。
 * 模型本身就是站好、爪子張開的姿勢，所以不轉正：所有角度為 0 就是模型的樣子。
 *
 * 階段（模型的 phasePoses，由 BossPhaseChanged 切換）：0 爪子張開、1 爪子收合（尾巴舉過頭連發）、2 尾巴脫離（phaseHidden 藏起尾巴）。
 */

/** 公尺 → 遊戲單位 */
const SCALE = 85;
/** 外觀倍率：身體約女主角的 4 倍高（碰撞半徑 0.5 × 體型 1.6，npm run docs:models 的 manifest 量得到） */
const VISUAL = 2.54;
/** 尾巴接在背甲下方的位置（公尺、遊戲軸向） */
const TAIL_ATTACH: V3 = [0, -0.14, -0.14];

const body = BODY as unknown as AiMonsterData;
const tail = TAIL as unknown as AiMonsterData;

/** 尾巴的骨頭節數（monster_ai.py 的 TAIL_COPIES） */
const SEGMENTS = Object.keys(tail.joints).filter((j) => /^ex_tail\d+$/.test(j)).length;
const CLAWS = ['T', 'B', 'UL', 'UR', 'DL', 'DR', 'RL', 'RR'] as const;
const SIDES: readonly ['L' | 'R', number][] = [['L', 1], ['R', -1]];

type Key = Partial<Record<Joint, V3>>;
const pose = (angles: Key, rootY = 0, rootZ = 0): Pose => ({ rootY, rootZ, angles });

/** 旋轉矩陣 → 關節角度（jointRotation 的反函式：Y · X · Z） */
function toAngles(m: M3): V3 {
  return [Math.asin(Math.max(-1, Math.min(1, -m[5]))), Math.atan2(m[2], m[8]), Math.atan2(m[3], m[4])];
}

/** 把尾巴接到本體上：頂點移到背甲下方、root 改名成 ex_tailRoot 掛在骨盆上；這些面的 region 是 tail（第三階段藏起來） */
function withTail(): { data: AiMonsterData; tailFaces: number } {
  const rename = (j: string) => (j === 'root' ? 'ex_tailRoot' : j);
  const anchor = tail.joints.root!;
  const move = (v: number[]) => [v[0]! - anchor[0]! + TAIL_ATTACH[0], v[1]! - anchor[1]! + TAIL_ATTACH[1], v[2]! - anchor[2]! + TAIL_ATTACH[2]];
  const table = (from: Record<string, number[]>) => Object.fromEntries(Object.entries(from).map(([j, p]) => [rename(j), move(p)]));
  const offset = body.verts.length;
  return {
    data: {
      joints: { ...body.joints, ...table(tail.joints) },
      tips: { ...body.tips, ...table(tail.tips) },
      parents: { ...body.parents, ...Object.fromEntries(Object.entries(tail.parents).map(([j, p]) => [rename(j), p === null ? 'root' : rename(p)])) },
      verts: [...body.verts, ...tail.verts.map(move)],
      weights: [...body.weights, ...(tail.weights as [string, number][][]).map((list) => list.map(([b, w]) => [rename(b), w]))],
      faces: [...body.faces, ...tail.faces.map((f) => [f[0]! + offset, f[1]! + offset, f[2]! + offset, f[3]!])],
    },
    tailFaces: body.faces.length,
  };
}

const merged = withTail();
const { J, TIP } = aiPoints(merged.data);
const figure = aiFigure(merged.data, { scale: SCALE }, () => I3);
const ground = Math.min(...merged.data.verts.map((v) => v[1]!));
const hipHeight = (J('root')[1] - ground) * SCALE;
// 尾巴的面：phaseHidden 依 region 不畫
figure.skin.faces.forEach((f, i) => {
  if (i >= merged.tailFaces) f.region = 'ex_tail';
});

/** 爪尖收合時碰在一起的地方：瞳孔正前方（公尺、遊戲軸向） */
const PUPIL: V3 = [0, 0.05, 0.2];
/** 每根爪完全收合的角度：繞根部轉，讓爪尖碰到瞳孔前方 */
const CLOSED: Record<string, V3> = Object.fromEntries(
  CLAWS.map((c) => {
    const root = J(`ex_claw${c}a`);
    return [c, toAngles(alignTo(sub(TIP(`ex_claw${c}b`), root), sub(PUPIL, root)))];
  }),
);

/** k = 1 完全收合、0 模型原本的張開、負數開得更大（往反方向轉） */
function claws(k: number, t = 0): Key {
  const out: Key = {};
  for (const [i, c] of CLAWS.entries()) {
    const a = CLOSED[c]!;
    // 每根爪略微錯開地蠕動
    const w = k + 0.025 * Math.sin(t * 1.6 + i * 1.3);
    out[`ex_claw${c}a`] = [a[0] * w, a[1] * w, a[2] * w];
    out[`ex_claw${c}b`] = [0.12 * k * Math.sign(a[0] || 1), 0, 0];
  }
  return out;
}

/** 深口的一圈骨頭（monster_ai.py 的 MOUTH_BONES）：每根轉 1 弧度時，口緣往外移的角度 */
const MOUTH_BONES = Object.keys(body.joints).filter((j) => j.startsWith('ex_mouth')).length;
const MOUTH: V3[] = Array.from({ length: MOUTH_BONES }, (_, i) => {
  const a = (2 * Math.PI * i) / MOUTH_BONES;
  const d = 0.1;
  return toAngles(alignTo([0, 0, 1], [Math.sin(d) * Math.cos(a), Math.sin(d) * Math.sin(a), Math.cos(d)])).map((x) => x / d) as V3;
});

/** 深口張開（正）/ 縮小（負），單位弧度：0.1 大約是口徑的 2 成 */
function mouth(k: number): Key {
  const out: Key = {};
  MOUTH.forEach((m, i) => (out[`ex_mouth${i}`] = [m[0] * k, m[1] * k, m[2] * k]));
  return out;
}

/** 吸氣吐氣：很慢、幅度小；吸氣（縮）比吐氣（張）短一點，不像機械的正弦波 */
const breathe = (t: number) => mouth(0.1 * Math.sin(t * 0.9 + 0.3 * Math.sin(t * 0.9)));

/** 翅膀：up 往上拍（負 = 往下）、forward 往前搧；tips 翼尖再多彎一點 */
function wings(up: number, forward = 0, tips = 0): Key {
  const out: Key = {};
  for (const [s, m] of SIDES) {
    out[`ex_wing${s}1`] = [0, -m * forward, m * up];
    out[`ex_wing${s}2`] = [0, -m * tips * 0.6, m * tips];
    for (const k of [3, 4, 5]) out[`ex_wing${s}${k}`] = [0, -m * tips * 0.4, m * tips * 0.6];
  }
  return out;
}

/** 尾巴拖在地上：出背甲後往下，再貼著地面慢慢擺 */
function tailDown(t: number, amp = 1): Key {
  const out: Key = { ex_tailRoot: [-0.3, 0.05 * amp * Math.sin(t * 0.7), 0] };
  for (let i = 1; i <= SEGMENTS; i++) {
    const x = i === 1 ? 0.1 : i === 2 ? 0.2 : 0.015;
    out[`ex_tail${i}`] = [x, 0.09 * amp * Math.sin(t * 1.1 - i * 0.8), 0];
  }
  out.ex_tailHead = [0.1, 0.1 * amp * Math.sin(t * 1.1 - (SEGMENTS + 1) * 0.8), 0];
  return out;
}

/** 尾巴舉過背甲，臉從頭上往前：爪子收合時由牠連發；bend = 整體彎曲的程度 */
function tailUp(t: number, bend = 1, whip = 0): Key {
  const out: Key = { ex_tailRoot: [0.75 * bend, 0.03 * Math.sin(t), 0] };
  for (let i = 1; i <= SEGMENTS; i++) out[`ex_tail${i}`] = [(0.34 + whip * 0.1) * bend, 0.05 * Math.sin(t * 1.2 - i * 0.7), 0];
  out.ex_tailHead = [(0.12 - whip * 0.3) * bend, 0, 0];
  return out;
}

/** 沉重的雙足步伐；手掌像人一樣踩地 */
function gait(phase: number, amp: number, t: Key): Pose {
  const s = Math.sin(phase);
  const liftL = Math.max(0, Math.cos(phase));
  const liftR = Math.max(0, -Math.cos(phase));
  const bend = (x: number): V3 => [x, 0, 0];
  const leg = (side: 'L' | 'R', sway: number, lift: number): Key => ({
    [`thigh${side}`]: bend(-0.42 * sway * amp - 0.2 * lift * amp),
    [`shin${side}`]: bend(0.5 * lift * amp),
    [`foot${side}`]: bend(-0.25 * lift * amp + 0.12 * sway * amp),
    [`ex_toe${side}`]: bend(0.2 * lift * amp),
  });
  return pose(
    {
      root: [0.03 * amp, 0.06 * s * amp, 0.05 * s * amp],
      chest: [0.02, -0.04 * s * amp, -0.03 * s * amp],
      head: [-0.02, 0.05 * s * amp, 0],
      ...wings(0.05 + 0.07 * Math.cos(phase * 2) * amp, 0, 0.03),
      ...leg('L', s, liftL),
      ...leg('R', -s, liftR),
      ...t,
    },
    -1.2 * amp + 1.2 * amp * Math.abs(Math.cos(phase)),
  );
}

/** 一組動作：clawK = 待機時爪子的開合；tailKeys(t) = 尾巴 */
function poseSet(parts: readonly PartDef[], clawK: number, tailKeys: (t: number) => Key): PoseSet {
  const onGround = (angles: Key, rootZ = 0): Pose => grounded(parts, hipHeight, { rootY: 0, rootZ, angles }, 'all');
  const fold = (k: number): Key => ({
    thighL: [-0.7 * k, 0, 0.1 * k], thighR: [-0.7 * k, 0, -0.1 * k], shinL: [1.2 * k, 0, 0], shinR: [1.2 * k, 0, 0], footL: [-0.5 * k, 0, 0], footR: [-0.5 * k, 0, 0],
  });
  const deathKeys = [
    pose({ root: [-0.12, 0, 0], head: [-0.12, 0, 0], ...claws(-0.15), ...wings(0.45, -0.1, 0.1), ...tailDown(0, 0) }, 1, -1),
    onGround({ root: [0.15, 0.05, 0.03], ...claws(0.5), ...fold(0.6), ...wings(-0.25, 0.1, -0.15), ...tailDown(0, 0) }, 1),
    onGround({ root: [0.42, 0.08, 0.05], head: [0.1, 0, 0], ...claws(1), ...fold(1), ...wings(-0.5, 0.2, -0.3), ...tailDown(0, 0) }, 2),
  ];
  const t0 = tailKeys(0);
  /** 爪子一口氣合起來咬住：往後蓄力、整個身體往前撲 */
  const SNAP = {
    windup: [pose({ root: [-0.06, 0, 0], ...claws(-0.1), ...wings(0.1), ...t0 }, 0.6, -1), pose({ root: [-0.1, 0, 0], ...claws(-0.2), ...wings(0.2), ...t0 }, 1, -2.4)],
    strike: [pose({ root: [0.14, 0, 0], head: [0.05, 0, 0], ...claws(0.85), ...wings(-0.12), ...t0 }, -1.5, 6), pose({ root: [0.1, 0, 0], ...claws(0.6), ...wings(-0.06), ...t0 }, -1, 4.5)],
  };
  /** 翅膀搧風（擊退）：高舉往後 → 一起往前往下搧 */
  const GUST = {
    windup: [pose({ root: [-0.05, 0, 0], ...claws(clawK), ...wings(0.35, -0.35, 0.15), ...t0 }, 0.6, -0.8), pose({ root: [-0.12, 0, 0], ...claws(clawK), ...wings(0.55, -0.6, 0.3), ...t0 }, 1, -1.6)],
    strike: [pose({ root: [0.12, 0, 0], ...claws(clawK), ...wings(-0.08, 0.75, -0.1), ...t0 }, -1, 2.5), pose({ root: [0.08, 0, 0], ...claws(clawK), ...wings(-0.02, 0.5, -0.05), ...t0 }, -0.6, 1.5)],
  };
  /** 重擊（跳起落地前後）：蹲低、落地時翅膀往下壓 */
  const SLAM = {
    windup: [pose({ ...fold(0.4), ...claws(clawK), ...wings(0.4, 0, 0.2), ...t0 }, -5), pose({ ...fold(0.65), root: [0.08, 0, 0], ...claws(clawK), ...wings(0.6, 0, 0.3), ...t0 }, -8)],
    strike: [pose({ ...fold(0.5), root: [0.12, 0, 0], ...claws(clawK), ...wings(-0.05, 0.1, -0.1), ...t0 }, -6), pose({ ...fold(0.3), root: [0.06, 0, 0], ...claws(clawK), ...wings(0, 0.05, -0.05), ...t0 }, -3)],
  };
  const castRelease = clawK > 0.5
    ? // 收合時的施法：尾巴的臉往前甩，吐出火彈
      pose({ root: [0.02, 0, 0], ...claws(clawK), ...wings(0.05), ...tailUp(0, 1, 1) })
    : // 張開時的施法（吐息、火雨）：爪子開到最大、眼球往前頂
      pose({ root: [0.1, 0, 0], head: [0.04, 0, 0], ...claws(-0.35), ...mouth(0.2), ...wings(-0.1, 0.25, -0.1), ...t0 }, -1, 3);
  return {
    ready: (t) =>
      pose(
        {
          chest: [0.012 * Math.sin(t * 0.8), 0.012 * Math.sin(t * 0.4), 0],
          head: [0.012 * Math.sin(t * 0.6), 0.04 * Math.sin(t * 0.35), 0],
          // 爪子開開合合，翅膀慢慢起伏
          ...claws(clawK + (clawK > 0.5 ? 0 : 0.05 + 0.05 * Math.sin(t * 0.8)), t),
          ...wings(0.05 + 0.05 * Math.sin(t * 0.9), 0.02 * Math.sin(t * 0.45), 0.03 * Math.sin(t * 0.9 - 0.8)),
          ...tailKeys(t),
          ...breathe(t),
        },
        0.5 * Math.sin(t * 0.9),
      ),
    walk: (phase) => gait(phase, 1, { ...claws(clawK, phase), ...tailKeys(phase * 0.5), ...breathe(phase * 0.5) }),
    run: (phase) => gait(phase, 1.2, { ...claws(clawK, phase), ...tailKeys(phase * 0.6), ...breathe(phase * 0.6) }),
    attackWindup: SNAP.windup[1]!,
    attackStrike: SNAP.strike[0]!,
    attackChain: SNAP,
    attackVariants: { slash: GUST, overhead: SLAM },
    castWindup: clawK > 0.5
      ? pose({ ...claws(clawK), ...wings(0.05), ...tailUp(0, 1.12, -0.5) })
      : pose({ root: [-0.1, 0, 0], ...claws(-0.25), ...mouth(-0.08), ...wings(0.3, -0.25, 0.12), ...t0 }, 0.8, -1.5),
    castRelease,
    hit: pose({ root: [-0.05, 0, 0.02], head: [-0.1, 0, 0], ...claws(clawK + 0.15), ...wings(0.15, 0, 0.1), ...t0 }, 0.3, -1),
    hitKeys: [
      pose({ head: [-0.1, 0, 0], ...claws(clawK + 0.1), ...t0 }),
      pose({ root: [-0.05, 0, 0.02], head: [-0.1, 0, 0], ...claws(clawK + 0.15), ...wings(0.15, 0, 0.1), ...t0 }, 0.3, -1),
      pose({ root: [-0.02, 0, 0], ...claws(clawK + 0.05), ...t0 }, -0.2, -0.5),
    ],
    dead: deathKeys[2]!,
    deathKeys,
  };
}

const OPEN = poseSet(figure.parts, 0, (t) => tailDown(t));
const SHUT = poseSet(figure.parts, 1, (t) => tailUp(t));
const BARE = poseSet(figure.parts, 0, () => ({}));

export const ABYSS_DRAGON: FigureModel = {
  hipHeight,
  referenceRadius: 0.5,
  visualScale: VISUAL,
  parts: figure.parts,
  poses: OPEN,
  skin: figure.skin,
  gaitRate: 0.55,
  dynamicShadow: true,
  softLight: true,
  rimLight: 0.2,
  phasePoses: [OPEN, SHUT, BARE],
  // 第三階段尾巴脫離
  phaseHidden: [[], [], ['ex_tail']],
  phaseBlendTime: 1.1,
};

// ─── 脫離的尾巴：反過來由臉帶頭爬行 ───

/** 轉 180°（臉朝前）、臉當骨盆：每節的支點換到靠臉的一端 */
function reversedTail(): AiMonsterData {
  const flip = (p: number[]) => [-p[0]!, p[1]!, -p[2]!];
  const rename = (j: string) => (j === 'ex_tailHead' ? 'root' : j === 'root' ? 'ex_tailEnd' : j);
  const joints: Record<string, number[]> = { root: flip(tail.joints.ex_tailHead!) };
  const tips: Record<string, number[]> = { root: flip(tail.tips.ex_tailHead!) };
  const parents: Record<string, string | null> = { root: null };
  let parent = 'root';
  for (let i = SEGMENTS; i >= 1; i--) {
    const j = `ex_tail${i}`;
    joints[j] = flip(tail.tips[j]!);
    tips[j] = flip(tail.joints[j]!);
    parents[j] = parent;
    parent = j;
  }
  joints.ex_tailEnd = flip(tail.tips.root!);
  tips.ex_tailEnd = flip(tail.joints.root!);
  parents.ex_tailEnd = parent;
  return {
    joints,
    tips,
    parents,
    verts: tail.verts.map(flip),
    weights: (tail.weights as [string, number][][]).map((list) => list.map(([b, w]) => [rename(b), w])),
    // 轉 180° 不是鏡射，面的方向不變（頂點順序不能反過來，否則只畫背對鏡頭的面，看到模型內側）
    faces: tail.faces,
  };
}

const wormData = reversedTail();
const worm = aiFigure(wormData, { scale: SCALE }, () => I3);
const wormHip = (wormData.joints.root![1]! - Math.min(...wormData.verts.map((v) => v[1]!))) * SCALE;

/** 蛇行：波從臉往後傳；amp = 幅度 */
function slither(t: number, amp: number): Key {
  const out: Key = {};
  let i = 1;
  for (let n = SEGMENTS; n >= 1; n--, i++) out[`ex_tail${n}`] = [0, 0.26 * amp * Math.sin(t - i * 0.9), 0];
  out.ex_tailEnd = [0, 0.26 * amp * Math.sin(t - i * 0.9), 0];
  return out;
}

const wormPoses: PoseSet = (() => {
  const raise = (k: number): Key => {
    const near: V3 = [0.2 * k, 0, 0];
    const next: V3 = [0.12 * k, 0, 0];
    return { root: [-0.32 * k, 0, 0], [`ex_tail${SEGMENTS}`]: near, [`ex_tail${SEGMENTS - 1}`]: next };
  };
  const strike = { windup: [pose({ ...raise(1), ...slither(0, 0.3) }, 4, -1.5)], strike: [pose({ root: [0.2, 0, 0], ...slither(1, 0.3) }, -1, 5), pose({ root: [0.1, 0, 0], ...slither(1.5, 0.3) }, 0, 3)] };
  const dead = pose({ root: [0.05, 0, 0.5], ...slither(2, 0.9) });
  return {
    ready: (t) => pose({ ...raise(0.55 + 0.1 * Math.sin(t)), ...slither(t * 1.2, 0.5) }, 1 + 0.6 * Math.sin(t)),
    run: (phase) => pose({ ...raise(0.35), ...slither(phase * 1.1, 1) }),
    attackWindup: strike.windup[0]!,
    attackStrike: strike.strike[0]!,
    attackChain: strike,
    castWindup: pose({ ...raise(1.25), ...slither(0, 0.3) }, 5, -1),
    castRelease: pose({ ...raise(0.4), ...slither(0.5, 0.3) }, 1, 2),
    hit: pose({ ...raise(1.1), ...slither(0, 0.6) }, 1.5, -1.5),
    dead,
    deathKeys: [pose({ ...raise(1.2), ...slither(1, 1) }, 3), dead],
  };
})();

/** 第三階段脫離的尾巴（enemy.abyss_tail）：比例和接在本體上時相同 */
export const ABYSS_TAIL: FigureModel = {
  hipHeight: wormHip,
  referenceRadius: 0.5,
  visualScale: VISUAL * 1.6,
  shadowScale: 0.45,
  parts: worm.parts,
  poses: wormPoses,
  skin: worm.skin,
  gaitRate: 0.7,
  softLight: true,
  rimLight: 0.2,
};
