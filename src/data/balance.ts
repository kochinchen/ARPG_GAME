import type { z } from 'zod';
import type { BalanceSchema } from './schema/balance';

/** 全域平衡數值。調整手感優先改這裡。 */
export const balance: z.input<typeof BalanceSchema> = {
  maxLevel: 99,
  xpCurve: { base: 100, exponent: 1.5 },
  skillPointsPerLevel: 1,
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
    attackSpeed: 1.6,
    attackRange: 0.5,
    critChance: 0.1,
    defense: 0,
    respawnDelay: 2,
    potionId: 'potion.rejuvenation',
    startingPotions: 3,
    startingLoadout: {
      left: 'basic.attack',
      right: ['melee.bash', 'magic.fireball', 'magic.frost_nova'],
    },
  },
  combat: {
    critMultiplier: 1.5,
    defenseConstant: 100,
  },
};
