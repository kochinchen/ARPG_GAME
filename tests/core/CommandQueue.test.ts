import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/CommandQueue';

describe('CommandQueue', () => {
  it('drain 依序取出並清空', () => {
    const queue = new CommandQueue<string>();
    queue.push('a');
    queue.push('b');
    expect(queue.drain()).toEqual(['a', 'b']);
    expect(queue.size).toBe(0);
    expect(queue.drain()).toEqual([]);
  });

  it('drain 期間新增的 Command 留到下一輪', () => {
    const queue = new CommandQueue<string>();
    queue.push('a');
    const first = queue.drain();
    queue.push('b');
    expect(first).toEqual(['a']);
    expect(queue.drain()).toEqual(['b']);
  });
});
