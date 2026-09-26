import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/CommandQueue';
import { EventBus } from '../../src/core/EventBus';
import { distance, vec2 } from '../../src/core/math/Vec2';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { GameCommand } from '../../src/game/Commands';
import type { GameEvents } from '../../src/game/GameEvents';
import { GameWorld } from '../../src/game/GameWorld';
import { decodeSave, encodeSave } from '../../src/save/Envelope';
import { SaveMapper } from '../../src/save/SaveMapper';
import { repairSave } from '../../src/save/SaveRepair';
import type { SaveData } from '../../src/save/schema';
import { run } from '../game/helpers';

const data = DataRegistry.load(gameData);
const CREATED = '2026-01-01T00:00:00.000Z';

function newWorld(seed = 11, floor = 1) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  return { world: new GameWorld({ data, floor, commands, events, seed }), commands, events };
}

/** 存 → 編碼 → 解碼 → 修復 → 還原到新的 GameWorld（等同重新整理頁面） */
function reload(world: GameWorld) {
  const save = SaveMapper.capture(world, CREATED);
  const decoded = decodeSave(encodeSave(save, new Date()));
  if (!decoded.ok) throw new Error(decoded.message);
  const repaired = repairSave(decoded.data, data);
  const fresh = newWorld(save.meta.runSeed);
  const notes = SaveMapper.restore(fresh.world, repaired);
  return { ...fresh, save, repaired, notes };
}

const enemies = (world: GameWorld) => world.actors.filter((a) => a.faction === 'enemy');

function interact(world: GameWorld, commands: CommandQueue<GameCommand>, target: { id: number; position: { x: number; y: number } }) {
  world.player.position = vec2(target.position.x - 0.5, target.position.y);
  commands.push({ type: 'PrimaryAction', worldPos: vec2(target.position.x, target.position.y), targetId: null, interactId: target.id, held: false });
  run(world, 0.5);
}

/** 做出一個有進度的角色：升級、學技能、裝備、背包、Codex、樓層進度 */
function progressedWorld() {
  const { world, commands } = newWorld(11, 1);
  for (let i = 0; i < 7; i++) world.experience.grantLevel();
  world.experience.addXp(10);
  world.attributes.allocate('vitality', 6);
  world.attributes.allocate('crit', 4);
  const learnable = data.skills.all.filter((s) => s.tree && s.tree.tier === 1 && s.kind === 'active');
  for (const skill of learnable.slice(0, 3)) world.skillTree.learn(skill.id);
  const passive = data.skills.all.find((s) => s.tree && s.tree.tier === 1 && s.kind === 'passive')!;
  world.skillTree.learn(passive.id);
  commands.push({ type: 'SetSupportSlot', slot: 1, skillId: passive.id });
  commands.push({ type: 'SetComboSlot', combo: 2, step: 0, skillId: learnable[0]!.id });
  commands.push({ type: 'SetComboSlot', combo: 2, step: 1, skillId: learnable[1]!.id });
  commands.push({ type: 'SelectRightSlot', slot: 2 });
  run(world, 1 / 60);

  const weapon = data.items.all.find((b) => b.slot === 'weapon' && b.levelReq <= 1)!;
  const ring = data.items.all.find((b) => b.slot === 'ring')!;
  world.equipment.equipTo('weapon', world.itemGenerator.create(weapon, 'rare', 5));
  world.equipment.equipTo('ring2', world.itemGenerator.create(ring, 'magic', 3));
  world.inventory.place(17, { kind: 'item', item: world.itemGenerator.create(weapon, 'magic', 2) });
  world.inventory.addPotions(data.balance.player.potionId, 25);
  world.cursor.set({ kind: 'item', item: world.itemGenerator.create(ring, 'normal', 1) });
  world.wallet.add(321);

  // 找一組會觸發 Combo 的連段寫進 Codex
  const actives = data.skills.all.filter((s) => s.tree && s.kind === 'active').map((s) => s.id);
  outer: for (const a of actives)
    for (const b of actives)
      for (const c of actives) {
        const r = world.comboResolver.resolve([a, b, c], () => 1);
        if (r.status !== 'combo') continue;
        world.events.emit('ComboCompleted', { comboId: r.comboId, ruleId: r.rule.id, name: r.displayName, skills: [a, b, c], description: r.description });
        world.events.emit('ComboCompleted', { comboId: r.comboId, ruleId: r.rule.id, name: r.displayName, skills: [a, b, c], description: r.description });
        break outer;
      }
  return { world, commands };
}

