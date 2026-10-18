import { z } from 'zod';
import { IdSchema, ModifierKindSchema, StatIdSchema } from './common';
import { EquipSlotSchema, RaritySchema, WeaponTypeSchema } from './item';
import { SkillFilterSchema } from './legendary';

/**
 * 熔核（v0.5.0 鑲嵌與融合，規格：SPEC_v0.5.0_鑲嵌與融合）：融合用不到的武器得到熔核，鑲進裝備的孔。
 * 同一顆熔核鑲在不同部位效果不同；每條屬性在 T1 範圍內擲骰，再乘核階倍率與核色倍率（見 balance.fusion）。
 */

/** 可以鑲嵌的部位（第二期加盾牌） */
export const CoreSlotSchema = z.enum(['weapon', 'helmet', 'armor', 'gloves', 'boots']);
export type CoreSlot = z.infer<typeof CoreSlotSchema>;
export const CORE_SLOTS: readonly CoreSlot[] = CoreSlotSchema.options;

/** 靈核的元素：融合時決定並存在核上，對應 fire / cold / lightning 的附加傷害與抗性 */
export const CoreElementSchema = z.enum(['fire', 'cold', 'lightning']);
export type CoreElement = z.infer<typeof CoreElementSchema>;

/** 熔核屬性的 T1 範圍 */
const RangeSchema = z.tuple([z.number().positive(), z.number().positive()]).refine(([lo, hi]) => lo <= hi, '範圍下限不可大於上限');

const LineBase = {
  /** 存檔用的 ID（熔核只存 ID 與擲骰值） */
  id: IdSchema,
  value: RangeSchema,
  /** 只有這個核色以上才會抽到（例如穿透 +1 只在紫以上） */
  minRarity: RaritySchema.optional(),
  /** none = 固定數值，不乘核階與核色（例如穿透 +1） */
  scaling: z.enum(['tier', 'none']).default('tier'),
  /** T5 改用這個範圍（取代核階倍率，例如射擊距離 T5 +1.5～2.0 格） */
  t5Value: RangeSchema.optional(),
};

/** 角色屬性（裝備時加到角色身上） */
const StatLineSchema = z.strictObject({
  type: z.literal('stat'),
  ...LineBase,
  stat: StatIdSchema,
  modifier: ModifierKindSchema.default('flat'),
});

/** 元素屬性：依熔核的元素換成 fire / cold / lightning 的附加傷害或抗性 */
const ElementLineSchema = z.strictObject({
  type: z.literal('element'),
  ...LineBase,
  kind: z.enum(['damage', 'resist']),
});

/** 技能加成（依技能標籤篩選，與傳奇裝的效果行同一套） */
const ModsLineSchema = z.strictObject({
  type: z.literal('mods'),
  ...LineBase,
  /** 顯示名稱（例如「重擊類技能傷害」） */
  label: z.string(),
  when: SkillFilterSchema.default({}),
  mod: z.enum(['damage', 'knockback', 'projectileSpeed', 'pierce', 'attackSpeed', 'castSpeed', 'aoeRadius', 'crit']),
});

export const CoreLineSchema = z.discriminatedUnion('type', [StatLineSchema, ElementLineSchema, ModsLineSchema]);
export type CoreLine = z.infer<typeof CoreLineSchema>;

/** 每個部位的主屬性候選（兩條時擲骰選一條） */
const SlotLinesSchema = z.array(CoreLineSchema).min(1).max(2);

export const CoreTypeIdSchema = z.enum(['sharp', 'heavy', 'pierce', 'arcane', 'wall', 'swift', 'grip', 'crown']);

export const CoreTypeDefSchema = z.strictObject({
  id: CoreTypeIdSchema,
  name: z.string(),
  /** attack 攻核（武器融合）；defense 護核（防具融合，v0.5.1 啟用） */
  family: z.enum(['attack', 'defense']),
  /** 攻核：來源武器種類（投票用） */
  weapon: WeaponTypeSchema.optional(),
  /** 護核：來源部位 */
  sourceSlots: z.array(EquipSlotSchema).optional(),
  /** false = 資料先寫好但還不能融合出來 */
  enabled: z.boolean(),
  /** 鑲在各部位的主屬性；啟用的核種五個部位都要有 */
  slots: z.partialRecord(CoreSlotSchema, SlotLinesSchema),
});
export type CoreTypeDef = z.infer<typeof CoreTypeDefSchema>;
export type CoreTypeId = CoreTypeDef['id'];

export const CoreDataSchema = z.strictObject({
  types: z.array(CoreTypeDefSchema).min(1),
  /** 通用副屬性池（任何核種都可能抽到） */
  shared: z.array(CoreLineSchema).min(1),
});
export type CoreData = z.infer<typeof CoreDataSchema>;
