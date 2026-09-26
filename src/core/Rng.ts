/**
 * Seeded 亂數產生器（mulberry32）。
 * 遊戲內所有隨機都必須經過這裡，同一個 seed 會得到同一串結果。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 浮點數 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** [min, max] 整數（含兩端） */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** 依 weight 抽一個；weight 總和須 > 0 */
  weighted<T extends { weight: number }>(entries: readonly T[]): T {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) throw new Error('Rng.weighted: total weight must be > 0');
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll < 0) return entry;
    }
    return entries[entries.length - 1] as T;
  }

  /**
   * 產生獨立的子序列（例如 loot 專用）。
   * 子序列的使用不會影響母序列之後的結果以外的任何東西，方便各系統互不干擾。
   */
  fork(label: string): Rng {
    return new Rng((this.next() * 4294967296) ^ hashString(label));
  }

  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
