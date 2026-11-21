import { describe, expect, it } from 'vitest';
import { solveJoints } from '../../src/render/figure/FigureModel';
import { HEROINE_AI } from '../../src/render/figure/HeroineAI';
import { apply } from '../../src/render/figure/Poly3D';

/** 女主角倒地：身體要貼在地上（之前把手上的武器也算進去，整個人浮在半空，影子落在身體下方） */
describe('女主角倒地的姿勢', () => {
  it('倒地後整個人平趴在地板上：身體最低點在地面（武器不算），胸口、臀部、大腿、頭都貼地', () => {
    const { parts, hipHeight, poses } = HEROINE_AI;
    const world = solveJoints(parts, hipHeight, poses.dead);
    const lows = new Map<string, number>();
    for (const part of parts) {
      const { m, p } = world.get(part.joint)!;
      let low = Infinity;
      for (const mesh of part.meshes) for (const v of mesh.verts) low = Math.min(low, p[1] + apply(m, v)[1]);
      if (Number.isFinite(low)) lows.set(part.joint, low);
    }
    const body = [...lows].filter(([j]) => j !== 'weapon' && j !== 'weaponL').map(([, low]) => low);
    expect(Math.min(...body)).toBeCloseTo(0, 1);
    // 平趴：胸口、臀部（腰布）、大腿都貼著地板（骨盆高度 32，容許 5 以內）；武器平躺，不插進地裡
    for (const joint of ['chest', 'cloth', 'thighL', 'thighR', 'head']) expect(lows.get(joint)!, joint).toBeLessThan(5);
    expect(lows.get('weapon')!).toBeGreaterThan(-3);
  });
});
