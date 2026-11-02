import type { DataRegistry } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { GameEventBus } from '../GameEvents';
import type { Inventory, InventoryEntry } from './Inventory';
import { sortGear } from './InventorySort';
import type { ItemCursor } from './ItemCursor';

/** 倉庫的一格：裝備（鑲著的熔核跟著一起）或熔核；藥水不能放 */
export type StashEntry = Extract<InventoryEntry, { kind: 'item' | 'core' }>;

/**
 * 共用倉庫：所有存檔欄位共用一份內容，資料由 save/ 另外存（game 不知道怎麼存）。
 *
 * 每個動作只會是「放進去」或「拿出來」其中一種，不做互換：存檔時才有固定的寫入順序，
 * 當機時最壞情況是多一件，不會少一件（docs/SAVE_SYSTEM.md 第 10 節）。
 * 拿出來的物品換新 uid（其他欄位的流水號可能相同；裝備的屬性是用 uid 當來源）。
 */
export class SharedStash {
  readonly cells: (StashEntry | null)[];
  private _version = 0;
  /** 倉庫存檔讀不進來：不能存取，也不會寫入，避免蓋掉損毀的檔案 */
  locked = false;

  constructor(
    private readonly config: Balance['stash'],
    private readonly cursor: ItemCursor,
    private readonly inventory: Inventory,
    private readonly newUid: () => string,
    private readonly events: GameEventBus,
  ) {
    this.cells = Array.from({ length: config.pages * config.cols * config.rows }, () => null);
  }

  get version(): number {
    return this._version;
  }

  /** 目前放了幾件（存檔時判斷這次是放進去還是拿出來） */
  get count(): number {
    return this.cells.filter((c) => c !== null).length;
  }

  /** 點倉庫的格子：手上沒東西 = 拿起；手上有裝備或熔核 = 放下，那格有東西就放到後面第一個空格 */
  click(cell: number): void {
    if (this.locked || cell < 0 || cell >= this.cells.length) return;
    const held = this.cursor.entry;
    if (!held) {
      const entry = this.cells[cell] ?? null;
      if (!entry) return;
      this.cells[cell] = null;
      this.cursor.set(this.withNewUids(entry));
      this._version++;
      return;
    }
    if (held.kind === 'potion') {
      this.events.emit('StashRejected', {});
      return;
    }
    if (this.put(held, cell)) this.cursor.set(null);
  }

  /** 背包某一格直接放進倉庫（從 fromCell 往後找空格） */
  deposit(inventoryCell: number, fromCell: number): void {
    if (this.locked) return;
    const entry = this.inventory.get(inventoryCell);
    if (!entry) return;
    if (entry.kind === 'potion') {
      this.events.emit('StashRejected', {});
      return;
    }
    if (this.put(entry, fromCell)) this.inventory.take(inventoryCell);
  }

  /** 倉庫某一格直接拿回背包；背包滿了就留在倉庫 */
  withdraw(cell: number): void {
    if (this.locked) return;
    const entry = this.cells[cell];
    if (!entry) return;
    const fresh = this.withNewUids(entry);
    const added = fresh.kind === 'item' ? this.inventory.addItem(fresh.item) : this.inventory.addCore(fresh.core);
    if (!added) {
      this.events.emit('PickupFailed', { reason: 'inventoryFull' });
      return;
    }
    this.cells[cell] = null;
    this._version++;
  }

  /**
   * 整理某一頁（和背包相同的順序：裝備依類別、物品等級、稀有度，接著熔核），其他頁不動。
   * 只換位置；排序結果的件數和原本不同就不套用，絕不會有東西消失。
   */
  sortPage(page: number, data: Pick<DataRegistry, 'items'>): void {
    const size = this.config.cols * this.config.rows;
    if (this.locked || !Number.isInteger(page) || page < 0 || page >= this.config.pages) return;
    const first = page * size;
    const before = this.cells.slice(first, first + size);
    const sorted = sortGear(before, data);
    if (sorted.length !== before.filter((c) => c !== null).length) return;
    for (let i = 0; i < size; i++) this.cells[first + i] = sorted[i] ?? null;
    this._version++;
  }

  /** 讀檔：套用存檔裡的內容（超過格數的丟給存檔修復處理，這裡只放得下的） */
  restore(cells: readonly (StashEntry | null)[]): void {
    this.cells.forEach((_, i) => (this.cells[i] = cells[i] ?? null));
    this._version++;
  }

  /** 開發用：清空 */
  clear(): void {
    this.cells.fill(null);
    this._version++;
  }

  /** 放進 from 那一格；有東西就往後找空格，到底再從頭找。全滿回傳 false */
  private put(entry: StashEntry, from: number): boolean {
    const n = this.cells.length;
    for (let i = 0; i < n; i++) {
      const at = (Math.max(0, from) + i) % n;
      if (this.cells[at]) continue;
      this.cells[at] = entry;
      this._version++;
      return true;
    }
    this.events.emit('StashFull', {});
    return false;
  }

  private withNewUids(entry: StashEntry): StashEntry {
    if (entry.kind === 'core') return { kind: 'core', core: { ...entry.core, uid: this.newUid() } };
    const { item } = entry;
    const sockets = item.sockets && { max: item.sockets.max, cores: item.sockets.cores.map((core) => ({ ...core, uid: this.newUid() })) };
    return { kind: 'item', item: { ...item, uid: this.newUid(), ...(sockets ? { sockets } : {}) } };
  }
}
