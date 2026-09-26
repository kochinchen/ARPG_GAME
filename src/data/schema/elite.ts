import { z } from 'zod';
import { IdSchema, ModifierKindSchema, StatIdSchema } from './common';

/**
 * 精英怪詞綴：精英怪（每群的隊長）身上 1～2 個，名稱會加在怪物名稱前面。
 * 目前只有屬性加成；需要特殊行為的詞綴（火焰強化、傳送…）之後加新欄位。
 */
export const EliteAffixDefSchema = z.strictObject({
  id: IdSchema,
  /** 名稱前綴，例如「強壯的」 */
  name: z.string(),
  modifiers: z.array(z.strictObject({ stat: StatIdSchema, kind: ModifierKindSchema.default('flat'), value: z.number() })).min(1),
  /** 從第幾層開始出現 */
  minFloor: z.int().positive().default(1),
  weight: z.number().positive(),
});

export type EliteAffixDef = z.infer<typeof EliteAffixDefSchema>;

/** Boss 狂暴：HP 降到 threshold 以下時一次性套用 modifiers */
export const BossConfigSchema = z.strictObject({
  enrageThreshold: z.number().gt(0).lt(1),
  enrage: z.array(z.strictObject({ stat: StatIdSchema, kind: ModifierKindSchema.default('flat'), value: z.number() })).min(1),
});

/** 精英怪的共通強化 */
export const EliteConfigSchema = z.strictObject({
  /** 第幾層開始出現精英怪 */
  minFloor: z.int().positive(),
  hpMultiplier: z.number().min(1),
  damageMultiplier: z.number().min(1),
  xpMultiplier: z.number().min(1),
  /** 體型放大（碰撞半徑，最大 0.5） */
  radiusMultiplier: z.number().min(1),
  /** 除了原本的掉落，另外擲一次這張掉落表 */
  lootTable: IdSchema,
});
