import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { Actor } from '../../src/game/entities/Actor';
import { MovementSystem } from '../../src/game/movement/MovementSystem';

const makeActor = () =>
  new Actor({ id: 1, faction: 'player', position: vec2(0, 0), radius: 0.3, moveSpeed: 4 });

describe('MovementSystem', () => {
  it('依速度前進並更新面向', () => {
    const actor = makeActor();
    actor.path = [vec2(10, 0)];
    new MovementSystem().update([actor], 0.5);
    expect(actor.position).toEqual(vec2(2, 0));
    expect(actor.facing).toEqual(vec2(1, 0));
  });

  it('剛好抵達時清空路徑', () => {
    const actor = makeActor();
    actor.path = [vec2(1, 0)];
    new MovementSystem().update([actor], 1);
    expect(actor.position).toEqual(vec2(1, 0));
    expect(actor.isMoving).toBe(false);
  });

  it('抵達 Waypoint 後，剩餘距離繼續走向下一個', () => {
    const actor = makeActor();
    actor.path = [vec2(1, 0), vec2(1, 5)];
    new MovementSystem().update([actor], 0.5); // 走 2：1 到轉角 + 1 往下
    expect(actor.position.x).toBeCloseTo(1);
    expect(actor.position.y).toBeCloseTo(1);
    expect(actor.path).toHaveLength(1);
  });
});
