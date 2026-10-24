import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { CoreSlot } from '../../../src/data/schema/core';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import type { CoreInstance, CoreRoll } from '../../../src/game/items/CoreInstance';
import { ItemGenerator } from '../../../src/game/items/ItemGenerator';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import { sellPrice } from '../../../src/game/items/Pricing';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

/** 孔位、商人的鑿孔、玩家自己鑲嵌 / 取下熔核（v0.5.0 P4） */
const data = DataRegistry.load(gameData);
const base = (slot: string) => data.items.all.find((b) => b.slot === slot)!;

const EMPTY: Record<CoreSlot, CoreRoll[]> = { weapon: [], helmet: [], armor: [], gloves: [], boots: [], shield: [] };
const core = (uid: string, over: Partial<CoreInstance> = {}): CoreInstance => ({
  uid,
  types: ['sharp'],
  tier: 1,
  rarity: 'epic',
  power: 1.2,
  itemLevel: 10,
  main: { ...EMPTY, weapon: [{ lineId: 'core.sharp.crit', roll: 1 }], helmet: [{ lineId: 'core.sharp.cast_speed', roll: 1 }] },
  secondary: [],
  ...over,
});

function setup() {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor: 2, commands, events, seed: 5 });
  const merchant = world.merchants[world.merchants.length - 1]!;
  world.player.position = { ...merchant.position, x: merchant.position.x + 0.8 };
  world.player.prevPosition = world.player.position;
  const failures: string[] = [];
  events.on('ShopFailed', (e) => failures.push(e.reason));
  const send = (c: GameCommand) => {
    commands.push(c);
    run(world, 1 / 60);
  };
  return { world, send, failures, events };
}
const item = (slot: string, rarity: ItemInstance['rarity'], itemLevel = 10, sockets?: ItemInstance['sockets']): ItemInstance => ({
  uid: `${slot}-${rarity}`,
  baseId: base(slot).id,
  rarity,
  itemLevel,
  affixes: [],
  ...(sockets ? { sockets } : {}),
});

