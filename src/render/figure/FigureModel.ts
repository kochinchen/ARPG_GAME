import { apply, jointRotation, mul, rotY, type M3, type Mesh, type V3 } from './Poly3D';

/**
 * 以關節組成的角色模型。每個關節掛在父關節上（offset 為父關節座標中的位置），
 * 身上掛著幾個多面體網格。姿勢 = 每個關節的旋轉角度（弧度）。
 *
 * 模型座標：Y 向上、Z 為角色面向的前方、+X 為角色的「左手邊」（-X 為右手，拿劍）。
 */
export type Joint =
  | 'root'
  | 'torso'
  | 'neck'
  | 'head'
  | 'ponytail'
  | 'upperArmL'
  | 'forearmL'
  | 'handL'
  | 'upperArmR'
  | 'forearmR'
  | 'handR'
  | 'thighL'
  | 'shinL'
  | 'footL'
  | 'thighR'
  | 'shinR'
  | 'footR'
  /** 下顎（掛在 head 上，骷髏張嘴） */
  | 'jaw'
  /** 腰布（掛在 root 上，待機與走路時擺動） */
  | 'cloth'
  /** 後腰布 */
  | 'clothBack'
  /** 胸腔（掛在 torso 上：torso = 腰、chest = 胸，讓脊椎可以彎） */
  | 'chest'
  /** 馬尾第 2～4 段（ponytail 為第 1 段） */
  | 'ponytail2'
  | 'ponytail3'
  | 'ponytail4'
  /** 圍巾的兩條尾巴（A 有兩段） */
  | 'scarfA'
  | 'scarfA2'
  | 'scarfB'
  /** 武器握點（掛在 handR 上） */
  | 'weapon'
  /** 左手的武器握點（弓） */
  | 'weaponL'
  /** 模型自訂的額外關節（手指、腳趾、披風、翅膀、尾巴、多隻腳…），名稱以 ex_ 開頭 */
  | `ex_${string}`;

export interface PartDef {
  joint: Joint;
  parent: Joint | null;
  offset: V3;
  meshes: Mesh[];
}

export interface Pose {
  /** 骨盆高度的變化（蹲低為負） */
  rootY: number;
  /** 骨盆往角色前方的位移（攻擊時重心前移；省略為 0） */
  rootZ?: number;
  angles: Partial<Record<Joint, V3>>;
}

/** 各種樣態的姿勢（t = 秒，p = 0～1 的進度） */
export interface PoseSet {
  ready(t: number): Pose;
  run(phase: number): Pose;
  attackWindup: Pose;
  attackStrike: Pose;
  castWindup: Pose;
  castRelease: Pose;
  hit: Pose;
  dead: Pose;
  /** 走路（可省略：移動較慢時使用；沒有時一律用 run） */
  walk?(phase: number): Pose;
  /** 依招式區分的多段攻擊（可省略）：橫斬、突刺、上劈 */
  attackVariants?: Partial<Record<AttackVariant, { windup: Pose[]; strike: Pose[] }>>;
  /** 受傷的分段反應（頭 → 肩 → 身體 → 骨盆），依序播放後回到原姿勢 */
  hitKeys?: Pose[];
  /** 死亡過程（失去平衡 → 跪倒 → 劍落地 → 倒地），最後一個姿勢為躺在地上 */
  deathKeys?: Pose[];
  /**
   * 多段攻擊（可省略）：前搖期間依序經過 windup 的姿勢（預備 → 引拍 → 重心前移 → 揮出），
   * 命中後依序經過 strike 的姿勢（命中 → 收勢），最後收回。沒有時只用 attackWindup / attackStrike。
   */
  attackChain?: { windup: Pose[]; strike: Pose[] };
}

/** 待機怒吼第一次開始的時間（秒）；之後每 period 秒一次 */
export const IDLE_ROAR_OFFSET = 3;

export interface FigureModel {
  /** 依父子順序排列（父關節在前） */
  parts: PartDef[];
  /** 骨盆（root）站直時的高度 */
  hipHeight: number;
  /** 設計時對應的碰撞半徑：實際大小 = 角色半徑 ÷ referenceRadius（精英、Boss 較大） */
  referenceRadius: number;
  /** 外觀倍率（只放大畫面上的模型、影子與血條位置，不影響碰撞與遊戲數值；預設 1） */
  visualScale?: number;
  poses: PoseSet;
  /** 待機時不定期仰天怒吼的節奏（與 bossPoses 的 idleRoar 相同；用來同步吼聲） */
  idleRoar?: { period: number; duration: number };
  /** 武器尖端在右手（handR）座標中的位置：用來畫武器拖尾（裝備光芒） */
  weaponTip?: V3;
  /** 腳下影子隨站姿（兩腳距離）改變寬度、隨重心前後偏移 */
  dynamicShadow?: boolean;
  /** 武器尖端所在的關節（預設 handR） */
  weaponJoint?: Joint;
  /**
   * 次級運動（馬尾、圍巾、腰布）：這些關節的方向以 rate（每秒反應速度）延遲跟隨目標，
   * 身體轉動時會先停在原處再甩過來。gravity：目標方向往正下方偏的比例（0～1）。clampTo / maxZ：在該關節座標中方向的 z 不可超過 maxZ（馬尾不穿過頭）。
   */
  secondary?: Partial<Record<Joint, { rate: number; gravity?: number; clampTo?: Joint; maxZ?: number }>>;
  /** 背光面的暖色輪廓光強度（0～1） */
  rimLight?: number;
  /** 走路 / 跑步的步頻倍率（沉重的魔王 < 1） */
  gaitRate?: number;
  /** 柔和光線（wrap lighting）：背光面不會一下子變很暗，明暗沿著表面漸變 */
  softLight?: boolean;
  /** 魔王階段變化時不再畫的關節（index = 階段；例如第 2 階段盾牌碎裂、第 3 階段巨劍落地） */
  phaseHidden?: readonly (readonly Joint[])[];
  /** 魔王階段變化時掉在地上、留在場上的物件（index = 階段；模型與相對魔王的位置） */
  phaseDrops?: readonly ({ model: FigureModel; offset: [number, number] } | null)[];
}

