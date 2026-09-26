import { z } from 'zod';

/** 資料 ID：小寫、底線、以點分層，例如 'magic.fireball' */
export const IdSchema = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/, 'ID 必須是小寫英數與底線，以點分層');

/** [min, max]，min <= max */
export const RangeSchema = z
  .tuple([z.number(), z.number()])
  .refine(([min, max]) => min <= max, 'Range 的 min 必須 <= max');

/** World 座標（Tile） */
export const PointSchema = z.tuple([z.number(), z.number()]);

/** 角色屬性名稱；物品、詞綴、Buff 都以此指定要影響的屬性 */
export const StatIdSchema = z.enum([
  'maxHp',
  'maxMana',
  'manaRegen',
  'moveSpeed',
  'damageMin',
  'damageMax',
  'attackSpeed',
  'attackRange',
  'critChance',
  'defense',
]);
export type StatId = z.infer<typeof StatIdSchema>;

export const ModifierKindSchema = z.enum(['flat', 'increased', 'more']);

export const ElementSchema = z.enum(['physical', 'fire', 'cold', 'lightning', 'poison']);
export type Element = z.infer<typeof ElementSchema>;
