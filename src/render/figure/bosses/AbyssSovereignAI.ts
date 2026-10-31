import { aiFigure, aiPoints, alignDown, I3, sub, type AiMonsterData } from '../AiRig';
import { solveJoints, type FigureModel, type Joint, type Pose, type PoseSet } from '../FigureModel';
import { apply, jointRotation, mul, placeMesh, rotY, type M3, type Mesh, type V3 } from '../Poly3D';
import { ABYSS_SOVEREIGN_ROAR, ABYSS_SOVEREIGN_SECONDARY, ABYSS_SOVEREIGN_STYLE, still } from './AbyssSovereign';
import { bossPoses } from './BossPoses';
import { BOSS_HIP, bossSecondary } from './BossRig';
import DATA from './abyssSovereignAI.json';

/**
 * 35F 深淵統御者（AI 版）：設計者的參考圖 + 舊版模型 + 30F 深淵魔王 → ChatGPT 設計稿 → 四視圖（不拿劍盾）→ 微軟 TRELLIS，
 * 巨劍與獸顱巨盾另外生成；由 scripts/monster_ai.py 減面、接上骨架、算好權重（正面多長出的尾巴在減面前切掉），輸出 abyssSovereignAI.json。
 *
 * 關節名稱與舊版相同（魔王的人形上身 + 獸身 ex_barrel + 後腳 ex_h*），動作沿用 ABYSS_SOVEREIGN_STYLE（四足對角步伐、巨劍招式、低吼張翅）。
 * - 四肢、後腳、尾巴在遊戲的靜止姿勢是筆直往下，所以轉正（只轉方向、不改形狀）；尾巴由動作抬到身後。
 * - 翅膀：動作平時把翅膀往前轉 0.35 弧度，先往後轉同樣的角度抵銷，待機時是 AI 模型往後斜張的角度。
 * - 巨劍（weapon）與盾牌（weaponL）是獨立的網格：大小照舊版（劍柄在原點、劍身往 -y），
 *   第 2 階段盾牌落地、第 3 階段巨劍插在地上（phaseHidden / phaseDrops），留在場上。
 * - 每個階段的持武器方式不同（phasePoses）：舉劍舉盾 → 雙手持劍 → 雙手往前、手掌微張，隨呼吸與步伐輕微前後擺動。
 * 單位：骨盆高度與其他魔王相同（BOSS_HIP），其餘依 AI 模型的比例。
 */

type Prop = { verts: number[][]; faces: number[][] };
const data = DATA as AiMonsterData & { props: { sword: Prop; shield: Prop } };
const { J, TIP } = aiPoints(data);

/** 翅膀往後轉的角度（抵銷動作平時的往前轉） */
const WING_BACK = 0.35;

/** 各關節轉正的旋轉：四肢、後腳與尾巴轉成往下、翅膀往後轉，其餘不轉 */
function rotOf(j: string): M3 {
  const limb = /^(upperArm|forearm|hand|ex_fingers|thigh|shin|foot|ex_toe|ex_hthigh|ex_hshin|ex_hfoot)([LR])$/.exec(j);
  if (limb) {
    const s = limb[2]!;
    switch (limb[1]) {
      case 'upperArm':
        return alignDown(sub(J(`forearm${s}`), J(`upperArm${s}`)));
      case 'forearm':
      case 'hand':
      case 'ex_fingers':
        return alignDown(sub(J(`hand${s}`), J(`forearm${s}`)));
      case 'thigh':
        return alignDown(sub(J(`shin${s}`), J(`thigh${s}`)));
      case 'ex_hthigh':
        return alignDown(sub(J(`ex_hshin${s}`), J(`ex_hthigh${s}`)));
      case 'ex_hshin':
      case 'ex_hfoot':
        return alignDown(sub(J(`ex_hfoot${s}`), J(`ex_hshin${s}`)));
      default:
        return alignDown(sub(J(`foot${s}`), J(`shin${s}`)));
    }
  }
  if (/^ex_tail\d$/.test(j)) return alignDown(sub(TIP(j), J(j)));
  const wing = /^ex_wing([LR])\d$/.exec(j);
  if (wing) return rotY((wing[1] === 'L' ? 1 : -1) * WING_BACK);
  return I3;
}

