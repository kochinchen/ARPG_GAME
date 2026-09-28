import { describe, expect, it, vi } from 'vitest';
import { vec2 } from '../../../src/core/math/Vec2';
import type { GroundItem } from '../../../src/game/entities/Interactable';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameEvents } from '../../../src/game/GameEvents';
import { ItemGenerator } from '../../../src/game/items/ItemGenerator';
import { LootSystem } from '../../../src/game/items/LootSystem';
import { createWorldWithMap, enemiesOf, run } from '../helpers';

const ROOM = [
  '##############',
  '#S...........#',
  '#............#',
  '#............#',
  '##############',
];

/** 必定掉 2 件物品的測試用掉落表 */
const ALWAYS_ITEMS = {
  id: 'loot.test_items',
  rolls: 2,
  entries: [{ kind: 'item', weight: 1 }],
  rarityWeights: { normal: 0, magic: 1, rare: 0, legendary: 0 },
};
const ALWAYS_POTION = { id: 'loot.test_potion', rolls: 1, entries: [{ kind: 'potion', weight: 1 }], rarityWeights: { normal: 1, magic: 0, rare: 0, legendary: 0 } };
const ALWAYS_GOLD = { id: 'loot.test_gold', rolls: 1, entries: [{ kind: 'gold', weight: 1 }], gold: [7, 7], rarityWeights: { normal: 1, magic: 0, rare: 0, legendary: 0 } };

const lootDummy = (lootTable: string) => ({
  id: `enemy.loot_${lootTable.split('.')[1]}`,
  name: '掉寶木樁',
  hp: 1,
  damage: [0, 0],
  defense: 0,
  moveSpeed: 0,
  attackRange: 1,
  detectRange: 0,
  ai: 'none',
  lootTable,
  xp: 0,
});

function setup(lootTable = 'loot.test_items', chests: { at: [number, number]; lootTable: string }[] = []) {
  const enemy = lootDummy(lootTable);
  return createWorldWithMap(ROOM, [{ enemyId: enemy.id, at: [8.5, 2.5] }], {
    chests,
    extra: { enemies: [enemy], lootTables: [ALWAYS_ITEMS, ALWAYS_POTION, ALWAYS_GOLD] },
  });
}

const click = (g: { id: number; position: { x: number; y: number } }) =>
  ({ type: 'PrimaryAction', worldPos: vec2(g.position.x, g.position.y), targetId: null, interactId: g.id, held: false }) as const;

