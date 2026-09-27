import { z } from 'zod';
import { IdSchema, ModifierKindSchema, StatIdSchema } from './common';

export const EquipSlotSchema = z.enum(['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet']);
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

/**
 * 稀有度（低 → 高）：白 普通、藍 魔法、黃 稀有、紫 史詩、橘 傳奇、紅 神話。
 * 綠色保留給之後的套裝 / 遠古 / 活動裝。
 */
export const RaritySchema = z.enum(['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic']);
export type Rarity = z.infer<typeof RaritySchema>;
export const RARITIES: readonly Rarity[] = RaritySchema.options;

/** 稀有度的中文名稱 */
export const RARITY_LABELS: Record<Rarity, string> = {
  normal: '普通',
  magic: '魔法',
  rare: '稀有',
  epic: '史詩',
  legendary: '傳奇',
  mythic: '神話',
};

/** 各稀有度的權重（掉落表、商人、賭博）；史詩以上省略 = 0 */
export const RarityWeightsSchema = z.strictObject({
  normal: z.number().nonnegative(),
  magic: z.number().nonnegative(),
  rare: z.number().nonnegative(),
  epic: z.number().nonnegative().default(0),
  legendary: z.number().nonnegative().default(0),
  mythic: z.number().nonnegative().default(0),
});

/**
 * 材料：拆解裝備得到精華（武器 → 武器精華；防具與飾品 → 防具精華），魔王可能掉落飛昇碎片。
 * 用於商人的「飛昇」（基底升一階）。
 */
export const MaterialIdSchema = z.enum(['weaponEssence', 'armorEssence', 'ascensionShard']);
export type MaterialId = z.infer<typeof MaterialIdSchema>;
export const MATERIAL_IDS: readonly MaterialId[] = MaterialIdSchema.options;
export const MATERIAL_LABELS: Record<MaterialId, string> = { weaponEssence: '武器精華', armorEssence: '防具精華', ascensionShard: '飛昇碎片' };

/** 武器種類：決定名稱與對技能類別的加成（不限制可用的技能） */
export const WeaponTypeSchema = z.enum(['sword', 'axe', 'bow', 'staff']);
export type WeaponType = z.infer<typeof WeaponTypeSchema>;
export const WEAPON_TYPE_LABELS: Record<WeaponType, string> = { sword: '劍', axe: '斧', bow: '弓', staff: '法杖' };

export const ItemBaseDefSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  slot: EquipSlotSchema,
  /** 武器種類（只有武器） */
  weaponType: WeaponTypeSchema.optional(),
  /** 同種類中的階級（1～8；飾品沒有）：商人「飛昇」把基底換成同種類的下一階 */
  tier: z.int().min(1).max(8).optional(),
  /** 舊版的基底 ID（改版後讀舊存檔時換成這個基底） */
  aliases: z.array(IdSchema).default([]),
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
  /** 身上最多攜帶的數量（所有疊合計）；滿了就撿不起來、買不了 */
  maxCarry: z.int().positive(),
  cooldown: z.number().nonnegative(),
});

export const AffixDefSchema = z.strictObject({
  id: IdSchema,
  /** 顯示名稱，例如「鋒利的」 */
  name: z.string(),
  /**
   * item：普通詞綴（藍黃紫都有）；strong：強屬性（改變 Build 的能力，紫 1 條、橘 2 條、紅 3 條，
   * 依部位有各自的強屬性池）。精英怪詞綴另見 schema/elite.ts。
   */
  kind: z.enum(['item', 'strong']).default('item'),
  stat: StatIdSchema,
  modifier: ModifierKindSchema.default('flat'),
  /** 擲骰範圍；兩端都是整數時擲整數，否則取到小數第 2 位 */
  value: z.tuple([z.number(), z.number()]).refine(([min, max]) => min <= max, 'min 必須 <= max'),
  minItemLevel: z.int().nonnegative(),
  weight: z.number().positive(),
  /** 每提高一個階級（每 10 層）數值增加的比例：固定值類較高、百分比類較低 */
  growth: z.number().nonnegative().default(0.5),
  /** 可出現在哪些裝備欄位；省略 = 全部 */
  slots: z.array(EquipSlotSchema).optional(),
});

export type ItemBaseDef = z.infer<typeof ItemBaseDefSchema>;
export type PotionDef = z.infer<typeof PotionDefSchema>;
export type AffixDef = z.infer<typeof AffixDefSchema>;

/** 每種稀有度的普通詞綴數量 */
export const AFFIX_COUNT: Record<Rarity, readonly [number, number]> = {
  normal: [0, 1],
  magic: [1, 2],
  rare: [3, 4],
  epic: [3, 3],
  legendary: [3, 3],
  mythic: [4, 4],
};

/** 每種稀有度的強屬性數量（紫的那一條由名稱決定） */
export const STRONG_COUNT: Record<Rarity, number> = {
  normal: 0,
  magic: 0,
  rare: 0,
  epic: 1,
  legendary: 2,
  mythic: 3,
};

