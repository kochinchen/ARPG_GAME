import { describe, expect, it } from 'vitest';
import { solveJoints, type Pose } from '../../src/render/figure/FigureModel';
import { HEROINE } from '../../src/render/figure/Heroine';
import { apply, type V3 } from '../../src/render/figure/Poly3D';
import { restPose } from '../../src/render/figure/WeaponRest';
import { mountFor, tierLook } from '../../src/render/figure/weapons/WeaponLooks';

/**
 * 主角平常拿法杖（設計者 2026-11-07）：手肘彎成直角、前臂水平往前（手往前推一點）；
 * 杖身直立、杖頭朝上，手握在杖身從下算起 2/3 的位置
 */
const staff = mountFor(tierLook('staff', 5));
const rested = (pose: Pose): Pose => restPose(HEROINE, pose, staff);

describe('主角拿法杖', () => {
  it('握點在杖身從下算起約 2/3 的位置', () => {
    const [a, b] = staff.axis;
    const along: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...along);
    // 杖身（第一個網格；杖頭的零件放大過，不算）
    const t = staff.meshes[0]!.verts.map((v) => (v[0] * along[0] + v[1] * along[1] + v[2] * along[2]) / len);
    const [low, high] = [Math.min(...t), Math.max(...t)];
    expect((0 - low) / (high - low)).toBeCloseTo(2 / 3, 1);
  });

  it('待機與走路時杖身直立、杖頭朝上，前臂水平往前', () => {
    for (const pose of [HEROINE.poses.ready(0), HEROINE.poses.ready(1.7), HEROINE.poses.run(0.8)]) {
      const p = rested(pose);
      const w = solveJoints(HEROINE.parts, HEROINE.hipHeight, p);
      // 前臂接近水平、往前（跑步時身體前傾，前臂最多斜約 20°）
      const fore = apply(w.get('forearmR')!.m, [0, -1, 0]);
      expect(Math.abs(fore[1])).toBeLessThan(0.4);
      expect(fore[2]).toBeGreaterThan(0.6);
      const [a, b] = staff.axis;
      const up = apply(w.get('weapon')!.m, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      expect(up[1] / Math.hypot(...up)).toBeGreaterThan(0.999);
    }
  });
});
