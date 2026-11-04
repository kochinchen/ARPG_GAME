import { describe, expect, it } from 'vitest';
import { solveJoints, skinVerts } from '../../src/render/figure/FigureModel';
import { BOSS_MODELS } from '../../src/render/figure/Bosses';

/** 網格的帶號體積：面朝外時為正。反了的話，隱藏背面的畫法（Pixi、設計文件的模型圖）會畫出模型內側 */
function signedVolume(verts: readonly (readonly number[])[], faces: readonly { idx: readonly number[] }[]): number {
  let total = 0;
  for (const { idx } of faces) {
    const a = verts[idx[0]!]!;
    for (let i = 1; i + 1 < idx.length; i++) {
      const b = verts[idx[i]!]!;
      const c = verts[idx[i + 1]!]!;
      total += a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) + a[1]! * (b[2]! * c[0]! - b[0]! * c[2]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
    }
  }
  return total / 6;
}

describe('AI 版魔王的網格', () => {
  const skinned = Object.entries(BOSS_MODELS).filter(([, model]) => model.skin);

  it('有蒙皮網格可以檢查', () => {
    expect(skinned.map(([id]) => id)).toContain('enemy.abyss_tail');
  });

  it.each(skinned)('%s：面朝外（不會畫出模型內側）', (_, model) => {
    const world = solveJoints(model.parts, model.hipHeight, model.poses.ready(0));
    expect(signedVolume(skinVerts(model.skin!, world), model.skin!.faces)).toBeGreaterThan(0);
  });
});
