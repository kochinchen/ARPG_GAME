import { describe, expect, it } from 'vitest';
import { distance } from '../../../src/core/math/Vec2';
import { createWorldWithMap, makeInvulnerable, run } from '../helpers';

/** 奪魂寄生花的附體（設計者 2026-11-19）：藤蔓範圍內的屍體拖到身邊附體，寄生花倒下就跟著枯萎 */
const ROOM = [
  '##############################',
  '#S...........................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
];

function setup() {
  const made = createWorldWithMap(ROOM, [
    { enemyId: 'enemy.soul_flower', at: [9, 4] },
    { enemyId: 'enemy.skeleton', at: [12, 4] },
  ]);
  const { world } = made;
  makeInvulnerable(world.player);
  world.player.position = { x: 5, y: 4 };
  const flower = world.actors.find((a) => a.defId === 'enemy.soul_flower')!;
  const skeleton = world.actors.find((a) => a.defId === 'enemy.skeleton')!;
  return { ...made, flower, skeleton };
}
const puppetsOf = (world: ReturnType<typeof setup>['world'], flowerId: number) => world.actors.filter((a) => a.alive && a.possessedBy === flowerId);

describe('奪魂寄生花的附體', () => {
  it('附近的怪倒下，寄生花把屍體拖過來附體：同一種怪、滿血、多了吸血', () => {
    const { world, data, flower, skeleton } = setup();
    run(world, 1);
    skeleton.hp = 0;
    run(world, 4);
    const puppets = puppetsOf(world, flower.id);
    expect(puppets).toHaveLength(1);
    const puppet = puppets[0]!;
    expect(puppet.defId).toBe('enemy.skeleton');
    expect(puppet.maxHp).toBeCloseTo(skeleton.maxHp, 5);
    expect(puppet.stats.get('lifeSteal')).toBeCloseTo(data.balance.enemyTactics.possess.lifeSteal, 5);
    // 拖到寄生花身邊
    expect(distance(puppet.position, flower.position)).toBeLessThan(flower.radius + puppet.radius + 0.5);
    expect(puppet.skillRanks.size).toBe(skeleton.skillRanks.size);
  });

  it('同時只控制一隻；寄生花倒下，附體的怪跟著枯萎', () => {
    const { world, flower, skeleton } = setup();
    run(world, 1);
    skeleton.hp = 0;
    run(world, 4);
    const puppet = puppetsOf(world, flower.id)[0]!;
    // 第二具屍體（另一隻骷髏）不會再被附體
    const other = world.spawnScaledEnemy('enemy.skeleton', 1, { x: 12, y: 6 });
    other.hp = 0;
    run(world, 15);
    expect(puppetsOf(world, flower.id)).toHaveLength(1);
    flower.hp = 0;
    run(world, 0.1);
    expect(puppet.alive).toBe(false);
  });

  it('屍體在藤蔓範圍外就不附體', () => {
    const made = createWorldWithMap(ROOM, [
      { enemyId: 'enemy.soul_flower', at: [5, 4] },
      { enemyId: 'enemy.skeleton', at: [25, 4] },
    ]);
    const { world } = made;
    makeInvulnerable(world.player);
    world.player.position = { x: 3, y: 4 };
    const flower = world.actors.find((a) => a.defId === 'enemy.soul_flower')!;
    run(world, 1);
    world.actors.find((a) => a.defId === 'enemy.skeleton')!.hp = 0;
    run(world, 5);
    expect(puppetsOf(world, flower.id)).toHaveLength(0);
  });
});
