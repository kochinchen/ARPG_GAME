import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from './helpers';

/** iPad 觸控：搖桿移動、攻擊鈕 / 招式鈕自動瞄準最近的敵人 */
const ROOM = [
  '####################',
  '#S.................#',
  '#..................#',
  '#..................#',
  '####################',
];

function setup(enemies: [number, number][] = []) {
  const ctx = createWorldWithMap(
    ROOM,
    enemies.map((at) => ({ enemyId: 'enemy.training_dummy', at })),
  );
  const player = ctx.world.player;
  player.position = vec2(3.5, 2.5);
  player.prevPosition = player.position;
  for (const e of enemiesOf(ctx.world)) makeInvulnerable(e);
  return ctx;
}

/** 模擬按住搖桿：每 0.1 秒重送一次方向 */
function holdStick(ctx: ReturnType<typeof setup>, dir: { x: number; y: number }, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) {
    ctx.commands.push({ type: 'MoveDirection', dir });
    run(ctx.world, 0.1);
  }
}

describe('觸控搖桿', () => {
  it('按住朝方向持續移動，放開就停下', () => {
    const ctx = setup();
    holdStick(ctx, vec2(1, 0), 1);
    const x = ctx.world.player.position.x;
    expect(x).toBeGreaterThan(5);
    expect(Math.abs(ctx.world.player.position.y - 2.5)).toBeLessThan(0.2);

    ctx.commands.push({ type: 'MoveDirection', dir: null });
    run(ctx.world, 0.5);
    expect(ctx.world.player.position.x).toBeCloseTo(x, 0);
  });

  it('攻擊鈕按住時搖桿不會打斷攻擊', () => {
    const ctx = setup([[5, 2.5]]);
    ctx.commands.push({ type: 'AutoAttack', held: false });
    for (let i = 0; i < 8; i++) {
      ctx.commands.push({ type: 'MoveDirection', dir: vec2(-1, 0) });
      ctx.commands.push({ type: 'AutoAttack', held: true });
      run(ctx.world, 0.1);
    }
    expect(ctx.world.player.castCount).toBeGreaterThan(0);
    expect(ctx.world.player.position.x).toBeGreaterThan(3.4);
  });
});

describe('觸控自動瞄準', () => {
  it('攻擊鈕打最近的敵人', () => {
    const ctx = setup([[12.5, 2.5], [6, 2.5]]);
    const near = enemiesOf(ctx.world).find((e) => e.position.x === 6)!;
    const hits = new Set<number>();
    ctx.events.on('ActorDamaged', (e) => hits.add(e.targetId));
    ctx.commands.push({ type: 'AutoAttack', held: false });
    run(ctx.world, 1.5);
    expect([...hits]).toEqual([near.id]);
  });

  it('附近沒有敵人：原地朝面向出手，不移動', () => {
    const ctx = setup([[18.5, 2.5]]);
    ctx.world.player.facing = vec2(0, 1);
    ctx.commands.push({ type: 'AutoAttack', held: false });
    run(ctx.world, 0.5);
    expect(ctx.world.player.position).toEqual(vec2(3.5, 2.5));
    expect(ctx.world.player.castCount).toBeGreaterThan(0);
  });

  it('招式鈕朝最近的敵人施放目前的連段', () => {
    const ctx = setup([[7, 2.5]]);
    const { world, commands } = ctx;
    world.player.skillRanks.set('magic.fireball', 1);
    world.loadout.combos[0] = ['magic.fireball', null, null];
    world.progress.level = 10;
    world.loadout.select(0);
    let projectiles = 0;
    const push = world.projectiles.push.bind(world.projectiles);
    world.projectiles.push = (...p) => {
      projectiles += p.length;
      return push(...p);
    };
    commands.push({ type: 'AutoCastRight' });
    run(world, 1);
    expect(projectiles).toBeGreaterThan(0);
    expect(world.player.facing.x).toBeGreaterThan(0.9);
  });
});