const { parts, skin } = aiFigure(data, { hip: BOSS_HIP }, rotOf);

// ── 巨劍與盾牌：AI 生成的獨立網格（公尺）→ 關節的區域座標 ──
const bounds = (p: Prop) => {
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const v of p.verts) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k]!, v[k]!)), (hi[k] = Math.max(hi[k]!, v[k]!));
  return { lo, hi, c: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] as V3 };
};
const propMesh = (p: Prop, map: (v: V3) => V3): Mesh => ({
  verts: p.verts.map((v) => map([v[0]!, v[1]!, v[2]!])),
  faces: p.faces.map((f) => ({ idx: [f[0]!, f[1]!, f[2]!], color: f[3]! })),
});

/** 巨劍全長（遊戲單位，與舊版相同：劍柄頂 +5 到劍尖 -46） */
const SWORD_LEN = 51;
/** 巨劍：劍尖朝下、劍鋒朝前；握點在護手（上半段最寬處）與劍柄頂之間，放在原點 */
const SWORD: Mesh = (() => {
  const p = data.props.sword;
  const { lo, hi, c } = bounds(p);
  const k = SWORD_LEN / (hi[1] - lo[1]);
  const top = p.verts.filter((v) => v[1]! > hi[1] - (hi[1] - lo[1]) * 0.35);
  const guard = top.reduce((a, v) => (Math.abs(v[0]! - c[0]) > Math.abs(a[0]! - c[0]) ? v : a))[1]!;
  const grip = guard + (hi[1] - guard) * 0.4;
  // 劍鋒朝前（+z）、劍面朝兩側：AI 生成的劍面朝前，繞劍身轉 90°
  return propMesh(p, (v) => [(v[2] - c[2]) * k, (v[1] - grip) * k, -(v[0] - c[0]) * k]);
})();

/** 盾牌高度（遊戲單位，與舊版相同） */
const SHIELD_HEIGHT = 42;
/** 盾牌：盾面朝前（+z），以中心為原點 */
const SHIELD_CENTERED = (() => {
  const p = data.props.shield;
  const { lo, hi, c } = bounds(p);
  const k = SHIELD_HEIGHT / (hi[1] - lo[1]);
  return { mesh: propMesh(p, (v) => [(v[0] - c[0]) * k, (v[1] - c[1]) * k, (v[2] - c[2]) * k]), depth: (hi[2] - lo[2]) * k };
})();
/** 拿在左手上：中心比握點稍高、稍微往外，背面（握把）貼著手 */
const SHIELD: Mesh = placeMesh(SHIELD_CENTERED.mesh, [0, 0, 0], [2, 5, SHIELD_CENTERED.depth / 2]);

/** 握點離手腕的距離（拳頭中心） */
const GRIP = 3;
// 動作的貼地計算不算劍盾（否則劍尖先碰地、身體被抬高；第 3 階段劍已落地，倒地時會浮在半空）
const bodyParts = [...parts];
parts.push(
  { joint: 'weapon', parent: 'handR', offset: [0, -GRIP, 0], meshes: [SWORD] },
  { joint: 'weaponL', parent: 'handL', offset: [0, -GRIP, 0], meshes: [SHIELD] },
);

// ─────────────────────────── 三個階段的動作 ───────────────────────────
// 動作沿用舊版（ABYSS_SOVEREIGN_STYLE），依階段改手臂：
// 1. 劍與盾：雙手往前舉、劍尖朝上、盾面朝前；2. 盾掉了：雙手持劍（左手用 IK 握住劍柄，揮劍時也跟著）；
// 3. 劍也掉了：雙手往前、手掌微張，待機與走路時兩手輕微前後交替擺動（施法時往上舉、往前推）。

