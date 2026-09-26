import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';

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
  rarityWeights: z.strictObject({
    normal: z.number().nonnegative(),
    magic: z.number().nonnegative(),
    rare: z.number().nonnegative(),
    legendary: z.number().nonnegative(),
  }),
});

export type LootTableDef = z.infer<typeof LootTableDefSchema>;
