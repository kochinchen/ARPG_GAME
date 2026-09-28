import { describe, expect, it, vi } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance, type Vec2 } from '../../../src/core/math/Vec2';
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
/** 出口旁的商人（三位商人的最後一位） */
const exitMerchant = (world: GameWorld) => world.merchants[world.merchants.length - 1]!;

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
    world.player.position = { ...exitMerchant(world).position, x: exitMerchant(world).position.x + 0.8 };
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
  it('每一層樓梯口、中途存檔點、出口旁各有一位商人；貨架由世界種子 + 樓層決定', () => {
    const a = setup(2, 5).world;
    expect(a.merchants).toHaveLength(3);
    const [atStairs, atMidway, atExit] = a.merchants.map((m) => m.position) as [Vec2, Vec2, Vec2];
    expect(distance(atStairs, a.spawnPoint)).toBeLessThan(3);
    expect(distance(atMidway, a.checkpoints.checkpoints[1]!.position)).toBeLessThan(3);
    expect(distance(atExit, a.exit!.position)).toBeLessThan(3);
    expect(a.shop.stock).toHaveLength(data.balance.shop.stockSize);
    const b = setup(2, 5).world;
    expect(b.shop.stock.map((i) => i?.baseId)).toEqual(a.shop.stock.map((i) => i?.baseId));
  });

  it('點商人：走過去後開啟商店', () => {
    const { world, commands, events } = setup();
    const opened = vi.fn();
    events.on('ShopOpened', opened);
    const merchant = exitMerchant(world);
    world.player.position = { x: merchant.position.x + 0.6, y: merchant.position.y };
    commands.push({ type: 'PrimaryAction', worldPos: merchant.position, targetId: null, interactId: merchant.id, held: false });
    run(world, 0.3);
    expect(opened).toHaveBeenCalled();
  });

  it('三位商人共用同一家店：在樓梯口買走的，中途與出口的商人那裡也是已售出', () => {
    const { world, send } = setup();
    const stand = (i: number) => {
      const m = world.merchants[i]!;
      world.player.position = { x: m.position.x + 0.8, y: m.position.y };
      world.player.prevPosition = world.player.position;
    };
    for (let i = 0; i < 3; i++) {
      stand(i);
      expect(world.shop.isNear()).toBe(true);
    }
    stand(0);
    const item = world.shop.stock[0]!;
    world.wallet.gold = buyPrice(item, data);
    send({ type: 'ShopBuy', index: 0 });
    expect(world.shop.stock[0]).toBeNull();
    stand(1);
    expect(world.shop.stock[0]).toBeNull();
    expect(world.shop.boughtIndices).toEqual([0]);
  });

  it('中途存檔點周圍 12 格內沒有怪物（在那裡購物不會被遠程怪發現）', () => {
    for (const floor of [3, 8, 15]) {
      const world = setup(floor, 9).world;
      const midway = world.checkpoints.checkpoints[1]!.position;
      const near = world.actors.filter((a) => a.faction === 'enemy' && distance(a.position, midway) < data.balance.floor.safeRadius);
      expect(near).toEqual([]);
    }
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
    // 樓梯口旁也有商人：站到寶箱那裡（寶箱不會生在商人所在的安全範圍內）
    world.player.position = { ...world.chests[0]!.position };
    world.player.prevPosition = world.player.position;
    expect(world.merchants.every((m) => distance(m.position, world.player.position) > data.balance.shop.range)).toBe(true);
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

  it('藥水最多攜帶 20 瓶：買到上限為止（多的退錢），滿了不能買', () => {
    const { world, send, approach, events } = setup(3);
    approach();
    const max = data.potions.get(data.balance.player.potionId).maxCarry;
    expect(max).toBe(20);
    world.inventory.addPotions(data.balance.player.potionId, max - 2 - world.potions.count);
    world.wallet.gold = 1000;
    send({ type: 'ShopBuyPotion', count: 5 });
    expect(world.potions.count).toBe(max);
    expect(world.wallet.gold).toBe(1000 - 2 * data.balance.shop.potionBuyPrice);
    const failed = vi.fn();
    events.on('ShopFailed', failed);
    send({ type: 'ShopBuyPotion', count: 1 });
    expect(failed).toHaveBeenCalledWith({ reason: 'potionCap' });
    expect(world.potions.count).toBe(max);
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

describe('飛昇（基底升一階）', () => {
  const sword = (rarity: 'normal' | 'rare' | 'mythic' = 'rare') => ({
    uid: 'asc',
    baseId: 'weapon.iron_longsword',
    rarity,
    itemLevel: 6,
    quality: 1,
    affixes: [{ id: 'affix.vital', rolls: [9] }],
  });

  it('飛昇格：放進裝備、付錢後基底換成同種類的下一階，結果留在飛昇格，名稱、詞綴、主倍率保留', () => {
    const { world, send, approach } = setup(1);
    approach();
    world.wallet.add(5000);
    world.cursor.set({ kind: 'item', item: sword() });
    send({ type: 'ShopAscendSlotClick' });
    expect(world.cursor.entry).toBeNull();
    expect(world.shop.ascendSlot!.uid).toBe('asc');
    const info = world.shop.ascendInfo(sword());
    expect(info.next!.id).toBe('weapon.knight_longsword');
    // 第 3 階：只需要武器精華（第 5 階起才需要飛昇碎片）
    expect(Object.keys(info.materials)).toEqual(['weaponEssence']);
    // 材料不夠時不能飛昇
    send({ type: 'ShopAscend' });
    expect(world.shop.ascendSlot!.baseId).toBe('weapon.iron_longsword');
    world.materials.add('weaponEssence', 100);
    const gold = world.wallet.gold;
    // 第 1 層也能飛昇（沒有樓層限制）
    send({ type: 'ShopAscend' });
    const item = world.shop.ascendSlot!;
    expect(item.baseId).toBe('weapon.knight_longsword');
    expect(item.quality).toBe(1);
    expect(item.affixes).toEqual([{ id: 'affix.vital', rolls: [9] }]);
    expect(item.itemLevel).toBe(12);
    expect(world.wallet.gold).toBe(gold - info.price);
    // 可以連續飛昇；空手點飛昇格拿回來
    send({ type: 'ShopAscendSlotClick' });
    expect(world.shop.ascendSlot).toBeNull();
    expect((world.cursor.entry as { item: { baseId: string } }).item.baseId).toBe('weapon.knight_longsword');
  });

  it('飛昇格裡的裝備會存檔', () => {
    const { world, send } = setup(2);
    world.cursor.set({ kind: 'item', item: sword() });
    send({ type: 'ShopAscendSlotClick' });
    const save = SaveMapper.capture(world, 'T');
    const fresh = new GameWorld({ data, floor: 1, commands: new CommandQueue(), events: new EventBus(), seed: save.meta.runSeed });
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.shop.ascendSlot!.uid).toBe('asc');
  });

  it('價格依目標階級與稀有度；最高階與飾品不能飛昇', () => {
    const { world } = setup(12);
    const rare = world.shop.ascendInfo(sword('rare')).price;
    const mythic = world.shop.ascendInfo(sword('mythic')).price;
    expect(mythic).toBeGreaterThan(rare);
    expect(world.shop.ascendInfo({ ...sword(), baseId: 'weapon.knight_longsword' }).reason).toBeNull();
    expect(world.shop.ascendInfo({ ...sword(), baseId: 'weapon.abyss_soul_sword' }).reason).toBe('maxTier');
    expect(world.shop.ascendInfo({ ...sword(), baseId: 'ring.plain' }).reason).toBe('jewelry');
  });

  it('每種武器與防具都有完整的 8 階，等級需求 1 / 6 / 12 / … / 42，數值逐階提高', () => {
    for (const kind of ['sword', 'axe', 'bow', 'staff', 'helmet', 'armor', 'gloves', 'boots']) {
      const tiers = data.items.all.filter((b) => (b.weaponType ?? b.slot) === kind).sort((a, b) => a.tier! - b.tier!);
      expect(tiers.map((b) => b.levelReq), kind).toEqual([1, 6, 12, 18, 24, 30, 36, 42]);
      // 法杖看法術強度，其他看最大傷害 / 防禦
      const value = (b: (typeof tiers)[number]) => b.baseStats.spellPower ?? b.baseStats.damageMax ?? b.baseStats.defense ?? 0;
      for (let i = 1; i < tiers.length; i++) expect(value(tiers[i]!), kind).toBeGreaterThan(value(tiers[i - 1]!) * 1.25);
    }
  });

  it('舊存檔的基底 ID 讀檔時換成新的對應基底', () => {
    const { world } = setup(2);
    const save = SaveMapper.capture(world, 'T');
    save.inventory.cells[0] = { kind: 'item', item: { uid: 'old', baseId: 'weapon.long_sword', rarity: 'magic', itemLevel: 4, affixes: [] } };
    save.collection = ['base:weapon.long_sword', 'base:weapon.iron_longsword'];
    const fixed = repairSave(save, data).data;
    expect((fixed.inventory.cells[0] as { item: { baseId: string } }).item.baseId).toBe('weapon.iron_longsword');
    expect(fixed.collection).toEqual(['base:weapon.iron_longsword']);
  });
});

describe('拆解與材料', () => {
  it('拆解區：放進裝備、按拆掉依稀有度得到精華（武器 → 武器精華、防具 → 防具精華）', () => {
    const { world, send } = setup(2);
    const put = (item: object, slot: number) => {
      world.cursor.set({ kind: 'item', item: item as never });
      send({ type: 'SalvageClick', slot });
    };
    put({ uid: 's1', baseId: 'weapon.short_sword', rarity: 'mythic', itemLevel: 1, affixes: [] }, 0);
    put({ uid: 's2', baseId: 'armor.quilted', rarity: 'normal', itemLevel: 1, affixes: [] }, 1);
    expect(world.cursor.entry).toBeNull();
    expect(world.salvage.preview()).toEqual({ weaponEssence: [16, 20], armorEssence: [1, 2] });
    send({ type: 'SalvageAll' });
    expect(world.materials.get('weaponEssence')).toBeGreaterThanOrEqual(16);
    expect(world.materials.get('weaponEssence')).toBeLessThanOrEqual(20);
    expect(world.materials.get('armorEssence')).toBeGreaterThanOrEqual(1);
    expect(world.salvage.slots.every((s) => s === null)).toBe(true);
  });

  it('拆解區的格子可以拿回；藥水不能放', () => {
    const { world, send } = setup(2);
    world.cursor.set({ kind: 'item', item: { uid: 'x', baseId: 'ring.plain', rarity: 'rare', itemLevel: 1, affixes: [] } });
    send({ type: 'SalvageClick', slot: 3 });
    send({ type: 'SalvageClick', slot: 3 });
    expect((world.cursor.entry as { item: { uid: string } }).item.uid).toBe('x');
    world.cursor.set({ kind: 'potion', potionId: 'potion.rejuvenation', count: 1 });
    send({ type: 'SalvageClick', slot: 4 });
    expect(world.salvage.slots[4]).toBeNull();
  });

  it('魔王的掉落表有機率掉飛昇碎片；走過去自動撿起', () => {
    const { world } = setup(5);
    expect(data.lootTables.get('loot.boss').shards).toEqual({ chance: 0.6, count: [1, 2] });
    // 擊敗魔王：大約六成機率掉碎片
    let dropped = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const w = setup(5, seed).world;
      const boss = w.actors.find((a) => a.isBoss)!;
      boss.lastDamagedBy = w.player.id;
      boss.hp = 0;
      run(w, 1 / 60);
      if (w.groundItems.some((g) => g.content.kind === 'material')) dropped++;
    }
    expect(dropped).toBeGreaterThan(15);
    expect(dropped).toBeLessThan(35);
    world.spawnGroundItem(world.player.position, { kind: 'material', materialId: 'ascensionShard', count: 2 });
    run(world, 0.2);
    expect(world.materials.get('ascensionShard')).toBe(2);
  });

  it('材料與拆解區會存檔', () => {
    const { world } = setup(2);
    world.materials.add('armorEssence', 7);
    world.cursor.set({ kind: 'item', item: { uid: 'keep', baseId: 'boots.leather', rarity: 'magic', itemLevel: 1, affixes: [] } });
    world.salvage.click(2);
    const save = SaveMapper.capture(world, 'T');
    const fresh = setup(1, save.meta.runSeed).world;
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.materials.get('armorEssence')).toBe(7);
    expect(fresh.salvage.slots[2]?.uid).toBe('keep');
  });
});
