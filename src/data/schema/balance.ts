import { z } from 'zod';
import { RangeSchema } from './common';

export const BalanceSchema = z.strictObject({
  maxLevel: z.int().positive(),
  /** 升到下一級所需經驗 = base × level ^ exponent */
  xpCurve: z.strictObject({ base: z.number().positive(), exponent: z.number().positive() }),
  skillPointsPerLevel: z.int().nonnegative(),
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
    /** 每秒攻擊次數 */
    attackSpeed: z.number().positive(),
    /** 攻擊距離（Tile，從雙方邊緣算起） */
    attackRange: z.number().positive(),
    critChance: z.number().min(0).max(1),
    defense: z.number().nonnegative(),
    /** 死亡後幾秒回到存檔點 */
    respawnDelay: z.number().nonnegative(),
  }),
  combat: z.strictObject({
    critMultiplier: z.number().min(1),
    /** 減傷 = defense / (defense + defenseConstant) */
    defenseConstant: z.number().positive(),
  }),
});

export type Balance = z.infer<typeof BalanceSchema>;
