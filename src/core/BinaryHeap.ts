/** 最小堆積：pop() 回傳 score 最小的項目 */
export class BinaryHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly score: (item: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score(items[i] as T) >= this.score(items[parent] as T)) break;
      [items[i], items[parent]] = [items[parent] as T, items[i] as T];
      i = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last !== undefined) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && this.score(items[left] as T) < this.score(items[smallest] as T)) smallest = left;
        if (right < items.length && this.score(items[right] as T) < this.score(items[smallest] as T)) smallest = right;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest] as T, items[i] as T];
        i = smallest;
      }
    }
    return top;
  }
}
