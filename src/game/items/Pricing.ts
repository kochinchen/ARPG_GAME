import type { DataRegistry } from '../../data/DataRegistry';
import type { InventoryEntry } from './Inventory';
import type { ItemInstance } from './ItemInstance';

type ShopData = Pick<DataRegistry, 'balance'>;

/** 物品價值 = (base + perItemLevel × 物品等級) × 稀有度倍率 */
export function itemValue(item: ItemInstance, data: ShopData): number {
  const v = data.balance.shop.value;
  return Math.max(1, Math.round((v.base + v.perItemLevel * item.itemLevel) * v.rarity[item.rarity]));
}

/** 賣給商人拿到的金幣（藥水每瓶固定價格） */
export function sellPrice(entry: InventoryEntry, data: ShopData): number {
  return entry.kind === 'item' ? itemValue(entry.item, data) : entry.count * data.balance.shop.potionSellPrice;
}

/** 向商人購買的價格 */
export function buyPrice(item: ItemInstance, data: ShopData): number {
  return itemValue(item, data) * data.balance.shop.buyMultiplier;
}

/** 賭博一次的價格（依樓層） */
export function gamblePrice(floor: number, data: ShopData): number {
  const g = data.balance.shop.gamble;
  return g.base + g.perFloor * Math.max(1, floor);
}
