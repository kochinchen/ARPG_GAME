import { z } from 'zod';
import { IdSchema } from './common';
import { StatusKindSchema } from './effects';

/**
 * 三段技能 Combo 的資料格式（規格：docs/COMBO_SYSTEM.md）。
 * RangeType 與各類標籤只供系統判定，不顯示給玩家。
 */

export const RangeTypeSchema = z.enum(['Near', 'Mid', 'Far']);
export type RangeType = z.infer<typeof RangeTypeSchema>;

export const ActionTagSchema = z.enum([
  'Fast',
  'Heavy',
  'MultiHit',
  'Projectile',
  'AoE',
  'Channel',
  'Impact',
  'Guard',
  'Counter',
  'Execute',
  'Pierce',
  'Burst',
]);
/** 實際造成的傷害類型 */
export const DamageTagSchema = z.enum(['Physical', 'Fire', 'Ice', 'Lightning']);
/** 魔法元素（不含 Physical） */
export const ElementTagSchema = z.enum(['Fire', 'Ice', 'Lightning']);
export const MovementTagSchema = z.enum(['Advance', 'Retreat', 'Roll', 'Reposition', 'Dash']);
export const ControlTagSchema = z.enum(['Slow', 'Freeze', 'Stun', 'Knockback', 'ArmorBreak', 'Mark', 'Shield', 'Launch']);
export const ComboRoleSchema = z.enum(['Starter', 'Setup', 'Bridge', 'Amplifier', 'Finisher', 'Defense']);

export const ComboTagSchema = z.union([ActionTagSchema, DamageTagSchema, MovementTagSchema, ControlTagSchema]);
export type ComboTag = z.infer<typeof ComboTagSchema>;
export type ComboRole = z.infer<typeof ComboRoleSchema>;
export type ElementTag = z.infer<typeof ElementTagSchema>;

/** 技能的 Combo 標籤；「None」以空陣列表示 */
export const SkillComboInfoSchema = z.strictObject({
  range: RangeTypeSchema,
  action: z.array(ActionTagSchema).default([]),
  damage: z.array(DamageTagSchema).default([]),
  element: z.array(ElementTagSchema).default([]),
  movement: z.array(MovementTagSchema).default([]),
  control: z.array(ControlTagSchema).default([]),
  role: ComboRoleSchema,
});
export type SkillComboInfo = z.infer<typeof SkillComboInfoSchema>;

/**
 * Range 排列是否合理：只有「直接來回跳」（Near→Far→Near、Far→Near→Far）不合理。
 * 資料驗證與遊戲判定共用。
 */
export function isRangeSequenceValid(r1: RangeType, r2: RangeType, r3: RangeType): boolean {
  const ends = (a: RangeType, b: RangeType) => (a === 'Near' && b === 'Far') || (a === 'Far' && b === 'Near');
  return !(r1 === r3 && ends(r1, r2));
}

// ───────────────────────── Combo Rule ─────────────────────────

export const StepMatcherSchema = z.strictObject({
  /** 含其中任一標籤 */
  anyTags: z.array(ComboTagSchema).optional(),
  /** 全部標籤都要有 */
  allTags: z.array(ComboTagSchema).optional(),
  range: z.array(RangeTypeSchema).optional(),
  role: z.array(ComboRoleSchema).optional(),
  /** 會造成傷害（DamageTags 非空） */
  hasDamage: z.boolean().optional(),
  /** 魔法元素技能（ElementTags 非空） */
  hasElement: z.boolean().optional(),
});
export type StepMatcher = z.infer<typeof StepMatcherSchema>;

export const ComboModifierTypeSchema = z.enum([
  'damage',
  'crit',
  'aoeRadius',
  'projectileSize',
  'projectileSpeed',
  'projectileCount',
  'pierce',
  'armorPenetration',
  'knockback',
  /** 硬直系統尚未實作：資料保留，暫不生效 */
  'stagger',
  'attackSpeed',
  'castSpeed',
  'animationSpeed',
  'elementDamage',
  'burn',
  /** 機率類：加百分點 */
  'freezeChance',
  'freezeDuration',
  'statusChance',
  'chainCount',
  'hitCount',
  'mp',
  'movementSpeed',
  /** 整組連段期間施放者免疫擊退 */
  'knockbackResist',
]);
export type ComboModifierType = z.infer<typeof ComboModifierTypeSchema>;

const StepIndexSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const ComboModifierSchema = z.strictObject({
  type: ComboModifierTypeSchema,
  /** Lv1 基準值；百分比以比例表示（0.25 = +25%），數量類為整數 */
  value: z.number().default(0),
  target: z.enum(['step1', 'step2', 'step3', 'allSteps', 'self']).default('step3'),
  /** elementDamage 的元素；fromStep1 / fromStep2 = 沿用第一 / 第二招的元素 */
  element: z.enum(['fire', 'ice', 'lightning', 'fromStep1', 'fromStep2']).optional(),
  when: z
    .union([
      z.strictObject({ stepHasTag: z.strictObject({ step: StepIndexSchema, tag: ComboTagSchema }) }),
      z.strictObject({ stepLacksTag: z.strictObject({ step: StepIndexSchema, tag: ComboTagSchema }) }),
      z.strictObject({ hitsAtLeast: z.strictObject({ steps: z.array(StepIndexSchema).min(1), hits: z.int().positive() }) }),
      /** 命中時才判斷：目標有其中任一狀態 */
      z.strictObject({ targetHasStatus: z.array(StatusKindSchema).min(1) }),
    ])
    .optional(),
});
export type ComboModifierDef = z.infer<typeof ComboModifierSchema>;

export const ComboRuleSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string(),
    description: z.string().default(''),
    /** 1 Exact Secret → 2 Element Escalation → 3 Status / Setup / Execute → 4 Range Transition → 5 Generic Action */
    tier: z.int().min(1).max(5),
    /** 同層、同 Specificity 時的順序（小者優先） */
    order: z.int().nonnegative(),
    match: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('exact'), skills: z.tuple([IdSchema, IdSchema, IdSchema]) }),
      z.strictObject({
        kind: z.literal('pattern'),
        steps: z.tuple([StepMatcherSchema, StepMatcherSchema, StepMatcherSchema]),
        distinctSkills: z.boolean().default(false),
        /** 帶元素的步驟之間元素互不相同（雙元素附刃） */
        distinctElements: z.boolean().default(false),
        sameElement: ElementTagSchema.optional(),
        rangePattern: z.tuple([RangeTypeSchema, RangeTypeSchema, RangeTypeSchema]).optional(),
      }),
    ]),
    modifiers: z.array(ComboModifierSchema).min(1),
    /** 依第三招替換顯示名稱（例如 R01 + 火球 → Greater Fireball） */
    displayNames: z.array(z.strictObject({ finalSkill: IdSchema, name: z.string() })).default([]),
  })
  .superRefine((rule, ctx) => {
    if ((rule.match.kind === 'exact') !== (rule.tier === 1)) {
      ctx.addIssue({ code: 'custom', path: ['tier'], message: 'Exact Secret Combo 必須是 tier 1，且 tier 1 只能是 Exact' });
    }
  });
export type ComboRuleDef = z.infer<typeof ComboRuleSchema>;
