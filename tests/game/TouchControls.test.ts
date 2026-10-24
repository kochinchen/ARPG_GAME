import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { Rng } from '../../src/core/Rng';
import type { ItemInstance } from '../../src/game/items/ItemInstance';
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

describe('觸控拿取鈕', () => {
  const gear = (ctx: ReturnType<typeof setup>, rarity: ItemInstance['rarity']) => ctx.world.itemGenerator.create(ctx.data.items.all[0]!, rarity, 1);

  /** 按一次拿取鈕並等走過去撿完 */
  function pick(ctx: ReturnType<typeof setup>) {
    ctx.commands.push({ type: 'AutoInteract' });
    run(ctx.world, 2);
  }

  it('先撿藥水，再依稀有度撿裝備（紅 → 橘 → 紫 → 藍 → 白）', () => {
    const ctx = setup();
    const { world } = ctx;
    world.inventory.restore(world.inventory.cells.map(() => null));
    world.spawnGroundItem(vec2(5.5, 2.5), { kind: 'item', item: gear(ctx, 'magic') });
    world.spawnGroundItem(vec2(6.5, 2.5), { kind: 'item', item: gear(ctx, 'legendary') });
    world.spawnGroundItem(vec2(4.5, 1.5), { kind: 'item', item: gear(ctx, 'epic') });
    world.spawnGroundItem(vec2(7.5, 2.5), { kind: 'potion', potionId: ctx.data.balance.player.potionId, count: 1 });
    const order: string[] = [];
    ctx.events.on('PotionPickedUp', () => order.push('potion'));
    ctx.events.on('ItemPickedUp', (e) => order.push(world.inventory.items.find((i) => i.uid === e.uid)!.rarity));
    for (let i = 0; i < 4; i++) pick(ctx);
    expect(order).toEqual(['potion', 'legendary', 'epic', 'magic']);
  });

  it('藥水帶滿了跳過藥水，直接撿裝備；自己丟下的不撿', () => {
    const ctx = setup();
    const { world } = ctx;
    const potionId = ctx.data.balance.player.potionId;
    world.inventory.restore(world.inventory.cells.map(() => null));
    world.inventory.addPotions(potionId, 999);
    world.spawnGroundItem(vec2(4.5, 2.5), { kind: 'potion', potionId, count: 1 });
    world.spawnGroundItem(vec2(5, 2.5), { kind: 'item', item: gear(ctx, 'rare') }).droppedByPlayer = true;
    world.spawnGroundItem(vec2(7.5, 2.5), { kind: 'item', item: gear(ctx, 'normal') });
    pick(ctx);
    expect(world.inventory.items.map((i) => i.rarity)).toEqual(['normal']);
    expect(world.groundItems).toHaveLength(2);
  });

  it('附近只有放不下的東西：提示，不移動', () => {
    const ctx = setup();
    const { world } = ctx;
    const failed: string[] = [];
    ctx.events.on('PickupFailed', (e) => failed.push(e.reason));
    world.inventory.restore(world.inventory.cells.map(() => ({ kind: 'item', item: gear(ctx, 'normal') })));
    world.spawnGroundItem(vec2(6.5, 2.5), { kind: 'item', item: gear(ctx, 'rare') });
    pick(ctx);
    expect(failed).toEqual(['inventoryFull']);
    expect(world.player.position).toEqual(vec2(3.5, 2.5));
  });

  it('太遠的東西不撿', () => {
    const ctx = setup();
    ctx.world.spawnGroundItem(vec2(15.5, 2.5), { kind: 'item', item: gear(ctx, 'mythic') });
    pick(ctx);
    expect(ctx.world.groundItems).toHaveLength(1);
    expect(ctx.world.player.position).toEqual(vec2(3.5, 2.5));
  });
});

describe('觸控按鈕打開商人', () => {
  function withMerchant(enemies: [number, number][] = []) {
    const ctx = setup(enemies);
    const at = vec2(6.5, 2.5);
    ctx.world.merchants = [{ kind: 'merchant', id: 9001, position: at }];
    ctx.world.shop.open(1, [at], new Rng(1));
    let opened = 0;
    ctx.events.on('ShopOpened', () => opened++);
    return { ...ctx, opened: () => opened };
  }

  it('附近沒有敵人：攻擊鈕走過去打開商人', () => {
    const ctx = withMerchant();
    ctx.commands.push({ type: 'AutoAttack', held: false });
    for (let i = 0; i < 20; i++) {
      ctx.commands.push({ type: 'AutoAttack', held: true });
      run(ctx.world, 0.1);
    }
    expect(ctx.opened()).toBe(1);
    expect(ctx.world.player.castCount).toBe(0);
  });

  it('拿取鈕：附近沒有東西可撿時打開商人', () => {
    const ctx = withMerchant();
    ctx.commands.push({ type: 'AutoInteract' });
    run(ctx.world, 2);
    expect(ctx.opened()).toBe(1);
  });

  it('有敵人時攻擊鈕照常攻擊', () => {
    const ctx = withMerchant([[5, 2.5]]);
    ctx.commands.push({ type: 'AutoAttack', held: false });
    run(ctx.world, 1);
    expect(ctx.opened()).toBe(0);
    expect(ctx.world.player.castCount).toBeGreaterThan(0);
  });
});
