import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';

export const EnemyDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  hp: z.number().positive(),
  damage: RangeSchema,
  defense: z.number().nonnegative(),
  /** Tile / 秒；0 = 不會移動（例如訓練木樁） */
  moveSpeed: z.number().nonnegative(),
  /** 碰撞半徑（Tile） */
  radius: z.number().positive().max(0.5).default(0.35),
  attackRange: z.number().positive(),
  /** 每秒攻擊次數 */
  attackSpeed: z.number().positive().default(1),
  /** 偵測範圍（Tile）：範圍內且視線未被牆擋住才會發現玩家 */
  detectRange: z.number().nonnegative(),
  /** 離出生點超過此距離就放棄追擊、走回原位 */
  leashRange: z.number().positive().default(14),
  /** none = 不行動（訓練木樁） */
  ai: z.enum(['none', 'melee']),
  skills: z.array(IdSchema).default([]),
  lootTable: IdSchema.optional(),
  xp: z.number().nonnegative(),
});

export type EnemyDef = z.infer<typeof EnemyDefSchema>;
export type EnemyDefInput = z.input<typeof EnemyDefSchema>;
