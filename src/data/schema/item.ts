import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';

export const EquipSlotSchema = z.enum(['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet']);
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

export const ItemBaseDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  slot: EquipSlotSchema,
  levelReq: z.int().nonnegative(),
  /** 例：{ damageMin: 2, damageMax: 5 }；Stat 名稱於 M2 StatBlock 定案 */
  baseStats: z.record(z.string(), z.number()),
});

export const PotionDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  /** 回復最大值的比例 */
  hpPct: z.number().min(0).max(1),
  mpPct: z.number().min(0).max(1),
  maxStack: z.int().positive(),
  cooldown: z.number().nonnegative(),
});

export const AffixDefSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['item', 'elite']),
  stat: z.string(),
  value: RangeSchema,
  minItemLevel: z.int().nonnegative(),
  weight: z.number().positive(),
});

export type ItemBaseDef = z.infer<typeof ItemBaseDefSchema>;
export type PotionDef = z.infer<typeof PotionDefSchema>;
export type AffixDef = z.infer<typeof AffixDefSchema>;
