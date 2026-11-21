import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { CoreSlot } from '../../../src/data/schema/core';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import type { CoreInstance, CoreRoll } from '../../../src/game/items/CoreInstance';
import { infusionPointsOf, infusionRange, previewInfusion, resolveInfusion, staffSpellPower } from '../../../src/game/items/InfusionResolver';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import { itemStats } from '../../../src/game/items/ItemStats';
import { decodeSave, encodeSave } from '../../../src/save/Envelope';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { run } from '../helpers';

/** 武器灌注（設計者 2026-11-21）：劍 / 斧 / 弓＋法杖＋ 2～6 顆法杖純核 → 武器帶法術強度 */
const data = DataRegistry.load(gameData);
const balance = data.balance;
const EMPTY: Record<CoreSlot, CoreRoll[]> = { weapon: [], helmet: [], armor: [], gloves: [], boots: [], shield: [] };
let n = 0;
const pure = (tier: number, rarity: CoreInstance['rarity'] = 'normal', over: Partial<CoreInstance> = {}): CoreInstance => ({
  uid: `core-${n++}`,
  types: ['arcane'],
  tier,
  rarity,
  power: 1,
  itemLevel: 1,
  pure: true,
  main: EMPTY,
  secondary: [],
  ...over,
});
const weapon = (type: string, over: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: `${type}-${n++}`,
  baseId: data.items.all.filter((b) => b.weaponType === type).at(-1)!.id,
  rarity: 'epic',
  itemLevel: 35,
  quality: 2,
  affixes: [],
  ...over,
});
const range = (points: number) => infusionRange(points, balance).map((v) => Math.round(v * 1000) / 10);

describe('灌注點數與繼承率', () => {
  it('點數 = 核階（T1～T5 = 1～5）＋核色加分（白 0、藍 0.2、黃 0.4、紫 0.6、橘 0.8）', () => {
    expect([1, 2, 3, 4, 5].map((t) => infusionPointsOf(pure(t), balance))).toEqual([1, 2, 3, 4, 5]);
    expect((['normal', 'magic', 'rare', 'epic', 'legendary'] as const).map((r) => Math.round(infusionPointsOf(pure(5, r), balance) * 10) / 10)).toEqual([5, 5.2, 5.4, 5.6, 5.8]);
  });

  it('設計者的對照表：2 顆 T1 15～31%、2 顆 T5 35～55%、6 顆 T1 25～43%、3 顆 T5＋2 顆 T3 62.5～88%、5 顆 T5 72.5～100%、6 顆 T5 85～100%', () => {
    expect([2, 10, 6, 21, 25, 30].map(range)).toEqual([[15, 31], [35, 55], [25, 43], [62.5, 88], [72.5, 100], [85, 100]]);
    // 核色加分：6 顆 T5 紫核 33.6 點、橘核 34.8 點都是 90～100%，不超過上限
    expect([33.6, 34.8, 100].map(range)).toEqual([[90, 100], [90, 100], [90, 100]]);
  });

  it('投入越多、品質越高，繼承率的上下限都不會下降', () => {
    let prev = [0, 0];
    for (let p = 0; p <= 40; p += 0.2) {
      const r = infusionRange(p, balance);
      expect(r[0]).toBeGreaterThanOrEqual(prev[0]!);
      expect(r[1]).toBeGreaterThanOrEqual(prev[1]!);
      expect(r[0]).toBeLessThanOrEqual(r[1]);
      expect(r[1]).toBeLessThanOrEqual(1);
      prev = r;
    }
  });
});

