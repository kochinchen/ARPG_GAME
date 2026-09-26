import { describe, expect, it, vi } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { sortInventory } from '../../../src/game/items/InventorySort';
import { buyPrice, gamblePrice, itemValue, sellPrice } from '../../../src/game/items/Pricing';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

const data = DataRegistry.load(gameData);

function setup(floor = 2, seed = 5) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor, commands, events, seed });
  const send = (c: GameCommand) => {
    commands.push(c);
    run(world, 1 / 60);
  };
  /** 站到商人旁邊 */
  const approach = () => {
    world.player.position = { ...world.merchant!.position, x: world.merchant!.position.x + 0.8 };
    world.player.prevPosition = world.player.position;
  };
  return { world, commands, events, send, approach };
}
const base = (slot: string) => data.items.all.find((b) => b.slot === slot)!;

describe('背包自動整理', () => {
  it('依裝備類別排列，同類別物品等級高到低；藥水合併放最後', () => {
    const { world } = setup();
    const g = world.itemGenerator;
    const inv = world.inventory;
    inv.restore(inv.cells.map(() => null));
    inv.place(10, { kind: 'item', item: g.create(base('boots'), 'magic', 3) });
    inv.place(3, { kind: 'potion', potionId: 'potion.rejuvenation', count: 7 });
    inv.place(20, { kind: 'item', item: g.create(base('weapon'), 'normal', 2) });
    inv.place(25, { kind: 'potion', potionId: 'potion.rejuvenation', count: 18 });
    inv.place(30, { kind: 'item', item: g.create(base('weapon'), 'rare', 7) });
    inv.place(40, { kind: 'item', item: g.create(base('helmet'), 'normal', 4) });
    sortInventory(inv, data);
    const summary = inv.cells.slice(0, 7).map((c) =>
      c === null ? null : c.kind === 'item' ? `${data.items.get(c.item.baseId).slot}:${c.item.itemLevel}` : `potion:${c.count}`,
    );
    expect(summary).toEqual(['weapon:7', 'weapon:2', 'helmet:4', 'boots:3', 'potion:20', 'potion:5', null]);
  });
});

