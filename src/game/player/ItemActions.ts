import type { GroundContent } from '../entities/Interactable';
import type { GameEventBus } from '../GameEvents';
import type { Equipment } from '../items/Equipment';
import type { Inventory, InventoryEntry } from '../items/Inventory';
import type { ItemCursor } from '../items/ItemCursor';
import type { EquipmentSlot } from '../items/ItemInstance';

/**
 * 背包 / 裝備欄的點擊規則（Diablo 式）：
 * - 手上沒東西：點背包格或裝備欄 → 拿起
 * - 手上有東西：點背包格 → 放下（有東西則互換、同種藥水合併）；點裝備欄 → 穿上（有裝備則互換）
 * - 手上有東西時點地面 → 丟在腳下
 */
export class ItemActions {
  constructor(
    private readonly inventory: Inventory,
    private readonly equipment: Equipment,
    private readonly cursor: ItemCursor,
    private readonly events: GameEventBus,
    private readonly dropToGround: (content: GroundContent) => void,
    /** 物品的等級需求 → 是否符合 */
    private readonly meetsLevel: (baseId: string) => boolean,
  ) {}

  get holding(): boolean {
    return this.cursor.entry !== null;
  }

  clickInventory(cell: number): void {
    const held = this.cursor.take();
    if (!held) {
      const entry = this.inventory.take(cell);
      if (entry) this.cursor.set(entry);
      return;
    }
    this.cursor.set(this.inventory.place(cell, held));
  }

  clickEquipment(slot: EquipmentSlot): void {
    const held = this.cursor.entry;
    if (!held) {
      const item = this.equipment.unequip(slot);
      if (item) this.cursor.set({ kind: 'item', item });
      return;
    }
    if (held.kind !== 'item' || !this.equipment.canEquip(held.item, slot)) {
      this.events.emit('EquipFailed', { slot, reason: 'wrongSlot' });
      return;
    }
    if (!this.meetsLevel(held.item.baseId)) {
      this.events.emit('EquipFailed', { slot, reason: 'level' });
      return;
    }
    this.cursor.take();
    const replaced = this.equipment.equipTo(slot, held.item);
    if (replaced) this.cursor.set({ kind: 'item', item: replaced });
  }

  /** 把手上的東西丟在地上；手上沒東西時回傳 false */
  dropHeld(): boolean {
    const held = this.cursor.take();
    if (!held) return false;
    this.dropToGround(toGround(held));
    return true;
  }
}

function toGround(entry: InventoryEntry): GroundContent {
  return entry.kind === 'item' ? entry : { kind: 'potion', potionId: entry.potionId, count: entry.count };
}