type Angles = Partial<Record<Joint, V3>>;
type Kind = 'stand' | 'action' | 'hit' | 'dead';
const withAngles = (p: Pose, a: Angles): Pose => ({ ...p, angles: { ...p.angles, ...a } });

/** 把一套動作的每個姿勢改過：stand = 待機 / 走路 / 跑步，action = 攻擊與施法，hit = 受傷，dead = 倒地 */
function mapPoses(set: PoseSet, edit: (p: Pose, kind: Kind) => Pose): PoseSet {
  const each = (keys: readonly Pose[] | undefined, kind: Kind) => keys?.map((k) => edit(k, kind));
  const chain = (c: { windup: Pose[]; strike: Pose[] } | undefined) => c && { windup: each(c.windup, 'action')!, strike: each(c.strike, 'action')! };
  const variants = set.attackVariants && (Object.fromEntries(Object.entries(set.attackVariants).map(([k, v]) => [k, chain(v)])) as PoseSet['attackVariants']);
  const hitKeys = each(set.hitKeys, 'hit');
  const deathKeys = each(set.deathKeys, 'dead');
  const attackChain = chain(set.attackChain);
  return {
    ready: (t) => edit(set.ready(t), 'stand'),
    run: (p) => edit(set.run(p), 'stand'),
    ...(set.walk ? { walk: (p: number) => edit(set.walk!(p), 'stand') } : {}),
    attackWindup: edit(set.attackWindup, 'action'),
    attackStrike: edit(set.attackStrike, 'action'),
    castWindup: edit(set.castWindup, 'action'),
    castRelease: edit(set.castRelease, 'action'),
    hit: edit(set.hit, 'hit'),
    dead: edit(set.dead, 'dead'),
    ...(variants ? { attackVariants: variants } : {}),
    ...(hitKeys ? { hitKeys } : {}),
    ...(deathKeys ? { deathKeys } : {}),
    ...(attackChain ? { attackChain } : {}),
  };
}

/** 劍尖朝上：手臂（上臂 + 前臂 + 手）往前抬的總角度，巨劍再轉到朝上 */
const swordUp = (armX: number): V3 => [-Math.PI - armX, 0, 0];
/**
 * 鎖骨往前帶（肩膀前移）：這隻 AI 模型的手臂比胸甲短，肩膀不往前，手往前伸也埋在肩甲與胸甲裡。
 * k = 往前轉的角度（弧度）。
 */
const shouldersForward = (k: number): Angles => ({ ex_clavL: [0, -k, 0], ex_clavR: [0, k, 0] });
/** 第 1 階段：雙手從身體兩側往前舉，右手的劍尖朝上、左手的盾面朝前 */
const GUARD: Angles = {
  ...shouldersForward(0.35),
  upperArmR: [-0.75, 0, -0.35],
  forearmR: [-1.0, 0, 0],
  handR: [0, 0, 0],
  weapon: swordUp(-1.75),
  upperArmL: [-0.7, 0, 0.35],
  forearmL: [-1.0, 0, 0],
  handL: [0, 0, 0],
  weaponL: [1.7, 0, 0],
};
/** 第 2 階段：站著時劍在身體正前方、劍尖朝上（之後由 twoHanded 讓雙手握住劍柄） */
const TWO_HANDED: Angles = {
  upperArmR: [-0.8, 0.45, 0],
  forearmR: [-0.9, 0, 0],
  handR: [0, 0, 0],
  weapon: swordUp(-1.7),
};
/** 第 3 階段：雙手從身體兩側往前、手掌微張；raise = 再往上舉、reach = 前臂再伸直 */
const OPEN_HANDS = (raise: number, reach: number, swingL = 0, swingR = 0): Angles => ({
  ...shouldersForward(0.35),
  upperArmL: [-1.0 - raise - swingL, -0.1, 0.3],
  forearmL: [-0.5 + reach, 0, 0],
  handL: [-0.55, 0, 0],
  ex_fingersL: [0.3, 0, 0.12],
  upperArmR: [-1.0 - raise - swingR, 0.1, -0.3],
  forearmR: [-0.5 + reach, 0, 0],
  handR: [-0.55, 0, 0],
  ex_fingersR: [0.3, 0, -0.12],
});

