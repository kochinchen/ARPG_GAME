import type { Balance } from '../../data/schema/balance';
import { RARITIES, type Rarity } from '../../data/schema/item';
import type { CoreTypeId } from '../../data/schema/core';
import type { CoreElement } from '../../data/schema/core';
import { EQUIPMENT_SLOTS, type ItemInstance } from './ItemInstance';

export interface GearAura {
  /** 身上裝備的稀有度分數總和 */
  score: number;
  /** 光芒等級：0 = 無光、1 微弱、2 中等、3 強、4 高階、5～6 熔核加開的兩階 */
  level: number;
  /** 身上最高的稀有度（決定光芒顏色與特效種類） */
  rarity: Rarity;
  /** 核光：全身最多的核種（沒有熔核為 null；平手取核階合計高的）與靈核的元素 */
  core: { type: CoreTypeId; element: CoreElement | undefined } | null;
}

/**
 * 裝備光芒（純函式）：身上每件裝備依稀有度給分，再加上全身熔核的核階（T1 = 1 … T5 = 5），決定光芒強度；
 * 顏色用最高稀有度，外圈的核光用全身最多的核種。只穿一件傳奇不會整個人發光，要整身裝備都好才會明顯。
 */
export function gearAura(items: Iterable<ItemInstance | undefined>, config: Balance['gearAura']): GearAura {
  let score = 0;
  let best = 0;
  const cores = new Map<CoreTypeId, { count: number; tiers: number; element: CoreElement | undefined }>();
  for (const item of items) {
    if (!item) continue;
    score += config.weights[item.rarity];
    best = Math.max(best, RARITIES.indexOf(item.rarity));
    for (const core of item.sockets?.cores ?? []) {
      score += core.tier;
      for (const type of core.types) {
        const c = cores.get(type) ?? { count: 0, tiers: 0, element: undefined };
        c.count++;
        c.tiers += core.tier;
        c.element ??= core.element;
        cores.set(type, c);
      }
    }
  }
  const level = config.thresholds.filter((t) => score >= t).length;
  const top = [...cores].sort(([, a], [, b]) => b.count - a.count || b.tiers - a.tiers)[0];
  return { score, level, rarity: RARITIES[best]!, core: top ? { type: top[0], element: top[1].element } : null };
}

/** 從裝備欄取出所有裝備 */
export function equippedItems(get: (slot: (typeof EQUIPMENT_SLOTS)[number]) => ItemInstance | undefined): (ItemInstance | undefined)[] {
  return EQUIPMENT_SLOTS.map(get);
}
