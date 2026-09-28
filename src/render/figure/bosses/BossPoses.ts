import { grounded, IDLE_ROAR_OFFSET, type AttackVariant, type Joint, type PartDef, type Pose, type PoseSet } from '../FigureModel';
import type { V3 } from '../Poly3D';
import { flatFeet, makeStance, mergeAngles, type Angles } from '../Stance';
import { BOSS_HIP } from './BossRig';

/**
 * 人形魔王的姿勢與動畫（霸氣、厚重）：
 * - 站姿：兩腳大開、膝微彎、挺胸、肩膀往後、下巴微抬，雙臂離開身體；依武器擺出不同的威嚇姿勢。
 * - 行走：緩慢沉重的踏步（抬膝、骨盆左右擺、肩膀反向轉），頭保持朝前，武器有慣性。
 * - 攻擊：三種招式（上劈重擊 / 橫掃 / 突進），每招前搖四段（預備 → 引拍 → 重心轉移 → 揮出）、
 *   命中兩段（命中 → 收勢）；重擊落下時身體壓縮、膝蓋深彎、重心往前。
 * - 施法：仰天怒吼（雙臂張開、下顎大開）→ 往前推出。受傷反應較小（不輕易動搖）；死亡：搖晃 → 跪倒 → 往前倒下。
 */

export type BossWeapon = 'mace' | 'greatsword' | 'staff' | 'dagger' | 'fists' | 'claws';

export interface BossStyle {
  weapon: BossWeapon;
  /** 駝背程度（熔岩巨獸） */
  hunch?: number;
  /** 施法方式：roar = 仰天怒吼、staff = 舉杖 */
  cast?: 'roar' | 'staff';
  /**
   * 額外關節（翅膀、尾巴…）的動作：idle / walk 的 x 為時間或步伐相位；
   * windup / strike 的 x 為第幾個關鍵姿勢。回傳的角度疊加在身體姿勢上。
   */
  accent?: (kind: 'idle' | 'walk' | 'windup' | 'strike', x: number) => Angles;
  /** 待機時不定期仰天怒吼：每 period 秒一次、持續 duration 秒 */
  idleRoar?: { period: number; duration: number };
}

/**
 * 仰天怒吼的強度（0～1）：每 period 秒在 offset 秒後開始，0.45 秒抬頭張口、維持、最後 0.6 秒收回。
 * 翅膀、尾巴等額外關節可以用同一個強度一起動作。
 */
export function roarEnvelope(t: number, period: number, duration: number, offset = IDLE_ROAR_OFFSET): number {
  const x = (((t - offset) % period) + period) % period;
  if (x > duration) return 0;
  const up = Math.min(1, x / 0.45);
  const down = Math.min(1, (duration - x) / 0.6);
  const k = Math.min(up, down);
  return k * k * (3 - 2 * k);
}

type Side = 'L' | 'R';
/** 魔王用的三種招式（射擊、法杖是主角專用） */
type BossVariant = Extract<AttackVariant, 'overhead' | 'slash' | 'thrust'>;
type ArmFn = (lean: number) => Angles;

function add(base: Pose, extra: Angles, rootY = base.rootY): Pose {
  const angles: Angles = { ...base.angles };
  for (const [j, v] of Object.entries(extra) as [Joint, V3][]) {
    const b = angles[j] ?? [0, 0, 0];
    angles[j] = [b[0] + v[0], b[1] + v[1], b[2] + v[2]];
  }
  return { ...base, rootY, angles };
}

/**
 * 手臂在身體正前方的平面上：upperWorld = 上臂相對鉛直（0 下垂、−π/2 水平往前、−π 朝上），fore = 手肘，
 * theta = 武器（沿手的 −Y）相對「水平往前」往下的角度（π/2 = 垂直往下、−π/2 = 朝上、π = 往後），out = 往外張。
 */
const armTo =
  (side: Side, upperWorld: number, fore: number, theta: number, out = 0, twist = 0): ArmFn =>
  (lean) => {
    const upper = upperWorld - lean;
    let hand = theta - Math.PI / 2 - (lean + upper + fore);
    hand = Math.atan2(Math.sin(hand), Math.cos(hand));
    const z = side === 'R' ? -out : out;
    return { [`upperArm${side}`]: [upper, twist, z], [`forearm${side}`]: [fore, 0, 0], [`hand${side}`]: [hand, 0, 0] } as Angles;
  };

/** 手臂抬到肩高、水平方向為 yaw（負 = 往右、正 = 往左），武器順著前臂 */
const sweep =
  (side: Side, yaw: number, elbow: number, lift = 0): ArmFn =>
  () =>
    ({ [`upperArm${side}`]: [-Math.PI / 2 + lift, yaw, 0], [`forearm${side}`]: [-elbow, 0, 0], [`hand${side}`]: [elbow * 0.5, 0, 0] }) as Angles;

