import { z } from 'zod';
import { IdSchema, RangeSchema, StatIdSchema } from './common';
import { EliteConfigSchema } from './elite';

/** 屬性的一項效果：每點給 stat 一個 flat 加成 */
export const AttributeEffectSchema = z.strictObject({
  stat: StatIdSchema,
  perPoint: z.number().positive(),
  /** 顯示：效果名稱，與是否以百分比顯示 */
  label: z.string(),
  percent: z.boolean().default(false),
});

/** 屬性點可以加的項目；一個屬性可以有多項效果 */
export const AttributeDefSchema = z.strictObject({
  /** 存檔使用的 ID，改名需要寫 Migration */
  id: z.string().regex(/^[a-z]+$/),
  name: z.string(),
  effects: z.array(AttributeEffectSchema).min(1),
  /** 最多可以加幾點（例如暴擊率避免超過 100%） */
  maxPoints: z.int().positive().optional(),
});
export type AttributeDef = z.infer<typeof AttributeDefSchema>;

/** 技能類型的共通特性（近戰承擔貼身風險，續航與 MP 效率較好） */
const CategoryTraitsSchema = z.strictObject({
  /** MP 消耗倍率 */
  manaCost: z.number().positive(),
  /** 吸血效率倍率 */
  lifeSteal: z.number().nonnegative(),
});

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
  /** 屬性點：每升一級得到 pointsPerLevel 點，自由加到 list 中的項目 */
  attributes: z
    .strictObject({
      pointsPerLevel: z.int().nonnegative(),
      list: z.array(AttributeDefSchema).min(1),
    })
    .refine((a) => new Set(a.list.map((d) => d.id)).size === a.list.length, '屬性 ID 不可重複'),
  /** 樓層難度：第 N 層的倍率 = 1 + 每層成長 × (N - 1) */
  difficulty: z.strictObject({
    hpPerFloor: z.number().nonnegative(),
    damagePerFloor: z.number().nonnegative(),
    defensePerFloor: z.number().nonnegative(),
    xpPerFloor: z.number().nonnegative(),
    densityPerFloor: z.number().nonnegative(),
    /** 怪物密度倍率上限 */
    maxDensityMultiplier: z.number().min(1),
  }),
  floor: z.strictObject({
    /** 存檔點與出口附近多少格內不放怪物（避免重生後立刻被圍） */
    safeRadius: z.number().nonnegative(),
    /** 走到中途存檔點多近時啟動 */
    checkpointRadius: z.number().positive(),
  }),
  /** 精英怪（每群隊長）的共通強化 */
  elite: EliteConfigSchema,
  /** 近戰 / 遠程 / 魔法技能的共通倍率 */
  skillCategories: z.strictObject({ melee: CategoryTraitsSchema, ranged: CategoryTraitsSchema, magic: CategoryTraitsSchema }),
  combo: z.strictObject({
    /** 「近 → 近 → 遠」的 Combo：第三招額外加成（前兩招承擔貼身風險的回報） */
    nearNearFarBonus: z.strictObject({ damage: z.number().nonnegative(), aoeRadius: z.number().nonnegative() }),
  }),
  combat: z.strictObject({
    critMultiplier: z.number().min(1),
    /** 減傷 = defense / (defense + defenseConstant) */
    defenseConstant: z.number().positive(),
  }),
});

export type Balance = z.infer<typeof BalanceSchema>;