const tApply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const transpose = (m: M3): M3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const scaleV = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** 關節靜止時往下（0, −1, 0）；轉到方向 w（父關節座標）的角度（不扭轉） */
const aim = (w: V3): V3 => [Math.atan2(-w[2], -w[1]), 0, Math.asin(Math.max(-1, Math.min(1, w[0] / len(w))))];
/** 旋轉矩陣 → 關節角度（jointRotation 的反運算：Ry · Rx · Rz） */
const toAngles = (m: M3): V3 => [Math.asin(Math.max(-1, Math.min(1, -m[5]))), Math.atan2(m[2], m[8]), Math.atan2(m[3], m[4])];
const offsetLen = (j: Joint) => len(parts.find((p) => p.joint === j)!.offset);
const UPPER = offsetLen('forearmL');
const FORE = offsetLen('handL');
/** 左手握在右手往劍柄頂端多遠 */
const HILT_SHIFT = 5;

/** 兩節 IK：上臂、前臂的角度，讓手腕到 target（手肘往 hint 方向彎）；回傳角度與前臂的世界旋轉 */
function reach(world: ReturnType<typeof solveJoints>, side: 'L' | 'R', target: V3, hint: V3): { upper: V3; fore: V3; foreM: M3 } {
  const shoulder = world.get(`upperArm${side}`)!.p;
  const parent = world.get(`ex_clav${side}`)!.m;
  const d = sub(target, shoulder);
  const dist = Math.max(1, Math.min(len(d), (UPPER + FORE) * 0.999));
  const u = scaleV(d, 1 / (len(d) || 1));
  const along = hint[0] * u[0] + hint[1] * u[1] + hint[2] * u[2];
  const vRaw = sub(hint, scaleV(u, along));
  const v = scaleV(vRaw, 1 / (len(vRaw) || 1));
  const a = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const elbow = addV(shoulder, addV(scaleV(u, a), scaleV(v, h)));
  const upper = aim(tApply(parent, sub(elbow, shoulder)));
  const upperM = mul(parent, jointRotation(upper));
  const fore = aim(tApply(upperM, sub(addV(shoulder, scaleV(u, dist)), elbow)));
  return { upper, fore, foreM: mul(upperM, jointRotation(fore)) };
}

/**
 * 雙手持劍：劍的方向照原本的動作，握點拉到兩肩都搆得到的範圍，
 * 右手握在握點、左手握在往劍柄頂端 HILT_SHIFT 的地方（兩隻手臂都用 IK）。
 */
function twoHanded(pose: Pose): Pose {
  // 雙手握劍時肩膀往前帶得更多（兩隻手才搆得到身體正前方）
  const p = withAngles(pose, shouldersForward(0.5));
  const world = solveJoints(parts, BOSS_HIP, p);
  const sword = world.get('weapon')!;
  const shL = world.get('upperArmL')!.p;
  const shR = world.get('upperArmR')!.p;
  const center = scaleV(addV(shL, shR), 0.5);
  // 兩隻手都搆得到的範圍：以兩肩中點為球心、半徑 = √(臂長² − 半肩寬²)
  const reachR = Math.sqrt(Math.max(0, (0.95 * (UPPER + FORE)) ** 2 - (len(sub(shL, shR)) / 2) ** 2));
  const off = sub(sword.p, center);
  const grip = addV(center, scaleV(off, Math.min(1, reachR / (len(off) || 1))));
  const right = reach(world, 'R', grip, [-1, -1, 0]);
  const left = reach(world, 'L', addV(grip, apply(sword.m, [0, HILT_SHIFT, 0])), [1, -1, 0]);
  // 巨劍的世界方向不變：換算成相對右手（手的角度為 0，與前臂同方向）的角度
  const weapon = toAngles(mul(transpose(right.foreM), sword.m));
  return withAngles(p, {
    upperArmR: right.upper,
    forearmR: right.fore,
    handR: [0, 0, 0],
    weapon,
    upperArmL: left.upper,
    forearmL: left.fore,
    handL: [0, 0, 0],
    ex_fingersL: [-1.3, 0, 0],
    ex_fingersR: [-1.3, 0, 0],
  });
}

