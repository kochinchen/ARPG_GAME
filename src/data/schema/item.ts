import { z } from 'zod';
import { IdSchema, ModifierKindSchema, StatIdSchema } from './common';

export const EquipSlotSchema = z.enum(['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet']);
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

export const RaritySchema = z.enum(['normal', 'magic', 'rare', 'legendary']);
export type Rarity = z.infer<typeof RaritySchema>;

export const ItemBaseDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  slot: EquipSlotSchema,
  levelReq: z.int().nonnegative(),
  /** 裝備時以 flat Modifier 加到角色屬性，例如 { damageMin: 2, damageMax: 5 } */
  baseStats: z.partialRecord(StatIdSchema, z.number()).default({}),
});

export const PotionDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  /** 回復最大值的比例 */
  hpPct: z.number().min(0).max(1),
  mpPct: z.number().min(0).max(1),
  /** 背包中每一格最多疊幾瓶 */
  maxStack: z.int().positive(),
  cooldown: z.number().nonnegative(),
});

export const AffixDefSchema = z.strictObject({
  id: IdSchema,
  /** 顯示名稱，例如「鋒利的」 */
  name: z.string(),
  kind: z.enum(['item', 'elite']),
  stat: StatIdSchema,
  modifier: ModifierKindSchema.default('flat'),
  /** 擲骰範圍；兩端都是整數時擲整數，否則取到小數第 2 位 */
  value: z.tuple([z.number(), z.number()]).refine(([min, max]) => min <= max, 'min 必須 <= max'),
  minItemLevel: z.int().nonnegative(),
  weight: z.number().positive(),
  /** 可出現在哪些裝備欄位；省略 = 全部 */
  slots: z.array(EquipSlotSchema).optional(),
});

export type ItemBaseDef = z.infer<typeof ItemBaseDefSchema>;
export type PotionDef = z.infer<typeof PotionDefSchema>;
export type AffixDef = z.infer<typeof AffixDefSchema>;

/** 每種稀有度的詞綴數量 */
export const AFFIX_COUNT: Record<Rarity, readonly [number, number]> = {
  normal: [0, 0],
  magic: [1, 2],
  rare: [3, 4],
  legendary: [0, 0],
};

