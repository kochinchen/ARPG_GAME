import { z } from 'zod';
import { IdSchema, ModifierKindSchema, RankNumberSchema, StatIdSchema } from './common';
import { EffectDefSchema } from './effects';
import { SkillComboInfoSchema } from './combo';

/** melee / ranged / magic 為主動技能（放進 Q/W/E 連段）；support 為常駐被動（最多裝備 3 個） */
export const SkillCategorySchema = z.enum(['melee', 'ranged', 'magic', 'support']);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export const SKILL_CATEGORIES = SkillCategorySchema.options;

export const SkillBranchSchema = z.enum(['A', 'B', 'C']);
export type SkillBranch = z.infer<typeof SkillBranchSchema>;
export const SKILL_BRANCHES = SkillBranchSchema.options;
export const SKILL_TIERS = [1, 2, 3, 4] as const;

/**
 * enemy：對單一敵人，距離不足會先走過去
 * direction：朝游標方向施放（投射物）
 * ground：施放在地面位置，超出距離時落在最遠可及處
 * self：以自己為中心
 */
export const TargetTypeSchema = z.enum(['enemy', 'direction', 'ground', 'self']);
export type TargetType = z.infer<typeof TargetTypeSchema>;

/** 被動技能對屬性的加成；values 為 Lv1～Lv5 */
export const PassiveBonusSchema = z.strictObject({
  stat: StatIdSchema,
  modifier: ModifierKindSchema,
  values: RankNumberSchema,
});

export const SkillDefSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string(),
    /** 技能說明（顯示在技能頁） */
    description: z.string().default(''),
    kind: z.enum(['active', 'passive']).default('active'),
    /** 技能樹位置；普通攻擊、怪物技能、隱藏組合產生的技能沒有 */
    tree: z
      .strictObject({
        category: SkillCategorySchema,
        tier: z.int().min(1).max(4),
        branch: SkillBranchSchema,
      })
      .optional(),
    // ---- 主動技能 ----
    targeting: TargetTypeSchema.default('enemy'),
    cost: z.strictObject({ mana: RankNumberSchema }).default({ mana: 0 }),
    /** 冷卻（秒） */
    cooldown: z.number().nonnegative().default(0),
    /** 施放時間（秒） */
    castTime: z.number().nonnegative().default(0.3),
    /** 效果在施放時間的哪個比例觸發（0～1）；重擊類可以設晚一點，前搖較長 */
    impactAt: z.number().min(0).max(1).default(0.5),
    /** 前搖期間在地上顯示攻擊範圍（怪物的重擊、法術），讓玩家有時間躲開 */
    telegraph: z.boolean().default(false),
    /** true：施放時間 = 1 / 攻速（普通攻擊、近戰、弓箭） */
    useAttackSpeed: z.boolean().default(false),
    /** 施放距離（Tile）；省略時使用角色的 attackRange（近戰） */
    range: z.number().positive().optional(),
    effects: z.array(EffectDefSchema).default([]),
    // ---- 被動技能 ----
    passive: z.array(PassiveBonusSchema).default([]),
    /** 供 Modifier（T4 突變、Legendary）比對 */
    tags: z.array(z.string()).default([]),
    /** 三段 Combo 判定用的距離分類與標籤（技能樹中的主動技能必填） */
    combo: SkillComboInfoSchema.optional(),
  })
  .superRefine((s, ctx) => {
    if (s.kind === 'active' && s.effects.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['effects'], message: '主動技能至少需要一個 effect' });
    }
    if (s.kind === 'passive' && s.passive.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['passive'], message: '被動技能至少需要一個 passive 加成' });
    }
    if (s.tree && s.kind === 'active' && !s.combo) {
      ctx.addIssue({ code: 'custom', path: ['combo'], message: '技能樹中的主動技能必須有 combo 標籤' });
    }
    if (s.tree && (s.tree.category === 'support') !== (s.kind === 'passive')) {
      ctx.addIssue({ code: 'custom', path: ['kind'], message: 'support 類技能必須是 passive，其他類必須是 active' });
    }
  });

export type SkillDef = z.infer<typeof SkillDefSchema>;
export type SkillDefInput = z.input<typeof SkillDefSchema>;
