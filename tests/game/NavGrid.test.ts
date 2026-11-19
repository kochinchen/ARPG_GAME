import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { NavGrid } from '../../src/game/movement/NavGrid';
import { navFrom } from './helpers';

describe('NavGrid', () => {
  const nav = navFrom(
    '#####',
    '#S..#',
    '#.#.#',
    '#####',
  );

  it('解析尺寸與可走區域；出生點視為地板；超出地圖視為牆', () => {
    expect([nav.width, nav.height]).toEqual([5, 4]);
    expect(nav.isWalkable(1, 1)).toBe(true);
    expect(nav.isWalkable(2, 2)).toBe(false);
    expect(nav.isWalkable(-1, 1)).toBe(false);
    expect(nav.isWalkable(5, 1)).toBe(false);
  });

  it('視線檢查考慮角色半徑', () => {
    expect(nav.hasLineOfSight(vec2(1.5, 1.5), vec2(3.5, 1.5), 0.3)).toBe(true);
    // 貼著牆邊走，半徑會擦到牆
    expect(nav.hasLineOfSight(vec2(1.5, 1.2), vec2(3.5, 1.2), 0.3)).toBe(false);
    // 穿過牆
    expect(nav.hasLineOfSight(vec2(1.5, 1.5), vec2(3.5, 2.5), 0.3)).toBe(false);
  });

  it('角色比格子寬時，夾在四個角中間的牆也算碰到', () => {
    // 格子 0.5：柱子只有 1 格 [1, 1.5) × [1, 1.5)，半徑 0.3 的角色四個角都落在柱子外面
    const pillar = NavGrid.fromMap({ rows: ['.....', '.....', '..#..', '.....', '.....'], cellSize: 0.5 });
    expect(pillar.isClearAt(vec2(1.25, 1.25), 0.3)).toBe(false);
    expect(pillar.isClearAt(vec2(1.25, 0.95), 0.3)).toBe(false);
    expect(pillar.isClearAt(vec2(1.25, 0.65), 0.3)).toBe(true);
    // 正對著柱子直走
    expect(pillar.hasLineOfSight(vec2(1.25, 0.35), vec2(1.25, 2.15), 0.3)).toBe(false);
    expect(pillar.hasLineOfSight(vec2(0.65, 0.35), vec2(0.65, 2.15), 0.3)).toBe(true);
    // 超出地圖視為牆
    expect(pillar.isClearAt(vec2(0.2, 0.2), 0.3)).toBe(false);
  });

  it('clampInside 把點推離相鄰的牆', () => {
    expect(nav.clampInside(vec2(1.05, 1.05), 0.3)).toEqual(vec2(1.3, 1.3));
    expect(nav.clampInside(vec2(2.5, 1.5), 0.3)).toEqual(vec2(2.5, 1.5));
  });

  it('nearestWalkable 找最近的地板，同距離時偏好靠近 prefer 的一側', () => {
    const wall = navFrom(
      '.....',
      '.....',
      '#####',
      '.....',
      '.....',
    );
    expect(wall.nearestWalkable(vec2(2, 2), 3, vec2(2.5, 0.5))).toEqual(vec2(2, 1));
    expect(wall.nearestWalkable(vec2(2, 2), 3, vec2(2.5, 4.5))).toEqual(vec2(2, 3));
  });
});
