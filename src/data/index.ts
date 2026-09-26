import type { RawGameData } from './DataRegistry';
import { balance } from './balance';
import { items, potions } from './items';
import { maps } from './maps';
import { enemies } from './enemies';
import { skills } from './skills';
import { comboRules } from './comboRules';
import { affixes } from './affixes';
import { lootTables } from './lootTables';

/**
 * 所有遊戲資料的集合，交給 DataRegistry.load() 驗證。
 * floors 於 M7 加入。
 */
export const gameData: RawGameData = {
  balance,
  skills,
  enemies,
  items,
  potions,
  affixes,
  lootTables,
  floors: [],
  maps,
  comboRules,
};
