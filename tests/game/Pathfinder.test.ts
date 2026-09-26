import { describe, expect, it } from 'vitest';
import { vec2, type Vec2 } from '../../src/core/math/Vec2';
import { Pathfinder } from '../../src/game/movement/Pathfinder';
import type { NavGrid } from '../../src/game/movement/NavGrid';
import { navFrom } from './helpers';

const R = 0.3;

/** 確認沿路徑每一段，角色（含半徑）都不會碰牆 */
function expectClearPath(nav: NavGrid, from: Vec2, path: Vec2[], radius = R) {
  let prev = from;
  for (const p of path) {
    expect(nav.hasLineOfSight(prev, p, radius)).toBe(true);
    prev = p;
  }
}

describe('Pathfinder', () => {
  it('直線可達時只有一個 Waypoint，終點為點擊位置', () => {
    const nav = navFrom('.......', '.......', '.......');
    const path = new Pathfinder(nav).findPath(vec2(0.5, 1.5), vec2(6.2, 1.4), R);
    expect(path).toEqual([vec2(6.2, 1.4)]);
  });

  it('繞過牆壁，且路徑經過平滑（不會每格一個點）', () => {
    const nav = navFrom(
      '.........',
      '.........',
      '....#....',
      '....#....',
      '....#....',
      '.........',
    );
    const from = vec2(1.5, 3.5);
    const to = vec2(7.5, 3.5);
    const path = new Pathfinder(nav).findPath(from, to, R);
    expect(path.at(-1)).toEqual(to);
    expect(path.length).toBeLessThanOrEqual(3);
    expectClearPath(nav, from, path);
  });

  it('走出 U 型死路', () => {
    const nav = navFrom(
      '..........',
      '.#######..',
      '.#.....#..',
      '.#..S..#..',
      '.#.....#..',
      '.###.###..',
      '..........',
    );
    const from = vec2(4.5, 3.5);
    const to = vec2(9.5, 3.5);
    const path = new Pathfinder(nav).findPath(from, to, R);
    expect(path.at(-1)).toEqual(to);
    expectClearPath(nav, from, path);
  });

  it('不會斜切牆角', () => {
    // (0,0) → (1,1) 斜走會擦過 (0,1) 與 (1,0) 兩面牆的角
    const nav = navFrom(
      '.#.',
      '#..',
      '...',
    );
    const path = new Pathfinder(nav).findPath(vec2(0.5, 0.5), vec2(2.5, 2.5), R);
    expect(path).toEqual([]);
  });

  it('點到牆壁時，走到牆邊最近的地板', () => {
    const nav = navFrom(
      '.....',
      '.....',
      '#####',
      '.....',
    );
    const path = new Pathfinder(nav).findPath(vec2(2.5, 0.5), vec2(2.5, 2.5), R);
    expect(path.at(-1)).toEqual(vec2(2.5, 1.5));
  });

  it('目標在無法到達的區域時，走到最接近目標的位置', () => {
    const nav = navFrom(
      '.....#...',
      '.....#...',
      '.....#...',
    );
    const from = vec2(0.5, 1.5);
    const path = new Pathfinder(nav).findPath(from, vec2(7.5, 1.5), R);
    expect(path.length).toBeGreaterThan(0);
    const end = path.at(-1)!;
    expect(Math.floor(end.x)).toBe(4);
    expectClearPath(nav, from, path);
  });

  it('已經在目標上時不需移動；四周都是牆時回傳空路徑', () => {
    const open = navFrom('...', '...', '...');
    expect(new Pathfinder(open).findPath(vec2(1.5, 1.5), vec2(1.5, 1.5), R)).toEqual([vec2(1.5, 1.5)]);

    const boxed = navFrom(
      '#####',
      '#.#..',
      '#####',
    );
    expect(new Pathfinder(boxed).findPath(vec2(1.5, 1.5), vec2(4.5, 1.5), R)).toEqual([]);
  });
});
