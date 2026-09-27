import { z } from 'zod';
import { IdSchema, ModifierKindSchema, StatIdSchema } from './common';
import { ComboRoleSchema, ComboTagSchema, ElementTagSchema, RangeTypeSchema } from './combo';
import { EffectDefSchema, StatusKindSchema } from './effects';

/**
 * 傳奇（橘）與神話（紅）裝備：固定名稱、固定屬性組合與特殊效果（參考 Diablo II 的 Unique、
 * Titan Quest 的 Legendary）。只有數值在小範圍內浮動，功能固定。
 *
 * - 橘：主倍率 + 5 行（3 條固定屬性、1 條強屬性、1 條傳奇效果）＝ 6 條；強化一個技能或一種玩法
 * - 紅：主倍率 + 7 行（4 條固定屬性、3 條神話效果）＝ 8 條；改變整個 Build 或 Combo 邏輯
 * - 戒指 / 護身符沒有基礎攻防（沒有主倍率），改為多一行屬性（橘 6 行、紅 8 行）
 *
 * 特殊效果由少數幾種「機制」組合而成（mods / trigger / conditional），全部是資料，不需要專屬程式。
 */

export const LegendaryKindSchema = z.enum(['sword', 'axe', 'bow', 'staff', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet']);
export type LegendaryKind = z.infer<typeof LegendaryKindSchema>;

/** 技能條件：全部符合才算（省略的欄位不檢查） */
export const SkillFilterSchema = z.strictObject({
  /** 指定技能 */
  skills: z.array(IdSchema).optional(),
  /** Combo 標籤（Action / Control / Movement / Damage，符合任一個） */
  tags: z.array(ComboTagSchema).optional(),
  ranges: z.array(RangeTypeSchema).optional(),
  roles: z.array(ComboRoleSchema).optional(),
  /** 近戰 / 遠程 / 魔法 */
  categories: z.array(z.enum(['melee', 'ranged', 'magic'])).optional(),
  /** 元素（符合任一個） */
  elements: z.array(ElementTagSchema).optional(),
  /** 連段中的第幾段（1～3） */
  step: z.int().min(1).max(3).optional(),
  /** 只在成功組成 Combo 時 */
  comboOnly: z.boolean().optional(),
  /** 三招的距離依序符合（例如 Near → Mid → Far） */
  rangePattern: z.tuple([RangeTypeSchema, RangeTypeSchema, RangeTypeSchema]).optional(),
  /** 三招的距離都是這一種 */
  allRange: RangeTypeSchema.optional(),
  /** 三招都不相同 */
  distinctSkills: z.boolean().optional(),
  /** 三招至少包含幾種不同元素 */
  minElements: z.int().min(1).max(3).optional(),
  /** Q / W / E（0～2） */
  comboSlot: z.int().min(0).max(2).optional(),
  /** 尚未發現的 Combo（第一次施放） */
  newCombo: z.boolean().optional(),
  /** 秘密 Combo（規則層級 1）且已發現 */
  secretCombo: z.boolean().optional(),
});
export type SkillFilter = z.infer<typeof SkillFilterSchema>;

/** 加到技能上的加成（格式同 Combo 的 StepMods，比例以小數表示） */
export const ModsInputSchema = z.strictObject({
  damage: z.number().optional(),
  crit: z.number().optional(),
  aoeRadius: z.number().optional(),
  projectileSpeed: z.number().optional(),
  projectileCount: z.int().optional(),
  pierce: z.int().optional(),
  knockback: z.number().optional(),
  attackSpeed: z.number().optional(),
  castSpeed: z.number().optional(),
  freezeChance: z.number().optional(),
  statusChance: z.number().optional(),
  chainCount: z.int().optional(),
  hitCount: z.int().optional(),
  /** 魔力消耗（-0.3 = -30%） */
  mp: z.number().optional(),
  /** 對身上有指定狀態的目標：傷害 / 暴擊加成 */
  vsStatus: z.strictObject({ statuses: z.array(StatusKindSchema).min(1), damage: z.number().default(0), crit: z.number().default(0) }).optional(),
  /** 對生命低於 below 的目標：傷害加成 */
  vsLowHp: z.strictObject({ below: z.number().gt(0).lt(1), damage: z.number() }).optional(),
});
export type ModsInput = z.infer<typeof ModsInputSchema>;

const StatModSchema = z.strictObject({ stat: StatIdSchema, modifier: ModifierKindSchema.default('flat'), value: z.number() });

/** 觸發後的動作 */
export const ItemActionSchema = z.discriminatedUnion('type', [
  /** 執行一組效果（範圍傷害、投射物、狀態…）；at = 目標位置或自己 */
  z.strictObject({
    type: z.literal('effects'),
    at: z.enum(['target', 'self']),
    /** 效果算哪一類技能（套用對應的傷害加成與吸血） */
    category: z.enum(['melee', 'ranged', 'magic']),
    /** 傷害改為「觸發那一擊的傷害 × 比例」（例如震波造成該擊 35% 傷害） */
    hitFraction: z.number().positive().optional(),
    get effects() {
      return z.array(EffectDefSchema).min(1);
    },
  }),
  /** 回復：最大生命 / 魔力的比例，或觸發那一擊傷害的比例 */
  z.strictObject({ type: z.literal('restore'), hp: z.number().optional(), mp: z.number().optional(), hpOfDamage: z.number().optional() }),
  /** 疊加的增益：每層提供 stats，持續 duration 秒（每次觸發刷新） */
  z.strictObject({
    type: z.literal('buff'),
    id: z.string(),
    label: z.string(),
    add: z.int().positive().default(1),
    max: z.int().positive(),
    duration: z.number().positive(),
    stats: z.array(StatModSchema).default([]),
  }),
  /** 清除增益 */
  z.strictObject({ type: z.literal('clearBuff'), id: z.string() }),
  /** 下一次符合條件的施放得到加成（用過即消失） */
  z.strictObject({ type: z.literal('arm'), id: z.string(), when: SkillFilterSchema.default({}), mods: ModsInputSchema, duration: z.number().positive() }),
  /** 以相同目標再施放一次同一個技能 */
  z.strictObject({ type: z.literal('recast') }),
]);
export type ItemAction = z.infer<typeof ItemActionSchema>;

const BuffCheckSchema = z.strictObject({ id: z.string(), atLeast: z.int().positive().default(1) });

/** 特殊效果的機制 */
export const ItemMechanicSchema = z.discriminatedUnion('type', [
  /** 符合條件的技能得到加成；scale = 依元素種類數或增益層數倍增；consume = 使用後清除增益 */
  z.strictObject({
    type: z.literal('mods'),
    when: SkillFilterSchema.default({}),
    mods: ModsInputSchema,
    requireBuff: BuffCheckSchema.optional(),
    requireStatus: StatusKindSchema.optional(),
    scale: z.union([z.strictObject({ by: z.literal('elements') }), z.strictObject({ by: z.literal('buff'), id: z.string() })]).optional(),
    consumeBuff: z.string().optional(),
  }),
  /** 事件觸發 */
  z.strictObject({
    type: z.literal('trigger'),
    /** hit 命中、crit 暴擊、kill 擊殺、hurt 受到傷害、dodge 閃避、cast 施放、comboComplete 完成 Combo、comboDiscovered 發現新 Combo */
    on: z.enum(['hit', 'crit', 'kill', 'hurt', 'dodge', 'cast', 'comboComplete', 'comboDiscovered']),
    when: SkillFilterSchema.default({}),
    /** hurt：攻擊者在幾格內（近身） */
    near: z.number().positive().optional(),
    targetStatus: StatusKindSchema.optional(),
    every: z.int().positive().optional(),
    chance: z.number().gt(0).max(1).optional(),
    cooldown: z.number().nonnegative().default(0),
    hpBelow: z.number().gt(0).max(1).optional(),
    hpAbove: z.number().min(0).lt(1).optional(),
    mpAbove: z.number().min(0).lt(1).optional(),
    requireBuff: BuffCheckSchema.optional(),
    consumeBuff: z.string().optional(),
    actions: z.array(ItemActionSchema).min(1),
  }),
  /** 條件成立時的屬性加成（每幀判斷） */
  z.strictObject({
    type: z.literal('conditional'),
    hpBelow: z.number().gt(0).max(1).optional(),
    hpAbove: z.number().min(0).lt(1).optional(),
    /** 幾格內的敵人：perEnemy = 每一名敵人給一次（最多 max 名） */
    enemiesWithin: z.strictObject({ radius: z.number().positive(), perEnemy: z.boolean().default(false), max: z.int().positive().default(99) }).optional(),
    /** 幾格內沒有敵人 */
    noEnemiesWithin: z.number().positive().optional(),
    buff: BuffCheckSchema.optional(),
    stats: z.array(StatModSchema).min(1),
  }),
]);
export type ItemMechanic = z.infer<typeof ItemMechanicSchema>;

/** 固定屬性：數值在 value 範圍內擲骰，並隨物品等級的階級成長 */
const StatLineSchema = z.strictObject({
  type: z.literal('stat'),
  stat: StatIdSchema,
  modifier: ModifierKindSchema.default('flat'),
  value: z.tuple([z.number(), z.number()]),
  growth: z.number().nonnegative().default(0.15),
  /** 強屬性（◆） */
  strong: z.boolean().default(false),
});

/** 效果行：文字說明 + 機制；unique = 傳奇 / 神話效果（✦），strong = 強屬性（◆） */
const EffectLineSchema = z.strictObject({
  type: z.literal('effect'),
  text: z.string(),
  strong: z.boolean().default(false),
  unique: z.boolean().default(false),
  mechanics: z.array(ItemMechanicSchema).min(1),
});

export const LegendaryLineSchema = z.discriminatedUnion('type', [StatLineSchema, EffectLineSchema]);
export type LegendaryLine = z.infer<typeof LegendaryLineSchema>;

export const LegendaryDefSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string(),
    rarity: z.enum(['legendary', 'mythic']),
    kind: LegendaryKindSchema,
    /** 定位（顯示在說明） */
    role: z.string(),
    lore: z.string(),
    /** 主倍率（武器傷害 / 防禦 +X%）；戒指與護身符沒有 */
    main: z.tuple([z.number().positive(), z.number().positive()]).optional(),
    lines: z.array(LegendaryLineSchema),
    minItemLevel: z.int().positive().default(1),
    weight: z.number().positive().default(1),
  })
  .superRefine((d, ctx) => {
    const jewelry = d.kind === 'ring' || d.kind === 'amulet';
    if (jewelry === (d.main !== undefined)) ctx.addIssue({ code: 'custom', message: jewelry ? '戒指 / 護身符沒有主倍率' : '武器與防具必須有主倍率' });
    const total = (d.main ? 1 : 0) + d.lines.length;
    const expected = d.rarity === 'legendary' ? 6 : 8;
    if (total !== expected) ctx.addIssue({ code: 'custom', message: `${d.rarity === 'legendary' ? '橘' : '紅'}裝固定 ${expected} 條（目前 ${total}）` });
  });
export type LegendaryDef = z.infer<typeof LegendaryDefSchema>;
