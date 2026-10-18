import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { DamagePipeline } from '../../../src/game/combat/DamagePipeline';
import { StatusEffectSystem } from '../../../src/game/combat/StatusEffectSystem';
import type { GameEvents } from '../../../src/game/GameEvents';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { migrate } from '../../../src/save/migrations';
import { repairSave } from '../../../src/save/SaveRepair';
import { CommandQueue } from '../../../src/core/CommandQueue';
import type { GameCommand } from '../../../src/game/Commands';
import { GameWorld } from '../../../src/game/GameWorld';
import { createWorld, makeActor, run } from '../helpers';

/** 盾牌：格擋、只能搭配劍 / 斧、橘紅效果、存檔 */
const data = DataRegistry.load(gameData);
/** 樓層模式（存檔需要樓層） */
const floorWorld = (seed = 3) => new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
const item = (baseId: string, uid = baseId): ItemInstance => ({ uid, baseId, rarity: 'normal', itemLevel: 1, affixes: [] });

describe('格擋', () => {
  it('格擋率上限 50%；格擋時傷害 -60%、發出事件；持續傷害與荊棘不能格擋', () => {
    const events = new EventBus<GameEvents>();
    const pipeline = new DamagePipeline(data.balance, new Rng(3), events, new StatusEffectSystem(events, data.balance.combat.maxControlResist));
    const blocked: number[] = [];
    events.on('AttackBlocked', (e) => blocked.push(e.prevented));
    const target = makeActor({ faction: 'enemy', stats: { maxHp: 1e6, blockChance: 0.9 } });
    target.hp = 1e6;
    const amounts: number[] = [];
    for (let i = 0; i < 400; i++) amounts.push(pipeline.apply({ source: null, target, min: 100, max: 100, element: 'physical' })!.amount);
    const rate = amounts.filter((a) => a === 40).length / amounts.length;
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(0.6);
    expect(amounts.every((a) => a === 40 || a === 100)).toBe(true);
    expect(blocked.every((p) => p === 60)).toBe(true);
    const before = blocked.length;
    for (let i = 0; i < 50; i++) pipeline.apply({ source: null, target, min: 100, max: 100, element: 'fire', isDot: true });
    expect(blocked.length).toBe(before);
  });
});

describe('盾牌的裝備規則', () => {
  it('8 階盾牌：有防禦與格擋率；只能搭配劍、斧', () => {
    const shields = data.items.all.filter((b) => b.slot === 'shield');
    expect(shields).toHaveLength(8);
    for (const s of shields) expect(s.baseStats.blockChance! > 0 && s.baseStats.defense! > 0).toBe(true);
    const { world } = createWorld();
    const shield = item('shield.wood');
    expect(world.equipment.canEquip(shield, 'shield')).toBe(false); // 空手
    world.equipment.equip(item('weapon.short_sword'));
    expect(world.equipment.canEquip(shield, 'shield')).toBe(true);
    world.equipment.equip(shield);
    expect(world.player.stats.get('blockChance')).toBeCloseTo(0.08);
  });

  it('換上弓：盾牌自動放回背包', () => {
    const { world, commands } = createWorld();
    world.equipment.equip(item('weapon.short_sword'));
    world.equipment.equip(item('shield.wood'));
    world.cursor.set({ kind: 'item', item: item('weapon.short_bow') });
    commands.push({ type: 'EquipmentClick', slot: 'weapon' });
    run(world, 1 / 60);
    expect(world.equipment.get('weapon')?.baseId).toBe('weapon.short_bow');
    expect(world.equipment.get('shield')).toBeUndefined();
    expect(world.inventory.cells.some((c) => c?.kind === 'item' && c.item.baseId === 'shield.wood')).toBe(true);
    // 拿弓時不能裝盾
    world.cursor.set({ kind: 'item', item: item('shield.iron', 's2') });
    const failed: string[] = [];
    world.events.on('EquipFailed', (e) => failed.push(e.reason));
    commands.push({ type: 'EquipmentClick', slot: 'shield' });
    run(world, 1 / 60);
    expect(failed).toEqual(['shield']);
  });

  it('橘紅盾牌：不落城牆 → 格擋時疊「堅守」', () => {
    const { world } = createWorld();
    world.equipment.equip(item('weapon.short_sword'));
    world.equipment.equip(world.itemGenerator.createLegendary(data.legendaries.get('legendary.bastion'), 5));
    world.itemEffects.update(0);
    world.events.emit('AttackBlocked', { targetId: world.player.id, sourceId: null, prevented: 10, position: world.player.position });
    expect(world.itemEffects.activeBuffs).toEqual([expect.objectContaining({ id: 'bastion', stacks: 1 })]);
  });

  it('存檔：盾牌欄位與重鑄次數；v11 存檔可以讀', () => {
    const world = floorWorld();
    world.equipment.equip(item('weapon.short_sword'));
    world.equipment.equip({ ...item('shield.wood'), rerolls: 2 });
    const save = SaveMapper.capture(world, 'T');
    expect(save.equipment.shield).toMatchObject({ baseId: 'shield.wood', rerolls: 2 });
    const fresh = floorWorld(save.meta.runSeed);
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.equipment.get('shield')?.rerolls).toBe(2);
    expect(migrate({ equipment: {} }, 11)).toMatchObject({ equipment: {} });
  });

  it('讀檔修復：拿弓卻裝著盾牌 → 盾牌放回背包', () => {
    const world = floorWorld();
    world.equipment.equip(item('weapon.short_sword'));
    world.equipment.equip(item('shield.wood'));
    const save = SaveMapper.capture(world, 'T');
    save.equipment.weapon = item('weapon.short_bow');
    const repaired = repairSave(save, data);
    expect(repaired.data.equipment.shield).toBeUndefined();
    expect(repaired.data.inventory.cells.some((c) => c?.kind === 'item' && c.item.baseId === 'shield.wood')).toBe(true);
  });
});
