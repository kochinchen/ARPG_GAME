import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { CoreSlot } from '../../../src/data/schema/core';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import type { CoreInstance, CoreRoll } from '../../../src/game/items/CoreInstance';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import type { StashEntry } from '../../../src/game/items/SharedStash';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { run } from '../helpers';

/** 共用倉庫的存取規則與熔核的等級限制 */
const data = DataRegistry.load(gameData);
const EMPTY: Record<CoreSlot, CoreRoll[]> = { weapon: [], helmet: [], armor: [], gloves: [], boots: [], shield: [] };
const core = (uid: string, itemLevel = 1): CoreInstance => ({ uid, types: ['sharp'], tier: 1, rarity: 'rare', power: 1, itemLevel, main: EMPTY, secondary: [] });
const weapon = (uid: string, sockets?: ItemInstance['sockets']): ItemInstance => ({
  uid,
  baseId: data.items.all.find((b) => b.slot === 'weapon' && b.levelReq === 1)!.id,
  rarity: 'normal',
  itemLevel: 1,
  affixes: [],
  ...(sockets ? { sockets } : {}),
});

function setup() {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor: 2, commands, events, seed: 5 });
  const chest = world.stashChests[0]!;
  world.player.position = { ...chest.position };
  world.player.prevPosition = world.player.position;
  const happened: string[] = [];
  events.on('StashFull', () => happened.push('full'));
  events.on('StashRejected', () => happened.push('rejected'));
  events.on('CoreLevelTooLow', (e) => happened.push(`coreLevel:${e.required}`));
  events.on('EquipFailed', (e) => happened.push(`equip:${e.reason}`));
  const send = (c: GameCommand) => {
    commands.push(c);
    run(world, 1);
  };
  return { world, send, happened };
}

describe('共用倉庫', () => {
  it('5 頁、每頁 30 格', () => {
    const { world } = setup();
    expect(world.stash.cells).toHaveLength(150);
  });

  it('拿著裝備點空格放進去，再點拿出來；拿出來的物品換新 uid', () => {
    const { world, send } = setup();
    world.cursor.set({ kind: 'item', item: weapon('A') });
    send({ type: 'StashClick', cell: 7 });
    expect(world.cursor.entry).toBeNull();
    expect(world.stash.cells[7]).toMatchObject({ kind: 'item', item: { uid: 'A' } });
    send({ type: 'StashClick', cell: 7 });
    expect(world.stash.cells[7]).toBeNull();
    const held = world.cursor.entry;
    expect(held?.kind === 'item' && held.item.uid).not.toBe('A');
  });

  it('裝備上的熔核跟著走，也換新 uid', () => {
    const { world, send } = setup();
    world.stash.cells[0] = { kind: 'item', item: weapon('A', { max: 2, cores: [core('C1')] }) };
    send({ type: 'StashClick', cell: 0 });
    const held = world.cursor.entry;
    if (held?.kind !== 'item') throw new Error('應該拿著裝備');
    expect(held.item.sockets!.cores).toHaveLength(1);
    expect(held.item.sockets!.cores[0]!.uid).not.toBe('C1');
  });

  it('不互換：那一格有東西時放到後面第一個空格，手上不會多東西', () => {
    const { world, send } = setup();
    world.stash.cells[3] = { kind: 'core', core: core('X') };
    world.cursor.set({ kind: 'core', core: core('Y') });
    send({ type: 'StashClick', cell: 3 });
    expect(world.cursor.entry).toBeNull();
    expect(world.stash.cells[3]).toMatchObject({ core: { uid: 'X' } });
    expect(world.stash.cells[4]).toMatchObject({ core: { uid: 'Y' } });
  });

  it('藥水不能放', () => {
    const { world, send, happened } = setup();
    world.cursor.set({ kind: 'potion', potionId: 'potion.rejuvenation', count: 1 });
    send({ type: 'StashClick', cell: 0 });
    expect(world.stash.count).toBe(0);
    expect(world.cursor.entry?.kind).toBe('potion');
    expect(happened).toContain('rejected');
  });

  it('全滿時放不進去，東西留在手上', () => {
    const { world, send, happened } = setup();
    world.stash.cells.fill({ kind: 'core', core: core('F') });
    world.cursor.set({ kind: 'core', core: core('Y') });
    send({ type: 'StashClick', cell: 0 });
    expect(world.cursor.entry?.kind).toBe('core');
    expect(happened).toContain('full');
  });

  it('Ctrl + 點擊：背包直接放進倉庫（從目前這一頁找空格），倉庫直接拿回背包', () => {
    const { world, send } = setup();
    world.inventory.restore(world.inventory.cells.map(() => null));
    world.inventory.addItem(weapon('A'));
    send({ type: 'StashDeposit', cell: 0, fromCell: 30 });
    expect(world.inventory.get(0)).toBeNull();
    expect(world.stash.cells[30]).toMatchObject({ item: { uid: 'A' } });
    send({ type: 'StashWithdraw', cell: 30 });
    expect(world.stash.count).toBe(0);
    expect(world.inventory.get(0)?.kind).toBe('item');
  });

  it('背包滿了拿不回來，東西留在倉庫', () => {
    const { world, send } = setup();
    world.inventory.restore(world.inventory.cells.map(() => ({ kind: 'item', item: weapon('B') })));
    world.stash.cells[0] = { kind: 'item', item: weapon('A') };
    send({ type: 'StashWithdraw', cell: 0 });
    expect(world.stash.cells[0]).toMatchObject({ item: { uid: 'A' } });
  });

  it('離開寶箱太遠不能存取', () => {
    const { world, send } = setup();
    const far = world.stashChests[world.stashChests.length - 1]!.position;
    world.stashChests = [{ kind: 'stash', id: 9999, position: { x: far.x + 100, y: far.y + 100 } }];
    world.cursor.set({ kind: 'core', core: core('Y') });
    send({ type: 'StashClick', cell: 0 });
    expect(world.stash.count).toBe(0);
  });

  it('存檔讀不進來時鎖住：不能存取，版本不變（不會寫入）', () => {
    const { world, send } = setup();
    world.stash.locked = true;
    const version = world.stash.version;
    world.cursor.set({ kind: 'core', core: core('Y') });
    send({ type: 'StashClick', cell: 0 });
    expect(world.stash.version).toBe(version);
    expect(world.cursor.entry?.kind).toBe('core');
  });

  it('從倉庫拿到手上的裝備會記進裝備圖鑑', () => {
    const { world, send } = setup();
    world.stash.cells[0] = { kind: 'item', item: weapon('A') };
    send({ type: 'StashClick', cell: 0 });
    run(world, 1);
    expect(world.progress.collection.has(`base:${weapon('A').baseId}`)).toBe(true);
  });
});