const both =
  (...fns: ArmFn[]): ArmFn =>
  (lean) =>
    Object.assign({}, ...fns.map((f) => f(lean))) as Angles;

/** 握拳：手指、拇指往掌心彎 */
const FIST: Angles = { ex_fingersL: [-1.3, 0, 0], ex_fingersR: [-1.3, 0, 0], ex_thumbL: [-0.6, 0, -0.4], ex_thumbR: [-0.6, 0, 0.4] };
/** 張開的爪 */
const CLAW_OPEN: Angles = { ex_fingersL: [0.35, 0, 0.15], ex_fingersR: [0.35, 0, -0.15], ex_thumbL: [0.2, 0, 0.5], ex_thumbR: [0.2, 0, -0.5] };

/** 依武器的待機手勢（站姿用；會被加在身體姿勢上） */
function idleArms(weapon: BossWeapon): ArmFn {
  switch (weapon) {
    // 右手垂握巨錘（錘頭朝前下）、左手塔盾擋在身前
    case 'mace':
      return both(armTo('R', 0.05, -0.35, 1.25, 0.32), armTo('L', -0.55, -1, 0.1, 0.2));
    // 巨劍扛在右肩（劍身往後上）、左拳垂在身側
    case 'greatsword':
      return both(armTo('R', -0.45, -2.1, -2.2, 0.3), armTo('L', 0.08, -0.25, 1.3, 0.3));
    // 左手握杖立在身側、右手掌心朝上（凝聚血光）
    case 'staff':
      return both(armTo('L', -0.15, -0.8, Math.PI / 2, 0.35), armTo('R', -0.45, -1.25, 0.4, 0.35));
    // 狂熱信徒：雙手往前、儀式短刀
    case 'dagger':
      return both(armTo('R', -0.5, -0.9, 0.4, 0.2), armTo('L', -0.45, -1, 0.9, 0.2));
    // 雙臂粗重地垂在身前、拳頭接近地面
    case 'fists':
      return both(armTo('R', -0.1, -0.35, Math.PI / 2, 0.38), armTo('L', -0.1, -0.35, Math.PI / 2, 0.38));
    // 雙臂張開、利爪外張
    // 雙臂粗壯地垂在身體兩側、稍微張開，利爪朝前下
    case 'claws':
      return both(armTo('R', -0.18, -0.55, 0.95, 0.42), armTo('L', -0.18, -0.55, 0.95, 0.42));
  }
}

