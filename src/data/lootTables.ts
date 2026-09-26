import type { z } from 'zod';
import type { LootTableDefSchema } from './schema/loot';

export const lootTables: z.input<typeof LootTableDefSchema>[] = [
  {
    id: 'loot.skeleton',
    rolls: 1,
    entries: [
      { kind: 'nothing', weight: 50 },
      { kind: 'item', weight: 25 },
      { kind: 'potion', weight: 15 },
      { kind: 'gold', weight: 10 },
    ],
    gold: [3, 12],
    rarityWeights: { normal: 70, magic: 25, rare: 5, legendary: 0 },
  },
  {
    id: 'loot.chest',
    rolls: 3,
    entries: [
      { kind: 'nothing', weight: 10 },
      { kind: 'item', weight: 50 },
      { kind: 'potion', weight: 25 },
      { kind: 'gold', weight: 15 },
    ],
    gold: [10, 30],
    rarityWeights: { normal: 40, magic: 45, rare: 15, legendary: 0 },
  },
];