describe('倉庫每頁整理', () => {
  const armor = (uid: string, itemLevel: number): ItemInstance => ({ uid, baseId: data.items.all.find((b) => b.slot === 'armor')!.id, rarity: 'magic', itemLevel, affixes: [] });
  const uids = (cells: readonly (StashEntry | null)[]) => cells.map((c) => (c === null ? null : c.kind === 'item' ? c.item.uid : c.core.uid));

  it('熔核不會消失：裝備在前、熔核在後，核階高的在前，空格排到最後', () => {
    const { world, send } = setup();
    world.stash.cells[2] = { kind: 'core', core: { ...core('C1'), tier: 2 } };
    world.stash.cells[9] = { kind: 'item', item: armor('A1', 5) };
    world.stash.cells[17] = { kind: 'core', core: { ...core('C5'), tier: 5 } };
    world.stash.cells[29] = { kind: 'item', item: weapon('W') };
    send({ type: 'StashSortPage', page: 0 });
    expect(world.stash.count).toBe(4);
    expect(uids(world.stash.cells.slice(0, 5))).toEqual(['W', 'A1', 'C5', 'C1', null]);
    expect(world.stash.cells.slice(4, 30).every((c) => c === null)).toBe(true);
  });

  it('滿滿 30 格只有熔核也一件不少', () => {
    const { world, send } = setup();
    for (let i = 0; i < 30; i++) world.stash.cells[i] = { kind: 'core', core: { ...core(`C${i}`), tier: (i % 5) + 1 } };
    const before = new Set(uids(world.stash.cells.slice(0, 30)));
    send({ type: 'StashSortPage', page: 0 });
    expect(new Set(uids(world.stash.cells.slice(0, 30)))).toEqual(before);
    expect(world.stash.count).toBe(30);
  });

  it('裝備上鑲的熔核留在裝備上，uid 不變', () => {
    const { world, send } = setup();
    world.stash.cells[5] = { kind: 'item', item: weapon('W', { max: 2, cores: [core('IN')] }) };
    send({ type: 'StashSortPage', page: 0 });
    expect(world.stash.cells[0]).toMatchObject({ item: { uid: 'W', sockets: { cores: [{ uid: 'IN' }] } } });
  });

  it('只動這一頁，其他頁不變', () => {
    const { world, send } = setup();
    world.stash.cells[3] = { kind: 'core', core: core('P1') };
    world.stash.cells[35] = { kind: 'core', core: core('P2') };
    world.stash.cells[149] = { kind: 'core', core: core('P5') };
    send({ type: 'StashSortPage', page: 1 });
    expect(world.stash.cells[3]).toMatchObject({ core: { uid: 'P1' } });
    expect(world.stash.cells[30]).toMatchObject({ core: { uid: 'P2' } });
    expect(world.stash.cells[35]).toBeNull();
    expect(world.stash.cells[149]).toMatchObject({ core: { uid: 'P5' } });
  });

  it('手上拿著的東西不受影響', () => {
    const { world, send } = setup();
    world.cursor.set({ kind: 'core', core: core('H') });
    world.stash.cells[4] = { kind: 'core', core: core('X') };
    send({ type: 'StashSortPage', page: 0 });
    expect(world.cursor.entry).toMatchObject({ core: { uid: 'H' } });
    expect(world.stash.cells[0]).toMatchObject({ core: { uid: 'X' } });
  });

  it('頁碼不對、鎖住、離太遠都不動', () => {
    const { world, send } = setup();
    world.stash.cells[4] = { kind: 'core', core: core('X') };
    send({ type: 'StashSortPage', page: 5 });
    send({ type: 'StashSortPage', page: -1 });
    expect(world.stash.cells[4]).not.toBeNull();
    world.stash.locked = true;
    send({ type: 'StashSortPage', page: 0 });
    expect(world.stash.cells[4]).not.toBeNull();
    world.stash.locked = false;
    world.stashChests = [];
    send({ type: 'StashSortPage', page: 0 });
    expect(world.stash.cells[4]).not.toBeNull();
  });
});

