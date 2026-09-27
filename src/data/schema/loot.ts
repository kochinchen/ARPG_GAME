import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';
import { RarityWeightsSchema } from './item';

export const LootTableDefSchema = z.strictObject({
  id: IdSchema,
  /** 掉落次數 */
  rolls: z.int().positive(),
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
});

export type LootTableDef = z.infer<typeof LootTableDefSchema>;
