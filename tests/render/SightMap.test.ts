import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { NavGrid } from '../../src/game/movement/NavGrid';
import { SightMap } from '../../src/render/SightMap';

/** 兩條平行的通道，中間隔一道牆；左上角有一個開口相連 */
const ROWS = [
  '##############',
  '#............#',
  '#.############',
  '#............#',
  '##############',
];

function sightAt(x: number, y: number, radius = 20): SightMap {
  const sight = new SightMap(NavGrid.fromMap({ rows: ROWS }));
  sight.update(vec2(x + 0.5, y + 0.5), radius, 0);
  sight.snap();
  return sight;
}

describe('SightMap（主角的視線）', () => {
  it('同一條通道看得到，隔壁通道被牆擋住', () => {
    const sight = sightAt(10, 1);
    expect(sight.isVisible(vec2(3.5, 1.5))).toBe(true);
    expect(sight.isVisible(vec2(10.5, 3.5))).toBe(false);
    expect(sight.isVisible(vec2(5.5, 3.5))).toBe(false);
  });

  it('擋住視線的牆本身看得到', () => {
    const sight = sightAt(10, 1);
    expect(sight.isVisible(vec2(10.5, 2.5))).toBe(true);
  });

  it('走過去之後：原本的通道變成「看過」，不在視線內', () => {
    const sight = new SightMap(NavGrid.fromMap({ rows: ROWS }));
    sight.update(vec2(10.5, 1.5), 20, 0);
    sight.update(vec2(10.5, 3.5), 20, 0);
    expect(sight.isVisible(vec2(5.5, 1.5))).toBe(false);
    expect(sight.wasSeen(vec2(5.5, 1.5))).toBe(true);
    expect(sight.isVisible(vec2(5.5, 3.5))).toBe(true);
  });

  it('視線距離外看不到，也不算看過', () => {
    const sight = sightAt(12, 1, 4);
    expect(sight.isVisible(vec2(2.5, 1.5))).toBe(false);
    expect(sight.wasSeen(vec2(2.5, 1.5))).toBe(false);
  });

  it('新看到的格子交給小地圖一次', () => {
    const sight = new SightMap(NavGrid.fromMap({ rows: ROWS }));
    sight.update(vec2(10.5, 1.5), 20, 0);
    const first = sight.takeFresh();
    expect(first.length).toBeGreaterThan(0);
    expect(sight.takeFresh()).toEqual([]);
  });
});
