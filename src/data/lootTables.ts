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
    // 精英怪額外掉落（原本的掉落之外再擲這張）：至少一件物品、稀有度較高
    id: 'loot.elite',
    rolls: 2,
    entries: [
      { kind: 'item', weight: 70 },
      { kind: 'potion', weight: 15 },
      { kind: 'gold', weight: 15 },
    ],
    gold: [15, 40],
    rarityWeights: { normal: 25, magic: 50, rare: 25, legendary: 0 },
  },
  {
    // Boss：大量掉落、稀有機率高
    id: 'loot.boss',
    rolls: 6,
    entries: [
      { kind: 'item', weight: 70 },
      { kind: 'potion', weight: 15 },
      { kind: 'gold', weight: 15 },
    ],
    gold: [40, 90],
    rarityWeights: { normal: 10, magic: 50, rare: 40, legendary: 0 },
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
