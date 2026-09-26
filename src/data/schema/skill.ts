import { z } from 'zod';
import { IdSchema } from './common';
import { EffectDefSchema } from './effects';

export const SkillCategorySchema = z.enum(['melee', 'ranged', 'magic', 'support', 'summon']);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillBranchSchema = z.enum(['A', 'B', 'C']);
export type SkillBranch = z.infer<typeof SkillBranchSchema>;

/**
 * enemy：對單一敵人，距離不足會先走過去
 * direction：朝游標方向施放（投射物）
 * ground：施放在地面位置，超出距離時落在最遠可及處
 * self：以自己為中心
 */
export const TargetTypeSchema = z.enum(['enemy', 'direction', 'ground', 'self']);
export type TargetType = z.infer<typeof TargetTypeSchema>;

export const SkillDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  /** 技能樹位置；普通攻擊與怪物技能沒有 */
  tree: z
    .strictObject({
      category: SkillCategorySchema,
      tier: z.int().min(1).max(4),
      branch: SkillBranchSchema,
    })
    .optional(),
  targeting: TargetTypeSchema,
  cost: z
    .strictObject({
      mana: z.number().nonnegative(),
      /** 每提升一級增加的魔力消耗 */
      perRank: z.number().nonnegative().default(0),
    })
    .default({ mana: 0, perRank: 0 }),
  /** 冷卻（秒） */
  cooldown: z.number().nonnegative().default(0),
  /** 施放時間（秒）；效果在施放到一半時觸發 */
  castTime: z.number().nonnegative().default(0.3),
  /** true：施放時間 = 1 / 攻速（普通攻擊、近戰技能） */
  useAttackSpeed: z.boolean().default(false),
  /** 施放距離（Tile）；省略時使用角色的 attackRange（近戰） */
  range: z.number().positive().optional(),
  /** 供 Modifier（T4 突變、Legendary）比對 */
  tags: z.array(z.string()).default([]),
  effects: z.array(EffectDefSchema).min(1),
});

export type SkillDef = z.infer<typeof SkillDefSchema>;
export type SkillDefInput = z.input<typeof SkillDefSchema>;
