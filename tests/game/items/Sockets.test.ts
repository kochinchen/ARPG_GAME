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

/** 孔位與商人的鑿孔 / 鑲嵌 / 拆卸（v0.5.0 P4） */
const data = DataRegistry.load(gameData);
const base = (slot: string) => data.items.all.find((b) => b.slot === slot)!;

const EMPTY: Record<CoreSlot, CoreRoll[]> = { weapon: [], helmet: [], armor: [], gloves: [], boots: [] };
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
  return { world, send, failures };
}
const item = (slot: string, rarity: ItemInstance['rarity'], itemLevel = 10, sockets?: ItemInstance['sockets']): ItemInstance => ({
  uid: `${slot}-${rarity}`,
  baseId: base(slot).id,
  rarity,
  itemLevel,
  affixes: [],
  ...(sockets ? { sockets } : {}),
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

  it('鑲嵌：背包的熔核放進空孔（金幣 10 × 物品等級）；沒有空孔時失敗；拆卸：熔核毀掉、孔保留', () => {
    const { world, send, failures } = setup();
    world.wallet.gold = 1000;
    world.shop.ascendSlot = item('weapon', 'normal', 12, { max: 1, cores: [] });
    world.inventory.restore(world.inventory.cells.map(() => null));
    world.inventory.addCore(core('c1'));
    world.inventory.addCore(core('c2'));
    send({ type: 'ShopInsertCore', cell: 0 });
    expect(world.shop.ascendSlot.sockets!.cores.map((c) => c.uid)).toEqual(['c1']);
    expect(world.wallet.gold).toBe(1000 - 120);
    expect(world.inventory.get(0)).toBeNull();
    send({ type: 'ShopInsertCore', cell: 1 });
    expect(failures.at(-1)).toBe('cannotInsert');
    expect(world.inventory.get(1)?.kind).toBe('core');
    send({ type: 'ShopRemoveCore', index: 0 });
    expect(world.shop.ascendSlot.sockets).toEqual({ max: 1, cores: [] });
    expect(world.wallet.gold).toBe(1000 - 120 - 240);
  });

  it('鑲好熔核的裝備穿上後屬性生效', () => {
    const { world } = setup();
    world.equipment.equip(item('weapon', 'normal', 12, { max: 1, cores: [] }));
    const before = world.player.stats.get('critChance');
    world.equipment.equip(item('weapon', 'normal', 12, { max: 1, cores: [core('c1')] }));
    // 白裝：熔核數值 ×0.5
    expect(world.player.stats.get('critChance')).toBeCloseTo(before + 0.04 * 1.2 * 0.5);
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