describe('SaveMapper：Round-trip', () => {
  it('存 → 讀 → 再存，兩次內容完全相同', () => {
    const { world } = progressedWorld();
    const { world: loaded, save, notes } = reload(world);
    expect(notes).toEqual([]);
    expect(SaveMapper.capture(loaded, CREATED)).toEqual(save);
  });

  it('修復對正常存檔不做任何改動', () => {
    const { world } = progressedWorld();
    const save = SaveMapper.capture(world, CREATED);
    const repaired = repairSave(save, data);
    expect(repaired.notes).toEqual([]);
    expect(repaired.overflow).toEqual([]);
    expect(repaired.data).toEqual(save);
  });

  it('還原後的最終屬性、Mastery、連段格數與存檔前相同（裝備 / 等級 / Support 都重新套用）', () => {
    const { world } = progressedWorld();
    const { world: loaded } = reload(world);
    for (const stat of ['maxHp', 'maxMana', 'damageMin', 'damageMax', 'defense', 'critChance', 'spellPower'] as const) {
      expect(loaded.player.stats.get(stat)).toBeCloseTo(world.player.stats.get(stat));
    }
    expect(loaded.skillTree.mastery).toBe(world.skillTree.mastery);
    expect(loaded.comboSlotsUnlocked).toBe(world.comboSlotsUnlocked);
    expect(loaded.potions.count).toBe(world.potions.count);
  });

  it('T4 開通次數與已開通類別正確還原', () => {
    const { world } = newWorld();
    world.progress.t4Charges = 2;
    world.progress.t4Unlocked.add('ranged');
    const { world: loaded } = reload(world);
    expect(loaded.progress.t4Charges).toBe(2);
    expect([...loaded.progress.t4Unlocked]).toEqual(['ranged']);
  });

  it('Codex：順序與使用次數還原；之後新發現的排在最後', () => {
    const { world } = progressedWorld();
    expect(world.codex.all).toHaveLength(1);
    const { world: loaded } = reload(world);
    expect(loaded.codex.all).toEqual(world.codex.all);
    expect(loaded.codex.all[0]!.timesUsed).toBe(2);
    expect(loaded.codex.nextOrder).toBe(world.codex.nextOrder);
  });

  it('讀檔後產生的新物品 uid 不與任何已存物品重複', () => {
    const { world } = progressedWorld();
    const { world: loaded } = reload(world);
    const existing = new Set([
      ...loaded.inventory.items.map((i) => i.uid),
      loaded.equipment.get('weapon')!.uid,
      loaded.equipment.get('ring2')!.uid,
    ]);
    const counter = (uid: string) => parseInt(uid.split('-')[0]!, 36);
    const base = data.items.all[0]!;
    for (let i = 0; i < 20; i++) {
      const item = loaded.itemGenerator.create(base, 'normal', 1);
      expect(existing.has(item.uid)).toBe(false);
      expect(counter(item.uid)).toBeGreaterThan(Math.max(...[...existing].map(counter)));
    }
  });
});

describe('SaveMapper：屬性點', () => {
  it('已分配與未分配的屬性點還原；加成重新套用', () => {
    const { world } = progressedWorld();
    const { world: loaded, save } = reload(world);
    expect(save.attributes).toEqual({ unspent: 21 - 10, allocated: { vitality: 6, crit: 4 } });
    expect(loaded.attributes.points('vitality')).toBe(6);
    expect(loaded.progress.attributePoints).toBe(11);
    expect(loaded.player.maxHp).toBeCloseTo(world.player.maxHp);
  });

  it('修復：屬性已移除 → 退點；超過上限 → 退回多出的；總數超過等級 → 全部重置', () => {
    const base = SaveMapper.capture(progressedWorld().world, CREATED);
    const removed = structuredClone(base);
    removed.attributes.allocated['luck'] = 3;
    removed.attributes.unspent -= 3;
    expect(repairSave(removed, data).data.attributes).toEqual(base.attributes);

    const over = structuredClone(base);
    over.character.level = 2;
    over.character.xp = 0;
    over.skills = { ...over.skills };
    const fixed = repairSave(over, data).data.attributes;
    expect(fixed).toEqual({ unspent: 3, allocated: {} });
  });
});

