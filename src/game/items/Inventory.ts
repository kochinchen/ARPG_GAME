import type { ItemInstance } from './ItemInstance';

/** 背包中一格的內容：一件物品，或一疊藥水 */
export type InventoryEntry = { kind: 'item'; item: ItemInstance } | { kind: 'potion'; potionId: string; count: number };

/**
 * 背包：cols × rows 格，每格放一件物品或一疊同種藥水。
 * 任何變動都會增加 version，UI 據此判斷是否需要重建快照。
 */
export class Inventory {
  readonly cells: (InventoryEntry | null)[];
  private _version = 0;

  constructor(
    readonly cols: number,
    readonly rows: number,
    /** 每種藥水一疊的上限 */
    private readonly stackSize: (potionId: string) => number,
  ) {
    this.cells = Array.from({ length: cols * rows }, () => null);
  }

  get capacity(): number {
    return this.cells.length;
  }

  get version(): number {
    return this._version;
  }

  get isFull(): boolean {
    return this.firstEmpty() < 0;
  }

  /** 背包內所有物品（不含藥水） */
  get items(): ItemInstance[] {
    return this.cells.flatMap((c) => (c?.kind === 'item' ? [c.item] : []));
  }

  get(cell: number): InventoryEntry | null {
    return this.cells[cell] ?? null;
  }

  firstEmpty(): number {
    return this.cells.indexOf(null);
  }

  /** 放進第一個空格；背包滿時回傳 false */
  addItem(item: ItemInstance): boolean {
    const cell = this.firstEmpty();
    if (cell < 0) return false;
    this.cells[cell] = { kind: 'item', item };
    this.changed();
    return true;
  }

  /** 先補滿既有的疊，再開新格；回傳實際放入的數量 */
  addPotions(potionId: string, count: number): number {
    const max = this.stackSize(potionId);
    let remaining = count;
    for (const entry of this.cells) {
      if (remaining === 0) break;
      if (entry?.kind !== 'potion' || entry.potionId !== potionId || entry.count >= max) continue;
      const add = Math.min(remaining, max - entry.count);
      entry.count += add;
      remaining -= add;
    }
    while (remaining > 0) {
      const cell = this.firstEmpty();
      if (cell < 0) break;
      const add = Math.min(remaining, max);
      this.cells[cell] = { kind: 'potion', potionId, count: add };
      remaining -= add;
    }
    if (remaining !== count) this.changed();
    return count - remaining;
  }

  potionCount(potionId: string): number {
    return this.cells.reduce((sum, c) => sum + (c?.kind === 'potion' && c.potionId === potionId ? c.count : 0), 0);
  }

  /** 取用一瓶：從最少的那一疊拿，讓藥水盡量集中；沒有藥水時回傳 false */
  takePotion(potionId: string): boolean {
    let best = -1;
    this.cells.forEach((c, i) => {
      if (c?.kind !== 'potion' || c.potionId !== potionId) return;
      const current = this.cells[best];
      if (best < 0 || (current?.kind === 'potion' && c.count < current.count)) best = i;
    });
    const stack = this.cells[best];
    if (stack?.kind !== 'potion') return false;
    stack.count--;
    if (stack.count === 0) this.cells[best] = null;
    this.changed();
    return true;
  }

  /** 拿起某一格的內容 */
  take(cell: number): InventoryEntry | null {
    const entry = this.get(cell);
    if (!entry) return null;
    this.cells[cell] = null;
    this.changed();
    return entry;
  }

  /**
   * 放下 entry 到某一格：空格直接放；同種藥水合併（放不下的留在手上）；其他情況互換。
   * 回傳放下後手上剩下的東西。
   */
  place(cell: number, entry: InventoryEntry): InventoryEntry | null {
    if (cell < 0 || cell >= this.cells.length) return entry;
    const current = this.cells[cell] ?? null;
    this.changed();
    if (!current) {
      this.cells[cell] = entry;
      return null;
    }
    if (current.kind === 'potion' && entry.kind === 'potion' && current.potionId === entry.potionId) {
      const add = Math.min(entry.count, this.stackSize(entry.potionId) - current.count);
      current.count += add;
      const rest = entry.count - add;
      return rest > 0 ? { ...entry, count: rest } : null;
    }
    this.cells[cell] = entry;
    return current;
  }

  /** 依 uid 移除物品（測試與後續系統使用） */
  removeItem(uid: string): ItemInstance | null {
    const cell = this.cells.findIndex((c) => c?.kind === 'item' && c.item.uid === uid);
    const entry = cell < 0 ? null : this.take(cell);
    return entry?.kind === 'item' ? entry.item : null;
  }

  private changed(): void {
    this._version++;
  }
}
