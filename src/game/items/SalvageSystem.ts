import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import type { MaterialId } from '../../data/schema/item';
import type { GameEventBus } from '../GameEvents';
import type { Materials } from '../player/Materials';
import type { CoreInstance } from './CoreInstance';
import type { InventoryEntry } from './Inventory';
import type { ItemCursor } from './ItemCursor';
import type { ItemInstance } from './ItemInstance';

/** 拆解區的一格：裝備或熔核（熔核拆成武器精華，數量依核色） */
export type SalvageEntry = Extract<InventoryEntry, { kind: 'item' | 'core' }>;

/** 拆解一件裝備得到的精華種類：武器 → 武器精華；防具與飾品 → 防具精華 */
export function essenceFor(item: ItemInstance, data: Pick<DataRegistry, 'items'>): MaterialId {
  return data.items.get(item.baseId).slot === 'weapon' ? 'weaponEssence' : 'armorEssence';
}

/** 拆解區一格的精華種類與數量範圍（熔核：武器精華，依核色） */
function yieldOf(entry: SalvageEntry, data: Pick<DataRegistry, 'items' | 'balance'>): { id: MaterialId; range: [number, number] } {
  const rarity = entry.kind === 'item' ? entry.item.rarity : entry.core.rarity;
  return { id: entry.kind === 'item' ? essenceFor(entry.item, data) : 'weaponEssence', range: data.balance.salvage.yields[rarity] };
}

/**
 * 背包裡的拆解區（最多 balance.salvage.slots 格）：拿著裝備點格子放進去（有東西則互換、空手點則拿起），
 * 按「拆掉」把所有格子裡的裝備拆成精華（數量依稀有度擲骰）。格子裡的裝備會存檔。
 */
export class SalvageSystem {
  readonly slots: (SalvageEntry | null)[];
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

  /** 點拆解區的格子：放下 / 互換 / 拿起（裝備與熔核可以，藥水不行） */
  click(slot: number): void {
    if (slot < 0 || slot >= this.slots.length) return;
    const held = this.cursor.entry;
    if (held && held.kind === 'potion') return;
    const current = this.slots[slot] ?? null;
    this.slots[slot] = held;
    this.cursor.set(current);
    this._version++;
  }

  /** 各種精華預計得到的數量範圍（UI 預覽） */
  preview(): Partial<Record<MaterialId, [number, number]>> {
    const out: Partial<Record<MaterialId, [number, number]>> = {};
    for (const entry of this.slots) {
      if (!entry) continue;
      const { id, range: [min, max] } = yieldOf(entry, this.data);
      const cur = out[id] ?? [0, 0];
      out[id] = [cur[0] + min, cur[1] + max];
    }
    return out;
  }

  /** 拆掉所有格子裡的裝備，回傳得到的精華 */
  salvageAll(): Partial<Record<MaterialId, number>> {
    const gained: Partial<Record<MaterialId, number>> = {};
    let count = 0;
    this.slots.forEach((entry, i) => {
      if (!entry) return;
      const { id, range: [min, max] } = yieldOf(entry, this.data);
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
  restore(entries: readonly (SalvageEntry | null)[]): void {
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = entries[i] ?? null;
    this._version++;
  }
}