describe('SaveMapper：重新整理不能刷 / 不能補滿（讀檔 = 死亡）', () => {
  it('開寶箱 → 讀檔：寶箱仍是開啟狀態', () => {
    const { world, commands } = newWorld(3, 1);
    const chest = world.chests.find((c) => c.spawnIndex === 0)!;
    interact(world, commands, chest);
    expect(chest.opened).toBe(true);
    const { world: loaded } = reload(world);
    expect(loaded.chests).toHaveLength(world.chests.length);
    expect(loaded.chests.find((c) => c.spawnIndex === 0)!.opened).toBe(true);
  });

  it('殺 5 隻 → 讀檔：那 5 隻不再出現，擊殺數 = 5，其餘怪物在原生成點滿血', () => {
    const { world } = newWorld(5, 1);
    const original = enemies(world).map((e) => ({ x: e.position.x, y: e.position.y }));
    const victims = enemies(world).slice(2, 7);
    for (const v of victims) v.hp = 0;
    enemies(world)[0]!.hp = 1;
    run(world, 1 / 60);
    const { world: loaded } = reload(world);
    expect(loaded.floors.killed).toBe(5);
    expect(enemies(loaded)).toHaveLength(original.length - 5);
    const expected = original.filter((_, i) => i < 2 || i >= 7);
    expect(enemies(loaded).map((e) => ({ x: e.position.x, y: e.position.y }))).toEqual(expected);
    expect(enemies(loaded).every((e) => e.hp === e.maxHp)).toBe(true);
  });

  it('出口已開 → 讀檔：出口仍開啟', () => {
    const { world } = newWorld(5, 1);
    for (const e of enemies(world)) e.hp = 0;
    run(world, 1 / 60);
    expect(world.floors.exitOpen).toBe(true);
    const { world: loaded } = reload(world);
    expect(loaded.floors.exitOpen).toBe(true);
    expect(loaded.exit!.open).toBe(true);
    expect(loaded.floors.remainingToOpen).toBe(0);
  });

  it('中途已啟動 → 讀檔：玩家在中途存檔點；未啟動則在樓梯口', () => {
    const { world } = newWorld(5, 2);
    const { world: atStairs } = reload(world);
    expect(distance(atStairs.player.position, atStairs.spawnPoint)).toBeLessThan(0.01);

    const midway = world.checkpoints.checkpoints.find((c) => c.kind === 'midway')!;
    world.player.position = midway.position;
    run(world, 1 / 60);
    world.player.position = vec2(midway.position.x + 3, midway.position.y);
    const { world: loaded } = reload(world);
    expect(loaded.floors.floor).toBe(2);
    expect(distance(loaded.player.position, midway.position)).toBeLessThan(0.01);
    expect(loaded.checkpoints.respawn.kind).toBe('midway');
  });

  it('HP 30% → 讀檔：HP 仍是 30%（不能靠重新整理補滿）', () => {
    const { world } = newWorld();
    world.player.hp = world.player.maxHp * 0.3;
    world.player.mana = 5;
    const { world: loaded } = reload(world);
    expect(loaded.player.hp).toBeCloseTo(world.player.maxHp * 0.3);
    expect(loaded.player.mana).toBeCloseTo(5);
  });

  it('倒地中存檔：存成已重生（HP / MP 滿）', () => {
    const { world } = newWorld();
    world.player.hp = 0;
    world.player.alive = false;
    const save = SaveMapper.capture(world, CREATED);
    expect(save.character.hp).toBe(world.player.maxHp);
    expect(save.character.mana).toBe(world.player.maxMana);
  });

  it('手上拿著物品 → 讀檔：物品仍在滑鼠上', () => {
    const { world } = progressedWorld();
    const held = world.cursor.entry;
    const { world: loaded } = reload(world);
    expect(loaded.cursor.entry).toEqual(held);
  });

  it('地上的物品 → 讀檔：原位還在（玩家丟的仍不會自動撿）；換層後消失', () => {
    const { world } = newWorld();
    const p = vec2(world.spawnPoint.x + 2, world.spawnPoint.y);
    world.spawnGroundItem(p, { kind: 'gold', amount: 40 });
    world.spawnGroundItem(p, { kind: 'potion', potionId: data.balance.player.potionId, count: 2 }).droppedByPlayer = true;
    const { world: loaded } = reload(world);
    expect(loaded.groundItems.map((g) => [g.content, g.position, g.droppedByPlayer ?? false])).toEqual([
      [{ kind: 'gold', amount: 40 }, p, false],
      [{ kind: 'potion', potionId: data.balance.player.potionId, count: 2 }, p, true],
    ]);
    loaded.enterFloor(2);
    expect(loaded.groundItems).toHaveLength(0);
  });

  it('往上一層後讀檔：拿到的是那一層重生後的狀態（寶箱紀錄跨層保留）', () => {
    const { world, commands } = newWorld(9, 2);
    interact(world, commands, world.chests.find((c) => c.spawnIndex === 0)!);
    world.enterFloor(3);
    world.enterFloor(2);
    const { world: loaded } = reload(world);
    expect(loaded.floors.floor).toBe(2);
    expect(loaded.progress.highestFloor).toBe(3);
    expect(loaded.floors.exitOpen).toBe(true);
    expect(loaded.chests.find((c) => c.spawnIndex === 0)!.opened).toBe(true);
    expect(loaded.stairsUp).not.toBeNull();
  });
});