/** 三種招式的身體關鍵姿勢（不含手臂）與重心前移 */
const BODY: Record<BossVariant, [Angles, number][]> = {
  overhead: [
    [{ shinL: [0.15, 0, 0], shinR: [0.15, 0, 0], thighL: [-0.08, 0, 0], thighR: [-0.08, 0, 0], chest: [0.05, 0, 0], jaw: [0.1, 0, 0] }, 0],
    [{ root: [-0.05, -0.1, 0], torso: [-0.08, 0, 0], chest: [-0.25, -0.15, 0], head: [-0.15, 0.15, 0], jaw: [0.35, 0, 0], shinR: [0.2, 0, 0] }, -1.5],
    [{ root: [-0.02, -0.05, 0], torso: [-0.1, 0, 0], chest: [-0.3, -0.1, 0], head: [-0.2, 0.1, 0], jaw: [0.45, 0, 0], thighL: [-0.2, 0, 0], shinL: [0.2, 0, 0] }, 0.5],
    [{ root: [0.1, 0.05, 0], torso: [0.1, 0, 0], chest: [0.15, 0, 0], jaw: [0.5, 0, 0], thighL: [-0.35, 0, 0], shinL: [0.4, 0, 0] }, 2.5],
    [{ root: [0.18, 0.08, 0], torso: [0.2, 0, 0], chest: [0.3, 0.05, 0], head: [0.1, 0, 0], jaw: [0.6, 0, 0], thighL: [-0.45, 0, 0], shinL: [0.75, 0, 0], thighR: [-0.1, 0, 0], shinR: [0.55, 0, 0] }, 3.4],
    [{ root: [0.16, 0.1, 0], torso: [0.18, 0, 0], chest: [0.26, 0.08, 0], head: [0.05, 0, 0], jaw: [0.4, 0, 0], thighL: [-0.45, 0, 0], shinL: [0.7, 0, 0], thighR: [-0.1, 0, 0], shinR: [0.5, 0, 0] }, 3.2],
  ],
  slash: [
    [{ shinL: [0.15, 0, 0], shinR: [0.15, 0, 0], thighL: [-0.08, 0, 0], thighR: [-0.08, 0, 0], chest: [0.05, 0, 0] }, 0],
    [{ root: [0, -0.2, 0], chest: [0, -0.3, 0], head: [0, 0.3, 0], jaw: [0.2, 0, 0], shinR: [0.25, 0, 0] }, -1],
    [{ root: [0, -0.35, 0], chest: [-0.05, -0.6, 0], head: [0, 0.6, 0], jaw: [0.35, 0, 0], shinR: [0.25, 0, 0] }, -1.3],
    [{ root: [0.05, 0.3, 0], chest: [0.05, -0.2, 0], head: [0, 0.1, 0], jaw: [0.45, 0, 0], thighL: [-0.25, 0, 0], shinL: [0.35, 0, 0] }, 1.6],
    [{ root: [0.08, 0.55, 0], chest: [0.08, 0.25, 0], head: [0, -0.35, 0], jaw: [0.55, 0, 0], thighL: [-0.35, 0, 0], shinL: [0.45, 0, 0] }, 2.4],
    [{ root: [0.06, 0.65, 0], chest: [0.06, 0.55, 0], head: [0, -0.55, 0], jaw: [0.35, 0, 0], thighL: [-0.35, 0, 0], shinL: [0.45, 0, 0] }, 2.2],
  ],
  thrust: [
    [{ shinL: [0.3, 0, 0], shinR: [0.3, 0, 0], thighL: [-0.15, 0, 0], thighR: [-0.15, 0, 0], chest: [0.08, 0, 0] }, 0],
    [{ root: [0.05, -0.3, 0], chest: [0.05, -0.25, 0], head: [0, 0.35, 0], jaw: [0.25, 0, 0], thighR: [0.1, 0, 0], shinR: [0.45, 0, 0], shinL: [0.2, 0, 0] }, -1.8],
    [{ root: [0.1, -0.2, 0], torso: [0.06, 0, 0], chest: [0.08, -0.15, 0], head: [-0.05, 0.25, 0], jaw: [0.4, 0, 0], thighL: [-0.6, 0, 0], shinL: [0.5, 0, 0], thighR: [0.25, 0, 0] }, 2.6],
    [{ root: [0.12, -0.1, 0], torso: [0.08, 0, 0], chest: [0.1, 0, 0], head: [-0.1, 0.15, 0], jaw: [0.55, 0, 0], thighL: [-0.75, 0, 0], shinL: [0.7, 0, 0], thighR: [0.35, 0, 0] }, 4.6],
    [{ root: [0.14, -0.05, 0], torso: [0.1, 0, 0], chest: [0.12, 0.05, 0], head: [-0.12, 0.1, 0], jaw: [0.6, 0, 0], thighL: [-0.8, 0, 0], shinL: [0.8, 0, 0], thighR: [0.4, 0, 0], footR: [0.3, 0, 0] }, 5.5],
    [{ root: [0.1, -0.08, 0], torso: [0.08, 0, 0], chest: [0.1, 0, 0], jaw: [0.35, 0, 0], thighL: [-0.7, 0, 0], shinL: [0.7, 0, 0], thighR: [0.35, 0, 0] }, 4.8],
  ],
};