describe('寶箱位置', () => {
  it('每位商人旁邊都有寶箱，而且不擋樓梯、出口、存檔點（每一層、多個種子）', () => {
    for (const seed of [1, 2]) {
      for (let floor = 1; floor <= data.balance.endgame.lastFloor; floor++) {
        const world = new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
        const label = `第 ${floor} 層，種子 ${seed}`;
        expect(world.stashChests.length, label).toBe(world.merchants.length);
        const spots = world.stashChests.map((s) => s.position);
        for (const p of spots) {
          const nearest = Math.min(...world.merchants.map((m) => distance(p, m.position)));
          expect(nearest, `${label}：離商人`).toBeGreaterThanOrEqual(2.5);
          expect(nearest, `${label}：離商人`).toBeLessThanOrEqual(5);
          expect(distance(p, world.spawnPoint), `${label}：離樓梯`).toBeGreaterThanOrEqual(2.5);
          if (world.exit) expect(distance(p, world.exit.position), `${label}：離出口`).toBeGreaterThanOrEqual(2.5);
          for (const c of world.checkpoints.checkpoints) expect(distance(p, c.position), `${label}：離存檔點`).toBeGreaterThanOrEqual(2.5);
          for (const c of world.chests) expect(distance(p, c.position), `${label}：離寶箱`).toBeGreaterThanOrEqual(1.6);
          for (const r of world.relics) expect(distance(p, r.position), `${label}：離遺物`).toBeGreaterThanOrEqual(1.6);
        }
      }
    }
  }, 300_000);

  it('同一張地圖位置固定，而且不影響這一層的其他內容', () => {
    const make = () => new GameWorld({ data, floor: 7, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: 9 });
    const [a, b] = [make(), make()];
    expect(a.stashChests.map((s) => s.position)).toEqual(b.stashChests.map((s) => s.position));
    expect(a.chests.map((c) => c.position)).toEqual(b.chests.map((c) => c.position));
  });
});

describe('熔核的等級限制', () => {
  it('等級不到核的物品等級：不能鑲進背包裡的裝備，核留在手上', () => {
    const { world, send, happened } = setup();
    world.inventory.restore(world.inventory.cells.map(() => null));
    world.inventory.addItem(weapon('A', { max: 1, cores: [] }));
    world.cursor.set({ kind: 'core', core: core('H', 40) });
    send({ type: 'InventoryClick', cell: 0 });
    expect(world.cursor.entry?.kind).toBe('core');
    const cell = world.inventory.get(0);
    expect(cell?.kind === 'item' && cell.item.sockets!.cores).toHaveLength(0);
    expect(happened).toContain('coreLevel:40');
  });

  it('等級不到核的物品等級：不能鑲進身上的裝備', () => {
    const { world, send, happened } = setup();
    world.equipment.equipTo('weapon', weapon('A', { max: 1, cores: [] }));
    world.cursor.set({ kind: 'core', core: core('H', 40) });
    send({ type: 'EquipmentClick', slot: 'weapon' });
    expect(world.cursor.entry?.kind).toBe('core');
    expect(world.equipment.get('weapon')!.sockets!.cores).toHaveLength(0);
    expect(happened).toContain('coreLevel:40');
  });

  it('等級到了就能鑲', () => {
    const { world, send } = setup();
    world.equipment.equipTo('weapon', weapon('A', { max: 1, cores: [] }));
    world.cursor.set({ kind: 'core', core: core('L', world.progress.level) });
    send({ type: 'EquipmentClick', slot: 'weapon' });
    expect(world.cursor.entry).toBeNull();
    expect(world.equipment.get('weapon')!.sockets!.cores).toHaveLength(1);
  });

  it('鑲著高階核的低階裝備不能拿來穿（倉庫不能繞過等級限制）', () => {
    const { world, send, happened } = setup();
    world.equipment.unequip('weapon');
    world.cursor.set({ kind: 'item', item: weapon('A', { max: 1, cores: [core('H', 40)] }) });
    send({ type: 'EquipmentClick', slot: 'weapon' });
    expect(world.equipment.get('weapon')).toBeUndefined();
    expect(happened).toContain('equip:level');
  });

  it('已經穿在身上的裝備，讀檔時不會因為核的等級被卸下', () => {
    const { world } = setup();
    world.equipment.equipTo('weapon', weapon('A', { max: 1, cores: [core('H', 40)] }));
    const repaired = repairSave(SaveMapper.capture(world, '2026-01-01T00:00:00.000Z'), data);
    expect(repaired.data.equipment.weapon?.uid).toBe('A');
  });
});
