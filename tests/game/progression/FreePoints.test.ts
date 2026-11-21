import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { earnedFreePoints } from '../../../src/game/progression/AttributeSystem';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

/** 自由屬性點的來源（設計者 2026-11-21）：往下每一層 1 點、第一次打倒 5～30 層的魔王 2 點、每一層第一次打倒隱藏魔王 2 點 */
const data = DataRegistry.load(gameData);
function start(floor = 1) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor, commands, events, seed: 7 });
  const earned: GameEvents['FreePointsEarned'][] = [];
  events.on('FreePointsEarned', (e) => earned.push(e));
  return { world, events, earned };
}

describe('自由屬性點的來源', () => {
  it('往下每一層 1 點：第 1 層不算，回到走過的樓層不重複給；直接建在某一層的世界不補發', () => {
    const { world, earned } = start();
    expect(world.progress.attributePoints).toBe(0);
    world.enterFloor(2);
    expect(world.progress.attributePoints).toBe(1);
    world.enterFloor(1);
    world.enterFloor(2);
    expect(world.progress.attributePoints).toBe(1);
    world.enterFloor(4);
    expect(world.progress.attributePoints).toBe(3);
    expect(earned).toEqual([{ points: 1, reason: 'floor' }, { points: 2, reason: 'floor' }]);
    expect(start(10).world.progress.attributePoints).toBe(0);
  });

  it('第一次打倒魔王 2 點（5、10…30 層）；重打不再給', () => {
    const { world, earned } = start();
    world.enterFloor(5);
    const before = world.progress.attributePoints;
    const kill = () => {
      const boss = world.actors.find((a) => a.isBoss && a.alive)!;
      boss.lastDamagedBy = world.player.id;
      boss.hp = 0;
      run(world, 3 / 60, () => (world.player.hp = world.player.maxHp));
    };
    kill();
    expect(world.progress.attributePoints).toBe(before + 2);
    expect(earned.at(-1)).toEqual({ points: 2, reason: 'boss' });
    world.enterFloor(4);
    world.enterFloor(5);
    kill();
    expect(world.progress.attributePoints).toBe(before + 2);
  });

  it('應得總數：樓層＋魔王＋每一層的隱藏魔王＋《井誌》；到第 20 層 27 點、第 35 層 46 點', () => {
    const souls = (floors: number[]) => new Set(floors.map((f) => `soul.f${f}`));
    const of = (highestFloor: number, bosses: number[], hidden: number[] = [], bookComplete = false) =>
      earnedFreePoints({ highestFloor, souls: souls(bosses), hiddenKills: new Set(hidden), bookComplete }, data);
    expect(of(1, [])).toBe(0);
    expect(of(20, [5, 10, 15, 20])).toBe(19 + 8);
    expect(of(35, [5, 10, 15, 20, 25, 30, 31, 32, 33, 34, 35])).toBe(34 + 12);
    // 隱藏魔王：每一層第一次 2 點（同一種在不同樓層各算一次）
    expect(of(20, [5, 10, 15, 20], [9, 11, 16])).toBe(27 + 6);
    expect(of(20, [5, 10, 15, 20], [], true)).toBe(27 + data.balance.book.attributePoints);
  });

  it('存檔：打倒過隱藏魔王的樓層會存；舊角色讀檔時照進度補發、自己分配過的保留到總數以內', () => {
    const { world } = start();
    world.enterFloor(3);
    world.progress.hiddenKills.add(3);
    world.progress.attributePoints += 2;
    world.attributes.allocate('vitality', 3);
    const save = SaveMapper.capture(world, new Date(0).toISOString());
    expect(save.hiddenKills).toEqual([3]);
    expect(save.attributes).toEqual({ unspent: 1, allocated: { vitality: 3 } });
    expect(repairSave(structuredClone(save), data).data.attributes).toEqual(save.attributes);
    // 舊角色（沒有這些點數的紀錄）：照到過的最深樓層補發
    const old = structuredClone(save);
    old.attributes = { unspent: 0, allocated: {} };
    delete old.hiddenKills;
    expect(repairSave(old, data).data.attributes).toEqual({ unspent: 2, allocated: {} });
  });
});
