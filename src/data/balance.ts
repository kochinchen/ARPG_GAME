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
    startingSkills: ['basic.attack', 'melee.heavy_slash', 'magic.fireball'],
    startingSkillPoints: 2,
    comboSlotLevels: [1, 3, 6],
    startingLoadout: {
      left: 'basic.attack',
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
    // 中途存檔點：與骷髏的偵測距離相同
    safeRadius: 7,
    checkpointRadius: 1.2,
  },
  elite: {
    minFloor: 3,
    hpMultiplier: 3,
    damageMultiplier: 1.3,
    xpMultiplier: 3,
    radiusMultiplier: 1.2,
    lootTable: 'loot.elite',
  },
  enemySize: {
    // 近戰：多數在 100%～140%，少數巨大個體接近 200%（HP / 傷害最多 150%）
    melee: { mean: 1.2, sd: 0.22, min: 1, max: 2, statPerSize: 0.5 },
    // 遠程 / 法術：100%～130%，數值不變
    ranged: { mean: 1.08, sd: 0.1, min: 1, max: 1.3, statPerSize: 0 },
  },
  shop: {
    value: { base: 4, perItemLevel: 2, rarity: { normal: 1, magic: 2.5, rare: 6, legendary: 15 } },
    buyMultiplier: 4,
    stockSize: 6,
    stockRarityWeights: { normal: 30, magic: 60, rare: 10, legendary: 0 },
    potionBuyPrice: 12,
    potionSellPrice: 3,
    // 賭博：比直接買一件魔法物品便宜一點，但可能拿到普通或稀有
    gamble: { base: 30, perFloor: 10, rarityWeights: { normal: 15, magic: 60, rare: 25, legendary: 0 } },
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
  },
};
