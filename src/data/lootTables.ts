import type { z } from 'zod';
import type { LootTableDefSchema } from './schema/loot';

/**
 * 稀有度權重（相對值）。傳奇 / 神話為固定設計（data/legendaries.ts）：
 * 一般怪物約 0.15% / 0.02%、精英 1% / 0.15%、魔王 5% / 1%、寶箱 0.5% / 0.06%；神話只在第 10 層以上出現。
 */
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
    rarityWeights: { normal: 70, magic: 25, rare: 5, epic: 0.6, legendary: 0.15, mythic: 0.02 },
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
    rarityWeights: { normal: 25, magic: 50, rare: 25, epic: 3, legendary: 1, mythic: 0.15 },
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
    rarityWeights: { normal: 10, magic: 45, rare: 40, epic: 12, legendary: 5, mythic: 1 },
    // 魔王：60% 機率掉 1～2 片飛昇碎片
    shards: { chance: 0.6, count: [1, 2] },
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
    rarityWeights: { normal: 40, magic: 45, rare: 15, epic: 1.5, legendary: 0.5, mythic: 0.06 },
  },
];
