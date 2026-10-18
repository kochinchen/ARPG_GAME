import type { CoreElement, CoreSlot, CoreTypeId } from '../../data/schema/core';
import type { Rarity } from '../../data/schema/item';

/** 熔核的核色（沒有紅核） */
export type CoreRarity = Exclude<Rarity, 'mythic'>;

/** 一條擲過骰的熔核屬性：lineId 對應 data/cores.ts，roll 是 T1 範圍內的位置（0 = 下限、1 = 上限） */
export interface CoreRoll {
  lineId: string;
  roll: number;
}

/**
 * 一顆熔核（v0.5.0 鑲嵌與融合）。只存 ID 與擲骰結果（可直接存檔），數值由資料推導：
 * T1 範圍 × 核階倍率（balance.fusion.tierMultiplier）× power（核色倍率擲骰）；混核的主屬性再 × mixedMultiplier。
 */
export interface CoreInstance {
  uid: string;
  /** 核種；混核有兩種（票數最高的兩種） */
  types: [CoreTypeId] | [CoreTypeId, CoreTypeId];
  /** 核階 1～5 */
  tier: number;
  rarity: CoreRarity;
  /** 核色倍率的擲骰結果（affixPower.rarity 範圍內；白 / 藍 / 黃為 1） */
  power: number;
  /** 投入武器的平均物品等級（四捨五入）：說明與拆解用 */
  itemLevel: number;
  /** 靈核（含混核中的靈核）的元素，融合時決定 */
  element?: CoreElement;
  /** 四把同種類 */
  pure?: boolean;
  /** 鑲在各部位的主屬性（混核每個部位兩條） */
  main: Record<CoreSlot, CoreRoll[]>;
  /** 副屬性（不分部位） */
  secondary: CoreRoll[];
  /** 印記：投入的橘武器的強屬性（◆），數值 × brand.valueMultiplier */
  brand?: { legendaryId: string; line: number; roll?: number };
}

/** 裝備上的孔：max 是目前的孔數（鑿孔增加），cores 是已鑲入的熔核（數量 ≤ max，其餘為空孔） */
export interface Sockets {
  max: number;
  cores: CoreInstance[];
}