describe('自己鑲嵌 / 取下（不需商人、不花錢）', () => {
  /** 離商人很遠：鑲嵌不經過商人 */
  function farSetup() {
    const s = setup();
    s.world.player.position = { x: s.world.player.position.x + 1000, y: s.world.player.position.y };
    s.world.player.prevPosition = s.world.player.position;
    s.world.wallet.gold = 0;
    s.world.inventory.restore(s.world.inventory.cells.map(() => null));
    return s;
  }

  it('拿著熔核點身上裝備的空孔 → 鑲入、屬性生效；右鍵取下 → 熔核放回背包、孔保留', () => {
    const { world, send } = farSetup();
    world.equipment.equip(item('weapon', 'epic', 12, { max: 2, cores: [] }));
    const before = world.player.stats.get('critChance');
    world.inventory.addCore(core('c1'));
    send({ type: 'InventoryClick', cell: 0 });
    expect(world.cursor.entry?.kind).toBe('core');
    send({ type: 'EquipmentClick', slot: 'weapon' });
    expect(world.cursor.entry).toBeNull();
    expect(world.equipment.get('weapon')!.sockets).toEqual({ max: 2, cores: [core('c1')] });
    // 紫裝 ×1；銳核武器欄暴擊 4% × 核色 1.2
    expect(world.player.stats.get('critChance')).toBeCloseTo(before + 0.04 * 1.2);

    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } });
    expect(world.cursor.entry).toBeNull();
    expect(world.inventory.get(0)).toEqual({ kind: 'core', core: core('c1') });
    expect(world.equipment.get('weapon')!.sockets).toEqual({ max: 2, cores: [] });
    expect(world.player.stats.get('critChance')).toBeCloseTo(before);
    expect(world.wallet.gold).toBe(0);
  });

  it('背包裡的裝備也能鑲：拿著熔核點有空孔的裝備 → 鑲入；孔滿了就照常互換', () => {
    const { world, send } = farSetup();
    world.inventory.place(0, { kind: 'item', item: item('helmet', 'rare', 10, { max: 1, cores: [] }) });
    world.cursor.set({ kind: 'core', core: core('h1') });
    send({ type: 'InventoryClick', cell: 0 });
    expect(world.cursor.entry).toBeNull();
    const helmet = world.inventory.get(0);
    expect(helmet?.kind === 'item' && helmet.item.sockets).toEqual({ max: 1, cores: [core('h1')] });

    // 孔滿了：照常互換（熔核放進格子、頭盔拿到手上）
    world.cursor.set({ kind: 'core', core: core('h2') });
    send({ type: 'InventoryClick', cell: 0 });
    expect(world.inventory.get(0)).toEqual({ kind: 'core', core: core('h2') });
    expect(world.cursor.entry?.kind).toBe('item');
    send({ type: 'InventoryClick', cell: 1 });

    send({ type: 'RemoveCore', from: { kind: 'cell', cell: 1 } });
    expect(world.cursor.entry).toBeNull();
    expect(world.inventory.get(2)).toEqual({ kind: 'core', core: core('h1') });
    const emptied = world.inventory.get(1);
    expect(emptied?.kind === 'item' && emptied.item.sockets).toEqual({ max: 1, cores: [] });
  });

  it('身上的裝備沒有空孔：熔核留在手上並提示；手上拿著東西時右鍵照樣取回背包', () => {
    const { world, send, events } = farSetup();
    const failed: string[] = [];
    events.on('EquipFailed', (e) => failed.push(e.reason));
    world.equipment.equip(item('weapon', 'normal', 12, { max: 1, cores: [core('full')] }));
    world.cursor.set({ kind: 'core', core: core('c2') });
    send({ type: 'EquipmentClick', slot: 'weapon' });
    expect(failed).toEqual(['noSocket']);
    expect(world.cursor.entry).toEqual({ kind: 'core', core: core('c2') });
    send({ type: 'EquipmentClick', slot: 'ring1' }); // 空欄位
    expect(failed).toEqual(['noSocket', 'noSocket']);
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } });
    expect(world.equipment.get('weapon')!.sockets!.cores).toEqual([]);
    expect(world.inventory.get(0)).toEqual({ kind: 'core', core: core('full') });
    expect(world.cursor.entry).toEqual({ kind: 'core', core: core('c2') });
  });

  it('多顆：連按右鍵從最後鑲入的開始一顆一顆取回背包；右鍵空格不動作', () => {
    const { world, send } = farSetup();
    world.equipment.equip(item('weapon', 'normal', 12, { max: 3, cores: [core('a'), core('b'), core('c')] }));
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } });
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } });
    expect(world.equipment.get('weapon')!.sockets!.cores.map((c) => c.uid)).toEqual(['a']);
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } });
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } }); // 已經沒有熔核：不動作
    expect(world.equipment.get('weapon')!.sockets).toEqual({ max: 3, cores: [] });
    expect([0, 1, 2, 3].map((i) => world.inventory.get(i))).toEqual([
      { kind: 'core', core: core('c') },
      { kind: 'core', core: core('b') },
      { kind: 'core', core: core('a') },
      null,
    ]);
    expect(world.cursor.entry).toBeNull();
    send({ type: 'RemoveCore', from: { kind: 'cell', cell: 5 } }); // 空格：不動作
    expect(world.cursor.entry).toBeNull();
  });

  it('觸控：指定第幾顆取下，其餘熔核保留原本順序', () => {
    const { world, send } = farSetup();
    world.equipment.equip(item('weapon', 'normal', 12, { max: 3, cores: [core('a'), core('b'), core('c')] }));
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' }, index: 1 });
    expect(world.equipment.get('weapon')!.sockets!.cores.map((c) => c.uid)).toEqual(['a', 'c']);
    expect(world.inventory.get(0)).toEqual({ kind: 'core', core: core('b') });
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' }, index: 5 }); // 沒有這一顆：不動作
    expect(world.equipment.get('weapon')!.sockets!.cores.map((c) => c.uid)).toEqual(['a', 'c']);
  });

  it('背包滿了：取下的熔核拿在手上；手上也有東西時不取並提示背包已滿', () => {
    const { world, send, events } = farSetup();
    const failed: string[] = [];
    events.on('PickupFailed', (e) => failed.push(e.reason));
    world.equipment.equip(item('weapon', 'normal', 12, { max: 2, cores: [core('a'), core('b')] }));
    world.inventory.restore(world.inventory.cells.map((_, i) => ({ kind: 'core' as const, core: core(`fill${i}`) })));
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } });
    expect(world.cursor.entry).toEqual({ kind: 'core', core: core('b') });
    send({ type: 'RemoveCore', from: { kind: 'slot', slot: 'weapon' } });
    expect(failed).toEqual(['inventoryFull']);
    expect(world.equipment.get('weapon')!.sockets!.cores.map((c) => c.uid)).toEqual(['a']);
    expect(world.cursor.entry).toEqual({ kind: 'core', core: core('b') });
  });
});