/** 招式：劍 / 斧的橫斬、突刺、上劈；弓的拉弓射擊；法杖的舉杖施法 */
export type AttackVariant = 'slash' | 'thrust' | 'overhead' | 'shoot' | 'staff';

export const JOINTS: readonly Joint[] = [
  'root',
  'torso',
  'neck',
  'head',
  'ponytail',
  'upperArmL',
  'forearmL',
  'handL',
  'upperArmR',
  'forearmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
  'jaw',
  'cloth',
  'clothBack',
  'chest',
  'ponytail2',
  'ponytail3',
  'ponytail4',
  'scarfA',
  'scarfA2',
  'scarfB',
  'weapon',
  'weaponL',
];

/** 兩個姿勢之間插值 */
export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const angles: Partial<Record<Joint, V3>> = {};
  for (const j of JOINTS) {
    const x = a.angles[j] ?? [0, 0, 0];
    const y = b.angles[j] ?? [0, 0, 0];
    angles[j] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  // 額外關節（ex_…）：兩個姿勢任一有的都插值
  for (const src of [a.angles, b.angles]) {
    for (const j of Object.keys(src) as Joint[]) {
      if (!j.startsWith('ex_') || angles[j]) continue;
      const x = a.angles[j] ?? [0, 0, 0];
      const y = b.angles[j] ?? [0, 0, 0];
      angles[j] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
    }
  }
  const az = a.rootZ ?? 0;
  const bz = b.rootZ ?? 0;
  return { rootY: a.rootY + (b.rootY - a.rootY) * k, ...(az || bz ? { rootZ: az + (bz - az) * k } : {}), angles };
}

/** 依序經過多個姿勢：t = 0～1，平均分段，每段 easeOut */
export function samplePoses(keys: readonly Pose[], t: number): Pose {
  const n = keys.length - 1;
  if (n <= 0) return keys[0]!;
  const x = Math.min(0.9999, Math.max(0, t)) * n;
  const i = Math.floor(x);
  const f = x - i;
  return lerpPose(keys[i]!, keys[i + 1]!, 1 - (1 - f) * (1 - f));
}

/** 正向運動學：每個關節在模型空間（已轉身 yaw）的旋轉與位置 */
export type JointFrames = Map<Joint, { m: M3; p: V3 }>;

/** adjust：可改寫某個關節的區域角度（次級運動用；parentM 為父關節的旋轉） */
export function solveJoints(
  parts: readonly PartDef[],
  hipHeight: number,
  pose: Pose,
  yaw = 0,
  adjust?: (joint: Joint, angles: V3, parentM: M3, world: JointFrames) => V3,
): JointFrames {
  const world: JointFrames = new Map();
  for (const part of parts) {
    const raw = pose.angles[part.joint] ?? [0, 0, 0];
    const angles = adjust && part.parent !== null ? adjust(part.joint, raw, world.get(part.parent)!.m, world) : raw;
    const local = jointRotation(angles);
    if (part.parent === null) {
      const z = pose.rootZ ?? 0;
      world.set(part.joint, { m: mul(rotY(yaw), local), p: [Math.sin(yaw) * z, hipHeight + pose.rootY, Math.cos(yaw) * z] });
    } else {
      const parent = world.get(part.parent)!;
      const o = apply(parent.m, part.offset);
      world.set(part.joint, { m: mul(parent.m, local), p: [parent.p[0] + o[0], parent.p[1] + o[1], parent.p[2] + o[2]] });
    }
  }
  return world;
}

/** 讓腳踩在地上：調整 rootY，使兩腳（或 'all' = 全身，倒地用）網格的最低點剛好在 y = 0 */
export function grounded(parts: readonly PartDef[], hipHeight: number, pose: Pose, feet: readonly Joint[] | 'all' = ['footL', 'footR']): Pose {
  const world = solveJoints(parts, hipHeight, { ...pose, rootY: 0 });
  let low = Infinity;
  for (const part of parts) {
    if (feet !== 'all' && !feet.includes(part.joint)) continue;
    const { m, p } = world.get(part.joint)!;
    for (const mesh of part.meshes) for (const v of mesh.verts) low = Math.min(low, p[1] + apply(m, v)[1]);
  }
  return { ...pose, rootY: Number.isFinite(low) ? -low : pose.rootY };
}

/** 模型在畫面上的縮放：角色半徑 ÷ 設計半徑 × 外觀倍率 */
export const figureScale = (model: FigureModel, radius: number): number => (radius / model.referenceRadius) * (model.visualScale ?? 1);