const BASE = bossPoses(bodyParts, ABYSS_SOVEREIGN_STYLE);
/** 第 1 階段：站著時舉劍舉盾（出招照舊） */
const PHASE1 = mapPoses(BASE, (p, kind) => (kind === 'stand' || kind === 'hit' ? withAngles(p, GUARD) : p));
/** 第 2 階段：雙手持劍（站著時劍在正前方；出招時左手跟著劍柄） */
const PHASE2 = mapPoses(BASE, (p, kind) => (kind === 'dead' ? p : twoHanded(kind === 'stand' || kind === 'hit' ? withAngles(p, TWO_HANDED) : p)));
/** 第 3 階段兩手前後擺動的幅度（弧度）：待機時隨呼吸慢慢擺、走路時跟著步伐交替擺 */
const IDLE_SWING = 0.28;
const WALK_SWING = 0.5;
/** 第 3 階段：雙手往前、手掌微張，兩手輕微前後交替擺動（施法前搖舉高、放出時往前推） */
const PHASE3 = (() => {
  const set = mapPoses(BASE, (p, kind) => (kind === 'hit' ? withAngles(p, OPEN_HANDS(0, 0)) : p));
  const swing = (p: Pose, x: number, amount: number) => withAngles(p, OPEN_HANDS(0, 0, Math.sin(x) * amount, -Math.sin(x) * amount));
  return {
    ...set,
    ready: (t: number) => swing(BASE.ready(t), t * 1.6, IDLE_SWING),
    run: (phase: number) => swing(BASE.run(phase), phase, WALK_SWING),
    ...(BASE.walk ? { walk: (phase: number) => swing(BASE.walk!(phase), phase, WALK_SWING) } : {}),
    castWindup: withAngles(BASE.castWindup, OPEN_HANDS(0.45, -0.35)),
    castRelease: withAngles(BASE.castRelease, OPEN_HANDS(0.05, 0.25)),
  };
})();

export const ABYSS_SOVEREIGN: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: 0.5,
  parts,
  idleRoar: ABYSS_SOVEREIGN_ROAR,
  poses: PHASE1,
  phasePoses: [PHASE1, PHASE2, PHASE3],
  skin,
  secondary: bossSecondary(parts, ABYSS_SOVEREIGN_SECONDARY),
  gaitRate: 0.5,
  dynamicShadow: true,
  softLight: true,
  rimLight: 0.2,
  // 第 2 階段（index 1）盾牌落地；第 3 階段（index 2）巨劍也落地
  phaseHidden: [[], ['weaponL'], ['weaponL', 'weapon']],
};

/** 落地的盾牌：盾面朝上平躺、微微傾斜 */
const DROPPED_SHIELD = still([placeMesh(SHIELD_CENTERED.mesh, [-Math.PI / 2 + 0.08, 0.6, 0], [0, SHIELD_CENTERED.depth / 2, 0])]);
/** 插在地上的巨劍：劍尖朝下插入地面、微微傾斜 */
const PLANTED_SWORD = still([placeMesh(SWORD, [0.18, 0.5, 0.12], [0, 34, 0])]);

ABYSS_SOVEREIGN.phaseDrops = [null, { model: DROPPED_SHIELD, offset: [2.4, 1.8] }, { model: PLANTED_SWORD, offset: [-1.6, 0.8] }];