describe('灌注預覽與結果', () => {
  it('法杖的法術強度含主倍率與法術強度詞綴，不算法杖上的熔核', () => {
    const staff = weapon('staff');
    const base = data.items.get(staff.baseId).baseStats.spellPower!;
    expect(staffSpellPower(staff, data)).toBe(Math.round(base * 3));
    const socketed = { ...staff, sockets: { max: 2, cores: [pure(5, 'legendary', { types: ['sharp'], pure: false })] } };
    expect(staffSpellPower(socketed, data)).toBe(Math.round(base * 3));
  });

  it('條件：劍 / 斧 / 弓、武器與法杖都先取下熔核、每次都要法杖、2～6 顆法杖純核', () => {
    const cores = [pure(5), pure(5)];
    const ok = previewInfusion(weapon('sword'), weapon('staff'), cores, data);
    expect(ok.problems).toEqual([]);
    expect(previewInfusion(weapon('axe'), weapon('staff'), cores, data).problems).toEqual([]);
    expect(previewInfusion(weapon('bow'), weapon('staff'), cores, data).problems).toEqual([]);
    const bad = (w: ItemInstance | null, s: ItemInstance | null, c: CoreInstance[]) => previewInfusion(w, s, c, data).problems.length;
    expect(bad(weapon('staff'), weapon('staff'), cores)).toBe(1);
    expect(bad(null, weapon('staff'), cores)).toBe(1);
    expect(bad(weapon('sword', { sockets: { max: 2, cores: [pure(1)] } }), weapon('staff'), cores)).toBe(1);
    expect(bad(weapon('sword'), weapon('staff', { sockets: { max: 1, cores: [pure(1)] } }), cores)).toBe(1);
    expect(bad(weapon('sword'), null, cores)).toBe(1);
    expect(bad(weapon('sword', { infusion: { spellPower: 50, rate: 0.5 } }), null, cores)).toBe(1);
    expect(bad(weapon('sword'), weapon('sword'), cores)).toBe(1);
    expect(bad(weapon('sword'), weapon('staff'), [pure(5)])).toBe(1);
    expect(bad(weapon('sword'), weapon('staff'), Array.from({ length: 7 }, () => pure(5)))).toBe(1);
    // 不是純核、混核、別種核都不行
    expect(bad(weapon('sword'), weapon('staff'), [pure(5), pure(5, 'normal', { pure: false })])).toBe(1);
    expect(bad(weapon('sword'), weapon('staff'), [pure(5), pure(5, 'normal', { types: ['sharp'] })])).toBe(1);
    expect(bad(weapon('sword'), weapon('staff'), [pure(5), pure(5, 'normal', { types: ['arcane', 'sharp'] })])).toBe(1);
    // 空孔不算鑲著熔核
    expect(bad(weapon('sword', { sockets: { max: 2, cores: [] } }), weapon('staff'), cores)).toBe(0);
  });

  it('灌注後武器的法術強度 = 法杖的法術強度 × 繼承率；傷害不變', () => {
    const sword = weapon('sword');
    const staff = weapon('staff');
    const pv = previewInfusion(sword, staff, Array.from({ length: 6 }, () => pure(5)), data);
    expect(pv.points).toBe(30);
    const low = resolveInfusion(pv, 0);
    const high = resolveInfusion(pv, 1);
    expect([low.rate, high.rate]).toEqual([0.85, 1]);
    const sp = staffSpellPower(staff, data);
    expect(pv.gain).toEqual([Math.round(sp * 0.85), sp]);
    const before = itemStats(sword, data).baseStats;
    const after = itemStats({ ...sword, infusion: { spellPower: high.spellPower, rate: high.rate } }, data).baseStats;
    expect(after.spellPower).toBe(sp);
    expect([after.damageMin, after.damageMax]).toEqual([before.damageMin, before.damageMax]);
    // 灌注後鑲熔核：武器傷害照常被熔核放大，灌注的法術強度不變
    const cored = itemStats({ ...sword, infusion: { spellPower: sp, rate: 1 }, sockets: { max: 1, cores: [pure(5, 'epic', { types: ['sharp'], pure: false })] } }, data).baseStats;
    expect(cored.spellPower).toBe(sp);
    expect(cored.damageMax!).toBeGreaterThan(before.damageMax!);
  });

  it('重新灌注：一定要放一把新的法杖；繼承率與法術強度來源各自取較高的，不會變差', () => {
    const sword = weapon('sword', { infusion: { spellPower: 100, rate: 0.6 } });
    const worse = weapon('staff', { baseId: data.items.all.find((b) => b.weaponType === 'staff')!.id, quality: 0 });
    const better = weapon('staff');
    // 沒放法杖：不能灌注
    expect(previewInfusion(sword, null, [pure(5), pure(5)], data).problems).toEqual(['重新灌注也要放一把新的法杖']);
    const weak = previewInfusion(sword, worse, [pure(1), pure(1)], data);
    expect(weak.problems).toEqual([]);
    expect(resolveInfusion(weak, 1)).toMatchObject({ spellPower: 100, rate: 0.6 });
    expect(weak.gain).toEqual([60, 60]);
    const strong = previewInfusion(sword, worse, Array.from({ length: 6 }, () => pure(5)), data);
    expect(resolveInfusion(strong, 0)).toMatchObject({ spellPower: 100, rate: 0.85 });
    // 新法杖比原本強就換來源，比原本弱就不變
    expect(previewInfusion(sword, better, [pure(1), pure(1)], data).sourcePower).toBe(staffSpellPower(better, data));
    expect(staffSpellPower(worse, data)).toBeLessThan(100);
    expect(previewInfusion(sword, worse, [pure(1), pure(1)], data).sourcePower).toBe(100);
  });
});

