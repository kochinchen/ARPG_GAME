import { grounded, type AttackVariant, type Joint, type PartDef, type Pose, type PoseSet } from '../FigureModel';
import type { V3 } from '../Poly3D';
import { flatFeet, makeStance, mergeAngles, type Angles } from '../Stance';
import { SWORD_CANT } from './HeroineWeapon';

/** 弓拿在左手時，手腕轉多少讓弓身直立（配合 WeaponLooks 的弓角度） */
export const BOW_UPRIGHT = 1.95;
/** 杖頭方向與劍尖方向的角度差（WeaponLooks：杖 π + 0.35、劍 SWORD_CANT − π/2） */
export const STAFF_OFFSET = Math.PI + 0.35 - (SWORD_CANT - Math.PI / 2);

/**
 * 女主角的姿勢與動畫（全部建立在關節上：骨盆 → 腰 → 胸 → 肩 → 肘 → 腕 → 劍）。
 *
 * - 戰鬥站姿：兩腳約肩寬、左腳稍前、膝微彎；骨盆往右轉、胸口反向補償一點，右肩略後、左肩略前；
 *   右臂自然下垂、肘微彎、手腕略往外，劍尖朝前下。
 * - 走路：交叉擺臂、骨盆與肩膀反向轉、頭保持朝前；跑步：前傾、步幅大、抬膝、擺臂大、重心低。
 * - 三種攻擊（前搖期間：預備 → 重心轉移 → 引拍 → 骨盆轉 → 胸口轉＋揮劍；命中後：命中 → 收勢）。
 * - 受傷：頭 → 肩 → 身體 → 骨盆依序反應；死亡：失去平衡 → 跪倒 → 劍落地 → 倒地。
 * 馬尾、圍巾、腰布的延遲擺動由 PolyFigure 的次級運動處理，這裡只給目標角度。
 */

function add(base: Pose, extra: Angles, rootY = base.rootY): Pose {
  const angles: Angles = { ...base.angles };
  for (const [j, v] of Object.entries(extra) as [Joint, V3][]) {
    const b = angles[j] ?? [0, 0, 0];
    angles[j] = [b[0] + v[0], b[1] + v[1], b[2] + v[2]];
  }
  return { ...base, rootY, angles };
}

/** 頭髮、圍巾、腰布自然下垂的目標角度 */
const HANG: Angles = {
  ponytail: [0.55, 0, 0],
  ponytail2: [-0.3, 0, 0],
  ponytail3: [-0.15, 0, 0],
  ponytail4: [-0.05, 0, 0],
  scarfA: [0.3, 0, 0.12],
  scarfA2: [-0.1, 0, 0],
  scarfB: [0.25, 0, -0.1],
  cloth: [0.02, 0, 0],
  clothBack: [-0.03, 0, 0],
};

const STANCE_ANGLES: Angles = {
  ...HANG,
  root: [0.05, -0.2, 0.02],
  torso: [0.03, 0.05, -0.03],
  chest: [0.04, 0.05, 0.02],
  neck: [-0.02, 0.05, 0],
  head: [-0.03, 0.08, 0.04],
  upperArmR: [0.05, 0, -0.12],
  forearmR: [-0.45, 0, 0],
  handR: [0.1, 0.25, 0.1],
  upperArmL: [-0.25, 0, 0.18],
  forearmL: [-0.6, 0, 0],
  handL: [0.1, 0, 0],
  thighL: [-0.3, 0.1, 0.07],
  shinL: [0.3, 0, 0],
  footL: [0, 0.2, -0.07],
  thighR: [0.12, -0.05, -0.08],
  shinR: [0.18, 0, 0],
  footR: [0, -0.35, 0.08],
};

