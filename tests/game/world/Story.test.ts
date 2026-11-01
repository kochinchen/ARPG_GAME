import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { buildBook } from '../../../src/data/book';
import { ChestSystem } from '../../../src/game/items/ChestSystem';
import { notePageInChest } from '../../../src/game/world/Notebook';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

const data = DataRegistry.load(gameData);

function floorWorld(floor: number, seed = 7) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  return { world: new GameWorld({ data, floor, commands, events, seed }), commands, events };
}

/** 讓魔王死亡事件發生（不需要真的打完） */
const killBoss = (world: GameWorld, events: EventBus<GameEvents>, flags: { miniBoss?: boolean; summoned?: boolean } = {}) =>
  events.emit('ActorDied', { actorId: -1, faction: 'enemy', defId: 'enemy.crypt_guardian', killerId: null, position: world.player.position, xp: 0, elite: false, summoned: flags.summoned ?? false, boss: true, ...(flags.miniBoss ? { miniBoss: true } : {}) });

describe('遺物', () => {
  it('每層放一件、位置由種子決定且走得到；第 35 層沒有', () => {
    for (const floor of [1, 7, 12, 23, 30]) {
      const a = floorWorld(floor).world;
      const b = floorWorld(floor).world;
      expect(a.relics.map((r) => r.loreId)).toEqual([`lore.f${floor}`]);
      expect(a.relics[0]!.position).toEqual(b.relics[0]!.position);
      expect(a.nav.isClearAt(a.relics[0]!.position, 0.35)).toBe(true);
    }
    expect(floorWorld(35).world.relics).toEqual([]);
  });

  it('走過去點擊：翻開舊紙（RelicRead）、記進存檔；讀檔後仍是讀過的；可以再讀', () => {
    const { world, commands, events } = floorWorld(3);
    const relic = world.relics[0]!;
    const read: string[] = [];
    events.on('RelicRead', (e) => read.push(e.loreId));
    world.player.position = vec2(relic.position.x - 0.5, relic.position.y);
    commands.push({ type: 'PrimaryAction', worldPos: relic.position, targetId: null, interactId: relic.id, held: false });
    run(world, 0.5);
    expect(read).toEqual(['lore.f3']);
    expect(relic.read).toBe(true);

    const save = SaveMapper.capture(world, '2026-01-01T00:00:00.000Z');
    expect(save.lore).toEqual(['lore.f3']);
    const fresh = floorWorld(1, save.meta.runSeed).world;
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(fresh.relics[0]!.read).toBe(true);
    expect(fresh.progress.lore.has('lore.f3')).toBe(true);
  });
});

describe('挑戰者的筆記', () => {
  const notes = data.notebook.all;
  const page8 = notes.find((n) => n.floor === 3)!;

  it('所在樓層只有選中的那個寶箱有；更淺的樓層沒有；已有的不會再出現', () => {
    const inFloor3 = Array.from({ length: 6 }, (_, spawnIndex) => notePageInChest(notes, { floor: 3, spawnIndex, floorChests: 6 }, 7, new Set()));
    expect(inFloor3.filter(Boolean)).toEqual([page8]);
    for (let spawnIndex = 0; spawnIndex < 6; spawnIndex++) expect(notePageInChest(notes, { floor: 2, spawnIndex, floorChests: 6 }, 7, new Set())).toBeNull();
    for (let spawnIndex = 0; spawnIndex < 6; spawnIndex++) expect(notePageInChest(notes, { floor: 3, spawnIndex, floorChests: 6 }, 7, new Set([page8.id]))).toBeNull();
  });

  it('錯過的頁：之後更深樓層開的下一個寶箱補上，由淺到深一次一頁', () => {
    expect(notePageInChest(notes, { floor: 10, spawnIndex: 0, floorChests: 6 }, 7, new Set())?.floor).toBe(3);
    expect(notePageInChest(notes, { floor: 10, spawnIndex: 0, floorChests: 6 }, 7, new Set([page8.id]))?.floor).toBe(7);
  });

  it('開寶箱拿到一頁，記進存檔', () => {
    const { world, events } = floorWorld(3);
    const found: string[] = [];
    events.on('NotePageFound', (e) => found.push(e.noteId));
    const chests = new ChestSystem(events);
    for (const chest of world.chests) chests.open(chest);
    expect(found).toEqual([page8.id]);
    expect(SaveMapper.capture(world, '2026-01-01T00:00:00.000Z').notebook).toEqual([page8.id]);
  });
});

