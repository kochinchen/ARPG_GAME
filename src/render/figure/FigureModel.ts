import type { Mesh, V3 } from './Poly3D';

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
  | 'footR';

export interface PartDef {
  joint: Joint;
  parent: Joint | null;
  offset: V3;
  meshes: Mesh[];
}

export interface Pose {
  /** 骨盆高度的變化（蹲低為負） */
  rootY: number;
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
}

export interface FigureModel {
  /** 依父子順序排列（父關節在前） */
  parts: PartDef[];
  /** 骨盆（root）站直時的高度 */
  hipHeight: number;
  /** 設計時對應的碰撞半徑：實際大小 = 角色半徑 ÷ referenceRadius（精英、Boss 較大） */
  referenceRadius: number;
  poses: PoseSet;
}

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
];

/** 兩個姿勢之間插值 */
export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const angles: Partial<Record<Joint, V3>> = {};
  for (const j of JOINTS) {
    const x = a.angles[j] ?? [0, 0, 0];
    const y = b.angles[j] ?? [0, 0, 0];
    angles[j] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  return { rootY: a.rootY + (b.rootY - a.rootY) * k, angles };
}