export function heroinePoses(parts: readonly PartDef[], hip: number): PoseSet {
  const { ground, planted } = makeStance(parts, hip);
  const STANCE = planted(STANCE_ANGLES);
  /**
   * extra 疊加在站姿上；arm 直接取代右手的角度（揮劍時不受站姿的手肘角度影響），
   * 可以是「身體前傾角 → 角度」的函式（armTo 用）。
   */
  const stance = (extra: Angles, rootZ = 0, arm: Angles | ((lean: number) => Angles) = {}): Pose => {
    const merged = mergeAngles(STANCE_ANGLES, extra);
    const lean = (merged.root?.[0] ?? 0) + (merged.torso?.[0] ?? 0) + (merged.chest?.[0] ?? 0);
    return planted({ ...merged, ...(typeof arm === 'function' ? arm(lean) : arm) }, rootZ);
  };
  /**
   * 右手在身體正前方的平面上揮動：upperWorld = 上臂相對鉛直的角度（0 下垂、−π/2 水平往前、−π 朝上），
   * fore = 手肘彎曲，blade = 劍身相對「水平往前」往下的角度（負 = 往上、π = 往後）。
   * 會扣掉身體的前傾，並算出手腕角度讓劍身落在指定方向。
   */
  const armTo = (upperWorld: number, fore: number, blade: number, out = 0) => (lean: number): Angles => {
    const upper = upperWorld - lean;
    let hand = blade - SWORD_CANT - (lean + upper + fore);
    hand = Math.atan2(Math.sin(hand), Math.cos(hand));
    return { upperArmR: [upper, 0, out], forearmR: [fore, 0, 0], handR: [hand, 0, 0] };
  };

  // ─────────────── 攻擊一：橫斬（劍在右後方 → 水平往左前方掃） ───────────────
  // 手臂抬到肩高（x = -π/2），劍身順著前臂（handR x ≈ π/2 − 劍的傾角）；
  // 手臂的水平方向由上臂的 y（繞垂直軸）決定：負 = 往右、正 = 往左。
  const ALONG = Math.PI / 2 - SWORD_CANT - 0.1;
  const slashArm = (yaw: number, elbow: number, lift = 0): Angles => ({ upperArmR: [-Math.PI / 2 + lift, yaw, 0], forearmR: [-elbow, 0, 0], handR: [ALONG + elbow * 0.6, 0, 0] });
  const slash: { windup: Pose[]; strike: Pose[] } = {
    windup: [
      // 1 預備：微蹲
      stance({ shinL: [0.15, 0, 0], shinR: [0.15, 0, 0], thighL: [-0.08, 0, 0], thighR: [-0.08, 0, 0], chest: [0.05, 0, 0], handR: [0.1, 0, 0] }),
      // 2 重心移到後腳，身體開始往右扭
      stance({ root: [0, -0.15, -0.03], chest: [0, -0.2, 0], head: [0, 0.2, 0], thighR: [0.05, 0, 0], shinR: [0.25, 0, 0], upperArmR: [0.2, 0, -0.5], forearmR: [-0.3, 0, 0] }, -1),
      // 3 引拍：胸口往右扭、劍拉到右後方（水平，肘彎）
      stance({ root: [0, -0.3, 0], chest: [-0.05, -0.55, 0], head: [0, 0.55, 0], upperArmL: [-1.1, 0.5, 0.1], forearmL: [-0.3, 0, 0], shinR: [0.2, 0, 0] }, -1.2, slashArm(-1.6, 0.5, 0.1)),
      // 4 骨盆先往左轉（胸口與手還留在後面）
      stance({ root: [0.05, 0.2, 0], chest: [0, -0.75, 0], head: [0, 0.3, 0], upperArmL: [-1, 0.4, 0.1], thighL: [-0.15, 0, 0], shinL: [0.2, 0, 0] }, 0.5, slashArm(-1.65, 0.5, 0.1)),
      // 5 胸口跟上、右肩帶動手臂，劍掃到右前方
      stance({ root: [0.05, 0.4, 0], chest: [0.05, -0.3, 0], head: [0, -0.05, 0], upperArmL: [-0.4, 0, 0.3], thighL: [-0.25, 0, 0], shinL: [0.3, 0, 0] }, 1.5, slashArm(-0.9, 0.25)),
    ],
    strike: [
      // 6 命中：劍在正前方，手臂伸直
      stance({ root: [0.06, 0.5, 0], chest: [0.08, 0.1, 0], head: [0, -0.4, 0], upperArmL: [0.2, 0, 0.45], thighL: [-0.3, 0, 0], shinL: [0.35, 0, 0] }, 2, slashArm(-0.1, 0.05)),
      // 7 收勢：劍停在左前方（不立刻收回）
      stance({ root: [0.05, 0.55, 0], chest: [0.06, 0.4, 0], head: [0, -0.6, 0], upperArmL: [0.35, 0, 0.5], thighL: [-0.3, 0, 0], shinL: [0.35, 0, 0] }, 1.8, slashArm(0.75, 0.3, -0.15)),
    ],
  };

  // ─────────────── 攻擊二：突刺（後腳蓄力、身體壓低 → 前腳踏出、推髖、手臂伸直） ───────────────
  const thrust: { windup: Pose[]; strike: Pose[] } = {
    windup: [
      stance({ shinL: [0.3, 0, 0], shinR: [0.3, 0, 0], thighL: [-0.15, 0, 0], thighR: [-0.15, 0, 0], chest: [0.06, 0, 0] }),
      stance({ root: [0.04, -0.3, 0], chest: [0.02, -0.25, 0], head: [0, 0.4, 0], thighR: [0.1, 0, 0], shinR: [0.45, 0, 0], shinL: [0.2, 0, 0] }, -1.8, armTo(0.2, -1.2, 0.3, -0.2)),
      // 引拍：劍收到右腰側、劍尖朝前（水平）
      stance({ root: [0.05, -0.35, 0], chest: [0.03, -0.3, 0], head: [0, 0.45, 0], upperArmL: [-0.9, 0, 0.2], forearmL: [-0.4, 0, 0], thighR: [0.1, 0, 0], shinR: [0.5, 0, 0], shinL: [0.25, 0, 0] }, -2, armTo(0.45, -2, 0, -0.25)),
      // 前腳踏出、推髖
      stance({ root: [0.08, -0.2, 0], torso: [0.04, 0, 0], chest: [0.04, -0.15, 0], head: [-0.05, 0.3, 0], upperArmL: [-0.4, 0, 0.35], thighL: [-0.6, 0, 0], shinL: [0.5, 0, 0], thighR: [0.25, 0, 0] }, 2.5, armTo(-0.4, -1.15, 0, -0.15)),
      // 手臂往前伸出
      stance({ root: [0.08, -0.15, 0], torso: [0.05, 0, 0], chest: [0.05, -0.05, 0], head: [-0.1, 0.2, 0], upperArmL: [0.2, 0, 0.45], thighL: [-0.75, 0, 0], shinL: [0.7, 0, 0], thighR: [0.35, 0, 0] }, 4.5, armTo(-1.2, -0.35, 0.05)),
    ],
    strike: [
      stance({ root: [0.1, -0.1, 0], torso: [0.06, 0, 0], chest: [0.06, 0, 0], head: [-0.12, 0.15, 0], upperArmL: [0.35, 0, 0.5], thighL: [-0.8, 0, 0], shinL: [0.8, 0, 0], thighR: [0.4, 0, 0], footR: [0.3, 0, 0] }, 5.6, armTo(-1.5, -0.05, 0.08, 0.05)),
      stance({ root: [0.08, -0.12, 0], torso: [0.05, 0, 0], chest: [0.05, 0, 0], upperArmL: [0.3, 0, 0.45], thighL: [-0.7, 0, 0], shinL: [0.7, 0, 0], thighR: [0.35, 0, 0] }, 4.8, armTo(-1.35, -0.25, 0.15, 0.05)),
    ],
  };

  // ─────────────── 攻擊三：上劈（劍舉過肩 → 肩、胸、脊椎、骨盆一起往下，落下時身體壓縮、膝蓋彎） ───────────────
  const overhead: { windup: Pose[]; strike: Pose[] } = {
    windup: [
      stance({ shinL: [0.15, 0, 0], shinR: [0.15, 0, 0], thighL: [-0.08, 0, 0], thighR: [-0.08, 0, 0], handR: [0.15, 0, 0] }),
      stance({ root: [-0.03, -0.1, 0], chest: [-0.05, -0.1, 0], shinR: [0.25, 0, 0] }, -1, armTo(-1.4, -1, -0.6, -0.15)),
      // 劍舉到頭後（劍尖朝後下）、胸口後仰、左手往前平衡
      stance({ root: [-0.05, -0.15, 0], torso: [-0.1, 0, 0], chest: [-0.2, -0.2, 0], head: [0.1, 0.25, 0], upperArmL: [-1.3, 0, 0.25], forearmL: [-0.3, 0, 0], shinR: [0.2, 0, 0] }, -1.2, armTo(-2.85, -1.1, 2.6, -0.2)),
      stance({ root: [0.05, 0, 0], torso: [-0.05, 0, 0], chest: [-0.15, -0.15, 0], head: [0.1, 0.2, 0], upperArmL: [-1.1, 0, 0.25], thighL: [-0.2, 0, 0], shinL: [0.2, 0, 0] }, 0.8, armTo(-2.9, -1.2, 2.75, -0.2)),
      // 往下劈：劍尖朝上 → 前方
      stance({ root: [0.1, 0.05, 0], torso: [0.05, 0, 0], chest: [0.15, 0, 0], head: [0, 0.1, 0], upperArmL: [-0.5, 0, 0.3], thighL: [-0.3, 0, 0], shinL: [0.35, 0, 0] }, 1.8, armTo(-2.45, -0.4, -1.2, -0.1)),
    ],
    strike: [
      // 命中：身體壓縮、膝蓋彎、手臂往前下伸直，劍尖朝前下
      stance(
        { root: [0.2, 0.08, 0], torso: [0.2, 0, 0], chest: [0.3, 0.05, 0], head: [-0.15, 0, 0], upperArmL: [0.2, 0, 0.4], thighL: [-0.45, 0, 0], shinL: [0.7, 0, 0], thighR: [-0.05, 0, 0], shinR: [0.5, 0, 0] },
        2.2,
        armTo(-1.1, -0.1, 0.55),
      ),
      stance(
        { root: [0.22, 0.1, 0], torso: [0.2, 0, 0], chest: [0.28, 0.08, 0], head: [-0.15, 0, 0], upperArmL: [0.25, 0, 0.4], thighL: [-0.45, 0, 0], shinL: [0.75, 0, 0], thighR: [-0.05, 0, 0], shinR: [0.55, 0, 0] },
        2,
        armTo(-0.75, -0.15, 0.95, 0.1),
      ),
    ],
  };

  // ─────────────── 弓：側身、左手舉弓指向目標 → 右手搭箭拉弦到下巴 → 放箭、右手順勢往後 ───────────────
  // 身體往右轉（左肩朝前），左臂的 y 補回來指向正前方；左手腕轉 90° 讓弓身直立。
  const TURN = 0.85;
  const bowArm = (lift = 0): Angles => ({ upperArmL: [-Math.PI / 2 + lift, TURN, 0], forearmL: [-0.05, 0, 0], handL: [BOW_UPRIGHT, 0, 0] });
  const archer = (extra: Angles, rootZ = 0): Pose =>
    stance({ root: [0.02, -TURN * 0.55, 0], chest: [0, -TURN * 0.45, 0], head: [0, TURN * 0.9, 0], thighL: [-0.3, 0.3, 0.1], shinL: [0.3, 0, 0], thighR: [0.15, -0.1, -0.12], ...extra }, rootZ);
  const shoot: { windup: Pose[]; strike: Pose[] } = {
    windup: [
      // 1 側身、舉弓
      archer({ ...bowArm(0.35), upperArmR: [-0.6, 0.6, -0.1], forearmR: [-1.2, 0, 0] }),
      // 2 搭箭：右手到弓把
      archer({ ...bowArm(0.05), upperArmR: [-1.45, TURN - 0.1, 0], forearmR: [-0.25, 0, 0], handR: [0, 0, 0] }, -0.3),
      // 3 拉弦：右肘往後、手到下巴
      archer({ ...bowArm(), upperArmR: [-1.5, 0.15, 0], forearmR: [-2.1, 0, 0], handR: [0.3, 0, 0], chest: [-0.03, -TURN * 0.5, 0] }, -0.6),
      // 4 滿弓：肘再往後
      archer({ ...bowArm(), upperArmR: [-1.55, -0.35, 0.05], forearmR: [-2.45, 0, 0], handR: [0.3, 0, 0], chest: [-0.05, -TURN * 0.55, 0] }, -0.8),
    ],
    strike: [
      // 5 放箭：右手往後彈開、弓臂微微往前送
      archer({ ...bowArm(-0.05), upperArmR: [-1.4, -0.75, 0.1], forearmR: [-1.3, 0, 0], handR: [0.2, 0, 0.3], chest: [-0.02, -TURN * 0.5, 0] }, -0.4),
      // 6 收勢
      archer({ ...bowArm(0.2), upperArmR: [-0.9, -0.5, 0], forearmR: [-1, 0, 0] }, -0.2),
    ],
  };

  // ─────────────── 法杖：杖頭高舉聚能 → 往前推出放出法術（左手張開輔助施法） ───────────────
  // 杖在手上的角度與劍不同（杖頭朝上），這裡直接指定杖頭方向（相對水平往前，負 = 往上）。
  const staffTo = (upperWorld: number, fore: number, head: number, out = 0) => armTo(upperWorld, fore, head - STAFF_OFFSET, out);
  const staffCast: { windup: Pose[]; strike: Pose[] } = {
    windup: [
      stance({ shinL: [0.12, 0, 0], shinR: [0.12, 0, 0] }, 0, staffTo(-0.6, -0.9, -1.5)),
      // 舉杖：杖頭高舉過頭、身體微後仰、左手往前張開
      stance({ root: [-0.03, -0.15, 0], torso: [-0.06, 0, 0], chest: [-0.12, -0.15, 0], head: [-0.15, 0.15, 0], upperArmL: [-1.1, 0.3, 0.3], forearmL: [-0.4, 0, 0], shinR: [0.2, 0, 0] }, -0.8, staffTo(-2.6, -0.6, -1.9, -0.1)),
      // 聚能：杖頭最高點
      stance({ root: [-0.04, -0.2, 0], torso: [-0.08, 0, 0], chest: [-0.15, -0.2, 0], head: [-0.2, 0.2, 0], upperArmL: [-1.4, 0.4, 0.35], forearmL: [-0.2, 0, 0], shinR: [0.25, 0, 0] }, -1, staffTo(-2.9, -0.4, -1.7, -0.1)),
    ],
    strike: [
      // 放出：杖頭往前推（斜上前方）、前腳踏出、左手收回
      stance({ root: [0.08, 0.1, 0], torso: [0.06, 0, 0], chest: [0.12, 0.05, 0], head: [-0.05, 0, 0], upperArmL: [-0.4, 0, 0.4], thighL: [-0.45, 0, 0], shinL: [0.45, 0, 0], thighR: [0.2, 0, 0] }, 2.4, staffTo(-1.5, -0.15, -1.05)),
      stance({ root: [0.06, 0.05, 0], torso: [0.04, 0, 0], chest: [0.08, 0, 0], upperArmL: [-0.2, 0, 0.35], thighL: [-0.35, 0, 0], shinL: [0.4, 0, 0] }, 1.6, staffTo(-1.2, -0.4, -1.25)),
    ],
  };

  const variants: Record<AttackVariant, { windup: Pose[]; strike: Pose[] }> = { slash, thrust, overhead, shoot, staff: staffCast };

  // ─────────────── 受傷：頭先 → 肩 → 身體彎 → 骨盆落後 ───────────────
  const hitKeys = [
    stance({ neck: [-0.2, 0, 0], head: [-0.5, 0.1, 0.1] }),
    stance({ neck: [-0.25, 0, 0], head: [-0.45, 0.1, 0.1], chest: [-0.2, 0.1, 0.05], upperArmR: [0.3, 0, -0.35], upperArmL: [0.35, 0, 0.4], handR: [-0.3, 0, 0] }, -0.5),
    stance({ neck: [-0.15, 0, 0], head: [-0.3, 0.05, 0.05], torso: [-0.2, 0, 0], chest: [-0.3, 0.12, 0.08], upperArmR: [0.35, 0, -0.4], upperArmL: [0.4, 0, 0.45], handR: [-0.35, 0, 0] }, -1.2),
    stance({ root: [-0.12, 0.05, 0], torso: [-0.12, 0, 0], chest: [-0.15, 0.06, 0.04], upperArmR: [0.15, 0, -0.2], upperArmL: [0.2, 0, 0.25], shinL: [0.2, 0, 0], shinR: [0.2, 0, 0] }, -1.6),
  ];

  // ─────────────── 死亡：失去平衡 → 膝蓋跪倒 → 劍落地 → 身體倒下 → 頭跟著 → 馬尾最後落地 ───────────────
  const onGround = (angles: Angles, rootZ = 0): Pose => grounded(parts, hip, { rootY: 0, rootZ, angles: { ...HANG, ...angles } }, 'all');
  const deathKeys = [
    stance({ chest: [-0.3, 0.2, 0.1], head: [-0.35, 0.1, 0.1], upperArmR: [0.3, 0, -0.35], upperArmL: [0.2, 0, 0.35], forearmR: [0.3, 0, 0], handR: [-0.4, 0, 0], shinL: [0.2, 0, 0], shinR: [0.3, 0, 0] }, -1),
    // 跪倒：膝蓋著地、身體往前垂
    onGround({ root: [0.15, -0.2, 0], torso: [0.2, 0, 0], chest: [0.25, 0.1, 0], head: [0.3, 0.1, 0], thighL: [-0.35, 0, 0.1], shinL: [1.75, 0, 0], footL: [-0.6, 0, 0], thighR: [-0.1, 0, -0.1], shinR: [1.9, 0, 0], footR: [-0.4, 0, 0], upperArmR: [0.15, 0, -0.2], forearmR: [0.2, 0, 0], handR: [0.4, 0, 0], weapon: [0.9, 0, 0.6], upperArmL: [0.1, 0, 0.3] }),
    // 劍脫手、身體往側前方倒
    onGround({ root: [0.9, -0.3, 0.4], torso: [0.2, 0, 0], chest: [0.2, 0.1, 0.1], head: [0.3, 0.3, 0.2], thighL: [-0.6, 0, 0.2], shinL: [1.3, 0, 0], thighR: [-0.4, 0, -0.1], shinR: [1.2, 0, 0], upperArmR: [-0.6, 0, -0.9], forearmR: [0.3, 0, 0], handR: [0.6, 0, 0], weapon: [1.5, 0, 1.2], upperArmL: [-0.8, 0, 0.9] }),
    // 倒地：側身趴在地上、頭側向一邊
    onGround({ root: [1.45, -0.35, 0.25], torso: [0.05, 0, 0], chest: [0.05, 0.1, 0], head: [0.2, 0.9, 0.2], neck: [0, 0.2, 0], thighL: [-0.5, 0, 0.25], shinL: [0.9, 0, 0], thighR: [-0.2, 0, -0.15], shinR: [0.5, 0, 0], upperArmR: [-1.2, 0, -1.1], forearmR: [0.4, 0, 0], handR: [0.5, 0, 0], weapon: [1.5, 0, 1.4], upperArmL: [-1.6, 0, 0.9], forearmL: [0.5, 0, 0], ponytail: [1.2, 0, 0.4], ponytail2: [0.1, 0, 0] }),
  ];

  const castWindup = stance({ chest: [-0.15, 0.1, 0], upperArmL: [-0.3, 0, -0.6], forearmL: [-2, 0, 0], upperArmR: [-0.1, 0, -0.3], forearmR: [-0.4, 0, 0], handR: [-0.5, 0, 0] });
  const castRelease = stance({ root: [0.05, -0.3, 0], chest: [0.1, -0.2, 0], upperArmL: [-1.5, 0, 0.1], forearmL: [-0.05, 0, 0], handL: [-0.2, 0, 0], upperArmR: [-0.1, 0, -0.3], forearmR: [-0.4, 0, 0], handR: [-0.5, 0, 0] }, 0.8);

  return {
    /** 待機：呼吸、骨盆輕微移動重心、頭輕晃、劍尖微動、頭髮與圍巾輕擺 */
    ready: (t) => {
      const b = Math.sin(t * 2.1);
      const sway = Math.sin(t * 0.6);
      return add(
        STANCE,
        {
          root: [0, sway * 0.03, sway * 0.02],
          torso: [0, -sway * 0.02, -sway * 0.015],
          chest: [b * 0.02, 0, 0],
          neck: [-b * 0.012, 0, 0],
          head: [Math.sin(t * 0.9 + 1) * 0.03, Math.sin(t * 0.7) * 0.08, 0],
          handR: [Math.sin(t * 1.7) * 0.04, 0, Math.sin(t * 1.2) * 0.03],
          ponytail: [b * 0.04, 0, Math.sin(t * 0.8) * 0.05],
          scarfA: [Math.sin(t * 1.3) * 0.06, 0, 0],
          scarfB: [Math.sin(t * 1.1 + 1) * 0.06, 0, 0],
        },
        STANCE.rootY + b * 0.25,
      );
    },
    /** 走路：交叉擺臂、骨盆與肩膀反向轉、頭保持朝前、劍有慣性 */
    walk: (p) => {
      const s = Math.sin(p);
      const hipYaw = -0.12 * s;
      const chestYaw = 0.16 * s;
      return ground({
        rootY: 0,
        angles: flatFeet({
          ...HANG,
          root: [0.04, -0.05 + hipYaw, 0.02 * s],
          torso: [0.02, 0, -0.015 * s],
          chest: [0.03, chestYaw, 0],
          neck: [0, -(hipYaw + chestYaw) * 0.85, 0],
          head: [-0.03, 0.03, 0],
          thighL: [-0.1 - 0.4 * s, 0, 0.05],
          shinL: [0.15 + 0.65 * Math.max(0, Math.cos(p)), 0, 0],
          footL: [0, 0.1, -0.05],
          thighR: [-0.1 + 0.4 * s, 0, -0.05],
          shinR: [0.15 + 0.65 * Math.max(0, -Math.cos(p)), 0, 0],
          footR: [0, -0.1, 0.05],
          upperArmR: [0.05 - 0.25 * s, 0, -0.12],
          forearmR: [-0.45, 0, 0],
          handR: [0.1 + Math.sin(p - 0.6) * 0.1, 0.25, 0.1],
          upperArmL: [0.05 + 0.35 * s, 0, 0.15],
          forearmL: [-0.4, 0, 0],
          ponytail: [0.7, 0, 0],
          scarfA: [0.55, 0, 0.1],
          scarfB: [0.5, 0, -0.1],
          cloth: [0.15 + 0.08 * Math.sin(p * 2), 0, 0],
          clothBack: [0.2, 0, 0],
        }),
      });
    },
    /** 跑步：身體前傾、步幅大、抬膝、擺臂大、重心低；馬尾、圍巾往後飄 */
    run: (p) => {
      const s = Math.sin(p);
      const hipYaw = -0.15 * s;
      const chestYaw = 0.25 * s;
      const pose = ground({
        rootY: 0,
        angles: flatFeet({
          ...HANG,
          root: [0.18, hipYaw, 0],
          torso: [0.08, 0, 0],
          chest: [0.12, chestYaw, 0],
          neck: [-0.2, -(hipYaw + chestYaw) * 0.8, 0],
          head: [-0.1, 0, 0],
          thighL: [-0.4 - 0.62 * s, 0, 0.05],
          shinL: [0.45 + 1.1 * Math.max(0, Math.cos(p)), 0, 0],
          footL: [0, 0.05, 0],
          thighR: [-0.4 + 0.62 * s, 0, -0.05],
          shinR: [0.45 + 1.1 * Math.max(0, -Math.cos(p)), 0, 0],
          footR: [0, -0.05, 0],
          upperArmR: [-0.1 - 0.5 * s, 0, -0.15],
          forearmR: [-1, 0, 0],
          handR: [0.35 + Math.sin(p - 0.6) * 0.15, 0.25, 0.1],
          upperArmL: [-0.1 + 0.7 * s, 0, 0.12],
          forearmL: [-1.2, 0, 0],
          ponytail: [1.3, 0, 0],
          ponytail2: [0.05, 0, 0],
          scarfA: [1.35, 0, 0.1],
          scarfB: [1.25, 0, -0.1],
          cloth: [0.55 + 0.1 * Math.sin(p * 2), 0, 0],
          clothBack: [0.65, 0, 0],
        }),
      });
      return { ...pose, rootY: pose.rootY + Math.abs(Math.cos(p)) * 0.8 };
    },
    attackWindup: slash.windup[2]!,
    attackStrike: slash.strike[0]!,
    castWindup,
    castRelease,
    hit: hitKeys[2]!,
    dead: deathKeys[deathKeys.length - 1]!,
    attackChain: slash,
    attackVariants: variants,
    hitKeys,
    deathKeys,
  };
}
