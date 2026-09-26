import { describe, expect, it, vi } from 'vitest';
import { vec2 } from '../../../src/core/math/Vec2';
import type { GameCommand } from '../../../src/game/Commands';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import { createWorld } from '../helpers';

const item = (uid: string, baseId: string, affixes: ItemInstance['affixes'] = []): ItemInstance => ({
  uid,
  baseId,
  rarity: affixes.length ? 'magic' : 'normal',
  itemLevel: 1,
  affixes,
});

function setup() {
  const ctx = createWorld();
  const send = (...commands: GameCommand[]) => {
    ctx.commands.push(...commands);
    ctx.world.update(1 / 60);
  };
  /** 放進背包並回傳所在格 */
  const give = (i: ItemInstance) => {
    ctx.world.inventory.addItem(i);
    return ctx.world.inventory.cells.findIndex((c) => c?.kind === 'item' && c.item.uid === i.uid);
  };
  return { ...ctx, send, give };
}

const heldUid = (entry: { kind: string; item?: ItemInstance } | null) => (entry?.kind === 'item' ? entry.item?.uid : undefined);

describe('背包 / 裝備操作（M5，Diablo 式拿起與放下）', () => {
  it('點背包物品只會拿起，不會穿上', () => {
    const { world, send, give } = setup();
    const cell = give(item('sword', 'weapon.short_sword'));
    send({ type: 'InventoryClick', cell });
    expect(heldUid(world.cursor.entry)).toBe('sword');
    expect(world.inventory.get(cell)).toBeNull();
    expect(world.equipment.get('weapon')).toBeUndefined();
  });

  it('拿著物品點裝備欄才穿上，屬性增加；點已裝備項目拿起，放回背包後屬性回到原值', () => {
    const { world, send, give } = setup();
    const stats = world.player.stats;
    const before = { min: stats.get('damageMin'), max: stats.get('damageMax'), hp: stats.get('maxHp') };
    const cell = give(item('sword', 'weapon.short_sword', [{ id: 'affix.vital', rolls: [10] }]));

    send({ type: 'InventoryClick', cell }, { type: 'EquipmentClick', slot: 'weapon' });
    expect(world.equipment.get('weapon')?.uid).toBe('sword');
    expect(world.cursor.entry).toBeNull();
    expect(stats.get('damageMin')).toBe(before.min + 2);
    expect(stats.get('damageMax')).toBe(before.max + 5);
    expect(stats.get('maxHp')).toBe(before.hp + 10);

    send({ type: 'EquipmentClick', slot: 'weapon' });
    expect(heldUid(world.cursor.entry)).toBe('sword');
    expect(stats.get('damageMin')).toBe(before.min);
    expect(stats.get('maxHp')).toBe(before.hp);

    send({ type: 'InventoryClick', cell: 5 });
    expect(world.cursor.entry).toBeNull();
    expect(heldUid(world.inventory.get(5))).toBe('sword');
  });

  it('回歸測試：來回穿脫多次，物品永遠只在一個地方（背包、裝備欄或手上）', () => {
    const { world, send, give } = setup();
    const cell = give(item('sword', 'weapon.short_sword'));
    const where = () =>
      [
        world.inventory.items.some((i) => i.uid === 'sword'),
        world.equipment.get('weapon')?.uid === 'sword',
        heldUid(world.cursor.entry) === 'sword',
      ].filter(Boolean).length;
    for (let i = 0; i < 5; i++) {
      send({ type: 'InventoryClick', cell });
      expect(where()).toBe(1);
      send({ type: 'EquipmentClick', slot: 'weapon' });
      expect(where()).toBe(1);
      send({ type: 'EquipmentClick', slot: 'weapon' });
      expect(where()).toBe(1);
      send({ type: 'InventoryClick', cell });
      expect(where()).toBe(1);
    }
  });

  it('穿到已有裝備的欄位時互換，舊裝備拿在手上', () => {
    const { world, send, give } = setup();
    const a = give(item('sword', 'weapon.short_sword'));
    const b = give(item('axe', 'weapon.hand_axe'));
    send({ type: 'InventoryClick', cell: a }, { type: 'EquipmentClick', slot: 'weapon' });
    send({ type: 'InventoryClick', cell: b }, { type: 'EquipmentClick', slot: 'weapon' });
    expect(world.equipment.get('weapon')?.uid).toBe('axe');
    expect(heldUid(world.cursor.entry)).toBe('sword');
  });

  it('放到有物品的背包格時互換', () => {
    const { world, send, give } = setup();
    const a = give(item('r1', 'ring.plain'));
    const b = give(item('r2', 'ring.plain'));
    send({ type: 'InventoryClick', cell: a }, { type: 'InventoryClick', cell: b });
    expect(heldUid(world.inventory.get(b))).toBe('r1');
    expect(heldUid(world.cursor.entry)).toBe('r2');
  });

  it('欄位不符時無法穿上，物品留在手上', () => {
    const { world, send, give, events } = setup();
    const onFailed = vi.fn();
    events.on('EquipFailed', onFailed);
    const cell = give(item('helm', 'helmet.cap'));
    send({ type: 'InventoryClick', cell }, { type: 'EquipmentClick', slot: 'weapon' });
    expect(world.equipment.get('weapon')).toBeUndefined();
    expect(heldUid(world.cursor.entry)).toBe('helm');
    expect(onFailed).toHaveBeenCalledWith({ slot: 'weapon' });
  });

  it('戒指可以放在戒指 1 或戒指 2', () => {
    const { world, send, give } = setup();
    const a = give(item('r1', 'ring.plain'));
    const b = give(item('r2', 'ring.plain'));
    send({ type: 'InventoryClick', cell: a }, { type: 'EquipmentClick', slot: 'ring2' });
    send({ type: 'InventoryClick', cell: b }, { type: 'EquipmentClick', slot: 'ring1' });
    expect(world.equipment.get('ring1')?.uid).toBe('r2');
    expect(world.equipment.get('ring2')?.uid).toBe('r1');
  });

  it('脫下增加 HP 上限的裝備時，目前 HP 不超過新上限', () => {
    const { world, send, give } = setup();
    const cell = give(item('amu', 'amulet.plain', [{ id: 'affix.vital', rolls: [15] }]));
    send({ type: 'InventoryClick', cell }, { type: 'EquipmentClick', slot: 'amulet' });
    world.player.hp = world.player.maxHp;
    send({ type: 'EquipmentClick', slot: 'amulet' });
    expect(world.player.hp).toBe(world.player.maxHp);
  });

  it('拿著物品點地面：丟在腳下，不會移動；丟下的藥水不會自動撿回', () => {
    const { world, send, give } = setup();
    const cell = give(item('sword', 'weapon.short_sword'));
    const potionCell = world.inventory.cells.findIndex((c) => c?.kind === 'potion');
    const start = world.player.position;

    send({ type: 'InventoryClick', cell }, { type: 'PrimaryAction', worldPos: vec2(10.5, 1.5), targetId: null, held: false });
    expect(world.cursor.entry).toBeNull();
    expect(world.player.isMoving).toBe(false);
    expect(world.groundItems.some((g) => g.content.kind === 'item' && g.content.item.uid === 'sword')).toBe(true);

    send({ type: 'InventoryClick', cell: potionCell }, { type: 'PrimaryAction', worldPos: vec2(10.5, 1.5), targetId: null, held: false });
    for (let i = 0; i < 30; i++) world.update(1 / 60);
    expect(world.player.position).toEqual(start);
    expect(world.potions.count).toBe(0);
    expect(world.groundItems.some((g) => g.content.kind === 'potion')).toBe(true);
  });

  it('itemsVersion 在背包、裝備、手上物品變動時增加', () => {
    const { world, send, give } = setup();
    const cell = give(item('sword', 'weapon.short_sword'));
    let v = world.itemsVersion;
    send({ type: 'InventoryClick', cell });
    expect(world.itemsVersion).toBeGreaterThan(v);
    v = world.itemsVersion;
    send({ type: 'EquipmentClick', slot: 'weapon' });
    expect(world.itemsVersion).toBeGreaterThan(v);
  });
});