describe('掉落時的孔數', () => {
  it('白 / 藍 / 黃依權重 0～2 孔；紫以上沒有孔；戒指等不可鑲嵌的部位沒有孔', () => {
    const gen = new ItemGenerator(data, new Rng(11), new Rng(12));
    const count = (rarity: ItemInstance['rarity'], slot: string) => {
      const n = [0, 0, 0];
      for (let i = 0; i < 2000; i++) n[gen.create(base(slot), rarity, 10).sockets?.max ?? 0]!++;
      return n.map((x) => x / 2000);
    };
    const white = count('normal', 'weapon');
    expect(white[0]).toBeGreaterThan(0.55);
    expect(white[0]).toBeLessThan(0.65);
    expect(white[2]).toBeGreaterThan(0.07);
    expect(white[2]).toBeLessThan(0.13);
    expect(count('rare', 'helmet')[0]).toBeGreaterThan(0.6);
    expect(count('epic', 'armor')).toEqual([1, 0, 0]);
    expect(count('magic', 'ring')).toEqual([1, 0, 0]);
    // 盾牌（2026-10-19）也會帶孔
    expect(count('normal', 'shield')[0]).toBeLessThan(0.65);
  });

  it('擲孔用獨立的序列：同一個種子，加上孔數後其他內容不變', () => {
    const a = new ItemGenerator(data, new Rng(3));
    const b = new ItemGenerator(data, new Rng(3), new Rng(99));
    for (let i = 0; i < 50; i++) {
      const x = a.generate(12, { normal: 30, magic: 30, rare: 20, epic: 10, legendary: 5, mythic: 5 });
      const { sockets: _, ...y } = b.generate(12, { normal: 30, magic: 30, rare: 20, epic: 10, legendary: 5, mythic: 5 });
      expect(y).toEqual(x);
    }
  });
});