describe('SaveRepair：資料表更新後舊存檔仍讀得進來', () => {
  const baseSave = (): SaveData => SaveMapper.capture(progressedWorld().world, CREATED);

  it('技能 ID 已刪除：移除並退回技能點；配置中引用的格子清空', () => {
    const save = baseSave();
    const before = save.skills.unspentPoints;
    save.skills.ranks['melee.removed_skill'] = 2;
    save.skills.unspentPoints -= 2;
    save.loadout.combos[0] = ['melee.removed_skill', null, null];
    save.loadout.left = 'melee.removed_skill';
    const { data: fixed, notes } = repairSave(save, data);
    expect(fixed.skills.ranks['melee.removed_skill']).toBeUndefined();
    expect(fixed.skills.unspentPoints).toBe(before);
    expect(fixed.loadout.combos[0]).toEqual([null, null, null]);
    expect(fixed.loadout.left).toBe(data.balance.player.startingLoadout.left);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('技能點總數不符：依公式修正；已使用超過總數時重置技能樹', () => {
    const save = baseSave();
    const correct = save.skills.unspentPoints;
    save.skills.unspentPoints = correct + 5;
    expect(repairSave(save, data).data.skills.unspentPoints).toBe(correct);

    const cheated = baseSave();
    cheated.character.level = 1;
    cheated.character.xp = 0;
    const { data: reset, notes } = repairSave(cheated, data);
    expect(Object.keys(reset.skills.ranks).sort()).toEqual([...data.balance.player.startingSkills].sort());
    expect(reset.skills.unspentPoints).toBe(data.balance.player.startingSkillPoints);
    expect(reset.loadout.supports).toEqual([null, null, null]);
    expect(notes.some((n) => n.includes('重置'))).toBe(true);
  });

  it('物品 base 不存在：只移除那件；詞綴不存在：只移除詞綴', () => {
    const save = baseSave();
    const cell = save.inventory.cells.findIndex((c) => c?.kind === 'item')!;
    const entry = save.inventory.cells[cell]!;
    if (entry.kind !== 'item') throw new Error();
    entry.item.baseId = 'weapon.deleted';
    const weapon = save.equipment.weapon!;
    weapon.affixes.push({ id: 'affix.deleted', rolls: [1] });
    const { data: fixed } = repairSave(save, data);
    expect(fixed.inventory.cells[cell]).toBeNull();
    expect(fixed.equipment.weapon!.affixes.some((a) => a.id === 'affix.deleted')).toBe(false);
    expect(fixed.inventory.cells.filter((c) => c?.kind === 'potion').length).toBeGreaterThan(0);
  });

  it('裝備欄位不符：卸下放回背包；藥水疊超過上限：拆成多疊', () => {
    const save = baseSave();
    save.equipment.helmet = save.equipment.weapon!;
    delete save.equipment.weapon;
    const potionCell = save.inventory.cells.findIndex((c) => c?.kind === 'potion');
    const stack = save.inventory.cells[potionCell]!;
    if (stack.kind !== 'potion') throw new Error();
    stack.count = 45;
    const expectedTotal = save.inventory.cells.reduce((sum, c) => sum + (c?.kind === 'potion' ? c.count : 0), 0);
    const { data: fixed, overflow } = repairSave(save, data);
    expect(fixed.equipment.helmet).toBeUndefined();
    const items = fixed.inventory.cells.flatMap((c) => (c?.kind === 'item' ? [c.item.uid] : []));
    expect(items).toContain(save.equipment.helmet!.uid);
    const max = data.potions.get(stack.potionId).maxStack;
    const total = fixed.inventory.cells.reduce((sum, c) => sum + (c?.kind === 'potion' ? c.count : 0), 0);
    expect(fixed.inventory.cells.every((c) => c?.kind !== 'potion' || c.count <= max)).toBe(true);
    expect(total).toBe(expectedTotal);
    expect(overflow).toEqual([]);
  });

  it('樓層佈局改變（mapId 不符）：本層重新生成，地上的物品移到樓梯口', () => {
    const save = baseSave();
    save.floor.mapId = 'map.old_layout';
    save.floor.killed = [0, 1];
    save.floor.midwayActive = true;
    save.floor.groundItems = [{ entry: { kind: 'potion', potionId: data.balance.player.potionId, count: 3 }, x: 5, y: 5, droppedByPlayer: false }];
    save.inventory.cells = save.inventory.cells.map((c) => c ?? { kind: 'potion', potionId: data.balance.player.potionId, count: 1 });
    const repaired = repairSave(save, data);
    expect(repaired.data.floor.killed).toEqual([]);
    expect(repaired.data.floor.midwayActive).toBe(false);
    expect(repaired.data.floor.groundItems).toEqual([]);
    expect(repaired.overflow).toEqual([{ kind: 'potion', potionId: data.balance.player.potionId, count: 3 }]);

    const fresh = newWorld(save.meta.runSeed);
    SaveMapper.restore(fresh.world, repaired);
    const atStairs = fresh.world.groundItems.filter((g) => distance(g.position, fresh.world.spawnPoint) < 0.01);
    expect(atStairs).toHaveLength(1);
  });
});
