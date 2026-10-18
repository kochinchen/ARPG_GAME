import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../../src/game/items/ItemInstance';
import { buildInventoryView, comparisonFor, itemEntryView } from '../../src/ui/bridge/InventoryView';
import { createWorld } from '../game/helpers';

const item = (uid: string, baseId: string): ItemInstance => ({ uid, baseId, rarity: 'normal', itemLevel: 1, affixes: [] });

describe('背包快照與裝備比較（UI bridge）', () => {
  it('背包物品對應的欄位已有裝備時，列出目前裝備供比較', () => {
    const { world, data } = createWorld();
    world.equipment.equip(item('old-sword', 'weapon.short_sword'));
    world.inventory.addItem(item('new-axe', 'weapon.hand_axe'));
    world.inventory.addItem(item('helm', 'helmet.cap'));
    const view = buildInventoryView(world, data);

    const axe = view.cells.find((c) => c?.name === '手斧')!;
    expect(comparisonFor(view, axe).map((e) => e.name)).toEqual(['短劍']);
    const helm = view.cells.find((c) => c?.name === '皮帽')!;
    expect(comparisonFor(view, helm)).toEqual([]);
  });

  it('戒指與兩個已裝備的戒指比較', () => {
    const { world, data } = createWorld();
    world.equipment.equipTo('ring1', item('r1', 'ring.plain'));
    world.equipment.equipTo('ring2', item('r2', 'ring.plain'));
    world.inventory.addItem(item('r3', 'ring.plain'));
    const view = buildInventoryView(world, data);
    const ring = view.cells.find((c) => c?.kind === 'item')!;
    expect(comparisonFor(view, ring)).toHaveLength(2);
  });

  it('藥水沒有比較對象；快照包含 10 × 8 格與手上的物品', () => {
    const { world, data } = createWorld();
    const view = buildInventoryView(world, data);
    expect(view.cells).toHaveLength(80);
    expect([view.cols, view.rows]).toEqual([10, 8]);
    const potion = view.cells.find((c) => c?.kind === 'potion')!;
    expect(comparisonFor(view, potion)).toEqual([]);
    expect(view.held).toBeNull();
  });
});

describe('resolveHover', () => {
  it('依位置解析：快照改變後同一個位置顯示新內容', async () => {
    const { resolveHover } = await import('../../src/ui/bridge/InventoryView');
    const { world, data } = createWorld();
    world.inventory.addItem(item('boots', 'boots.leather'));
    const cell = world.inventory.cells.findIndex((c) => c?.kind === 'item');
    expect(resolveHover(buildInventoryView(world, data), { kind: 'slot', slot: 'boots' })).toBeNull();

    world.equipment.equip(world.inventory.removeItem('boots')!);
    const after = buildInventoryView(world, data);
    expect(resolveHover(after, { kind: 'slot', slot: 'boots' })?.entry.name).toBe('皮靴');
    expect(resolveHover(after, { kind: 'cell', cell })).toBeNull();
  });
});

describe('武器說明：可用技能（v0.4.0 武器允許矩陣）', () => {
  it('劍＝近戰、魔法、戰術；弓＝遠程、魔法、戰術；法杖＝魔法、戰術；防具沒有這一行', () => {
    const { data } = createWorld();
    const entry = (weaponType: string | null, slot = 'weapon') => {
      const base = data.items.all.find((b) => b.slot === slot && (weaponType === null || b.weaponType === weaponType))!;
      return itemEntryView({ uid: base.id, baseId: base.id, rarity: 'normal', itemLevel: 1, affixes: [] }, data);
    };
    expect(entry('sword').skillsLine).toBe('可用技能：近戰、魔法、戰術');
    expect(entry('bow').skillsLine).toBe('可用技能：遠程、魔法、戰術');
    expect(entry('staff').skillsLine).toBe('可用技能：魔法、戰術');
    expect(entry(null, 'armor').skillsLine).toBeUndefined();
  });
});
