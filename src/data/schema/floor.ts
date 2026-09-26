import { z } from 'zod';
import { IdSchema, PointSchema, RangeSchema } from './common';

export const FloorDefSchema = z
  .strictObject({
    id: IdSchema,
    /** 適用樓層區間 [from, to] */
    floors: RangeSchema,
    map: IdSchema,
    monsterPool: z.array(z.strictObject({ enemyId: IdSchema, weight: z.number().positive() })).min(1),
    density: z.number().positive(),
    eliteChance: z.number().min(0).max(1),
    affixCount: RangeSchema,
    lootTier: z.int().positive(),
    checkpoints: z.strictObject({ stairs: PointSchema, midway: PointSchema }),
    chests: z.int().nonnegative(),
  });

export type FloorDef = z.infer<typeof FloorDefSchema>;
