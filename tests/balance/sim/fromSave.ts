import { readFileSync } from 'node:fs';
import { Rng } from '../../../src/core/Rng';
import type { DataRegistry } from '../../../src/data/DataRegistry';
import { RNG_STREAMS, type GameWorld } from '../../../src/game/GameWorld';
import { decodeSave } from '../../../src/save/Envelope';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import type { SaveData } from '../../../src/save/schema';
import type { Build } from './character';

/**
 * 存檔法：用設計者匯出的存檔當角色（等級、技能、屬性、裝備、熔核、按鍵配置都是真的）。
 * 存檔的世界種子決定地圖，所以同一份存檔每次打同一層都是同一張地圖；
 * 不同種子只換戰鬥與怪物 AI 的亂數。
 */
export interface LoadedSave {
  data: SaveData;
  build: Build;
}

export function loadSave(path: string, data: DataRegistry): LoadedSave {
  const decoded = decodeSave(readFileSync(path, 'utf8'));
  if (!decoded.ok) throw new Error(`存檔讀不了（${decoded.reason}）：${path}：${decoded.message}`);
  const save = decoded.data;
  const weapon = save.equipment.weapon ? data.items.get(save.equipment.weapon.baseId).weaponType : undefined;
  const left = save.loadout.left;
  const category = data.skills.has(left) ? (data.skills.get(left).tree?.category ?? 'melee') : 'melee';
  const build: Build = {
    id: `save:${path}`,
    label: path,
    category: category === 'ranged' || category === 'magic' ? category : 'melee',
    weapon: weapon ?? 'sword',
    shield: save.equipment.shield !== undefined,
    left,
    attributes: {},
    ranged: weapon === 'bow' || weapon === 'staff',
  };
  return { data: save, build };
}

/** 套用存檔（世界必須用存檔的種子建立、還在第 1 層），再前往要測的樓層；生命魔力回滿、藥水帶滿 */
export function applySave(world: GameWorld, data: DataRegistry, save: SaveData, floor: number, seed: number): void {
  SaveMapper.restore(world, repairSave(save, data));
  // 換掉戰鬥與 AI 的亂數，不同種子的結果才會不同（掉寶等序列不影響難度）
  for (const name of RNG_STREAMS) world.rngStreams[name].setState(new Rng(seed).fork(name).getState());
  world.enterFloor(floor);
  const potionId = data.balance.player.potionId;
  world.inventory.addPotions(potionId, data.potions.get(potionId).maxCarry);
  world.restoreResources(world.player.maxHp, world.player.maxMana);
}
