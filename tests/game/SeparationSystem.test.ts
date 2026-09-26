import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../src/core/math/Vec2';
import { SeparationSystem } from '../../src/game/movement/SeparationSystem';
import { makeActor, navFrom } from './helpers';

const OPEN = navFrom('........', '........', '........', '........');

describe('SeparationSystem', () => {
  it('兩個可移動角色重疊時各推開一半', () => {
    const a = makeActor({ position: vec2(3, 2) });
    const b = makeActor({ faction: 'enemy', position: vec2(3.2, 2) });
    new SeparationSystem(OPEN).update([a, b]);
    expect(distance(a.position, b.position)).toBeCloseTo(0.6);
    expect(a.position.x).toBeCloseTo(2.8);
    expect(b.position.x).toBeCloseTo(3.4);
  });

  it('不會移動的角色（moveSpeed = 0）只推別人', () => {
    const dummy = makeActor({ faction: 'enemy', position: vec2(3, 2), stats: { moveSpeed: 0 } });
    const player = makeActor({ position: vec2(3.2, 2) });
    new SeparationSystem(OPEN).update([dummy, player]);
    expect(dummy.position).toEqual(vec2(3, 2));
    expect(player.position.x).toBeCloseTo(3.6);
  });

  it('完全重疊時仍會推開，且結果可重現', () => {
    const run = () => {
      const a = makeActor({ position: vec2(3, 2) });
      const b = makeActor({ position: vec2(3, 2) });
      new SeparationSystem(OPEN).update([a, b]);
      return [a.position, b.position];
    };
    const [a, b] = run();
    expect(distance(a!, b!)).toBeGreaterThan(0.5);
  });

  it('推開後會碰牆的一方不動，另一方承擔全部位移', () => {
    const nav = navFrom('#....', '#....');
    const a = makeActor({ position: vec2(1.3, 1) });
    const b = makeActor({ position: vec2(1.5, 1) });
    new SeparationSystem(nav).update([a, b]);
    expect(a.position).toEqual(vec2(1.3, 1));
    expect(b.position.x).toBeCloseTo(1.9);
  });

  it('忽略已死亡的角色', () => {
    const a = makeActor({ position: vec2(3, 2) });
    const b = makeActor({ position: vec2(3.1, 2) });
    b.alive = false;
    new SeparationSystem(OPEN).update([a, b]);
    expect(a.position).toEqual(vec2(3, 2));
  });
});
