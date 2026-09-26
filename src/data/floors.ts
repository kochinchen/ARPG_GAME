import type { z } from 'zod';
import type { FloorDefSchema } from './schema/floor';

/** 樓層區間設定。怪物強度依 balance.difficulty 逐層提高。 */
export const floors: z.input<typeof FloorDefSchema>[] = [
  {
    id: 'floor.crypt_1',
    floors: [1, 5],
    maps: ['map.crypt_a', 'map.crypt_b'],
    // 第 1 層：骷髏、食屍鬼；第 3 層起弓手；第 4 層起重甲骷髏
    monsterPool: [
      { enemyId: 'enemy.skeleton', weight: 5 },
      { enemyId: 'enemy.ghoul', weight: 3 },
      { enemyId: 'enemy.skeleton_archer', weight: 3, minFloor: 3 },
      { enemyId: 'enemy.armored_skeleton', weight: 1.5, minFloor: 4 },
    ],
    density: 2.2,
    packSize: [2, 4],
    // 精英怪第 3 層起出現（balance.elite.minFloor）
    eliteChance: 0.2,
    affixCount: [1, 1],
    boss: { enemyId: 'enemy.skeleton_king', every: 5 },
    lootTier: 1,
    chests: [1, 2],
    chestLootTable: 'loot.chest',
    clearRatio: 0.7,
  },
  {
    id: 'floor.crypt_2',
    floors: [6, 999],
    maps: ['map.crypt_b', 'map.crypt_a'],
    // 第 6 層起加入骷髏法師
    monsterPool: [
      { enemyId: 'enemy.skeleton', weight: 4 },
      { enemyId: 'enemy.ghoul', weight: 3 },
      { enemyId: 'enemy.skeleton_archer', weight: 3 },
      { enemyId: 'enemy.armored_skeleton', weight: 2 },
      { enemyId: 'enemy.skeleton_mage', weight: 2.5 },
    ],
    density: 2.6,
    packSize: [3, 5],
    eliteChance: 0.3,
    affixCount: [1, 2],
    boss: { enemyId: 'enemy.skeleton_king', every: 5 },
    lootTier: 2,
    chests: [1, 3],
    chestLootTable: 'loot.chest',
    clearRatio: 0.7,
  },
];
