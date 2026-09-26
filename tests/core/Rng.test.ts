import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/Rng';

const sequence = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('同一個 seed 產生相同序列', () => {
    expect(sequence(new Rng(42), 20)).toEqual(sequence(new Rng(42), 20));
  });

  it('不同 seed 產生不同序列', () => {
    expect(sequence(new Rng(1), 5)).not.toEqual(sequence(new Rng(2), 5));
  });

  it('next() 落在 [0, 1)', () => {
    const rng = new Rng(7);
    for (const v of sequence(rng, 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() 包含兩端且不超出範圍', () => {
    const rng = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('weighted() 分佈接近權重比例', () => {
    const rng = new Rng(99);
    const entries = [
      { id: 'a', weight: 70 },
      { id: 'b', weight: 25 },
      { id: 'c', weight: 5 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) counts[rng.weighted(entries).id]!++;
    expect(counts.a! / n).toBeCloseTo(0.7, 1);
    expect(counts.b! / n).toBeCloseTo(0.25, 1);
    expect(counts.c! / n).toBeCloseTo(0.05, 1);
  });

  it('fork() 可重現，且不同 label 產生不同序列', () => {
    const a = new Rng(5).fork('loot');
    const b = new Rng(5).fork('loot');
    const c = new Rng(5).fork('spawn');
    expect(sequence(a, 10)).toEqual(sequence(b, 10));
    expect(sequence(new Rng(5).fork('loot'), 10)).not.toEqual(sequence(c, 10));
  });

  it('getState / setState 可還原序列（存檔用）', () => {
    const rng = new Rng(11);
    rng.next();
    const state = rng.getState();
    const expected = sequence(rng, 5);
    rng.setState(state);
    expect(sequence(rng, 5)).toEqual(expected);
  });
});
