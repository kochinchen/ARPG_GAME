import { describe, expect, it } from 'vitest';
import { solveJoints, type Joint } from '../../src/render/figure/FigureModel';
import { AI_MONSTERS, MONSTER_MODELS } from '../../src/render/figure/Monsters';
import { apply, type V3 } from '../../src/render/figure/Poly3D';

/** AI 版一般怪：腳板平放、武器握在拳心、弓弦拉弓時被拉開 */
const frames = (id: string, pose = MONSTER_MODELS[id]!.poses.ready(0)) => {
  const m = MONSTER_MODELS[id]!;
  return solveJoints(m.parts, m.hipHeight, pose);
};
const up = (id: string, j: Joint, pose?: Parameters<typeof frames>[1]): V3 => apply(frames(id, pose).get(j)!.m, [0, 1, 0]);

describe('AI 版一般怪', () => {
  it('每一隻都換成有蒙皮網格的模型', () => {
    for (const id of AI_MONSTERS) expect(MONSTER_MODELS[id]!.skin, id).toBeDefined();
  });

  it('人形怪待機、攻擊時兩腳的腳底朝正下方（腳尖不翹起）', () => {
    for (const id of ['enemy.skeleton', 'enemy.frost_skeleton', 'enemy.flame_skeleton', 'enemy.storm_skeleton', 'enemy.skeleton_archer', 'enemy.ember_archer', 'enemy.frost_archer', 'enemy.venom_archer', 'enemy.chain_warden', 'enemy.ghoul', 'enemy.venom_ghoul']) {
      const poses = MONSTER_MODELS[id]!.poses;
      for (const pose of [poses.ready(0), poses.ready(1.3), poses.attackWindup, poses.attackStrike]) {
        for (const foot of ['footL', 'footR'] as const) expect(up(id, foot, pose)[1], `${id} ${foot}`).toBeGreaterThan(0.999);
      }
    }
  });

  it('劍與手臂垂直、盾面垂直地面', () => {
    for (const id of ['enemy.skeleton', 'enemy.frost_skeleton', 'enemy.flame_skeleton', 'enemy.storm_skeleton']) {
      const w = frames(id);
      const arm = apply(w.get('handR')!.m, [0, -1, 0]);
      const blade = apply(w.get('weapon')!.m, [0, 0, 1]);
      expect(Math.abs(arm[0] * blade[0] + arm[1] * blade[1] + arm[2] * blade[2]), id).toBeLessThan(1e-6);
      // 盾面的法線（手的 +X）水平
      expect(Math.abs(apply(w.get('weaponL')!.m, [1, 0, 0])[1]), id).toBeLessThan(0.35);
    }
  });

  it('弓手拉弓時弦被拉開、平時筆直；箭只在前搖時畫', () => {
    const m = MONSTER_MODELS['enemy.skeleton_archer']!;
    expect(m.poses.attackWindup.angles.ex_stringT?.[0]).not.toBe(0);
    expect(m.poses.ready(0).angles.ex_stringT).toBeUndefined();
    expect(m.windupOnly).toContain('ex_arrow');
    // 拉弓時弓直立
    expect(Math.abs(up('enemy.skeleton_archer', 'weaponL', m.poses.attackWindup)[1])).toBeLessThan(0.2);
  });
});
