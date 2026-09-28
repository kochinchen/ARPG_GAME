import type { z } from 'zod';
import type { BalanceSchema } from './schema/balance';

/** 全域平衡數值。調整手感優先改這裡。 */
export const balance: z.input<typeof BalanceSchema> = {
  maxLevel: 99,
  xpCurve: { base: 50, exponent: 1.5 },
  skillPointsPerLevel: 1,
  statsPerLevel: { maxHp: 5, maxMana: 2 },
  maxSkillRank: 5,
  tierLevelReq: [1, 6, 12, 24],
  t4UnlockChargesPerLevel: 1,
  player: {
    baseHp: 100,
    baseMana: 50,
    manaRegenPerSec: 1.5,
    // 基礎回復：生命每秒 0.3%、魔力每秒 0.2%（魔力另有固定 1.5 / 秒）
    hpRegenPctPerSec: 0.003,
    manaRegenPctPerSec: 0.002,
    // 脫戰 4 秒（沒有受到傷害）後生命回復 5 倍：戰鬥難度不變，打完一波能較快回滿
    outOfCombatRegen: { delay: 4, multiplier: 5 },
    moveSpeed: 4,
    radius: 0.3,
    baseDamage: [3, 6],
    spellPower: 8,
    attackSpeed: 1.6,
    attackRange: 0.5,
    critChance: 0.1,
    defense: 0,
    respawnDelay: 2,
    potionId: 'potion.rejuvenation',
    startingPotions: 3,
    inventoryCols: 10,
    inventoryRows: 8,
    // 玩家沒有普通攻擊：免費送的重砍就是預設左鍵（普通攻擊只給怪物用）
    startingSkills: ['melee.heavy_slash', 'magic.fireball'],
    startingSkillPoints: 2,
    comboSlotLevels: [1, 3, 6],
    startingLoadout: {
      left: 'melee.heavy_slash',
      // 第 2、3 格分別在 Lv3、Lv6 解鎖
      combos: [
        ['melee.heavy_slash', null, null],
        ['magic.fireball', null, null],
        [null, null, null],
      ],
      supports: [null, null, null],
    },
  },
  attributes: {
    pointsPerLevel: 3,
    list: [
      // 基礎攻擊：武器傷害（最小與最大值）與法術強度各 +0.3；近戰要貼身承受傷害，另外 +0.5% 近戰傷害
      {
        id: 'attack',
        name: '攻擊',
        effects: [
          { stat: 'damageMin', perPoint: 0.3, label: '基礎攻擊（武器 / 法術）' },
          { stat: 'damageMax', perPoint: 0.3, label: '基礎攻擊（武器 / 法術）' },
          { stat: 'spellPower', perPoint: 0.3, label: '基礎攻擊（武器 / 法術）' },
          { stat: 'meleeDamageBonus', perPoint: 0.005, label: '近戰傷害', percent: true },
        ],
      },
      { id: 'vitality', name: '生命', effects: [{ stat: 'maxHp', perPoint: 5, label: '最大生命' }] },
      { id: 'mana', name: '魔力', effects: [{ stat: 'maxMana', perPoint: 4, label: '最大魔力' }] },
      { id: 'defense', name: '防禦', effects: [{ stat: 'defense', perPoint: 2, label: '防禦' }] },
      // 暴擊率上限 +40%：基礎 10% + 屬性 40% + 裝備 / 被動，避免輕易到 100%
      { id: 'crit', name: '暴擊', maxPoints: 80, effects: [{ stat: 'critChance', perPoint: 0.005, label: '暴擊率', percent: true }] },
    ],
  },
  difficulty: {
    hpPerFloor: 0.2,
    damagePerFloor: 0.12,
    defensePerFloor: 0.1,
    xpPerFloor: 0.15,
    densityPerFloor: 0.03,
    maxDensityMultiplier: 1.4,
  },
  floor: {
    // 樓梯口與出口：大於最遠的偵測距離（骷髏王 9），上下樓時附近一定沒有怪物
    stairsSafeRadius: 12,
    // 中途存檔點：與樓梯口相同（這裡也有商人，大於最遠的一般怪偵測距離 9，購物時不會被遠程怪發現）
    safeRadius: 12,
    checkpointRadius: 1.2,
  },
  elite: {
    minFloor: 3,
    hpMultiplier: 3,
    damageMultiplier: 1.3,
    xpMultiplier: 3,
    radiusMultiplier: 1.2,
    lootTable: 'loot.elite',
    floorResist: { minFloor: 10, perFloor: { elite: 0.015, boss: 0.02 }, max: 0.4 },
  },
  affixPower: {
    levelsPerTier: 10,
    maxTier: 5,
    // 紫比黃高 20%～50%，紅最高 300%
    rarity: { normal: [1, 1], magic: [1, 1], rare: [1, 1], epic: [1.2, 1.5], legendary: [1.5, 2], mythic: [2, 3] },
  },
  mainRoll: {
    // 武器傷害 / 防具防禦 +X%：藍 20～90、黃 70～150、紫 130～230、橘 210～320、紅 290～400（相鄰重疊 20～30%）
    base: { normal: [0, 0], magic: [0.2, 0.9], rare: [0.7, 1.5], epic: [1.3, 2.3], legendary: [2.1, 3.2], mythic: [2.9, 4] },
    // 飾品：所有詞綴 +X%
    jewelry: { normal: [0, 0], magic: [0.05, 0.25], rare: [0.2, 0.45], epic: [0.4, 0.65], legendary: [0.6, 0.85], mythic: [0.8, 1] },
  },
  salvage: {
    slots: 10,
    // 白 1～2、藍 2～4、黃 4～7、紫 7～11、橘 11～15、紅 16～20
    yields: { normal: [1, 2], magic: [2, 4], rare: [4, 7], epic: [7, 11], legendary: [11, 15], mythic: [16, 20] },
  },
  gearAura: {
    weights: { normal: 0, magic: 1, rare: 2, epic: 4, legendary: 7, mythic: 12 },
    // 0～5 無光、6～10 微弱、11～18 中等、19～30 強、31 以上高階
    thresholds: [6, 11, 19, 31],
  },
  enemySize: {
    // 近戰：多數在 100%～140%，少數巨大個體接近 200%（HP / 傷害最多 150%）
    melee: { mean: 1.2, sd: 0.22, min: 1, max: 2, statPerSize: 0.5 },
    // 遠程 / 法術：100%～130%，數值不變
    ranged: { mean: 1.08, sd: 0.1, min: 1, max: 1.3, statPerSize: 0 },
  },
  shop: {
    value: { base: 4, perItemLevel: 2, rarity: { normal: 1, magic: 2.5, rare: 6, epic: 12, legendary: 20, mythic: 35 } },
    buyMultiplier: 4,
    stockSize: 6,
    stockRarityWeights: { normal: 30, magic: 60, rare: 10 },
    potionBuyPrice: 12,
    potionSellPrice: 3,
    // 賭博：比直接買一件魔法物品便宜一點，但可能拿到普通或稀有
    gamble: { base: 30, perFloor: 10, rarityWeights: { normal: 15, magic: 56.5, rare: 25, epic: 3, legendary: 0.5 } },
    // 飛昇：越高階、越稀有越貴（紅裝升到第 8 階約 1 萬金幣）
    ascend: {
      base: 60,
      perTier: 120,
      rarity: { normal: 1, magic: 1.5, rare: 2.5, epic: 4, legendary: 6, mythic: 10 },
      // 精華：第 2 階 11 個 … 第 8 階 29 個（再乘稀有度，紅裝 ×2.5）
      essenceBase: 5,
      essencePerTier: 3,
      essenceRarity: { normal: 1, magic: 1, rare: 1.2, epic: 1.5, legendary: 2, mythic: 2.5 },
      // 第 5 階起需要飛昇碎片：第 5 階 1 片 … 第 8 階 4 片
      shardFromTier: 5,
    },
    range: 3,
  },
  skillCategories: {
    melee: { manaCost: 0.85, lifeSteal: 1.3 },
    ranged: { manaCost: 1, lifeSteal: 1 },
    magic: { manaCost: 1, lifeSteal: 0.8 },
  },
  combo: {
    nearNearFarBonus: { damage: 0.1, aoeRadius: 0.1 },
  },
  combat: {
    critMultiplier: 1.5,
    defenseConstant: 100,
    maxResist: 0.75,
    maxDodge: 0.5,
  },
};
