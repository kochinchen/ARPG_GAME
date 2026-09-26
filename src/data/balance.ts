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
  combat: {
    critMultiplier: 1.5,
    defenseConstant: 100,
  },
};
