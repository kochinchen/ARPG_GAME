import { grounded, solveJoints, type Joint, type PartDef, type Pose } from './FigureModel';
import { apply, type V3 } from './Poly3D';

/**
 * 人形站姿的共用工具：腳掌放平、兩腳都踩地（懸空的那條腿自動往垂直收）、角度疊加。
 * 由模型的零件與骨盆高度建立（makeStance），姿勢在模組載入時算好。
 */

export type Angles = Partial<Record<Joint, V3>>;

/** 角度相加（腳掌只疊加外開與側傾，前後由 flatFeet 重新計算；b 的腳掌 x 為額外的踮腳角度） */
export function mergeAngles(a: Angles, b: Angles): Angles {
  const out: Angles = { ...a };
  for (const [j, v] of Object.entries(b) as [Joint, V3][]) {
    const x = out[j] ?? [0, 0, 0];
    out[j] = [x[0] + v[0], x[1] + v[1], x[2] + v[2]];
  }
  for (const foot of ['footL', 'footR'] as const) {
    const base = a[foot] ?? [0, 0, 0];
    const extra = b[foot];
    out[foot] = extra ? [extra[0], base[1] + extra[1], base[2] + extra[2]] : [0, base[1], base[2]];
  }
  return out;
}

/** 腳掌放平：抵消骨盆、大腿、小腿的前後角度（腳掌原本的 x 為額外踮腳） */
export function flatFeet(a: Angles): Angles {
  const rx = a.root?.[0] ?? 0;
  const fl = a.footL ?? [0, 0, 0];
  const fr = a.footR ?? [0, 0, 0];
  return {
    ...a,
    footL: [-(rx + (a.thighL?.[0] ?? 0) + (a.shinL?.[0] ?? 0)) + fl[0], fl[1], fl[2]],
    footR: [-(rx + (a.thighR?.[0] ?? 0) + (a.shinR?.[0] ?? 0)) + fr[0], fr[1], fr[2]],
  };
}

export function makeStance(parts: readonly PartDef[], hip: number) {
  const ground = (pose: Pose): Pose => grounded(parts, hip, pose);

  /** 某隻腳網格的最低點高度 */
  const footLow = (pose: Pose, joint: Joint): number => {
    const { m, p } = solveJoints(parts, hip, pose).get(joint)!;
    let low = Infinity;
    for (const mesh of parts.find((part) => part.joint === joint)!.meshes) for (const v of mesh.verts) low = Math.min(low, p[1] + apply(m, v)[1]);
    return low;
  };

  /**
   * 兩腳都踩地：先讓較低的腳著地，若另一腳懸空，就把那條腿的大腿往垂直方向收、膝蓋打直（二分搜尋），
   * 直到兩腳一樣高。只用在站姿、攻擊、受傷（走路的抬腳不處理）。
   */
  const planted = (angles: Angles, rootZ = 0): Pose => {
    let pose = ground({ rootY: 0, rootZ, angles: flatFeet(angles) });
    const side = footLow(pose, 'footL') > footLow(pose, 'footR') ? 'L' : 'R';
    const thighJoint: Joint = `thigh${side}`;
    const foot: Joint = `foot${side}`;
    if (footLow(pose, foot) < 0.15) return pose;
    const rx = angles.root?.[0] ?? 0;
    const shinJoint: Joint = `shin${side}`;
    const [tx, ty, tz] = angles[thighJoint] ?? [0, 0, 0];
    const [sx, sy, sz] = angles[shinJoint] ?? [0, 0, 0];
    // f = 1 原本的角度，f = 0 大腿垂直、膝蓋打直（最低）
    const at = (f: number) => ground({ rootY: 0, rootZ, angles: flatFeet({ ...angles, [thighJoint]: [-rx + (tx + rx) * f, ty, tz], [shinJoint]: [sx * f, sy, sz] }) });
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const f = (lo + hi) / 2;
      pose = at(f);
      if (footLow(pose, foot) > 0.05) hi = f;
      else lo = f;
    }
    return at(lo);
  };

  return { ground, footLow, planted };
}