describe('《井誌》的獎勵', () => {
  const pages = buildBook(data);
  const milestones = (events: EventBus<GameEvents>) => {
    const out: { quarter: number; reward: string }[] = [];
    events.on('BookMilestone', (e) => out.push(e));
    return out;
  };
  const record = (world: GameWorld, page: (typeof pages)[number]) => (page.kind === 'soul' ? world.progress.souls : page.kind === 'lore' ? world.progress.lore : world.progress.notebook).add(page.sourceId);
  /** 收集前 n 頁（直接寫進紀錄，不觸發獎勵） */
  const collect = (world: GameWorld, n: number) => {
    for (const page of pages.slice(0, n)) record(world, page);
  };
  /** 再讀一件還沒讀過的遺物（第 30 層的） */
  const readOne = (world: GameWorld) => {
    const relic = world.relics[0]!;
    world.progress.lore.delete(relic.loreId);
    world.readRelic(relic);
  };
  /** 收集到差一頁就滿 quarter/4，讀一件遺物跨過去 */
  const reach = (quarter: number, world: GameWorld) => {
    world.progress.lore.clear();
    world.progress.souls.clear();
    world.progress.notebook.clear();
    const need = Math.ceil((pages.length * quarter) / 4);
    const relicId = world.relics[0]!.loreId;
    // 魂魄的句子整組收集：放得下才放，湊到剛好差一頁
    const sizes = new Map<string, number>();
    for (const p of pages) sizes.set(p.sourceId, (sizes.get(p.sourceId) ?? 0) + 1);
    let count = 0;
    for (const page of pages) {
      const size = sizes.get(page.sourceId)!;
      if (page.sourceId === relicId || count + size > need - 1) continue;
      if ((page.kind === 'soul' ? world.progress.souls : page.kind === 'lore' ? world.progress.lore : world.progress.notebook).has(page.sourceId)) continue;
      record(world, page);
      count += size;
    }
    readOne(world);
  };

  it('整本書 69 頁（魂魄一句一頁，有署名且連續）；頁碼連續、依樓層排序；沒跨過門檻不發獎勵', () => {
    expect(pages).toHaveLength(69);
    const soul5 = pages.filter((p) => p.sourceId === 'soul.f5');
    expect(soul5.map((p) => p.speaker)).toEqual(['墓穴守衛', '墓穴守衛', '墓穴守衛']);
    expect(soul5[1]!.number).toBe(soul5[0]!.number + 1);
    expect(soul5[2]!.number).toBe(soul5[0]!.number + 2);
    expect(pages.map((p) => p.number)).toEqual(pages.map((_, i) => i + 1));
    for (let i = 1; i < pages.length; i++) expect(pages[i]!.floor).toBeGreaterThanOrEqual(pages[i - 1]!.floor);
    const { world, events } = floorWorld(30);
    const got = milestones(events);
    collect(world, 3);
    readOne(world);
    expect(got).toEqual([]);
  });

  it('1/4：隨機橘核掉在腳邊', () => {
    const { world, events } = floorWorld(30);
    const got = milestones(events);
    reach(1, world);
    expect(got.map((m) => m.quarter)).toEqual([1]);
    const core = world.groundItems.at(-1)!.content;
    expect(core.kind === 'core' && core.core.rarity).toBe('legendary');
  });

  it('2/4、3/4：依技能點最多的路線給橘裝武器與鎧甲', () => {
    for (const [school, kinds] of [['magic', ['staff']], ['ranged', ['bow']], ['melee', ['sword', 'axe']]] as const) {
      const { world, events } = floorWorld(30);
      const got = milestones(events);
      const skill = data.skills.all.find((s) => s.tree?.category === school)!;
      world.player.skillRanks.set(skill.id, 5);
      reach(2, world);
      reach(3, world);
      expect(got.map((m) => m.quarter)).toEqual([2, 3]);
      const [weapon, armor] = world.groundItems.slice(-2).map((g) => (g.content.kind === 'item' ? g.content.item : null));
      expect(weapon!.rarity).toBe('legendary');
      expect(kinds as readonly string[]).toContain(data.items.get(weapon!.baseId).weaponType);
      expect(armor!.rarity).toBe('legendary');
      expect(data.items.get(armor!.baseId).slot).toBe('armor');
      expect(data.balance.book.armors[school]).toContain(armor!.legendaryId);
    }
  });

  it('4/4：額外 20 屬性點；存檔修復承認這些點數，沒收集完的不算', () => {
    const { world, events } = floorWorld(30);
    const got = milestones(events);
    const before = world.progress.attributePoints;
    reach(4, world);
    expect(got.map((m) => m.quarter)).toEqual([4]);
    expect(world.progress.attributePoints).toBe(before + 20);

    const save = SaveMapper.capture(world, '2026-01-01T00:00:00.000Z');
    expect(repairSave(structuredClone(save), data).data.attributes.unspent).toBe(before + 20);
    const missing = structuredClone(save);
    missing.lore.pop();
    expect(repairSave(missing, data).data.attributes.unspent).toBe(before);
  });

  it('設定的鎧甲都存在且是橘裝', () => {
    for (const id of Object.values(data.balance.book.armors).flat()) {
      const def = data.legendaries.get(id);
      expect(def.rarity).toBe('legendary');
      expect(def.kind).toBe('armor');
    }
  });
});

describe('魔王的魂魄', () => {
  it('第一次倒下才飄出；中途小王與召喚物沒有；沒有魂魄的樓層不會觸發', () => {
    const { world, events } = floorWorld(5);
    const souls: string[] = [];
    events.on('SoulReleased', (e) => souls.push(e.soulId));
    killBoss(world, events, { miniBoss: true });
    killBoss(world, events, { summoned: true });
    expect(souls).toEqual([]);
    killBoss(world, events);
    killBoss(world, events);
    expect(souls).toEqual(['soul.f5']);
    expect(world.progress.souls.has('soul.f5')).toBe(true);

    const other = floorWorld(6);
    other.events.on('SoulReleased', () => souls.push('wrong'));
    killBoss(other.world, other.events);
    expect(souls).toEqual(['soul.f5']);
  });
});