/** 各武器三種招式的手臂關鍵姿勢（與 BODY 一一對應） */
function attackArms(weapon: BossWeapon, variant: BossVariant): ArmFn[] {
  const two = (fn: (side: Side) => ArmFn): ArmFn => both(fn('R'), fn('L'));
  switch (weapon) {
    case 'mace':
    case 'dagger': {
      const off = weapon === 'mace' ? armTo('L', -0.6, -1, 0.1, 0.2) : armTo('L', -0.4, -0.9, 0.9, 0.3);
      if (variant === 'overhead')
        return [
          both(armTo('R', -0.2, -0.6, 1.2, 0.3), off),
          both(armTo('R', -2.7, -1.2, 2.8, 0.25), off),
          both(armTo('R', -2.95, -1.3, 3, 0.2), armTo('L', -0.8, -0.9, 0.2, 0.3)),
          both(armTo('R', -2.2, -0.5, -1, 0.1), off),
          both(armTo('R', -1, -0.1, 0.7), armTo('L', -0.2, -0.8, 0.8, 0.35)),
          both(armTo('R', -0.7, -0.15, 1.1, 0.05), armTo('L', -0.2, -0.8, 0.8, 0.35)),
        ];
      if (variant === 'slash')
        return [
          both(armTo('R', -0.2, -0.6, 1.2, 0.3), off),
          both(sweep('R', -0.6, 0.6, 0.6), off),
          both(sweep('R', -1.6, 0.5, 0.1), off),
          both(sweep('R', -0.9, 0.25), off),
          both(sweep('R', -0.1, 0.05), armTo('L', -0.2, -0.8, 0.8, 0.4)),
          both(sweep('R', 0.75, 0.3, -0.15), armTo('L', -0.2, -0.8, 0.8, 0.4)),
        ];
      // 突進：巨錘 = 盾擊（左手把盾往前推）；短刀 = 往前刺
      if (weapon === 'mace')
        return [
          both(armTo('R', 0.2, -1, 1.4, 0.3), armTo('L', -0.6, -1, 0.1, 0.2)),
          both(armTo('R', 0.3, -1.2, 1.5, 0.3), armTo('L', -0.3, -1.6, -0.2, 0.1)),
          both(armTo('R', 0.3, -1.2, 1.5, 0.3), armTo('L', -0.9, -1.2, 0, 0.1)),
          both(armTo('R', 0.3, -1.2, 1.5, 0.3), armTo('L', -1.4, -0.4, 0.1)),
          both(armTo('R', 0.3, -1.2, 1.5, 0.3), armTo('L', -1.5, -0.2, 0.1)),
          both(armTo('R', 0.2, -1.1, 1.4, 0.3), armTo('L', -1.3, -0.4, 0.1)),
        ];
      return [
        both(armTo('R', -0.3, -1.2, 0.2, 0.2), off),
        both(armTo('R', 0.4, -2, 0, 0.25), off),
        both(armTo('R', -0.4, -1.1, 0, 0.1), off),
        both(armTo('R', -1.2, -0.35, 0.05), off),
        both(armTo('R', -1.5, -0.05, 0.1), armTo('L', 0.2, -0.5, 1, 0.4)),
        both(armTo('R', -1.35, -0.25, 0.15), armTo('L', 0.2, -0.5, 1, 0.4)),
      ];
    }
    case 'greatsword':
      if (variant === 'overhead')
        return [
          two((s) => armTo(s, -0.6, -1.3, -1.4, 0.15, s === 'R' ? 0.3 : -0.3)),
          two((s) => armTo(s, -2.75, -1.1, 2.7, 0.15)),
          two((s) => armTo(s, -3, -1.2, 3, 0.12)),
          two((s) => armTo(s, -2.3, -0.4, -1, 0.1)),
          two((s) => armTo(s, -1.15, -0.1, 0.6, 0.05, s === 'R' ? 0.35 : -0.35)),
          two((s) => armTo(s, -0.8, -0.15, 1, 0.05, s === 'R' ? 0.35 : -0.35)),
        ];
      if (variant === 'slash')
        return [
          two((s) => armTo(s, -0.6, -1.3, -1.4, 0.15, s === 'R' ? 0.3 : -0.3)),
          both(sweep('R', -0.7, 0.6, 0.5), sweep('L', -0.2, 1.2, 0.5)),
          both(sweep('R', -1.6, 0.5, 0.15), sweep('L', -1.1, 1.3, 0.15)),
          both(sweep('R', -0.9, 0.25), sweep('L', -0.4, 1, 0)),
          both(sweep('R', -0.1, 0.05), sweep('L', 0.35, 0.8)),
          both(sweep('R', 0.8, 0.3, -0.2), sweep('L', 1.2, 0.5, -0.2)),
        ];
      return [
        two((s) => armTo(s, -0.6, -1.3, -1.4, 0.15, s === 'R' ? 0.3 : -0.3)),
        two((s) => armTo(s, 0.25, -1.9, 0, 0.1, s === 'R' ? 0.3 : -0.3)),
        two((s) => armTo(s, -0.4, -1.15, 0, 0.05, s === 'R' ? 0.35 : -0.35)),
        two((s) => armTo(s, -1.2, -0.35, 0.05, 0, s === 'R' ? 0.4 : -0.4)),
        two((s) => armTo(s, -1.5, -0.05, 0.08, 0, s === 'R' ? 0.4 : -0.4)),
        two((s) => armTo(s, -1.35, -0.25, 0.15, 0, s === 'R' ? 0.4 : -0.4)),
      ];
    case 'staff': {
      const rest = armTo('L', -0.15, -0.8, Math.PI / 2, 0.35);
      if (variant === 'overhead')
        // 法杖高舉 → 杖底重重敲在身前的地上
        return [
          both(armTo('L', -0.4, -0.9, 1.5, 0.3), armTo('R', -0.5, -1.2, 0.4, 0.35)),
          both(armTo('L', -2.6, -0.5, Math.PI / 2 - 3.1, 0.2), armTo('R', -1.6, -0.6, 0.2, 0.5)),
          both(armTo('L', -2.9, -0.4, Math.PI / 2 - 3.2, 0.15), armTo('R', -2.2, -0.4, -0.5, 0.5)),
          both(armTo('L', -2, -0.3, -1.4, 0.15), armTo('R', -1.8, -0.3, -0.3, 0.45)),
          both(armTo('L', -0.9, -0.2, Math.PI / 2, 0.1), armTo('R', -0.3, -0.5, 1, 0.5)),
          both(armTo('L', -0.8, -0.3, Math.PI / 2, 0.1), armTo('R', -0.2, -0.5, 1, 0.5)),
        ];
      if (variant === 'slash')
        // 右手凝聚血光往左橫掃
        return [
          both(rest, armTo('R', -0.5, -1.2, 0.4, 0.35)),
          both(rest, sweep('R', -0.8, 0.8, 0.5)),
          both(rest, sweep('R', -1.7, 0.6, 0.2)),
          both(rest, sweep('R', -0.9, 0.3)),
          both(rest, sweep('R', 0, 0.05)),
          both(rest, sweep('R', 0.8, 0.3, -0.15)),
        ];
      // 右掌往前推出
      return [
        both(rest, armTo('R', -0.5, -1.4, 0, 0.3)),
        both(rest, armTo('R', 0.3, -2.1, -0.5, 0.25)),
        both(rest, armTo('R', -0.5, -1.3, -0.6, 0.1)),
        both(rest, armTo('R', -1.3, -0.4, -0.8)),
        both(rest, armTo('R', -1.55, -0.05, -0.9)),
        both(rest, armTo('R', -1.4, -0.2, -0.8)),
      ];
    }
    case 'fists':
      if (variant === 'overhead')
        // 雙拳高舉 → 往地面重錘
        return [
          two((s) => armTo(s, -0.2, -0.6, 1.4, 0.35)),
          two((s) => armTo(s, -2.7, -0.9, 2.5, 0.1, s === 'R' ? 0.25 : -0.25)),
          two((s) => armTo(s, -3, -1, 2.8, 0.05, s === 'R' ? 0.3 : -0.3)),
          two((s) => armTo(s, -2.2, -0.3, -1, 0.05, s === 'R' ? 0.3 : -0.3)),
          two((s) => armTo(s, -0.9, -0.05, 1.2, 0.05, s === 'R' ? 0.3 : -0.3)),
          two((s) => armTo(s, -0.7, -0.1, 1.4, 0.1, s === 'R' ? 0.25 : -0.25)),
        ];
      if (variant === 'slash')
        // 右臂反手橫掃
        return [
          two((s) => armTo(s, -0.2, -0.5, 1.4, 0.38)),
          both(sweep('R', -0.7, 0.8, 0.4), armTo('L', -0.5, -0.7, 1, 0.4)),
          both(sweep('R', -1.7, 0.6, 0.1), armTo('L', -0.7, -0.8, 1, 0.4)),
          both(sweep('R', -0.9, 0.3), armTo('L', -0.3, -0.6, 1.2, 0.4)),
          both(sweep('R', 0, 0.05), armTo('L', 0.1, -0.4, 1.4, 0.45)),
          both(sweep('R', 0.8, 0.3, -0.2), armTo('L', 0.1, -0.4, 1.4, 0.45)),
        ];
      // 右直拳（左手往後拉）
      return [
        two((s) => armTo(s, -0.2, -0.8, 1, 0.35)),
        both(armTo('R', 0.4, -1.9, 0.2, 0.3), armTo('L', -0.9, -1.2, 0.3, 0.3)),
        both(armTo('R', -0.3, -1.3, 0, 0.2), armTo('L', -0.5, -1.2, 0.5, 0.3)),
        both(armTo('R', -1.2, -0.4, 0), armTo('L', 0.2, -0.8, 1, 0.35)),
        both(armTo('R', -1.55, -0.05, 0), armTo('L', 0.35, -0.7, 1.1, 0.35)),
        both(armTo('R', -1.4, -0.2, 0.1), armTo('L', 0.3, -0.7, 1.1, 0.35)),
      ];
    case 'claws':
      if (variant === 'overhead')
        // 雙爪高舉 → 往下撕裂
        return [
          two((s) => armTo(s, -0.4, -0.8, 0.6, 0.6)),
          two((s) => armTo(s, -2.6, -0.8, -1.2, 0.35)),
          two((s) => armTo(s, -2.9, -0.9, -1.3, 0.3)),
          two((s) => armTo(s, -2.1, -0.4, -0.6, 0.2)),
          two((s) => armTo(s, -0.9, -0.2, 0.8, 0.15)),
          two((s) => armTo(s, -0.5, -0.3, 1.2, 0.25)),
        ];
      if (variant === 'slash')
        // 右爪橫掃、左爪跟上
        return [
          two((s) => armTo(s, -0.4, -0.8, 0.6, 0.6)),
          both(sweep('R', -0.9, 0.7, 0.3), armTo('L', -0.6, -0.8, 0.6, 0.6)),
          both(sweep('R', -1.7, 0.5, 0.1), armTo('L', -0.8, -0.8, 0.5, 0.7)),
          both(sweep('R', -0.9, 0.3), sweep('L', 1.2, 0.5, 0.2)),
          both(sweep('R', 0, 0.1), sweep('L', 0.6, 0.3)),
          both(sweep('R', 0.8, 0.3, -0.2), sweep('L', -0.2, 0.2, -0.1)),
        ];
      // 雙爪往前撲刺
      return [
        two((s) => armTo(s, -0.4, -0.8, 0.6, 0.6)),
        two((s) => armTo(s, 0.3, -1.6, 0.2, 0.5)),
        two((s) => armTo(s, -0.6, -1, 0.1, 0.3, s === 'R' ? 0.2 : -0.2)),
        two((s) => armTo(s, -1.3, -0.3, 0.1, 0.1, s === 'R' ? 0.25 : -0.25)),
        two((s) => armTo(s, -1.55, -0.05, 0.1, 0.05, s === 'R' ? 0.25 : -0.25)),
        two((s) => armTo(s, -1.4, -0.2, 0.3, 0.1, s === 'R' ? 0.2 : -0.2)),
      ];
  }
}

