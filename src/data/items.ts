import type { z } from 'zod';
import type { ItemBaseDefSchema, PotionDefSchema } from './schema/item';

/** 裝備基底。稀有度與詞綴由 ItemGenerator 擲骰。 */
export const items: z.input<typeof ItemBaseDefSchema>[] = [
  { id: 'weapon.short_sword', name: '短劍', slot: 'weapon', levelReq: 1, baseStats: { damageMin: 2, damageMax: 5 } },
  { id: 'weapon.hand_axe', name: '手斧', slot: 'weapon', levelReq: 1, baseStats: { damageMin: 3, damageMax: 7 } },
  { id: 'helmet.cap', name: '皮帽', slot: 'helmet', levelReq: 1, baseStats: { defense: 3 } },
  { id: 'armor.quilted', name: '布甲', slot: 'armor', levelReq: 1, baseStats: { defense: 8 } },
  { id: 'gloves.leather', name: '皮手套', slot: 'gloves', levelReq: 1, baseStats: { defense: 2 } },
  { id: 'boots.leather', name: '皮靴', slot: 'boots', levelReq: 1, baseStats: { defense: 2 } },
  { id: 'ring.plain', name: '戒指', slot: 'ring', levelReq: 1 },
  { id: 'amulet.plain', name: '護身符', slot: 'amulet', levelReq: 1 },
];

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
