import type { DataRegistry } from '../../data/DataRegistry';
import type { EquipSlot } from '../../data/schema/item';
import type { GameWorld } from '../../game/GameWorld';
import { SLOT_LABELS } from '../../game/items/ItemDescriber';
import { buyPrice, sellPrice } from '../../game/items/Pricing';
import { itemEntryView, type EntryView } from './InventoryView';

export interface ShopView {
  /** 站在商人附近（離開後 UI 自動關閉商店） */
  near: boolean;
  /** compare：同欄位目前穿著的裝備（Tooltip 並排比較） */
  stock: { index: number; entry: EntryView; price: number; affordable: boolean; compare: EntryView[] }[];
  potionPrice: number;
  gamblePrice: number;
  gambleSlots: { slot: EquipSlot; label: string; glyph: string }[];
  /** 手上拿著的物品賣出價格（沒拿東西為 null） */
  heldSellPrice: number | null;
  /** 背包裡普通（白色）裝備的件數與總價 */
  normals: { count: number; gold: number };
  gold: number;
}

export function emptyShopView(): ShopView {
  return { near: false, stock: [], potionPrice: 0, gamblePrice: 0, gambleSlots: [], heldSellPrice: null, normals: { count: 0, gold: 0 }, gold: 0 };
}

const GLYPHS: Record<EquipSlot, string> = { weapon: '劍', helmet: '盔', armor: '甲', gloves: '手', boots: '靴', ring: '戒', amulet: '符' };

const GAMBLE_SLOTS: readonly EquipSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet'];

/** 貨架、金幣、背包改變時重建 */
export function shopSignature(world: GameWorld): string {
  return `${world.shop.version}|${world.wallet.gold}|${world.itemsVersion}|${world.shop.isNear()}|${world.floors.floor}`;
}

export function buildShopView(world: GameWorld, data: DataRegistry): ShopView {
  const shop = world.shop;
  const gold = world.wallet.gold;
  const normals = world.inventory.cells.filter((c) => c?.kind === 'item' && c.item.rarity === 'normal');
  const held = world.cursor.entry;
  return {
    near: shop.isNear(),
    stock: shop.stock.flatMap((item, index) => {
      if (!item) return [];
      const price = buyPrice(item, data);
      const entry = itemEntryView(item, data);
      const compare = entry.equipSlots.flatMap((slot) => {
        const equipped = world.equipment.get(slot);
        return equipped ? [itemEntryView(equipped, data)] : [];
      });
      return [{ index, entry, price, affordable: gold >= price, compare }];
    }),
    potionPrice: shop.potionPrice,
    gamblePrice: shop.gamblePrice,
    gambleSlots: GAMBLE_SLOTS.filter((slot) => data.items.all.some((b) => b.slot === slot)).map((slot) => ({ slot, label: SLOT_LABELS[slot], glyph: GLYPHS[slot] })),
    heldSellPrice: held ? sellPrice(held, data) : null,
    normals: { count: normals.length, gold: normals.reduce((sum, c) => sum + (c ? sellPrice(c, data) : 0), 0) },
    gold,
  };
}
