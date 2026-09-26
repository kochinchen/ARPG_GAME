import { z } from 'zod';
import { IdSchema, RangeSchema, StatIdSchema } from './common';

const ComboSlotsSchema = z.tuple([IdSchema.nullable(), IdSchema.nullable(), IdSchema.nullable()]);

export const BalanceSchema = z.strictObject({
  maxLevel: z.int().positive(),
  /** 升到下一級所需經驗 = base × level ^ exponent */
  xpCurve: z.strictObject({ base: z.number().positive(), exponent: z.number().positive() }),
  skillPointsPerLevel: z.int().nonnegative(),
  /** 升級時各屬性基礎值的成長 */
  statsPerLevel: z.partialRecord(StatIdSchema, z.number()).default({}),
  maxSkillRank: z.int().positive(),
  /** 各 Tier 需要的角色等級，index 0 = T1 */
  tierLevelReq: z.tuple([z.int(), z.int(), z.int(), z.int()]),
  /** Mastery 後每升一級得到的 T4 開通次數 */
  t4UnlockChargesPerLevel: z.int().nonnegative(),
  player: z.strictObject({
    baseHp: z.number().positive(),
    baseMana: z.number().positive(),
    manaRegenPerSec: z.number().nonnegative(),
    /** Tile / 秒 */
    moveSpeed: z.number().positive(),
    /** 碰撞半徑（Tile） */
    radius: z.number().positive().max(0.5),
    /** 空手傷害；M5 起由武器提供 */
    baseDamage: RangeSchema,
    /** 魔法技能傷害基準 */
    spellPower: z.number().nonnegative(),
    /** 每秒攻擊次數 */
    attackSpeed: z.number().positive(),
    /** 攻擊距離（Tile，從雙方邊緣算起） */
    attackRange: z.number().positive(),
    critChance: z.number().min(0).max(1),
    defense: z.number().nonnegative(),
    /** 死亡後幾秒回到存檔點 */
    respawnDelay: z.number().nonnegative(),
    /** 使用的藥水種類（PotionDef ID） */
    potionId: IdSchema,
    startingPotions: z.int().nonnegative(),
    /** 背包格數：寬 × 高，每格放一件物品或一疊藥水 */
    inventoryCols: z.int().positive(),
    inventoryRows: z.int().positive(),
    /** 新角色一開始會的技能（Lv1）；其餘技能以技能點學習 */
    startingSkills: z.array(IdSchema).default([]),
    startingSkillPoints: z.int().nonnegative().default(0),
    /** Q / W / E 連段第 1、2、3 格的解鎖等級 */
    comboSlotLevels: z.tuple([z.int().positive(), z.int().positive(), z.int().positive()]),
    /** 新角色的技能配置（必須是 startingSkills 內的技能） */
    startingLoadout: z.strictObject({
      left: IdSchema,
      /** Q / W / E 各 3 步連段 */
      combos: z.tuple([ComboSlotsSchema, ComboSlotsSchema, ComboSlotsSchema]),
      supports: z.tuple([IdSchema.nullable(), IdSchema.nullable(), IdSchema.nullable()]),
    }),
  }),
  combat: z.strictObject({
    critMultiplier: z.number().min(1),
    /** 減傷 = defense / (defense + defenseConstant) */
    defenseConstant: z.number().positive(),
  }),
});

export type Balance = z.infer<typeof BalanceSchema>;
