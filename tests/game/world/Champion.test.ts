import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { floorResistFor } from '../../../src/game/world/DifficultyScaler';
import { run } from '../helpers';

const data = DataRegistry.load(gameData);
const config = data.balance.champion;

function world(floor: number, seed = 1) {
  const w = new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
  return w;
}
const champions = (w: GameWorld) => w.actors.filter((a) => a.faction === 'enemy' && a.name.startsWith('首領・'));
const championChests = (w: GameWorld) => w.chests.filter((c) => c.lootTable === config.chestLootTable);

describe('每層的首領', () => {
  it('沒有魔王的樓層各有一隻，站在出口前；魔王層與挑戰樓層沒有', () => {
    for (const floor of [1, 2, 4, 6, 12, 29]) {
      const w = world(floor);
      const list = champions(w);
      expect(list).toHaveLength(1);
      const c = list[0]!;
      expect(c.elite).toBe(true);
      expect(w.floors.defFor(floor).monsterPool.some((m) => m.enemyId === c.defId)).toBe(true);
      // 出口的安全範圍外、離出口約 guardDistance 格
      expect(distance(c.position, w.exit!.position)).toBeGreaterThanOrEqual(data.balance.floor.stairsSafeRadius);
      expect(distance(c.position, w.exit!.position)).toBeLessThan(config.guardDistance + 4);
      expect(w.floors.championAlive).toBe(true);
    }
    for (const floor of [5, 10, 30, 31, 34]) expect(champions(world(floor))).toHaveLength(0);
  });

  it('數值比同種的一般怪強：HP、經驗依首領倍率；帶 2～3 個精英詞綴；第 10 層起兩種減傷都有', () => {
    const w = world(12, 3);
    const c = champions(w)[0]!;
    const plain = w.actors.filter((a) => a.faction === 'enemy' && a.defId === c.defId && !a.elite);
    const affixes = c.name.replace('首領・', '').split(' ').length - 1;
    expect(affixes).toBeGreaterThanOrEqual(config.affixCount[0]);
    expect(affixes).toBeLessThanOrEqual(config.affixCount[1]);
    if (plain.length) expect(c.maxHp).toBeGreaterThan(Math.max(...plain.map((p) => p.maxHp)) * 3);
    const value = floorResistFor(12, false, data.balance.elite.floorResist);
    expect(c.stats.get('physicalResist')).toBeCloseTo(value);
    expect(c.stats.get('fireResist')).toBeCloseTo(value);
  });

  it('同一個種子、同一層：首領的種類與位置固定（讀檔後不變），也不改變其他怪物', () => {
    const a = world(7, 5);
    const b = world(7, 5);
    expect(champions(a)[0]!.defId).toBe(champions(b)[0]!.defId);
    expect(champions(a)[0]!.position).toEqual(champions(b)[0]!.position);
    expect(a.floors.total).toBe(b.floors.total);
  });

  it('擊敗首領：原地出現首領寶箱（掉落表是一般寶箱的兩倍擲骰、金幣較多）；開過就不再出現', () => {
    const w = world(3);
    const c = champions(w)[0]!;
    expect(championChests(w)).toHaveLength(0);
    c.hp = 0;
    run(w, 1 / 60);
    expect(w.floors.championAlive).toBe(false);
    const [chest] = championChests(w);
    expect(chest).toBeDefined();
    expect(distance(chest!.position, c.position)).toBeLessThan(2);
    const table = data.lootTables.get(config.chestLootTable);
    const normal = data.lootTables.get('loot.chest');
    expect(table.rolls).toBe(normal.rolls * 2);
    expect(table.gold[0]).toBeGreaterThan(normal.gold[1]);

    // 開過之後重新進入這一層：首領重生，再擊敗也不會再出現寶箱
    w.events.emit('ChestOpened', { chestId: chest!.id, lootTable: chest!.lootTable, position: chest!.position });
    w.enterFloor(3);
    champions(w)[0]!.hp = 0;
    run(w, 1 / 60);
    expect(championChests(w)).toHaveLength(0);
  });

  it('讀檔時首領已被擊敗：不再生成，寶箱放在首領原本的位置；出口條件只剩清怪比例', () => {
    const fresh = world(2, 4);
    const spot = champions(fresh)[0]!.position;
    const index = fresh.floors.total - 1;
    const w = world(2, 4);
    w.enterFloor(2, { killed: [index], midwayActive: false, exitOpen: false });
    expect(champions(w)).toHaveLength(0);
    expect(w.floors.championAlive).toBe(false);
    expect(distance(championChests(w)[0]!.position, spot)).toBeLessThan(1);
  });
});
