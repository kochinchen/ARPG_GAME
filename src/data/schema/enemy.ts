import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';

export const EnemyDefSchema = z
  .strictObject({
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
  /** none = 不行動（訓練木樁）；melee = 貼身攻擊；ranged = 保持距離攻擊，被貼身時後退 */
  ai: z.enum(['none', 'melee', 'ranged']),
  /** ranged：目標比這個距離近時後退（Tile） */
  keepDistance: z.number().nonnegative().default(0),
  /**
   * 第一個技能為主要攻擊；其餘為特殊技能（應有冷卻），冷卻結束且目標在範圍內時優先使用。
   */
  skills: z.array(IdSchema).default([]),
  lootTable: IdSchema.optional(),
  xp: z.number().nonnegative(),
  /** Boss：冰凍改為強力緩速 */
  boss: z.boolean().default(false),
  })
  .refine((e) => e.ai === 'none' || e.skills.length > 0, { message: '有 AI 的怪物至少需要一個技能' })
  .refine((e) => e.ai !== 'ranged' || e.keepDistance > 0, { message: 'ranged AI 需要設定 keepDistance' });

export type EnemyDef = z.infer<typeof EnemyDefSchema>;
export type EnemyDefInput = z.input<typeof EnemyDefSchema>;
