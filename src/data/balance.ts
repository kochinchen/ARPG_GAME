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
  },
  combat: {
    critMultiplier: 1.5,
    defenseConstant: 100,
  },
};
