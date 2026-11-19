import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { MovementSystem } from '../../src/game/movement/MovementSystem';
import { Pathfinder } from '../../src/game/movement/Pathfinder';
import { makeActor, navFrom } from './helpers';

const OPEN = navFrom(...Array.from({ length: 8 }, () => '............'));
const movementOn = (nav = OPEN) => new MovementSystem(nav, new Pathfinder(nav));

describe('MovementSystem', () => {
  it('依速度前進並更新面向', () => {
    const actor = makeActor();
    actor.path = [vec2(10, 0)];
    movementOn().update([actor], 0.5);
    expect(actor.position).toEqual(vec2(2, 0));
    expect(actor.facing).toEqual(vec2(1, 0));
  });

  it('剛好抵達時清空路徑', () => {
    const actor = makeActor();
    actor.path = [vec2(1, 0)];
    movementOn().update([actor], 1);
    expect(actor.position).toEqual(vec2(1, 0));
    expect(actor.isMoving).toBe(false);
  });

  it('抵達 Waypoint 後，剩餘距離繼續走向下一個', () => {
    const actor = makeActor();
    actor.path = [vec2(1, 0), vec2(1, 5)];
    movementOn().update([actor], 0.5); // 走 2：1 到轉角 + 1 往下
    expect(actor.position.x).toBeCloseTo(1);
    expect(actor.position.y).toBeCloseTo(1);
    expect(actor.path).toHaveLength(1);
  });

  it('路徑會直線穿過牆時，改繞路走到同一個終點', () => {
    const nav = navFrom('.....', '.....', '..#..', '.....', '.....');
    const actor = makeActor({ position: vec2(0.5, 2.5) });
    // 不是 findPath 算出來的路（例如被推開後留下的舊路徑）：直線穿過柱子
    actor.path = [vec2(4.5, 2.5)];
    const movement = movementOn(nav);
    for (let t = 0; t < 240 && actor.isMoving; t++) {
      movement.update([actor], 1 / 60);
      expect(nav.isWalkableAt(actor.position.x, actor.position.y)).toBe(true);
    }
    expect(actor.position).toEqual(vec2(4.5, 2.5));
  });

  it('終點在走不到的地方：走到牆前停下，不會踩進去', () => {
    const nav = navFrom('..#..', '..#..', '..#..');
    const actor = makeActor({ position: vec2(0.5, 1.5) });
    actor.path = [vec2(4.5, 1.5)];
    const movement = movementOn(nav);
    for (let t = 0; t < 240 && actor.isMoving; t++) movement.update([actor], 1 / 60);
    expect(actor.isMoving).toBe(false);
    expect(nav.isWalkableAt(actor.position.x, actor.position.y)).toBe(true);
    expect(actor.position.x).toBeLessThan(2);
  });
});
