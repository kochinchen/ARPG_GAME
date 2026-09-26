import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from './helpers';

/** 按住 Shift：原地施放（不移動），方便遠程 / 魔法操作 */
const ROOM = [
  '####################',
  '#S.................#',
  '#..................#',
  '#..................#',
  '####################',
];

function setup(enemyX: number) {
  const ctx = createWorldWithMap(ROOM, [{ enemyId: 'enemy.training_dummy', at: [enemyX, 2.5] }]);
  const player = ctx.world.player;
  player.position = vec2(3.5, 2.5);
  player.prevPosition = player.position;
  for (const e of enemiesOf(ctx.world)) makeInvulnerable(e);
  return ctx;
}

describe('Shift 原地施放', () => {
  it('左鍵點遠處的敵人：沒按 Shift 會走過去；按住 Shift 站在原地出手', () => {
    const walk = setup(12.5);
    const dummy = enemiesOf(walk.world)[0]!;
    walk.commands.push({ type: 'PrimaryAction', worldPos: dummy.position, targetId: dummy.id, held: false });
    run(walk.world, 0.5);
    expect(walk.world.player.position.x).toBeGreaterThan(4);

    const stand = setup(12.5);
    const target = enemiesOf(stand.world)[0]!;
    stand.commands.push({ type: 'PrimaryAction', worldPos: target.position, targetId: target.id, held: false, standStill: true });
    run(stand.world, 0.5);
    expect(stand.world.player.position).toEqual(vec2(3.5, 2.5));
    expect(stand.world.player.castCount).toBeGreaterThan(0);
    expect(stand.world.player.facing.x).toBeGreaterThan(0.9);
  });

  it('Shift + 左鍵點地面：不移動，朝游標方向出手；按住持續施放', () => {
    const { world, commands } = setup(12.5);
    commands.push({ type: 'PrimaryAction', worldPos: vec2(3.5, 1.5), targetId: null, held: false, standStill: true });
    run(world, 0.3);
    for (let i = 0; i < 4; i++) {
      commands.push({ type: 'PrimaryAction', worldPos: vec2(3.5, 1.5), targetId: null, held: true, standStill: true });
      run(world, 0.3);
    }
    expect(world.player.position).toEqual(vec2(3.5, 2.5));
    expect(world.player.castCount).toBeGreaterThan(1);
    expect(world.player.facing.y).toBeLessThan(-0.9);
  });

  it('Shift + 左鍵：敵人在範圍內時照常打中', () => {
    const { world, commands, events } = setup(4.3);
    const dummy = enemiesOf(world)[0]!;
    let hit = 0;
    events.on('ActorDamaged', (e) => {
      if (e.targetId === dummy.id) hit++;
    });
    commands.push({ type: 'PrimaryAction', worldPos: dummy.position, targetId: dummy.id, held: false, standStill: true });
    run(world, 0.8);
    expect(hit).toBeGreaterThan(0);
  });

  it('Shift + 右鍵：整組連段原地施放（重砍不會衝向遠處的敵人），火球照樣飛出去', () => {
    const { world, commands } = setup(12.5);
    world.player.skillRanks.set('melee.heavy_slash', 1);
    world.loadout.combos[0] = ['melee.heavy_slash', 'magic.fireball', null];
    world.progress.level = 10;
    world.loadout.select(0);
    const dummy = enemiesOf(world)[0]!;
    let projectiles = 0;
    const push = world.projectiles.push.bind(world.projectiles);
    world.projectiles.push = (...p) => {
      projectiles += p.length;
      return push(...p);
    };
    commands.push({ type: 'CastRight', worldPos: dummy.position, targetId: dummy.id, standStill: true });
    run(world, 2);
    expect(world.player.position).toEqual(vec2(3.5, 2.5));
    expect(world.player.castCount).toBe(2);
    expect(projectiles).toBe(1);
  });
});
