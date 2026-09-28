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
});

export type LootTableDef = z.infer<typeof LootTableDefSchema>;
