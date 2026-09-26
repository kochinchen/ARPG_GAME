import { describe, expect, it } from 'vitest';
import { Inventory } from '../../../src/game/items/Inventory';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';

const item = (uid: string): ItemInstance => ({ uid, baseId: 'ring.plain', rarity: 'normal', itemLevel: 1, affixes: [] });
const POTION = 'potion.rejuvenation';
const make = (cols = 3, rows = 2) => new Inventory(cols, rows, () => 20);

describe('Inventory（格子背包）', () => {
  it('容量 = 寬 × 高，每格一件物品，滿了放不進去', () => {
    const inv = make(2, 1);
    expect(inv.capacity).toBe(2);
    expect(inv.addItem(item('a'))).toBe(true);
    expect(inv.addItem(item('b'))).toBe(true);
    expect(inv.addItem(item('c'))).toBe(false);
    expect(inv.isFull).toBe(true);
  });

  it('藥水每 20 瓶一疊，可以有很多疊；先補滿舊的疊再開新格', () => {
    const inv = make();
    expect(inv.addPotions(POTION, 15)).toBe(15);
    expect(inv.addPotions(POTION, 30)).toBe(30);
    expect(inv.cells.filter(Boolean).map((c) => (c?.kind === 'potion' ? c.count : 0))).toEqual([20, 20, 5]);
    expect(inv.potionCount(POTION)).toBe(45);
  });

  it('背包放不下的藥水不會放入，回傳實際放入數量', () => {
    const inv = make(2, 1);
    inv.addItem(item('a'));
    expect(inv.addPotions(POTION, 25)).toBe(20);
    expect(inv.potionCount(POTION)).toBe(20);
  });

  it('取用藥水從最少的那一疊拿，拿光後該格清空', () => {
    const inv = make();
    inv.addPotions(POTION, 21);
    expect(inv.takePotion(POTION)).toBe(true);
    expect(inv.get(1)).toBeNull();
    expect(inv.potionCount(POTION)).toBe(20);
    expect(make().takePotion(POTION)).toBe(false);
  });

  it('place：空格放下、有物品互換、同種藥水合併（放不下的留在手上）', () => {
    const inv = make();
    inv.addItem(item('a'));
    expect(inv.place(1, { kind: 'item', item: item('b') })).toBeNull();
    const swapped = inv.place(0, { kind: 'item', item: item('c') });
    expect(swapped).toEqual({ kind: 'item', item: item('a') });

    inv.addPotions(POTION, 15);
    const cell = inv.cells.findIndex((c) => c?.kind === 'potion');
    expect(inv.place(cell, { kind: 'potion', potionId: POTION, count: 8 })).toEqual({ kind: 'potion', potionId: POTION, count: 3 });
    expect(inv.get(cell)).toEqual({ kind: 'potion', potionId: POTION, count: 20 });
  });

  it('每次變動都增加 version', () => {
    const inv = make();
    const v0 = inv.version;
    inv.addItem(item('a'));
    inv.take(0);
    expect(inv.version).toBe(v0 + 2);
    inv.take(0);
    expect(inv.version).toBe(v0 + 2);
  });
});