describe('掉寶（M5）', () => {
  it('怪物死亡時依掉落表在附近的地板生成物品', () => {
    const { world } = setup();
    enemiesOf(world)[0]!.hp = 0;
    run(world, 0.1);
    expect(world.groundItems).toHaveLength(2);
    for (const g of world.groundItems) {
      expect(g.content.kind).toBe('item');
      expect(world.nav.isWalkableAt(g.position.x, g.position.y)).toBe(true);
      expect(Math.hypot(g.position.x - 8.5, g.position.y - 2.5)).toBeLessThanOrEqual(1.2);
    }
  });

  it('點擊地上的物品：走過去撿起放進背包', () => {
    const { world, commands, events } = setup();
    const onPicked = vi.fn();
    events.on('ItemPickedUp', onPicked);
    enemiesOf(world)[0]!.hp = 0;
    run(world, 0.1);
    const target = world.groundItems[0]!;
    const uid = (target.content as Extract<GroundItem['content'], { kind: 'item' }>).item.uid;

    commands.push(click(target));
    run(world, 4);
    expect(world.inventory.items.map((i) => i.uid)).toContain(uid);
    expect(world.groundItems).not.toContain(target);
    expect(onPicked).toHaveBeenCalledWith(expect.objectContaining({ uid }));
  });

  it('背包滿時撿不起來，物品留在地上', () => {
    const { world, commands, events } = setup();
    const onFailed = vi.fn();
    events.on('PickupFailed', onFailed);
    for (let i = 0; i < world.inventory.capacity; i++) {
      world.inventory.addItem({ uid: `f${i}`, baseId: 'ring.plain', rarity: 'normal', itemLevel: 1, affixes: [] });
    }
    enemiesOf(world)[0]!.hp = 0;
    run(world, 0.1);
    const target = world.groundItems[0]!;
    commands.push(click(target));
    run(world, 4);
    expect(world.groundItems).toContain(target);
    expect(onFailed).toHaveBeenCalledWith({ reason: 'inventoryFull' });
  });

  it('藥水與金幣：走過去自動撿取', () => {
    const { world, commands } = setup('loot.test_gold');
    world.spawnGroundItem(vec2(4.5, 1.5), { kind: 'potion', potionId: 'potion.rejuvenation', count: 1 });
    enemiesOf(world)[0]!.hp = 0;
    run(world, 0.1);
    const potionsBefore = world.potions.count;

    commands.push({ type: 'PrimaryAction', worldPos: vec2(4.5, 1.5), targetId: null, held: false });
    run(world, 2);
    expect(world.potions.count).toBe(potionsBefore + 1);

    const gold = world.groundItems.find((g) => g.content.kind === 'gold')!;
    commands.push({ type: 'PrimaryAction', worldPos: gold.position, targetId: null, held: false });
    run(world, 3);
    expect(world.wallet.gold).toBe(7);
    expect(world.groundItems).toHaveLength(0);
  });

  it('藥水疊入背包；背包沒有空間時留在地上（只撿得下的部分）', () => {
    const { world, commands } = setup('loot.test_potion');
    const inv = world.inventory;
    // 起始藥水在第一格；其餘格子塞滿物品，只剩原本那一疊可以補
    for (let i = 0; i < inv.capacity; i++) {
      inv.addItem({ uid: `f${i}`, baseId: 'ring.plain', rarity: 'normal', itemLevel: 1, affixes: [] });
    }
    const before = world.potions.count;
    const ground = world.spawnGroundItem(vec2(3.5, 1.5), { kind: 'potion', potionId: 'potion.rejuvenation', count: 30 });
    commands.push({ type: 'PrimaryAction', worldPos: vec2(3.5, 1.5), targetId: null, held: false });
    run(world, 2);
    expect(world.potions.count).toBe(20);
    expect(world.groundItems).toContain(ground);
    expect(ground.content).toMatchObject({ kind: 'potion', count: 30 - (20 - before) });
  });

  it('寶箱：點擊後走過去開啟並掉寶，只能開一次', () => {
    const { world, commands, events } = setup('loot.test_items', [{ at: [5.5, 3.5], lootTable: 'loot.test_items' }]);
    const onOpened = vi.fn();
    events.on('ChestOpened', onOpened);
    const chest = world.chests[0]!;

    commands.push(click(chest));
    run(world, 3);
    expect(chest.opened).toBe(true);
    expect(world.groundItems).toHaveLength(2);

    commands.push(click(chest));
    run(world, 1);
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(world.groundItems).toHaveLength(2);
  });

  it('點擊物品後又點地面：取消撿取', () => {
    const { world, commands } = setup();
    enemiesOf(world)[0]!.hp = 0;
    run(world, 0.1);
    commands.push(click(world.groundItems[0]!));
    run(world, 0.2);
    commands.push({ type: 'PrimaryAction', worldPos: vec2(1.5, 3.5), targetId: null, held: false });
    run(world, 4);
    expect(world.inventory.items).toHaveLength(0);
    expect(world.interaction.target).toBeNull();
  });

  it('測試地圖的骷髏與寶箱都掛有掉落表', () => {
    const { world, data } = createWorldWithMap(ROOM);
    expect(data.enemies.get('enemy.skeleton').lootTable).toBe('loot.skeleton');
    expect(data.maps.get('map.test_1').chests.length).toBeGreaterThan(0);
    expect(world.chests).toHaveLength(0);
  });
});

describe('掉寶的樓層成長', () => {
  const data = DataRegistry.load(gameData);
  const loot = (lootTier: number) =>
    new LootSystem(data, new Rng(3), new ItemGenerator(data, new Rng(4)), null as never, () => {}, () => 20, () => lootTier, new EventBus<GameEvents>());

  it('lootTier 放大黃以上的權重，白 / 藍不變；超出設定的階級用最後一組', () => {
    const table = data.lootTables.get('loot.skeleton');
    expect(loot(1).rarityWeights(table)).toEqual(table.rarityWeights);
    const deep = loot(4).rarityWeights(table);
    const bonus = data.balance.loot.tierBonus[3]!;
    expect(deep.normal).toBe(table.rarityWeights.normal);
    expect(deep.magic).toBe(table.rarityWeights.magic);
    expect(deep.rare).toBeCloseTo(table.rarityWeights.rare * bonus.rare);
    expect(deep.legendary).toBeCloseTo(table.rarityWeights.legendary * bonus.legendary);
    expect(deep.mythic).toBeCloseTo(table.rarityWeights.mythic * bonus.mythic);
    expect(loot(9).rarityWeights(table)).toEqual(deep);
  });

  it('精英額外掉落至少一件物品', () => {
    const system = loot(1);
    for (let i = 0; i < 300; i++) expect(system.roll('loot.elite').some((d) => d.kind === 'item')).toBe(true);
  });

  it('大型怪使用 loot.brute（擲兩次）', () => {
    const brutes = data.enemies.all.filter((e) => e.lootTable === 'loot.brute').map((e) => e.id);
    expect(brutes).toEqual(expect.arrayContaining(['enemy.horned_brute', 'enemy.molten_brute', 'enemy.quake_beast', 'enemy.egg_matron']));
    expect(data.lootTables.get('loot.brute').rolls).toBe(2);
  });
});