describe('商人的灌注格', () => {
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
    const place = (zone: 'weapon' | 'staff' | 'cores', index: number, entry: { kind: 'item'; item: ItemInstance } | { kind: 'core'; core: CoreInstance }) => {
      world.cursor.set(entry);
      send({ type: 'ShopInfusionSlotClick', zone, index });
    };
    return { world, send, failures, events, place };
  }

  it('放進格子有限制；灌注後法杖與純核消失、武器留在格子裡帶著法術強度；關面板時全部放回背包', () => {
    const { world, send, failures, events, place } = setup();
    world.inventory.restore(world.inventory.cells.map(() => null));
    const sword = weapon('sword');
    const staff = weapon('staff');
    // 放錯東西：法杖不能放武器格、劍不能放法杖格、非純核不能放純核格
    place('weapon', 0, { kind: 'item', item: staff });
    place('staff', 0, { kind: 'item', item: sword });
    place('cores', 0, { kind: 'core', core: pure(5, 'normal', { pure: false }) });
    expect(failures).toEqual(['cannotInfuse', 'cannotInfuse', 'cannotInfuse']);
    expect(world.shop.infusionWeapon).toBeNull();
    world.cursor.set(null);

    place('weapon', 0, { kind: 'item', item: sword });
    place('staff', 0, { kind: 'item', item: staff });
    send({ type: 'ShopInfuse' }); // 還沒放純核
    expect(failures.at(-1)).toBe('cannotInfuse');
    expect(world.shop.infusionStaff).not.toBeNull();
    for (let i = 0; i < 6; i++) place('cores', i, { kind: 'core', core: pure(5) });
    const done: GameEvents['WeaponInfused'][] = [];
    events.on('WeaponInfused', (e) => done.push(e));
    send({ type: 'ShopInfuse' });
    expect(done).toHaveLength(1);
    expect(done[0]!.improved).toBe(true);
    expect(done[0]!.rate).toBeGreaterThanOrEqual(0.85);
    expect(done[0]!.rate).toBeLessThanOrEqual(1);
    expect(world.shop.infusionStaff).toBeNull();
    expect(world.shop.infusionCores.every((c) => c === null)).toBe(true);
    const infused = world.shop.infusionWeapon!;
    expect(infused.infusion).toEqual({ spellPower: staffSpellPower(staff, data), rate: done[0]!.rate });

    // 重新灌注：只放純核不行，一定要再放一把法杖
    place('cores', 0, { kind: 'core', core: pure(1) });
    place('cores', 1, { kind: 'core', core: pure(1) });
    send({ type: 'ShopInfuse' });
    expect(failures.at(-1)).toBe('cannotInfuse');
    expect(done).toHaveLength(1);
    // 放一把一樣的法杖＋兩顆 T1 純核：擲到的一定比較低，數值保留、法杖與純核照樣消耗
    place('staff', 0, { kind: 'item', item: weapon('staff') });
    send({ type: 'ShopInfuse' });
    expect(done[1]).toMatchObject({ improved: false, rate: done[0]!.rate });
    expect(world.shop.infusionStaff).toBeNull();
    expect(world.shop.infusionWeapon!.infusion).toEqual(infused.infusion);
    expect(world.shop.infusionCores.every((c) => c === null)).toBe(true);

    // 存檔來回：灌注格與武器上的灌注都保留
    place('cores', 2, { kind: 'core', core: pure(3, 'epic') });
    const decoded = decodeSave(encodeSave(SaveMapper.capture(world, new Date(0).toISOString()), new Date(0)));
    if (!decoded.ok) throw new Error(decoded.message);
    expect(decoded.data.infusion?.weapon?.infusion).toEqual(infused.infusion);
    expect(decoded.data.infusion?.cores[2]?.tier).toBe(3);

    // 關面板：武器與還沒用掉的純核回背包
    send({ type: 'ShopClosed' });
    expect(world.shop.infusionWeapon).toBeNull();
    expect(world.inventory.cells.some((e) => e?.kind === 'item' && e.item.uid === sword.uid && e.item.infusion !== undefined)).toBe(true);
    expect(world.inventory.cells.filter((e) => e?.kind === 'core')).toHaveLength(1);

    // 穿上後角色真的多了法術強度
    const before = world.player.stats.get('spellPower');
    world.equipment.equipTo('weapon', { ...infused });
    run(world, 1 / 60);
    expect(world.player.stats.get('spellPower') - before).toBeCloseTo(Math.round(infused.infusion!.spellPower * infused.infusion!.rate), 0);
  });
});
