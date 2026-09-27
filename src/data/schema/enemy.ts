import { z } from 'zod';
import { IdSchema, ModifierKindSchema, RangeSchema, StatIdSchema } from './common';

/** 怪物圖鑑的分類 */
export const EnemyFamilySchema = z.enum(['undead', 'beast', 'chitin', 'brute', 'spitter', 'floater', 'parasite', 'boss', 'other']);
export type EnemyFamily = z.infer<typeof EnemyFamilySchema>;

/** Boss 的階段：HP 降到 hpBelow 以下時進入（一次性套用 modifiers，並可改用另一組技能） */
export const BossPhaseSchema = z.strictObject({
  hpBelow: z.number().gt(0).lt(1),
  /** 顯示在 Boss 血條與畫面上，例如「狂怒」「火焰附魔」 */
  label: z.string(),
  modifiers: z.array(z.strictObject({ stat: StatIdSchema, kind: ModifierKindSchema.default('flat'), value: z.number() })).default([]),
  /** 進入此階段後改用的技能（取代原本的技能；第一個為主要攻擊，其餘依序為特殊技能） */
  skills: z.array(IdSchema).min(1).optional(),
});
export type BossPhase = z.infer<typeof BossPhaseSchema>;

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
  /** 體型倍率（只影響外觀大小；Boss 為主角的 2 倍以上）。一般怪物另有隨機體型，見 balance.enemySize */
  size: z.number().positive().default(1),
  /** Boss 的階段變化（依 hpBelow 由高到低） */
  phases: z.array(BossPhaseSchema).default([]),
  /** 怪物圖鑑：分類與介紹 */
  family: EnemyFamilySchema.default('undead'),
  lore: z.string().default(''),
  })
  .refine((e) => e.ai === 'none' || e.skills.length > 0, { message: '有 AI 的怪物至少需要一個技能' })
  .refine((e) => e.ai !== 'ranged' || e.keepDistance > 0, { message: 'ranged AI 需要設定 keepDistance' })
  .refine((e) => e.phases.every((p, i) => i === 0 || p.hpBelow < e.phases[i - 1]!.hpBelow), { message: 'phases 必須依 hpBelow 由高到低排列' })
  .refine((e) => e.boss || e.phases.length === 0, { message: '只有 Boss 可以設定 phases' });

export type EnemyDef = z.infer<typeof EnemyDefSchema>;
export type EnemyDefInput = z.input<typeof EnemyDefSchema>;
