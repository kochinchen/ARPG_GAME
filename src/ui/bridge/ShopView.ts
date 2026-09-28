import type { DataRegistry } from '../../data/DataRegistry';
import { MATERIAL_LABELS, type EquipSlot, type MaterialId } from '../../data/schema/item';
import type { GameWorld } from '../../game/GameWorld';
import { SLOT_LABELS } from '../../game/items/ItemDescriber';
import type { ItemInstance } from '../../game/items/ItemInstance';
import { itemStats } from '../../game/items/ItemStats';
import { buyPrice, sellPrice } from '../../game/items/Pricing';
import { itemEntryView, type EntryView } from './InventoryView';

export interface ShopView {
  /** 站在商人附近（離開後 UI 自動關閉商店） */
  near: boolean;
  /** compare：同欄位目前穿著的裝備（Tooltip 並排比較） */
  stock: {
    index: number;
    entry: EntryView;
    price: number;
    affordable: boolean;
    compare: EntryView[];
  }[];
  potionPrice: number;
  /** 身上的藥水 / 攜帶上限 */
  potions: { count: number; max: number };
  gamblePrice: number;
  gambleSlots: { slot: EquipSlot; label: string; glyph: string }[];
  /** 手上拿著的物品賣出價格（沒拿東西為 null） */
  heldSellPrice: number | null;
  /**
   * 飛昇：手上拿著的裝備換成下一階基底的預覽（沒拿裝備為 null）。
   * canAscend = false 時 note 說明原因（飾品、已是最高階、還沒到達該樓層）。
   */
  /** 飛昇格裡的裝備（沒放時為 null） */
  ascendSlot: EntryView | null;
  ascend: {
    from: string;
    to: string | null;
    fromStat: string;
    toStat: string | null;
    price: number;
    affordable: boolean;
    /** 需要的材料與持有數量 */
    materials: { label: string; need: number; have: number }[];
    canAscend: boolean;
    note: string;
  } | null;
  /** 背包裡普通（白色）裝備的件數與總價 */
  normals: { count: number; gold: number };
  gold: number;
}

export function emptyShopView(): ShopView {
  return {
    near: false,
    stock: [],
    potionPrice: 0,
    potions: { count: 0, max: 0 },
    gamblePrice: 0,
    gambleSlots: [],
    heldSellPrice: null,
    ascendSlot: null,
    ascend: null,
    normals: { count: 0, gold: 0 },
    gold: 0,
  };
}

const GLYPHS: Record<EquipSlot, string> = {
  weapon: '劍',
  helmet: '盔',
  armor: '甲',
  gloves: '手',
  boots: '靴',
  ring: '戒',
  amulet: '符',
};

const GAMBLE_SLOTS: readonly EquipSlot[] = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet'];

/** 貨架、金幣、背包改變時重建 */
export function shopSignature(world: GameWorld): string {
  return `${world.shop.version}|${world.wallet.gold}|${world.itemsVersion}|${world.shop.isNear()}|${world.floors.floor}|${world.progress.highestFloor}`;
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
    potions: {
      count: world.potions.count,
      max: data.potions.get(data.balance.player.potionId).maxCarry,
    },
    gamblePrice: shop.gamblePrice,
    gambleSlots: GAMBLE_SLOTS.filter((slot) => data.items.all.some((b) => b.slot === slot)).map((slot) => ({ slot, label: SLOT_LABELS[slot], glyph: GLYPHS[slot] })),
    heldSellPrice: held ? sellPrice(held, data) : null,
    ascendSlot: shop.ascendSlot ? itemEntryView(shop.ascendSlot, data) : null,
    ascend: shop.ascendSlot ? ascendView(world, data, shop.ascendSlot, gold) : null,
    normals: {
      count: normals.length,
      gold: normals.reduce((sum, c) => sum + (c ? sellPrice(c, data) : 0), 0),
    },
    gold,
  };
}

/** 飛昇預覽：基底名稱與基礎攻防（已含主倍率）的前後比較 */
function ascendView(world: GameWorld, data: DataRegistry, item: ItemInstance, gold: number): ShopView['ascend'] {
  const info = world.shop.ascendInfo(item);
  const statOf = (baseId: string) => {
    const s = itemStats({ ...item, baseId }, data).baseStats;
    if (s.damageMin !== undefined) return `傷害 ${s.damageMin}–${s.damageMax ?? 0}${s.spellPower !== undefined ? `・法術強度 ${s.spellPower}` : ''}`;
    if (s.defense !== undefined) return `防禦 ${s.defense}`;
    return '';
  };
  const base = data.items.get(item.baseId);
  const note =
    info.reason === 'jewelry'
      ? '戒指與護身符沒有階級，不能飛昇'
      : info.reason === 'maxTier'
        ? '已經是最高階（第 8 階）'
        : `第 ${base.tier} 階 → 第 ${info.next!.tier} 階（名稱、詞綴、主倍率與特殊效果保留）${
            info.next!.levelReq > world.progress.level ? `。飛昇後需要等級 ${info.next!.levelReq} 才能裝備` : ''
          }`;
  return {
    from: base.name,
    to: info.next?.name ?? null,
    fromStat: statOf(item.baseId),
    toStat: info.next ? statOf(info.next.id) : null,
    price: info.price,
    // 金幣與材料都要夠
    affordable: gold >= info.price && world.materials.has(info.materials),
    materials: (Object.entries(info.materials) as [MaterialId, number][]).map(([id, need]) => ({
      label: MATERIAL_LABELS[id],
      need,
      have: world.materials.get(id),
    })),
    canAscend: info.reason === null,
    note,
  };
}
