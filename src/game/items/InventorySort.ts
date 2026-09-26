import type { DataRegistry } from '../../data/DataRegistry';
import type { EquipSlot, Rarity } from '../../data/schema/item';
import type { Inventory, InventoryEntry } from './Inventory';

/** 整理順序：裝備類別 */
const SLOT_ORDER: readonly EquipSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet'];
const RARITY_ORDER: readonly Rarity[] = ['legendary', 'rare', 'magic', 'normal'];

/**
 * 自動整理背包：物品依「裝備類別 → 物品等級（高到低）→ 稀有度（高到低）」排在前面，
 * 藥水放在最後並合併成滿疊。手上拿著的物品不受影響。
 */
export function sortInventory(inventory: Inventory, data: Pick<DataRegistry, 'items' | 'potions'>): void {
  const items: Extract<InventoryEntry, { kind: 'item' }>[] = [];
  const potions = new Map<string, number>();
  for (const entry of inventory.cells) {
    if (entry?.kind === 'item') items.push(entry);
    else if (entry?.kind === 'potion') potions.set(entry.potionId, (potions.get(entry.potionId) ?? 0) + entry.count);
  }
  items.sort((a, b) => {
    const slotA = SLOT_ORDER.indexOf(data.items.get(a.item.baseId).slot);
    const slotB = SLOT_ORDER.indexOf(data.items.get(b.item.baseId).slot);
    return (
      slotA - slotB ||
      b.item.itemLevel - a.item.itemLevel ||
      RARITY_ORDER.indexOf(a.item.rarity) - RARITY_ORDER.indexOf(b.item.rarity) ||
      a.item.baseId.localeCompare(b.item.baseId) ||
      a.item.uid.localeCompare(b.item.uid)
    );
  });
  const cells: (InventoryEntry | null)[] = [...items];
  for (const [potionId, total] of potions) {
    const max = data.potions.get(potionId).maxStack;
    for (let left = total; left > 0; left -= max) cells.push({ kind: 'potion', potionId, count: Math.min(left, max) });
  }
  while (cells.length < inventory.capacity) cells.push(null);
  inventory.restore(cells);
}
