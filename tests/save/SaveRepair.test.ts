import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/CommandQueue';
import { EventBus } from '../../src/core/EventBus';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { GameCommand } from '../../src/game/Commands';
import type { GameEvents } from '../../src/game/GameEvents';
import { GameWorld } from '../../src/game/GameWorld';
import { SaveMapper } from '../../src/save/SaveMapper';
import { repairSave } from '../../src/save/SaveRepair';

const data = DataRegistry.load(gameData);

function capture() {
  const world = new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: 7 });
  return SaveMapper.capture(world, '2026-01-01T00:00:00.000Z');
}

describe('SaveRepair：玩家不再有普通攻擊', () => {
  it('舊存檔免費送的普通攻擊被移除，技能點不變；左鍵改回預設的重砍', () => {
    const save = capture();
    const old = structuredClone(save);
    old.skills.ranks = { 'basic.attack': 1, ...old.skills.ranks };
    old.loadout.left = 'basic.attack';

    const { data: fixed, notes } = repairSave(old, data);
    expect(fixed.skills.ranks).not.toHaveProperty('basic.attack');
    expect(fixed.skills.unspentPoints).toBe(save.skills.unspentPoints);
    expect(fixed.loadout.left).toBe('melee.heavy_slash');
    expect(notes).toContain('左鍵技能無效，改回重砍');
    expect(notes.some((n) => n.includes('技能點'))).toBe(false);
  });

  it('新角色沒有普通攻擊，左鍵是重砍', () => {
    const save = capture();
    expect(save.skills.ranks).not.toHaveProperty('basic.attack');
    expect(save.loadout.left).toBe('melee.heavy_slash');
    expect(repairSave(save, data).notes).toEqual([]);
  });
});
