import { z } from 'zod';
import { IdSchema, RangeSchema, StatIdSchema } from './common';
import { EliteConfigSchema } from './elite';
import { RaritySchema, RarityWeightsSchema, WeaponTypeSchema } from './item';
import { ActiveCategorySchema } from './skill';

const SizeRollSchema = z.strictObject({
  mean: z.number().positive(),
  sd: z.number().nonnegative(),
  min: z.number().positive(),
  max: z.number().positive(),
  /** 體型每大 100%，HP 與傷害提高多少（0.5 = 體型 200% 時 150%） */
  statPerSize: z.number().nonnegative(),
});

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
    /** 基礎每秒回復：最大生命 / 最大魔力的比例（隨上限成長，與裝備、技能的回復相加） */
    hpRegenPctPerSec: z.number().nonnegative(),
    manaRegenPctPerSec: z.number().nonnegative(),
    /** 脫戰回復：delay 秒沒有受到傷害後，生命回復 × multiplier */
    outOfCombatRegen: z.strictObject({ delay: z.number().nonnegative(), multiplier: z.number().min(1) }),
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
    /** 每組連段第 1、2、3 格的解鎖等級 */
    comboSlotLevels: z.tuple([z.int().positive(), z.int().positive(), z.int().positive()]),
    /** Q / W / E / R / A / S / D 各組連段的解鎖等級 */
    comboKeyLevels: z.array(z.int().positive()).length(7),
    /** 新角色的技能配置（必須是 startingSkills 內的技能） */
    startingLoadout: z.strictObject({
      left: IdSchema,
      /** Q / W / E / R / A / S / D 各 3 步連段 */
      combos: z.array(ComboSlotsSchema).length(7),
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
    /** 前期怪物數量加成：第 1～fullUntil 層 +bonus，之後線性遞減，第 fadeTo 層起為 0 */
    earlyDensityBoost: z.strictObject({ bonus: z.number().nonnegative(), fullUntil: z.int().positive(), fadeTo: z.int().positive() }),
    /**
     * 怪物強化（乘在每層成長之上）：[第 1 層, 第 toFloor 層] 之間線性增加，之後維持最高值。
     * bossHp 給樓層魔王與挑戰樓層的魔王；skillArea 放大怪物特殊技能（普通攻擊以外）的圓形 / 扇形範圍，直線招式不變。
     */
    monsterBoost: z.strictObject({
      toFloor: z.int().positive(),
      hp: z.tuple([z.number().positive(), z.number().positive()]),
      bossHp: z.tuple([z.number().positive(), z.number().positive()]),
      damage: z.tuple([z.number().positive(), z.number().positive()]),
      skillArea: z.tuple([z.number().positive(), z.number().positive()]),
      xp: z.number().positive(),
    }),
  }),
  floor: z.strictObject({
    /** 樓梯口與出口的安全範圍（Tile）：大於所有怪物的偵測距離 */
    stairsSafeRadius: z.number().positive(),
    /** 存檔點與出口附近多少格內不放怪物（避免重生後立刻被圍） */
    safeRadius: z.number().nonnegative(),
    /** 走到中途存檔點多近時啟動 */
    checkpointRadius: z.number().positive(),
  }),
  /** 終局（docs/ENDGAME.md）：30 層通關、31～35 極限挑戰 */
  endgame: z.strictObject({
    /** 一般模式的最後一層：擊敗這層的魔王 = 已通關；出口先詢問是否進入挑戰 */
    lastNormalFloor: z.int().positive(),
    /** 最後一層：擊敗這層的魔王 = 已完成隱藏難關；沒有下一層 */
    lastFloor: z.int().positive(),
    /** 挑戰樓層的中途小王（魔王數值 × 樓層成長後，再乘這些倍率；沒有階段變化） */
    miniBoss: z.strictObject({
      maxPerFloor: z.int().positive(),
      /** 小王空地的直徑：小王身體寬度的幾倍 */
      arenaBodies: z.number().positive(),
      hpMultiplier: z.number().positive(),
      damageMultiplier: z.number().positive(),
      xpMultiplier: z.number().positive(),
      lootTable: IdSchema,
    }),
  }),
  /** 精英怪（每群隊長）的共通強化 */
  elite: EliteConfigSchema,
  /**
   * 每層的首領（沒有魔王的樓層）：從該層的怪物池抽一隻，精英強化改用這些倍率、詞綴 affixCount 個；
   * 守在出口前 guardDistance 格，擊敗後出口才會開（清怪比例照舊），原地出現首領寶箱（chestLootTable）
   */
  champion: z.strictObject({
    hpMultiplier: z.number().positive(),
    damageMultiplier: z.number().positive(),
    xpMultiplier: z.number().positive(),
    radiusMultiplier: z.number().positive(),
    affixCount: z.tuple([z.int().positive(), z.int().positive()]),
    guardDistance: z.number().positive(),
    chestLootTable: IdSchema,
  }),
  /**
   * 怪物的隨機體型（常態分佈，限制在 min～max）：近戰（物理）怪體型差異大，HP 與傷害跟著提高；
   * 遠程 / 法術怪差異小、數值不變。倍率 = 1 + (體型 − 1) × statPerSize。Boss 與訓練木樁不套用。
   */
  /**
   * 詞綴強度：
   * - 階級：物品等級每 levelsPerTier 提高一階（T1～maxTier），數值 × (1 + 詞綴 growth × (階級 − 1))
   * - 稀有度倍率：紫 / 橘 / 紅的詞綴數值再乘上擲骰的倍率（例如紫 120%～150%、紅最高 300%）
   */
  affixPower: z.strictObject({
    levelsPerTier: z.int().positive(),
    maxTier: z.int().positive(),
    rarity: z.record(RaritySchema, z.tuple([z.number().positive(), z.number().positive()])),
  }),
  /**
   * 主倍率（每件裝備擲一次，存在物品上）：武器乘在基礎傷害、防具乘在基礎防禦（base）；
   * 戒指與護身符沒有基礎攻防，改為該件所有詞綴數值提高（jewelry）。相鄰稀有度的區間互相重疊。
   */
  mainRoll: z.strictObject({
    base: z.record(RaritySchema, z.tuple([z.number().nonnegative(), z.number().nonnegative()])),
    jewelry: z.record(RaritySchema, z.tuple([z.number().nonnegative(), z.number().nonnegative()])),
  }),
  /**
   * 掉寶的樓層成長：
   * - tierBonus：樓層 lootTier → 黃以上的稀有度權重倍率（index = lootTier − 1，超出時用最後一組）
   * - highRarityTier：紫 / 橘 / 紅的基底階級 = 樓層階（等級需求 ≤ 物品等級的最高階）+ 偏移，偏移依權重抽
   */
  loot: z.strictObject({
    tierBonus: z
      .array(z.strictObject({ rare: z.number().positive(), epic: z.number().positive(), legendary: z.number().positive(), mythic: z.number().positive() }))
      .min(1),
    highRarityTier: z
      .strictObject({ offsets: z.array(z.int()).min(1), weights: z.array(z.number().positive()).min(1) })
      .refine((t) => t.offsets.length === t.weights.length, 'offsets 與 weights 長度必須相同'),
  }),
  /** 拆解：拆解區的格數與各稀有度拆出的精華數量 */
  salvage: z.strictObject({
    slots: z.int().positive(),
    yields: z.record(RaritySchema, z.tuple([z.int().nonnegative(), z.int().nonnegative()])),
  }),
  /**
   * 裝備光芒：每件裝備依稀有度給分（weights），總分達到 thresholds 的第 N 個門檻 = 光芒等級 N（0～4）。
   */
  gearAura: z.strictObject({
    weights: z.record(RaritySchema, z.number().nonnegative()),
    thresholds: z.array(z.number().positive()).min(4).max(6),
  }),
  enemySize: z.strictObject({
    melee: SizeRollSchema,
    ranged: SizeRollSchema,
  }),
  /** 出口旁的商人：買、賣、賭博 */
  shop: z.strictObject({
    /** 物品價值 = (base + perItemLevel × 物品等級) × 稀有度倍率；賣出拿到價值，購買付 buyMultiplier 倍 */
    value: z.strictObject({
      base: z.number().nonnegative(),
      perItemLevel: z.number().nonnegative(),
      rarity: z.record(RaritySchema, z.number()),
    }),
    buyMultiplier: z.number().min(1),
    /** 每層商人販賣的物品數量與稀有度（物品等級 = 樓層） */
    stockSize: z.int().nonnegative(),
    stockRarityWeights: RarityWeightsSchema,
    potionBuyPrice: z.int().positive(),
    potionSellPrice: z.int().nonnegative(),
    /** 賭博：價格 = base + perFloor × 樓層；結果的稀有度權重 */
    gamble: z.strictObject({
      base: z.int().positive(),
      perFloor: z.int().nonnegative(),
      rarityWeights: RarityWeightsSchema,
    }),
    /**
     * 飛昇：把裝備的基底換成同種類的下一階（名稱、詞綴、主倍率、傳奇效果都保留）。
     * 價格 = (base + perTier × 目標階級) × 稀有度倍率；目標階級的等級需求不可超過到過的最深樓層。
     */
    /**
     * 詞綴重鑄：把一條詞綴（橘 / 紅為固定屬性行的數值）重擲。
     * 價格 = (base + perItemLevel × 物品等級) × 稀有度倍率 × 強屬性倍率 × (1 + perReroll × 這件物品已重鑄的次數)
     */
    reroll: z.strictObject({
      base: z.int().nonnegative(),
      perItemLevel: z.int().nonnegative(),
      rarity: z.record(RaritySchema, z.number().positive()),
      strong: z.number().min(1),
      perReroll: z.number().nonnegative(),
    }),
    ascend: z.strictObject({
      base: z.int().nonnegative(),
      perTier: z.int().nonnegative(),
      rarity: z.record(RaritySchema, z.number().positive()),
      /** 精華（武器用武器精華、防具用防具精華）= (essenceBase + essencePerTier × 目標階級) × essenceRarity */
      essenceBase: z.int().nonnegative(),
      essencePerTier: z.int().nonnegative(),
      essenceRarity: z.record(RaritySchema, z.number().positive()),
      /** 目標階級 ≥ shardFromTier 時需要飛昇碎片：目標階級 − shardFromTier + 1 片 */
      shardFromTier: z.int().positive(),
    }),
    /** 離商人多遠內可以交易（Tile） */
    range: z.number().positive(),
  }),
  /** 近戰 / 遠程 / 魔法 / 戰術技能的共通倍率 */
  skillCategories: z.strictObject({
    melee: CategoryTraitsSchema,
    ranged: CategoryTraitsSchema,
    magic: CategoryTraitsSchema,
    utility: CategoryTraitsSchema,
  }),
  /**
   * 鑲嵌（v0.5.0）：孔數上限（與稀有度反向）、掉落時的孔數權重（index = 孔數）、商人的鑿孔 / 鑲嵌 / 拆卸費用、
   * 全身上限（同一條屬性全身熔核合計 ≤ 一顆 T5 橘核最高值 × bodyCap；同一條印記 ≤ 單顆 × bodyCap）。
   */
  sockets: z.strictObject({
    max: z.record(RaritySchema, z.int().min(0).max(5)),
    dropWeights: z.record(RaritySchema, z.array(z.number().nonnegative()).min(1)),
    /** 鑿第 n 孔：金幣 drillGold × 物品等級 × n、防具精華 drillEssence × n */
    drillGold: z.int().nonnegative(),
    drillEssence: z.int().nonnegative(),
    /** 鑲嵌 / 拆卸：金幣 × 物品等級（拆卸時熔核毀掉、孔保留） */
    insertGold: z.int().nonnegative(),
    removeGold: z.int().nonnegative(),
    bodyCap: z.number().positive(),
    maxCores: z.int().positive(),
    /** 熔核鑲在這個稀有度的裝備上時，數值（固定數值的屬性除外）× 倍率：好裝備讓熔核更強，白裝不能取代打寶 */
    hostPower: z.record(RaritySchema, z.number().positive()),
  }),
  /**
   * 融合（v0.5.0）：2～4 把武器 → 一顆熔核；飾品區最多 2 件戒指 / 護身符，只提高印記機率。
   * 核階 = 平均物品等級每 levelsPerTier 一階（最高 affixPower.maxTier；與詞綴階級分開設定）；核色 = gearAura.weights 加總對照 rarityFrom；
   * 數值 = T1 擲骰 × tierMultiplier × affixPower.rarity（核色倍率）。
   */
  fusion: z.strictObject({
    inputs: z.strictObject({ min: z.int().positive(), max: z.int().positive() }),
    jewelrySlots: z.int().nonnegative(),
    /** 核階：投入裝備的平均物品等級每幾級一階 */
    levelsPerTier: z.int().positive(),
    /** 核階倍率（index = 核階 − 1） */
    tierMultiplier: z.array(z.number().positive()).min(1),
    /** 核色：權重加總 ≥ 門檻即為該核色（沒有紅核） */
    rarityFrom: z.strictObject({ magic: z.number(), rare: z.number(), epic: z.number(), legendary: z.number() }),
    /** 屬性條數（含主屬性；印記不佔條數） */
    lineCount: z.strictObject({ normal: z.int().positive(), magic: z.int().positive(), rare: z.int().positive(), epic: z.int().positive(), legendary: z.int().positive() }),
    /** 純核（四件同一種類）多幾條屬性 */
    pureBonusLines: z.int().nonnegative(),
    /** 混核：兩個核種各取一條，數值 × mixedMultiplier */
    mixedMultiplier: z.number().positive(),
    brand: z.strictObject({
      /** 每把橘武器的基礎機率（再加飾品區加成） */
      chance: z.number().min(0).max(1),
      /** 總機率上限：1 − Π(1 − p) 不超過這個值 */
      chanceCap: z.number().min(0).max(1),
      /** 傳入的數值倍率（整數四捨五入、至少 1） */
      valueMultiplier: z.number().positive(),
    }),
    /** 飾品區：每件依稀有度提高印記機率（白飾品不能放） */
    jewelryBoost: z.record(RaritySchema, z.number().nonnegative()),
    /** 費用：金幣 goldBase + goldPerItemLevel × Σ物品等級；武器精華 essenceBase + Σ ceil(物品等級 ÷ essenceLevelDivisor) */
    cost: z.strictObject({
      goldBase: z.int().nonnegative(),
      goldPerItemLevel: z.number().nonnegative(),
      essenceBase: z.int().nonnegative(),
      essenceLevelDivisor: z.int().positive(),
    }),
  }),
  /** 武器允許矩陣：每種武器可以使用的主動技能類別（不在清單內 = 禁用） */
  weaponRules: z.record(WeaponTypeSchema, z.array(ActiveCategorySchema).min(1)),
  /** 機關（戰術技能佈置的有血量物件） */
  devices: z.strictObject({
    /** 全身同時存在的上限；放下一個時最舊的消失 */
    maxAlive: z.int().positive(),
    /** 怪物在這個距離內（Tile）會把機關當目標 */
    aggroRange: z.number().positive(),
  }),
  combo: z.strictObject({
    /** 「近 → 近 → 遠」的 Combo：第三招額外加成（前兩招承擔貼身風險的回報） */
    nearNearFarBonus: z.strictObject({ damage: z.number().nonnegative(), aoeRadius: z.number().nonnegative() }),
  }),
  combat: z.strictObject({
    critMultiplier: z.number().min(1),
    /** 減傷 = defense / (defense + defenseConstant) */
    defenseConstant: z.number().positive(),
    /** 元素抗性上限 */
    maxResist: z.number().min(0).max(1),
    /** 閃避上限 */
    maxDodge: z.number().min(0).max(1),
    /** 控制抗性上限（緩速抗性、擊退抗性、暈眩時間減少） */
    maxControlResist: z.number().min(0).max(1),
    /** 格擋率上限 */
    maxBlock: z.number().min(0).max(1),
    /** 格擋時減免的傷害比例 */
    blockReduction: z.number().min(0).max(1),
  }),
  /**
   * 洗點：重置技能點 / 屬性點的金幣 = round(base × 等級^exponent)。
   * 等級越高越貴，避免隨意切換 Build；仍比重練便宜很多。
   */
  respec: z.strictObject({
    skills: z.strictObject({ base: z.number().positive(), exponent: z.number().positive() }),
    attributes: z.strictObject({ base: z.number().positive(), exponent: z.number().positive() }),
  }),
});

export type Balance = z.infer<typeof BalanceSchema>;