export function bossPoses(parts: readonly PartDef[], style: BossStyle): PoseSet {
  const hunch = style.hunch ?? 0;
  const { ground, planted } = makeStance(parts, BOSS_HIP);
  const handGrip = style.weapon === 'claws' ? CLAW_OPEN : style.weapon === 'staff' ? { ...FIST, ex_fingersR: [0.2, 0, -0.1] as V3, ex_thumbR: [0.3, 0, -0.4] as V3 } : FIST;

  /** 霸氣站姿：兩腳大開、挺胸、肩膀往後、下巴微抬 */
  const STANCE: Angles = {
    ...handGrip,
    root: [0.04 + hunch * 0.3, -0.12, 0],
    torso: [-0.02 + hunch * 0.3, 0.04, 0],
    chest: [-0.08 + hunch * 0.5, 0.06, 0],
    neck: [0.04 - hunch * 0.6, 0, 0],
    head: [-0.08 - hunch * 0.4, 0.04, 0],
    jaw: [0.05, 0, 0],
    ex_clavL: [0, 0.12, -0.05],
    ex_clavR: [0, -0.12, 0.05],
    thighL: [-0.28, 0.1, 0.22],
    shinL: [0.32, 0, 0],
    footL: [0, 0.25, -0.22],
    thighR: [0.12, -0.15, -0.22],
    shinR: [0.22, 0, 0],
    footR: [0, -0.35, 0.22],
    ex_tassetL: [0, 0, 0.1],
    ex_tassetR: [0, 0, -0.1],
    ex_capeL1: [0.12, 0, 0.08],
    ex_capeR1: [0.12, 0, -0.08],
    ex_capeC1: [0.12, 0, 0],
  };
  const idle = idleArms(style.weapon);
  const accent = style.accent ?? (() => ({}));
  /** 兩組角度相加（腳掌以外；腳掌交給 mergeAngles / flatFeet） */
  const mergeExtra = (a: Angles, b: Angles): Angles => {
    const out: Angles = { ...a };
    for (const [j, v] of Object.entries(b) as [Joint, V3][]) {
      const x = out[j] ?? [0, 0, 0];
      out[j] = [x[0] + v[0], x[1] + v[1], x[2] + v[2]];
    }
    return out;
  };
  const lean = (a: Angles) => (a.root?.[0] ?? 0) + (a.torso?.[0] ?? 0) + (a.chest?.[0] ?? 0);
  const stance = (extra: Angles, rootZ = 0, arms: ArmFn = idle): Pose => {
    const merged = mergeAngles(STANCE, extra);
    return planted({ ...merged, ...arms(lean(merged)) }, rootZ);
  };
  const BASE = stance({});

  const chain = (variant: BossVariant) => {
    const arms = attackArms(style.weapon, variant);
    const keys = BODY[variant].map(([body, z], i) => stance(mergeExtra(body, accent(i < 4 ? 'windup' : 'strike', i < 4 ? i : i - 4)), z, arms[i]!));
    return { windup: keys.slice(0, 4), strike: keys.slice(4) };
  };
  const variants = { overhead: chain('overhead'), slash: chain('slash'), thrust: chain('thrust') };

  // 施法：仰天怒吼（雙臂張開、下顎大開）→ 往前推出；舉杖的魔王改為高舉法杖
  const roarArms = (up: boolean): ArmFn =>
    style.cast === 'staff'
      ? both(armTo('L', up ? -2.8 : -1.3, -0.3, up ? -1.5 : -0.4, 0.2), armTo('R', up ? -2.4 : -1.4, -0.3, -0.8, 0.6))
      : both(armTo('R', up ? -2.5 : -1.2, -0.4, up ? -1 : 0.3, up ? 0.75 : 0.25), armTo('L', up ? -2.5 : -1.2, -0.4, up ? -1 : 0.3, up ? 0.75 : 0.25));
  const castWindup = stance(mergeExtra({ chest: [-0.35, 0, 0], neck: [-0.2, 0, 0], head: [-0.35, 0, 0], jaw: [0.75, 0, 0], shinL: [0.15, 0, 0], shinR: [0.15, 0, 0] }, accent('windup', 2)), -0.8, roarArms(true));
  const castRelease = stance(mergeExtra({ root: [0.08, 0, 0], chest: [0.2, 0, 0], head: [0.05, 0, 0], jaw: [0.55, 0, 0], thighL: [-0.25, 0, 0], shinL: [0.35, 0, 0] }, accent('strike', 0)), 1.5, roarArms(false));

  // 受傷：幅度較小（魔王不輕易動搖）
  const hitKeys = [
    stance({ neck: [-0.12, 0, 0], head: [-0.3, 0.1, 0.05], jaw: [0.35, 0, 0] }),
    stance({ neck: [-0.15, 0, 0], head: [-0.25, 0.1, 0.05], chest: [-0.12, 0.08, 0.04], jaw: [0.4, 0, 0] }, -0.4),
    stance({ head: [-0.15, 0.05, 0], torso: [-0.1, 0, 0], chest: [-0.15, 0.08, 0.05], jaw: [0.3, 0, 0], shinL: [0.1, 0, 0], shinR: [0.1, 0, 0] }, -0.8),
    stance({ root: [-0.06, 0.04, 0], chest: [-0.06, 0.04, 0], shinL: [0.15, 0, 0], shinR: [0.15, 0, 0] }, -1),
  ];

  // 死亡：搖晃 → 單膝跪地（武器脫手）→ 往前倒下 → 趴在地上
  const onGround = (angles: Angles, rootZ = 0): Pose => grounded(parts, BOSS_HIP, { rootY: 0, rootZ, angles: { ...handGrip, ...angles } }, 'all');
  const deathKeys = [
    stance({ chest: [-0.3, 0.15, 0.1], head: [-0.4, 0.1, 0.1], jaw: [0.7, 0, 0], shinL: [0.25, 0, 0], shinR: [0.3, 0, 0] }, -1, both(armTo('R', 0.2, -0.3, 1.5, 0.4), armTo('L', 0.2, -0.3, 1.5, 0.4))),
    onGround({ root: [0.15, -0.2, 0], torso: [0.25, 0, 0], chest: [0.3, 0.1, 0], head: [0.35, 0.1, 0], jaw: [0.6, 0, 0], thighL: [-0.9, 0, 0.15], shinL: [1.1, 0, 0], thighR: [0.1, 0, -0.15], shinR: [1.7, 0, 0], footR: [-0.6, 0, 0], upperArmR: [0.2, 0, -0.3], upperArmL: [-0.3, 0, 0.3], forearmL: [-0.6, 0, 0], weapon: [1, 0, 0.8] }),
    onGround({ root: [0.95, -0.2, 0.2], torso: [0.2, 0, 0], chest: [0.2, 0.1, 0], head: [0.3, 0.3, 0.2], jaw: [0.5, 0, 0], thighL: [-0.7, 0, 0.2], shinL: [1.2, 0, 0], thighR: [-0.4, 0, -0.1], shinR: [1.1, 0, 0], upperArmR: [-0.9, 0, -0.9], upperArmL: [-0.9, 0, 0.9], weapon: [1.5, 0, 1.2] }),
    onGround({ root: [1.5, -0.25, 0.15], torso: [0.05, 0, 0], chest: [0.05, 0.1, 0], head: [0.2, 0.9, 0.2], jaw: [0.7, 0, 0], thighL: [-0.4, 0, 0.3], shinL: [0.6, 0, 0], thighR: [-0.15, 0, -0.2], shinR: [0.4, 0, 0], upperArmR: [-1.5, 0, -1], upperArmL: [-1.6, 0, 0.9], forearmL: [0.4, 0, 0], weapon: [1.5, 0, 1.4] }),
  ];

  return {
    /** 待機：沉重的呼吸（胸口起伏、肩膀微聳）、頭緩緩掃視、武器微動、下顎輕顫 */
    ready: (t) => {
      const b = Math.sin(t * 1.6);
      const r = style.idleRoar ? roarEnvelope(t, style.idleRoar.period, style.idleRoar.duration) : 0;
      // 怒吼時的顫抖（咆哮的震動感）
      const shake = r * Math.sin(t * 38) * 0.025;
      const roar: Angles = r
        ? {
            torso: [-0.12 * r, 0, 0],
            chest: [-0.32 * r + shake, 0, 0],
            neck: [-0.3 * r, 0, 0],
            head: [-0.5 * r + shake, 0, 0],
            jaw: [0.85 * r, 0, 0],
            ex_clavL: [0, 0, 0.18 * r],
            ex_clavR: [0, 0, -0.18 * r],
            upperArmL: [-0.55 * r, 0, 0.45 * r],
            upperArmR: [-0.55 * r, 0, -0.45 * r],
            forearmL: [-0.5 * r, 0, 0],
            forearmR: [-0.5 * r, 0, 0],
            ex_fingersL: [0.8 * r, 0, 0],
            ex_fingersR: [0.8 * r, 0, 0],
          }
        : {};
      const breath = add(
        BASE,
        {
          chest: [b * 0.035, Math.sin(t * 0.5) * 0.04, 0],
          ex_clavL: [0, 0, b * 0.04],
          ex_clavR: [0, 0, -b * 0.04],
          neck: [-b * 0.02, Math.sin(t * 0.35) * 0.12, 0],
          head: [Math.sin(t * 0.7 + 1) * 0.03, Math.sin(t * 0.35 + 0.6) * 0.1, 0],
          jaw: [Math.max(0, Math.sin(t * 1.3)) * 0.08, 0, 0],
          handR: [Math.sin(t * 1.4) * 0.04, 0, 0],
          handL: [Math.sin(t * 1.2 + 1) * 0.03, 0, 0],
          ...accent('idle', t),
        },
        BASE.rootY + b * 0.45 - r * 0.8,
      );
      return r ? add(breath, roar) : breath;
    },
    /** 行走：緩慢沉重的踏步（高抬膝、骨盆左右擺、肩膀反向轉），頭保持朝前，武器落後 */
    run: (p) => {
      const s = Math.sin(p);
      const hipYaw = -0.14 * s;
      const chestYaw = 0.2 * s;
      const walk = mergeAngles(STANCE, {
        root: [0.06, hipYaw + 0.12, 0.06 * s],
        torso: [0.02, 0.05 * s, -0.05 * s],
        chest: [0.04, chestYaw - 0.06, 0.03 * s],
        neck: [0, -(hipYaw + chestYaw) * 0.8, 0],
        thighL: [-0.2 - 0.45 * s + 0.28, -0.1, -0.1],
        shinL: [0.25 + 0.95 * Math.max(0, Math.cos(p)) - 0.32, 0, 0],
        thighR: [-0.2 + 0.45 * s - 0.12, 0.15, 0.12],
        shinR: [0.25 + 0.95 * Math.max(0, -Math.cos(p)) - 0.22, 0, 0],
        ex_capeL1: [0.35, 0, 0],
        ex_capeC1: [0.35, 0, 0],
        ex_capeR1: [0.35, 0, 0],
        cloth: [0.2, 0, 0],
        ...accent('walk', p),
      });
      const arms = idle(lean(walk));
      const swing = (j: Joint, k: number) => {
        const v = arms[j] ?? [0, 0, 0];
        arms[j] = [v[0] + k, v[1], v[2]];
      };
      swing('upperArmR', -0.22 * s);
      swing('upperArmL', 0.22 * s);
      swing('handR', Math.sin(p - 0.6) * 0.12);
      return ground({ rootY: 0, angles: flatFeet({ ...walk, ...arms }) });
    },
    attackWindup: variants.overhead.windup[1]!,
    attackStrike: variants.overhead.strike[0]!,
    castWindup,
    castRelease,
    hit: hitKeys[2]!,
    dead: deathKeys[deathKeys.length - 1]!,
    attackChain: variants.overhead,
    attackVariants: variants,
    hitKeys,
    deathKeys,
  };
}
