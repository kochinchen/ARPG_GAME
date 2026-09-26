import { describe, expect, it } from 'vitest';
import { GameLoop } from '../../src/core/GameLoop';

function createLoop() {
  const updates: number[] = [];
  const alphas: number[] = [];
  const loop = new GameLoop({
    step: 0.1,
    maxFrameTime: 0.5,
    update: (dt) => updates.push(dt),
    render: (alpha) => alphas.push(alpha),
  });
  return { loop, updates, alphas };
}

describe('GameLoop', () => {
  it('以固定步長執行 update，餘數累積到下一幀', () => {
    const { loop, updates } = createLoop();
    expect(loop.advance(0.25)).toBe(2);
    expect(loop.advance(0.06)).toBe(1); // 0.05 + 0.06 = 0.11
    expect(updates).toEqual([0.1, 0.1, 0.1]);
    expect(loop.tick).toBe(3);
  });

  it('每次 advance 都 render 一次，並提供插值 alpha', () => {
    const { loop, alphas } = createLoop();
    loop.advance(0.15);
    expect(alphas).toHaveLength(1);
    expect(alphas[0]).toBeCloseTo(0.5, 5);
  });

  it('單幀時間過長時截斷，避免一次跑太多 Tick', () => {
    const { loop } = createLoop();
    expect(loop.advance(10)).toBe(5);
  });

  it('暫停時不執行 update 但仍 render', () => {
    const { loop, updates, alphas } = createLoop();
    loop.paused = true;
    loop.advance(0.3);
    expect(updates).toHaveLength(0);
    expect(alphas).toHaveLength(1);
  });

  it('start 使用注入的時鐘與排程器', () => {
    const { loop, updates } = createLoop();
    let time = 0;
    const frames: (() => void)[] = [];
    loop.start({ now: () => time }, (cb) => frames.push(cb));
    time = 0.2;
    frames.shift()!();
    expect(updates).toHaveLength(2);
    loop.stop();
    time = 1;
    frames.shift()!();
    expect(updates).toHaveLength(2);
  });
});
