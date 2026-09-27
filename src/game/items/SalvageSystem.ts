import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import type { MaterialId } from '../../data/schema/item';
import type { GameEventBus } from '../GameEvents';
import type { Materials } from '../player/Materials';
import type { ItemCursor } from './ItemCursor';
import type { ItemInstance } from './ItemInstance';

/** 拆解一件裝備得到的精華種類：武器 → 武器精華；防具與飾品 → 防具精華 */
export function essenceFor(item: ItemInstance, data: Pick<DataRegistry, 'items'>): MaterialId {
  return data.items.get(item.baseId).slot === 'weapon' ? 'weaponEssence' : 'armorEssence';
}

/**
 * 背包裡的拆解區（最多 balance.salvage.slots 格）：拿著裝備點格子放進去（有東西則互換、空手點則拿起），
 * 按「拆掉」把所有格子裡的裝備拆成精華（數量依稀有度擲骰）。格子裡的裝備會存檔。
 */
export class SalvageSystem {
  readonly slots: (ItemInstance | null)[];
  private _version = 0;

  constructor(
    private readonly data: Pick<DataRegistry, 'items' | 'balance'>,
    private readonly cursor: ItemCursor,
    private readonly materials: Materials,
    private readonly rng: Rng,
    private readonly events: GameEventBus,
  ) {
    this.slots = Array.from({ length: data.balance.salvage.slots }, () => null);
  }

  get version(): number {
    return this._version;
  }

  /** 點拆解區的格子：放下 / 互換 / 拿起（只能放裝備，藥水不行） */
  click(slot: number): void {
    if (slot < 0 || slot >= this.slots.length) return;
    const held = this.cursor.entry;
    if (held && held.kind !== 'item') return;
    const current = this.slots[slot] ?? null;
    this.slots[slot] = held?.kind === 'item' ? held.item : null;
    this.cursor.set(current ? { kind: 'item', item: current } : null);
    this._version++;
  }

  /** 各種精華預計得到的數量範圍（UI 預覽） */
  preview(): Partial<Record<MaterialId, [number, number]>> {
    const out: Partial<Record<MaterialId, [number, number]>> = {};
    for (const item of this.slots) {
      if (!item) continue;
      const id = essenceFor(item, this.data);
      const [min, max] = this.data.balance.salvage.yields[item.rarity];
      const cur = out[id] ?? [0, 0];
      out[id] = [cur[0] + min, cur[1] + max];
    }
    return out;
  }

  /** 拆掉所有格子裡的裝備，回傳得到的精華 */
  salvageAll(): Partial<Record<MaterialId, number>> {
    const gained: Partial<Record<MaterialId, number>> = {};
    let count = 0;
    this.slots.forEach((item, i) => {
      if (!item) return;
      const id = essenceFor(item, this.data);
      const [min, max] = this.data.balance.salvage.yields[item.rarity];
      gained[id] = (gained[id] ?? 0) + this.rng.int(min, max);
      this.slots[i] = null;
      count++;
    });
    if (count === 0) return gained;
    for (const [id, n] of Object.entries(gained) as [MaterialId, number][]) this.materials.add(id, n);
    this._version++;
    this.events.emit('ItemsSalvaged', { count, gained });
    return gained;
  }

  /** 讀檔 */
  restore(items: readonly (ItemInstance | null)[]): void {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = items[i] ?? null;
    this._version++;
  }
}
