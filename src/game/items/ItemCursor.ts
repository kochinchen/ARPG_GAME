import type { InventoryEntry } from './Inventory';

/**
 * 滑鼠上「拿著」的物品（Diablo 式：點一下拿起、點一下放下）。
 * 屬於遊戲狀態而非 UI 狀態，存檔時才不會遺失手上的物品。
 */
export class ItemCursor {
  private held: InventoryEntry | null = null;
  private _version = 0;

  get entry(): InventoryEntry | null {
    return this.held;
  }

  get version(): number {
    return this._version;
  }

  set(entry: InventoryEntry | null): void {
    this.held = entry;
    this._version++;
  }

  take(): InventoryEntry | null {
    const entry = this.held;
    if (entry) this.set(null);
    return entry;
  }
}
