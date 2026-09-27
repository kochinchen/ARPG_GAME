import type { Balance } from '../../data/schema/balance';
import { RARITIES, type Rarity } from '../../data/schema/item';
import { EQUIPMENT_SLOTS, type ItemInstance } from './ItemInstance';

export interface GearAura {
  /** 身上裝備的稀有度分數總和 */
  score: number;
  /** 光芒等級：0 = 無光、1 微弱、2 中等、3 強、4 高階 */
  level: number;
  /** 身上最高的稀有度（決定光芒顏色與特效種類） */
  rarity: Rarity;
}

/**
 * 裝備光芒（純函式）：身上每件裝備依稀有度給分後加總，決定光芒強度；顏色用最高稀有度。
 * 只穿一件傳奇不會整個人發光，要整身裝備都好才會明顯。
 */
export function gearAura(items: Iterable<ItemInstance | undefined>, config: Balance['gearAura']): GearAura {
  let score = 0;
  let best = 0;
  for (const item of items) {
    if (!item) continue;
    score += config.weights[item.rarity];
    best = Math.max(best, RARITIES.indexOf(item.rarity));
  }
  const level = config.thresholds.filter((t) => score >= t).length;
  return { score, level, rarity: RARITIES[best]! };
}

/** 從裝備欄取出所有裝備 */
export function equippedItems(get: (slot: (typeof EQUIPMENT_SLOTS)[number]) => ItemInstance | undefined): (ItemInstance | undefined)[] {
  return EQUIPMENT_SLOTS.map(get);
}
