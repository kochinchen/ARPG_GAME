import type { Rarity } from '../../data/schema/item';

/**
 * 一件實際存在的物品。只存 ID 與擲骰結果（可直接存檔），名稱與數值說明由 ItemDescriber 推導。
 */
export interface ItemInstance {
  uid: string;
  baseId: string;
  rarity: Rarity;
  itemLevel: number;
  /**
   * 主倍率（例如 1.8 = +180%）：武器乘在基礎傷害、防具乘在基礎防禦、飾品乘在所有詞綴。
   * 省略 = 0（普通裝備、測試用物品）。
   */
  quality?: number;
  affixes: { id: string; rolls: number[] }[];
  /** 傳奇 / 神話：對應的 LegendaryDef */
  legendaryId?: string;
  /** 傳奇 / 神話：固定屬性行的擲骰結果（依 LegendaryDef 中 stat 行的順序，已含階級成長） */
  legendaryRolls?: number[];
}

export type EquipmentSlot = 'weapon' | 'helmet' | 'armor' | 'gloves' | 'boots' | 'ring1' | 'ring2' | 'amulet';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  'weapon',
  'helmet',
  'armor',
  'gloves',
  'boots',
  'ring1',
  'ring2',
  'amulet',
];
