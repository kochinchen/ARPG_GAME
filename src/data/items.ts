import type { z } from 'zod';
import type { ItemBaseDefSchema, PotionDefSchema } from './schema/item';

/** 裝備基底：M5 加入 */
export const items: z.input<typeof ItemBaseDefSchema>[] = [];

export const potions: z.input<typeof PotionDefSchema>[] = [
  {
    id: 'potion.rejuvenation',
    name: '回復藥水',
    hpPct: 0.35,
    mpPct: 0.35,
    maxStack: 20,
    cooldown: 1,
  },
];
