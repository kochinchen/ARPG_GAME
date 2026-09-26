import { z } from 'zod';
import { IdSchema } from './common';

export const SkillCategorySchema = z.enum(['melee', 'ranged', 'magic', 'support', 'summon']);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillBranchSchema = z.enum(['A', 'B', 'C']);
export type SkillBranch = z.infer<typeof SkillBranchSchema>;

export const TargetTypeSchema = z.enum(['enemy', 'direction', 'ground', 'self']);

/**
 * Effect 先只驗證 type 欄位；各 Effect 的詳細 Schema 在 M4 實作 EffectRegistry 時補上。
 */
export const EffectDefSchema = z.looseObject({ type: z.string() });

export const SkillDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  category: SkillCategorySchema,
  tier: z.int().min(1).max(4),
  branch: SkillBranchSchema,
  targeting: TargetTypeSchema,
  cost: z.strictObject({
    mana: z.number().nonnegative(),
    perRank: z.number().default(0),
  }),
  cooldown: z.number().nonnegative().default(0),
  castTime: z.number().nonnegative().default(0),
  range: z.number().positive(),
  tags: z.array(z.string()).default([]),
  effects: z.array(EffectDefSchema).min(1),
});

export type SkillDef = z.infer<typeof SkillDefSchema>;
export type SkillDefInput = z.input<typeof SkillDefSchema>;
