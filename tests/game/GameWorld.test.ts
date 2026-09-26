import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/CommandQueue';
import { distance, vec2 } from '../../src/core/math/Vec2';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { GameCommand } from '../../src/game/Commands';
import { GameWorld } from '../../src/game/GameWorld';

const DT = 1 / 60;

function createWorld() {
  const data = DataRegistry.load(gameData);
  const commands = new CommandQueue<GameCommand>();
  const world = new GameWorld({ data, mapId: 'map.test_1', commands });
  return { world, commands };
}

describe('GameWorld（M1 移動整合測試）', () => {
  it('玩家出生在地圖的 S 位置', () => {
    const { world } = createWorld();
    expect(world.player.position).toEqual(vec2(1.5, 1.5));
  });

  it('點擊地面後走到目的地，途中從未進入牆壁', () => {
    const { world, commands } = createWorld();
    // 出生房間 → 右上房間，必須穿過 (18, 8) 的缺口
    const target = vec2(20.5, 10.5);
    commands.push({ type: 'PrimaryAction', worldPos: target, held: false });

    for (let tick = 0; tick < 60 * 20 && (tick === 0 || world.player.isMoving); tick++) {
      world.update(DT);
      expect(world.nav.isClearAt(world.player.position, world.player.radius - 0.01)).toBe(true);
    }
    expect(distance(world.player.position, target)).toBeLessThan(0.01);
  });

  it('新的點擊會取代原本的目的地', () => {
    const { world, commands } = createWorld();
    commands.push({ type: 'PrimaryAction', worldPos: vec2(10.5, 1.5), held: false });
    world.update(DT);
    commands.push({ type: 'PrimaryAction', worldPos: vec2(1.5, 5.5), held: true });
    world.update(DT);
    expect(world.player.path.at(-1)).toEqual(vec2(1.5, 5.5));
  });

  it('prevPosition 保留上一個 Tick 的位置（供畫面插值）', () => {
    const { world, commands } = createWorld();
    commands.push({ type: 'PrimaryAction', worldPos: vec2(10.5, 1.5), held: false });
    world.update(DT);
    const before = world.player.position;
    world.update(DT);
    expect(world.player.prevPosition).toEqual(before);
    expect(world.player.position).not.toEqual(before);
  });
});
