import type { RawGameData } from './DataRegistry';
import { balance } from './balance';
import { items, potions } from './items';

/**
 * 所有遊戲資料的集合，交給 DataRegistry.load() 驗證。
 * skills / enemies / affixes / lootTables / floors 依 Milestone 逐步加入。
 */
export const gameData: RawGameData = {
  balance,
  skills: [],
  enemies: [],
  items,
  potions,
  affixes: [],
  lootTables: [],
  floors: [],
};
