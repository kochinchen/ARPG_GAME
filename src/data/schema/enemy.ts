import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';

export const EnemyDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  hp: z.number().positive(),
  damage: RangeSchema,
  defense: z.number().nonnegative(),
  moveSpeed: z.number().positive(),
  attackRange: z.number().positive(),
  detectRange: z.number().positive(),
  ai: z.enum(['melee']),
  skills: z.array(IdSchema).min(1),
  lootTable: IdSchema,
  xp: z.number().nonnegative(),
});

export type EnemyDef = z.infer<typeof EnemyDefSchema>;
export type EnemyDefInput = z.input<typeof EnemyDefSchema>;