describe('商人', () => {
  it('每一層出口旁都有商人；貨架由世界種子 + 樓層決定', () => {
    const a = setup(2, 5).world;
    expect(a.merchant).not.toBeNull();
    expect(distance(a.merchant!.position, a.exit!.position)).toBeLessThan(3);
    expect(a.shop.stock).toHaveLength(data.balance.shop.stockSize);
    const b = setup(2, 5).world;
    expect(b.shop.stock.map((i) => i?.baseId)).toEqual(a.shop.stock.map((i) => i?.baseId));
  });

  it('點商人：走過去後開啟商店', () => {
    const { world, commands, events } = setup();
    const opened = vi.fn();
    events.on('ShopOpened', opened);
    world.player.position = { x: world.merchant!.position.x + 0.6, y: world.merchant!.position.y };
    commands.push({ type: 'PrimaryAction', worldPos: world.merchant!.position, targetId: null, interactId: world.merchant!.id, held: false });
    run(world, 0.3);
    expect(opened).toHaveBeenCalled();
  });

  it('購買：扣金幣、放進背包（換新的 uid）、貨架該格清空', () => {
    const { world, send, approach } = setup();
    approach();
    const item = world.shop.stock[0]!;
    const price = buyPrice(item, data);
    world.wallet.gold = price + 5;
    send({ type: 'ShopBuy', index: 0 });
    expect(world.wallet.gold).toBe(5);
    expect(world.shop.stock[0]).toBeNull();
    const got = world.inventory.items.find((i) => i.baseId === item.baseId && i.itemLevel === item.itemLevel && i.rarity === item.rarity)!;
    expect(got).toBeDefined();
    expect(got.uid).not.toBe(item.uid);
  });

  it('金幣不足或離太遠：不能交易', () => {
    const { world, events, send, approach } = setup();
    const failed = vi.fn();
    events.on('ShopFailed', failed);
    world.wallet.gold = 1;
    send({ type: 'ShopBuy', index: 0 });
    expect(failed).toHaveBeenLastCalledWith({ reason: 'far' });
    approach();
    send({ type: 'ShopBuy', index: 0 });
    expect(failed).toHaveBeenLastCalledWith({ reason: 'gold' });
    expect(world.shop.stock[0]).not.toBeNull();
  });

  it('賣出：背包格、手上的物品、所有普通裝備', () => {
    const { world, send, approach } = setup();
    approach();
    const g = world.itemGenerator;
    world.wallet.gold = 0;
    const magic = g.create(base('weapon'), 'magic', 4);
    world.inventory.place(50, { kind: 'item', item: magic });
    send({ type: 'ShopSell', cell: 50 });
    expect(world.wallet.gold).toBe(itemValue(magic, data));
    expect(world.inventory.get(50)).toBeNull();

    const held = g.create(base('ring'), 'rare', 3);
    world.cursor.set({ kind: 'item', item: held });
    send({ type: 'ShopSellHeld' });
    expect(world.cursor.entry).toBeNull();

    world.wallet.gold = 0;
    const n1 = g.create(base('helmet'), 'normal', 1);
    const n2 = g.create(base('boots'), 'normal', 2);
    world.inventory.place(60, { kind: 'item', item: n1 });
    world.inventory.place(61, { kind: 'item', item: n2 });
    world.inventory.place(62, { kind: 'item', item: g.create(base('boots'), 'magic', 2) });
    send({ type: 'ShopSellNormals' });
    expect(world.wallet.gold).toBe(itemValue(n1, data) + itemValue(n2, data));
    expect(world.inventory.get(62)).not.toBeNull();
    expect(sellPrice({ kind: 'potion', potionId: 'potion.rejuvenation', count: 4 }, data)).toBe(4 * data.balance.shop.potionSellPrice);
  });

  it('買藥水；賭博得到指定類別的物品（價格依樓層）', () => {
    const { world, send, approach } = setup(3);
    approach();
    const potions = world.potions.count;
    world.wallet.gold = 1000;
    send({ type: 'ShopBuyPotion', count: 5 });
    expect(world.potions.count).toBe(potions + 5);
    expect(world.wallet.gold).toBe(1000 - 5 * data.balance.shop.potionBuyPrice);

    const before = world.wallet.gold;
    const count = world.inventory.items.length;
    send({ type: 'ShopGamble', slot: 'gloves' });
    expect(world.wallet.gold).toBe(before - gamblePrice(3, data));
    const items = world.inventory.items;
    expect(items).toHaveLength(count + 1);
    expect(data.items.get(items.at(-1)!.baseId).slot).toBe('gloves');
    expect(items.at(-1)!.itemLevel).toBe(3);
  });

  it('背包滿了：買不到，也不扣錢', () => {
    const { world, send, approach } = setup();
    approach();
    world.inventory.restore(world.inventory.cells.map(() => ({ kind: 'potion' as const, potionId: 'potion.rejuvenation', count: 20 })));
    world.wallet.gold = 10000;
    send({ type: 'ShopBuy', index: 0 });
    send({ type: 'ShopGamble', slot: 'weapon' });
    expect(world.wallet.gold).toBe(10000);
    expect(world.shop.stock[0]).not.toBeNull();
  });

  it('讀檔：貨架相同，已買走的不會補回來', () => {
    const { world, send, approach } = setup(2, 9);
    approach();
    world.wallet.gold = 100000;
    send({ type: 'ShopBuy', index: 1 });
    send({ type: 'ShopBuy', index: 4 });
    const save = SaveMapper.capture(world, 'T');
    expect(save.floor.shopBought).toEqual([1, 4]);
    const fresh = new GameWorld({ data, floor: 1, commands: new CommandQueue(), events: new EventBus(), seed: save.meta.runSeed });
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.shop.boughtIndices).toEqual([1, 4]);
    expect(fresh.shop.stock.map((i) => i?.baseId ?? null)).toEqual(world.shop.stock.map((i) => i?.baseId ?? null));
  });
});
