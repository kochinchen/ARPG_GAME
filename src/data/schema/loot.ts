import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';
import { RarityWeightsSchema } from './item';

export const LootTableDefSchema = z.strictObject({
  id: IdSchema,
  /** 掉落次數 */
  rolls: z.int().positive(),
  /** 前幾次必定是物品（精英保底） */
  guaranteedItems: z.int().nonnegative().default(0),
  /** 接著幾次必定是藥水（第 35 層的寶箱：每個必出 2 罐） */
  guaranteedPotions: z.int().nonnegative().default(0),
  entries: z
    .array(
      z.strictObject({
        kind: z.enum(['nothing', 'item', 'potion', 'gold']),
        weight: z.number().positive(),
      }),
    )
    .min(1),
  /** 掉落金幣時的數量範圍 */
  gold: RangeSchema.default([1, 10]),
  rarityWeights: RarityWeightsSchema,
  /** 飛昇碎片：chance 機率掉落 count 片（魔王） */
  shards: z.strictObject({ chance: z.number().gt(0).max(1), count: RangeSchema }).optional(),
  /** 額外的金幣（隱藏魔王）：範圍內一筆，分成 piles 堆噴出來 */
  bonusGold: z.strictObject({ amount: RangeSchema, piles: z.int().positive() }).optional(),
  /** 這個機率把其中一件裝備換成孔數全滿的白裝（隱藏魔王） */
  fullSocketWhite: z.number().gt(0).max(1).optional(),
  /**
   * 越深掉越多（隱藏魔王）：fromFloor 是表上的數量，到 toFloor 線性增加：
   * 多 extraItems 件必掉的裝備、額外金幣 × goldMultiplier、孔數全滿白裝的機率變成 fullSocketWhite
   */
  deeper: z.strictObject({ fromFloor: z.int().positive(), toFloor: z.int().positive(), extraItems: z.int().positive(), goldMultiplier: z.number().gt(1), fullSocketWhite: z.number().gt(0).max(1) }).optional(),
});

export type LootTableDef = z.infer<typeof LootTableDefSchema>;
