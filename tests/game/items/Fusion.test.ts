import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { Rarity, WeaponType } from '../../../src/data/schema/item';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

/** 融合流程（v0.5.0 P5）：商人的 4 合成格＋2 飾品格、扣費、消耗投入、產出熔核 */
const data = DataRegistry.load(gameData);
const baseOf = (w: WeaponType) => data.items.all.find((b) => b.weaponType === w)!.id;
const baseOfSlot = (slot: string) => data.items.all.find((b) => b.slot === slot)!.id;

let n = 0;
const weapon = (w: WeaponType, rarity: Rarity, itemLevel: number, extra: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: `t${n++}`,
  baseId: baseOf(w),
  rarity,
  itemLevel,
  affixes: [],
  ...extra,
});

function setup(seed = 5) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor: 2, commands, events, seed });
  const merchant = world.merchants[world.merchants.length - 1]!;
  world.player.position = { ...merchant.position, x: merchant.position.x + 0.8 };
  world.player.prevPosition = world.player.position;
  world.inventory.restore(world.inventory.cells.map(() => null));
  const failures: string[] = [];
  const fused: GameEvents['CoreFused'][] = [];
  events.on('ShopFailed', (e) => failures.push(e.reason));
  events.on('CoreFused', (e) => fused.push(e));
  const send = (c: GameCommand) => {
    commands.push(c);
    run(world, 1 / 60);
  };
  /** 拿著物品點融合格 */
  const place = (zone: 'inputs' | 'jewelry', index: number, item: ItemInstance) => {
    world.cursor.set({ kind: 'item', item });
    send({ type: 'ShopFusionSlotClick', zone, index });
  };
  return { world, events, send, place, failures, fused };
}

const example3 = () => [weapon('axe', 'legendary', 18, { legendaryId: 'legendary.mountain_splitter' }), weapon('axe', 'rare', 17), weapon('axe', 'magic', 19)];

describe('融合流程', () => {
  it('範例 #3：投入裂山與兩把斧 → 二次確認後融合，扣 735 金幣 / 16 武器精華，得到重核 T2 紫', () => {
    const { world, send, place, failures, fused } = setup();
    world.wallet.gold = 2000;
    world.materials.add('weaponEssence', 40);
    example3().forEach((item, i) => place('inputs', i, item));
    expect(world.shop.fusionInputs.filter(Boolean)).toHaveLength(3);
    expect(world.shop.fusionPreview()).toMatchObject({ types: ['heavy'], tier: 2, rarity: 'epic' });

    send({ type: 'ShopFuse', confirm: false });
    expect(failures.at(-1)).toBe('needsConfirm');
    expect(world.wallet.gold).toBe(2000);

    send({ type: 'ShopFuse', confirm: true });
    expect(world.wallet.gold).toBe(2000 - 735);
    expect(world.materials.get('weaponEssence')).toBe(40 - 16);
    expect(world.shop.fusionInputs.every((s) => s === null)).toBe(true);
    const entry = world.inventory.cells.find((c) => c?.kind === 'core');
    expect(entry?.kind === 'core' && entry.core).toMatchObject({ types: ['heavy'], tier: 2, rarity: 'epic' });
    expect(fused).toHaveLength(1);
    expect(fused[0]).toMatchObject({ rarity: 'epic', tier: 2 });
  });

  it('合成區只能放武器、飾品區只能放非白的戒指 / 護身符（放錯時留在手上）', () => {
    const { world, place, failures } = setup();
    const armor: ItemInstance = { uid: 'a1', baseId: baseOfSlot('armor'), rarity: 'magic', itemLevel: 5, affixes: [] };
    place('inputs', 0, armor);
    expect(failures.at(-1)).toBe('cannotFuse');
    expect(world.shop.fusionInputs[0]).toBeNull();
    expect(world.cursor.entry).toMatchObject({ kind: 'item', item: { uid: 'a1' } });
    const whiteRing: ItemInstance = { uid: 'r0', baseId: baseOfSlot('ring'), rarity: 'normal', itemLevel: 5, affixes: [] };
    place('jewelry', 0, whiteRing);
    expect(world.shop.fusionJewelry[0]).toBeNull();
    const amulet: ItemInstance = { uid: 'm1', baseId: baseOfSlot('amulet'), rarity: 'rare', itemLevel: 5, affixes: [] };
    place('jewelry', 1, amulet);
    expect(world.shop.fusionJewelry[1]?.uid).toBe('m1');
  });

  it('飾品區的戒指提高印記機率，融合後一起消失', () => {
    const { world, send, place } = setup();
    world.wallet.gold = 5000;
    world.materials.add('weaponEssence', 100);
    example3().forEach((item, i) => place('inputs', i, item));
    place('jewelry', 0, { uid: 'ring1', baseId: baseOfSlot('ring'), rarity: 'rare', itemLevel: 10, affixes: [] });
    expect(world.shop.fusionPreview().brand.chance).toBeCloseTo(0.45);
    send({ type: 'ShopFuse', confirm: true });
    expect(world.shop.fusionJewelry.every((s) => s === null)).toBe(true);
    expect(world.inventory.items.some((i) => i.uid === 'ring1')).toBe(false);
  });

  it('材料或數量不足時不能融合，什麼都不消耗', () => {
    const { world, send, place, failures } = setup();
    world.wallet.gold = 5000;
    place('inputs', 0, weapon('sword', 'normal', 5));
    send({ type: 'ShopFuse', confirm: false });
    expect(failures.at(-1)).toBe('cannotFuse');
    place('inputs', 1, weapon('sword', 'normal', 5));
    send({ type: 'ShopFuse', confirm: false });
    expect(failures.at(-1)).toBe('materials');
    expect(world.wallet.gold).toBe(5000);
    expect(world.shop.fusionInputs.filter(Boolean)).toHaveLength(2);
  });

  it('關閉商人面板時，融合格裡的物品放回背包', () => {
    const { world, send, place } = setup();
    const items = [weapon('bow', 'magic', 8), weapon('bow', 'rare', 9)];
    items.forEach((item, i) => place('inputs', i, item));
    place('jewelry', 0, { uid: 'ring2', baseId: baseOfSlot('ring'), rarity: 'epic', itemLevel: 10, affixes: [] });
    send({ type: 'ShopClosed' });
    expect(world.shop.fusionInputs.every((s) => s === null)).toBe(true);
    expect(world.inventory.items.map((i) => i.uid).sort()).toEqual([...items.map((i) => i.uid), 'ring2'].sort());
  });

  it('融合格會存檔；熔核的 uid 不與讀檔後的新物品重複', () => {
    const { world, send, place } = setup();
    world.wallet.gold = 5000;
    world.materials.add('weaponEssence', 100);
    [weapon('staff', 'normal', 5), weapon('staff', 'magic', 6)].forEach((item, i) => place('inputs', i, item));
    send({ type: 'ShopFuse', confirm: false });
    place('inputs', 2, weapon('sword', 'rare', 7, { uid: 'keep' }));
    const save = SaveMapper.capture(world, 'T');
    const fresh = setup(save.meta.runSeed).world;
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.shop.fusionInputs[2]?.uid).toBe('keep');
    const coreUid = fresh.inventory.cells.find((c) => c?.kind === 'core')!;
    expect(coreUid.kind === 'core' && coreUid.core.uid).toBeTruthy();
    const next = fresh.itemGenerator.newUid();
    expect(coreUid.kind === 'core' && coreUid.core.uid).not.toBe(next);
  });
});
