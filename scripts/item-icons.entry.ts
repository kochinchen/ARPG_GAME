import { gameData } from '../src/data';
import { DataRegistry } from '../src/data/DataRegistry';
import type { ItemInstance } from '../src/game/items/ItemInstance';
import { itemIcon } from '../src/render/icons/ItemIcons';

/**
 * 裝備圖鑑的物品圖示（npm run docs:icons → release/設計文件/item-icons.js）：
 * 與遊戲背包相同的圖示，在網頁上即時產生（不把幾百張圖片塞進 HTML）。
 */
const data = DataRegistry.load(gameData);
const instance = (baseId: string, rarity: ItemInstance['rarity'], legendaryId?: string): ItemInstance => ({
  uid: 'codex',
  baseId,
  rarity,
  itemLevel: 1,
  affixes: [],
  ...(legendaryId ? { legendaryId } : {}),
});

/** 基底（白裝）的圖示 */
export function baseIcon(baseId: string): string | null {
  return data.items.has(baseId) ? itemIcon(instance(baseId, 'normal'), data) : null;
}

/** 傳奇 / 神話的圖示 */
export function uniqueIcon(legendaryId: string): string | null {
  if (!data.legendaries.has(legendaryId)) return null;
  const def = data.legendaries.get(legendaryId);
  const base = data.items.all.find((b) => b.weaponType === def.kind || b.slot === def.kind);
  return base ? itemIcon(instance(base.id, def.rarity, legendaryId), data) : null;
}
