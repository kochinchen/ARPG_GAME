import { describe, expect, it } from 'vitest';
import { IsoProjection } from '../../src/core/math/IsoProjection';
import { vec2 } from '../../src/core/math/Vec2';

describe('IsoProjection', () => {
  const iso = new IsoProjection(64, 32);

  it('原點對應畫面原點', () => {
    expect(iso.toScreen(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('World +x 往右下、+y 往左下（2:1）', () => {
    expect(iso.toScreen(vec2(1, 0))).toEqual({ x: 32, y: 16 });
    expect(iso.toScreen(vec2(0, 1))).toEqual({ x: -32, y: 16 });
  });

  it('toWorld(toScreen(p)) ≈ p', () => {
    for (const p of [vec2(0, 0), vec2(3.5, -2), vec2(-10.25, 7.75), vec2(123.4, 56.7)]) {
      const back = iso.toWorld(iso.toScreen(p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('depth 越靠近鏡頭越大', () => {
    expect(iso.depth(vec2(5, 5))).toBeGreaterThan(iso.depth(vec2(2, 3)));
  });
});
