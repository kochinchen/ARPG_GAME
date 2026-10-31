import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { decodeSave, encodeSave } from '../../../src/save/Envelope';
import { migrate } from '../../../src/save/migrations';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

const data = DataRegistry.load(gameData);

function newWorld(seed = 7, floor = 3) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  return new GameWorld({ data, floor, commands, events, seed });
}

const enemies = (world: GameWorld) => world.actors.filter((a) => a.faction === 'enemy');

function reload(world: GameWorld) {
  const save = SaveMapper.capture(world, '2026-01-01T00:00:00.000Z');
  const decoded = decodeSave(encodeSave(save, new Date()));
  if (!decoded.ok) throw new Error(decoded.message);
  const fresh = newWorld(save.meta.runSeed);
  SaveMapper.restore(fresh, repairSave(decoded.data, data));
  return { save, world: fresh };
}

describe('屍體', () => {
  it('怪物死後留下屍體（位置、面向、外觀），本身照常移除：不擋路、AI 與技能都看不到', () => {
    const world = newWorld();
    const victim = enemies(world)[3]!;
    const { defId, visualRadius } = victim;
    victim.hp = 0;
    run(world, 1 / 60);
    expect(world.actors).not.toContain(victim);
    expect(world.corpses).toHaveLength(1);
    // 死掉那一刻的位置與面向
    expect(world.corpses[0]).toMatchObject({ index: 3, defId, visualRadius, restored: false });
    expect(world.corpses[0]!.position).toEqual(victim.position);
    expect(world.corpses[0]!.facing).toEqual(victim.facing);
  });

  it('換樓層後屍體消失；回到原本的樓層怪物重生、沒有屍體', () => {
    const world = newWorld();
    enemies(world)[0]!.hp = 0;
    run(world, 1 / 60);
    expect(world.corpses).toHaveLength(1);
    world.enterFloor(4);
    expect(world.corpses).toHaveLength(0);
    world.enterFloor(3);
    expect(world.corpses).toHaveLength(0);
    expect(world.floors.killed).toBe(0);
  });

  it('讀檔：屍體留在死掉的位置與面向，外觀由生成索引推導', () => {
    const world = newWorld();
    for (const v of enemies(world).slice(1, 4)) v.hp = 0;
    run(world, 1 / 60);
    const before = world.corpses.map((c) => ({ ...c }));
    const { save, world: loaded } = reload(world);
    expect(save.floor.corpses).toHaveLength(3);
    expect(loaded.corpses).toHaveLength(3);
    loaded.corpses.forEach((c, i) => {
      const b = before[i]!;
      expect(c).toMatchObject({ index: b.index, defId: b.defId, restored: true });
      expect(c.visualRadius).toBeCloseTo(b.visualRadius, 9);
      expect(c.position).toEqual(b.position);
      expect(c.facing.x).toBeCloseTo(b.facing.x, 9);
      expect(c.facing.y).toBeCloseTo(b.facing.y, 9);
    });
  });

  it('v17 → v18：舊存檔補上空的屍體清單', () => {
    const migrated = migrate({ floor: { killed: [1, 2] } }, 17) as { floor: { corpses: unknown[]; killed: number[] } };
    expect(migrated.floor.corpses).toEqual([]);
    expect(migrated.floor.killed).toEqual([1, 2]);
  });
});