describe('商人：鑿孔、鑲嵌、拆卸', () => {
  it('鑿孔：第 n 孔 金幣 30 × 物品等級 × n、防具精華 3n；不超過稀有度上限（橘 1 孔、紅不可）', () => {
    const { world, send, failures } = setup();
    world.wallet.gold = 10000;
    world.materials.add('armorEssence', 50);
    world.shop.ascendSlot = item('weapon', 'epic', 20);
    send({ type: 'ShopDrill' });
    expect(world.shop.ascendSlot.sockets).toEqual({ max: 1, cores: [] });
    expect(world.wallet.gold).toBe(10000 - 30 * 20 * 1);
    expect(world.materials.get('armorEssence')).toBe(50 - 3);
    send({ type: 'ShopDrill' });
    expect(world.shop.ascendSlot.sockets!.max).toBe(2);
    expect(world.wallet.gold).toBe(10000 - 600 - 30 * 20 * 2);
    send({ type: 'ShopDrill' }); // 紫最多 2 孔
    expect(failures.at(-1)).toBe('cannotDrill');
    world.shop.ascendSlot = item('weapon', 'mythic', 20);
    send({ type: 'ShopDrill' });
    expect(world.shop.ascendSlot.sockets).toBeUndefined();
    world.shop.ascendSlot = item('ring', 'magic', 20);
    send({ type: 'ShopDrill' });
    expect(failures.filter((f) => f === 'cannotDrill')).toHaveLength(3);
  });

  it('鑲好熔核的裝備可以飛昇：孔與熔核保留；飛昇的金幣與精華是 v0.5.0 前的 2 倍', () => {
    const { world, send } = setup();
    const t1 = data.items.all.find((b) => b.weaponType === 'sword' && b.tier === 1)!;
    const t2 = data.items.all.find((b) => b.weaponType === 'sword' && b.tier === 2)!;
    const sockets = { max: 2, cores: [core('keep')] };
    world.shop.ascendSlot = { uid: 'w', baseId: t1.id, rarity: 'epic', itemLevel: 10, affixes: [], sockets };
    const info = world.shop.ascendInfo(world.shop.ascendSlot);
    // (120 + 240 × 2) × 紫 4 = 2,400；武器精華 (10 + 6 × 2) × 紫 1.5 = 33
    expect(info.price).toBe(2400);
    expect(info.materials).toEqual({ weaponEssence: 33 });
    world.wallet.gold = 2400;
    world.materials.add('weaponEssence', 33);
    send({ type: 'ShopAscend' });
    expect(world.shop.ascendSlot.baseId).toBe(t2.id);
    expect(world.shop.ascendSlot.sockets).toEqual(sockets);
    expect(world.wallet.gold).toBe(0);
  });

  it('盾牌可以鑿孔（孔數上限照稀有度，付防具精華）', () => {
    const { world, send } = setup();
    world.wallet.gold = 10000;
    world.materials.add('armorEssence', 50);
    world.shop.ascendSlot = item('shield', 'rare', 10);
    expect(world.shop.socketInfo(world.shop.ascendSlot)).toMatchObject({ socketable: true, limit: 3 });
    send({ type: 'ShopDrill' });
    expect(world.shop.ascendSlot.sockets).toEqual({ max: 1, cores: [] });
    expect(world.materials.get('armorEssence')).toBe(50 - 3);
  });

  it('盾牌上的熔核用盾牌欄的主屬性（配劍穿上後生效）', () => {
    const { world } = setup();
    const sword = data.items.all.find((b) => b.weaponType === 'sword')!;
    world.equipment.equip({ uid: 'sw', baseId: sword.id, rarity: 'normal', itemLevel: 5, affixes: [] });
    world.equipment.equip(item('shield', 'epic', 12, { max: 1, cores: [] }));
    const before = world.player.stats.get('dodgeChance');
    const shieldCore = core('sh', { main: { ...EMPTY, shield: [{ lineId: 'core.sharp.dodge_shield', roll: 1 }] } });
    world.equipment.equip(item('shield', 'epic', 12, { max: 1, cores: [shieldCore] }));
    // 紫裝 ×1；銳核盾牌欄閃避 4% × 核色 1.2
    expect(world.player.stats.get('dodgeChance')).toBeCloseTo(before + 0.04 * 1.2);
    expect(world.equipment.socketedCores().map((c) => c.slot)).toEqual(['shield']);
  });

  it('鑲好熔核的裝備穿上後屬性生效', () => {
    const { world } = setup();
    world.equipment.equip(item('weapon', 'normal', 12, { max: 2, cores: [] }));
    const before = world.player.stats.get('critChance');
    world.equipment.equip(item('weapon', 'normal', 12, { max: 2, cores: [core('c1')] }));
    // 不看裝備稀有度（白裝也 ×1）；孔沒鑲滿，沒有同核加成
    expect(world.player.stats.get('critChance')).toBeCloseTo(before + 0.04 * 1.2);
    world.equipment.unequip('weapon');
    expect(world.player.stats.get('critChance')).toBeLessThan(before);
  });

  it('熔核不能賣；可以放進拆解區拆成武器精華（依核色）', () => {
    const { world, send, failures } = setup();
    world.inventory.restore(world.inventory.cells.map(() => null));
    world.inventory.addCore(core('c1'));
    expect(sellPrice(world.inventory.get(0)!, data)).toBe(0);
    send({ type: 'ShopSell', cell: 0 });
    expect(failures.at(-1)).toBe('cannotSell');
    expect(world.inventory.get(0)?.kind).toBe('core');
    world.cursor.set(world.inventory.take(0));
    world.salvage.click(0);
    expect(world.salvage.preview()).toEqual({ weaponEssence: data.balance.salvage.yields.epic });
    world.salvage.salvageAll();
    expect(world.materials.get('weaponEssence')).toBeGreaterThanOrEqual(data.balance.salvage.yields.epic[0]);
  });

  it('孔位、熔核（背包、裝備、拆解區）都會存檔', () => {
    const { world } = setup();
    world.inventory.restore(world.inventory.cells.map(() => null));
    world.inventory.addCore(core('bag', { types: ['arcane', 'sharp'], element: 'fire', brand: { legendaryId: 'legendary.star_burner', line: 3 } }));
    world.equipment.equip(item('helmet', 'magic', 8, { max: 2, cores: [core('worn')] }));
    world.cursor.set({ kind: 'core', core: core('salv') });
    world.salvage.click(1);
    const save = SaveMapper.capture(world, 'T');
    const commands = new CommandQueue<GameCommand>();
    const fresh = new GameWorld({ data, floor: 1, commands, events: new EventBus<GameEvents>(), seed: save.meta.runSeed });
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.inventory.get(0)).toEqual({ kind: 'core', core: core('bag', { types: ['arcane', 'sharp'], element: 'fire', brand: { legendaryId: 'legendary.star_burner', line: 3 } }) });
    expect(fresh.equipment.get('helmet')!.sockets).toEqual({ max: 2, cores: [core('worn')] });
    expect(fresh.salvage.slots[1]).toEqual({ kind: 'core', core: core('salv') });
    // 讀檔後熔核屬性照樣生效
    expect(fresh.player.stats.get('castSpeed')).toBeCloseTo(world.player.stats.get('castSpeed'));
  });
});
