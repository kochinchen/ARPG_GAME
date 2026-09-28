import type { DataRegistry } from '../../data/DataRegistry';
import { MATERIAL_LABELS, RARITIES, RARITY_LABELS, WEAPON_TYPE_LABELS, type EquipSlot, type MaterialId, type WeaponType } from '../../data/schema/item';
import { LegendaryKindSchema, type LegendaryKind } from '../../data/schema/legendary';
import { baseIsKind } from '../../game/items/ItemGenerator';
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
  /** 可以賭的種類：四種武器分開，再加上防具與飾品部位 */
  gambleKinds: { kind: LegendaryKind; label: string; glyph: string }[];
  /** 賭博的稀有度機率（例：普通 15% · 魔法 56.5% …） */
  gambleOdds: string;
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
    gambleKinds: [],
    gambleOdds: '',
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

const WEAPON_GLYPHS: Record<WeaponType, string> = { sword: '劍', axe: '斧', bow: '弓', staff: '杖' };

/** 賭博的種類：資料中有基底的才列出（新增武器類型只要加資料） */
function gambleKinds(data: DataRegistry): ShopView['gambleKinds'] {
  return LegendaryKindSchema.options
    .filter((kind) => data.items.all.some((b) => baseIsKind(b, kind)))
    .map((kind) => {
      const weapon = kind in WEAPON_GLYPHS ? (kind as WeaponType) : null;
      return weapon
        ? { kind, label: WEAPON_TYPE_LABELS[weapon], glyph: WEAPON_GLYPHS[weapon] }
        : { kind, label: SLOT_LABELS[kind as EquipSlot], glyph: GLYPHS[kind as EquipSlot] };
    });
}

function gambleOdds(data: DataRegistry): string {
  const weights = data.balance.shop.gamble.rarityWeights;
  const total = RARITIES.reduce((sum, r) => sum + (weights[r] ?? 0), 0);
  return RARITIES.filter((r) => (weights[r] ?? 0) > 0)
    .map((r) => `${RARITY_LABELS[r]} ${Number((((weights[r] ?? 0) / total) * 100).toFixed(2))}%`)
    .join(' · ');
}

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
    gambleKinds: gambleKinds(data),
    gambleOdds: gambleOdds(data),
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
