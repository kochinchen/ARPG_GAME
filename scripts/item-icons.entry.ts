import { gameData } from '../src/data';
import { DataRegistry } from '../src/data/DataRegistry';
import type { ItemInstance } from '../src/game/items/ItemInstance';
import { itemIcon } from '../src/render/icons/ItemIcons';
import { coreIcon } from '../src/render/icons/CoreIcons';
import type { CoreElement, CoreTypeId } from '../src/data/schema/core';

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

/** 熔核圖示（v0.5.0）：核種（混核兩種）、核階、核色、元素、是否帶印記 */
export function gemIcon(types: CoreTypeId[], tier: number, rarity: 'normal' | 'magic' | 'rare' | 'epic' | 'legendary', element?: CoreElement, branded = false): string {
  return coreIcon({ types: types as [CoreTypeId], tier, rarity, ...(element ? { element } : {}), ...(branded ? { brand: { legendaryId: 'codex', line: 0 } } : {}) });
}
