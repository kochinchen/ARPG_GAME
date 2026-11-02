import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { decodeSave, encodeSave } from '../../src/save/Envelope';
import { SaveService, type SyncStore } from '../../src/save/SaveService';
import { captureStash, decodeStash, encodeStash, repairStash, restoreStash, StashService, StashSync, type StashData } from '../../src/save/StashStore';
import { MemoryStorage } from '../../src/save/storage/MemoryStorage';
import { CommandQueue } from '../../src/core/CommandQueue';
import { EventBus } from '../../src/core/EventBus';
import type { GameCommand } from '../../src/game/Commands';
import type { GameEvents } from '../../src/game/GameEvents';
import { GameWorld } from '../../src/game/GameWorld';
import { SaveMapper } from '../../src/save/SaveMapper';

/** 共用倉庫的存檔：輪替備份、損毀處理、修復、和角色存檔的寫入順序 */
const data = DataRegistry.load(gameData);
const baseId = data.items.all.find((b) => b.slot === 'weapon')!.id;
const item = (uid: string) => ({ kind: 'item' as const, item: { uid, baseId, rarity: 'normal' as const, itemLevel: 1, affixes: [] } });
const sample = (uid: string): StashData => ({ cells: [item(uid), null] });

function memoryLocal(): SyncStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

describe('倉庫存檔格式', () => {
  it('編碼再解碼內容相同', () => {
    const decoded = decodeStash(encodeStash(sample('A'), new Date()));
    expect(decoded.ok && decoded.data).toEqual(sample('A'));
  });

  it('角色存檔不能當倉庫檔案匯入', () => {
    const decoded = decodeStash(JSON.stringify({ schemaVersion: 21, savedAt: 'x', checksum: 'x', payload: '{}' }));
    expect(decoded.ok).toBe(false);
  });

  it('Checksum 不符、版本比遊戲新都會拒絕', () => {
    const text = encodeStash(sample('A'), new Date());
    const envelope = JSON.parse(text) as Record<string, unknown>;
    expect(decodeStash(JSON.stringify({ ...envelope, checksum: 'bad' })).ok).toBe(false);
    expect(decodeStash(JSON.stringify({ ...envelope, schemaVersion: 999 })).ok).toBe(false);
  });
});

describe('StashService', () => {
  it('沒有存檔時是 empty', async () => {
    expect((await new StashService(new MemoryStorage()).load()).status).toBe('empty');
  });

  it('和角色存檔的鍵不衝突：清掉一個欄位，倉庫還在', async () => {
    const storage = new MemoryStorage();
    const stash = new StashService(storage);
    await stash.write(sample('A'));
    await new SaveService(storage, null, undefined, 1).clear();
    await new SaveService(storage, null, undefined, 2).clear();
    const loaded = await stash.load();
    expect(loaded.status === 'ok' && loaded.data).toEqual(sample('A'));
  });

  it('最新一份損毀時退回備份', async () => {
    const storage = new MemoryStorage();
    const stash = new StashService(storage);
    await stash.write(sample('OLD'));
    await stash.write(sample('NEW'));
    await storage.put('stash.1', 'broken');
    const loaded = await new StashService(storage).load();
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') {
      expect(loaded.data).toEqual(sample('OLD'));
      expect(loaded.fellBack).toBe(true);
    }
  });

  it('全部損毀時回傳 corrupt，不覆蓋', async () => {
    const storage = new MemoryStorage();
    await storage.put('stash.0', 'broken');
    const loaded = await new StashService(storage).load();
    expect(loaded.status).toBe('corrupt');
    expect(await storage.get('stash.0')).toBe('broken');
  });

  it('緊急副本較新時用緊急副本', async () => {
    const storage = new MemoryStorage();
    const local = memoryLocal();
    let t = 1000;
    const stash = new StashService(storage, local, () => new Date(t));
    await stash.write(sample('IDB'));
    t = 2000;
    stash.writeEmergency(sample('EMERGENCY'));
    const loaded = await stash.load();
    expect(loaded.status === 'ok' && loaded.data).toEqual(sample('EMERGENCY'));
  });
});

describe('repairStash', () => {
  it('補滿 150 格；已刪除的基底移除', () => {
    const { data: fixed, notes } = repairStash({ cells: [item('A'), { kind: 'item', item: { ...item('B').item, baseId: 'weapon.not_exist' } }] }, data);
    expect(fixed.cells).toHaveLength(150);
    expect(fixed.cells[0]).toMatchObject({ item: { uid: 'A' } });
    expect(fixed.cells[1]).toBeNull();
    expect(notes.length).toBeGreaterThan(0);
  });

  it('格數變少時往前補，不丟東西', () => {
    const cells: StashData['cells'] = Array.from({ length: 160 }, () => null);
    cells[155] = item('LATE');
    const { data: fixed } = repairStash({ cells }, data);
    expect(fixed.cells).toHaveLength(150);
    expect(fixed.cells[0]).toMatchObject({ item: { uid: 'LATE' } });
  });
});

describe('StashSync：倉庫與角色的寫入', () => {
  function setup() {
    const world = new GameWorld({ data, floor: 2, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: 5 });
    const storage = new MemoryStorage();
    const local = memoryLocal();
    const order: string[] = [];
    const service = new StashService(storage, local);
    const realWrite = service.write.bind(service);
    service.write = async (d) => {
      order.push('stash');
      return realWrite(d);
    };
    const realEmergency = service.writeEmergency.bind(service);
    service.writeEmergency = (d) => {
      order.push('stash-emergency');
      return realEmergency(d);
    };
    const autoSaver = {
      flushEmergency: () => void order.push('character-emergency'),
      saveNow: async () => {
        order.push('character');
        return 'now';
      },
    };
    const errors: unknown[] = [];
    const sync = new StashSync(world.stash, service, autoSaver, (e) => errors.push(e));
    return { world, sync, order, service, errors, local };
  }

  it('沒有變動時不寫', async () => {
    const { sync, order } = setup();
    sync.update(1);
    await sync.flush();
    expect(order).toEqual([]);
  });

  it('放進去：先同步寫兩邊的緊急副本，再寫倉庫、後寫角色', async () => {
    const { world, sync, order } = setup();
    world.stash.cells[0] = item('A');
    world.stash.restore([...world.stash.cells]);
    sync.update(1);
    await sync.flush();
    expect(order).toEqual(['stash-emergency', 'character-emergency', 'stash', 'character']);
  });

  it('拿出來：先寫角色、後寫倉庫', async () => {
    const { world, order, service } = setup();
    world.stash.restore([item('A')]);
    const sync = new StashSync(world.stash, service, { flushEmergency: () => void order.push('character-emergency'), saveNow: async () => (order.push('character'), 'now') }, () => {});
    world.cursor.set(null);
    world.stash.click(0);
    sync.update(1);
    await sync.flush();
    expect(order).toEqual(['stash-emergency', 'character-emergency', 'character', 'stash']);
  });

  it('寫入失敗會回報，之後再試', async () => {
    const { world, sync, service, errors } = setup();
    const real = service.write.bind(service);
    service.write = async () => {
      throw new Error('disk full');
    };
    world.stash.restore([item('A')]);
    sync.update(1);
    await sync.flush().catch(() => {});
    expect(errors.length).toBeGreaterThan(0);
    service.write = real;
    await sync.flush();
    const loaded = await service.load();
    expect(loaded.status === 'ok' && loaded.data.cells[0]).toMatchObject({ item: { uid: 'A' } });
  });

  it('鎖住時絕不寫入', async () => {
    const { world, sync, order } = setup();
    world.stash.locked = true;
    world.stash.restore([item('A')]);
    sync.update(1);
    await sync.flush();
    sync.flushSync();
    expect(order).toEqual([]);
  });
});

describe('整理後的存檔', () => {
  it('整理一頁再存檔、讀回來，裝備與熔核都還在', async () => {
    const world = new GameWorld({ data, floor: 2, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: 5 });
    world.stash.cells[7] = { kind: 'core', core: { uid: 'C', types: ['sharp'], tier: 5, rarity: 'legendary', power: 1, itemLevel: 40, main: { weapon: [], helmet: [], armor: [], gloves: [], boots: [], shield: [] }, secondary: [] } };
    world.stash.cells[20] = { kind: 'item', item: item('A').item };
    world.stash.sortPage(0, data);
    const service = new StashService(new MemoryStorage());
    await service.write(captureStash(world.stash));
    const loaded = await service.load();
    if (loaded.status !== 'ok') throw new Error('應該讀得到');
    expect(loaded.data.cells[0]).toMatchObject({ item: { uid: 'A' } });
    expect(loaded.data.cells[1]).toMatchObject({ core: { uid: 'C' } });
    expect(loaded.data.cells.filter((c) => c !== null)).toHaveLength(2);
  });
});

describe('跨存檔交換', () => {
  it('A 角色放進倉庫 → B 角色讀同一個倉庫，拿到一樣的裝備', async () => {
    const storage = new MemoryStorage();
    const make = (seed: number) => new GameWorld({ data, floor: 2, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
    const a = make(1);
    const generated = a.itemGenerator.create(data.items.all.find((b) => b.slot === 'weapon')!, 'magic', 10);
    a.cursor.set({ kind: 'item', item: generated });
    a.stash.click(5);
    const service = new StashService(storage);
    await service.write(captureStash(a.stash));

    const b = make(2);
    const loaded = await new StashService(storage).load();
    if (loaded.status !== 'ok') throw new Error('應該讀得到');
    restoreStash(b.stash, repairStash(loaded.data, data).data);
    b.stash.click(5);
    const held = b.cursor.entry;
    if (held?.kind !== 'item') throw new Error('應該拿著裝備');
    expect(held.item.baseId).toBe(generated.baseId);
    expect(held.item.affixes).toEqual(generated.affixes);
    expect(held.item.uid).not.toBe(generated.uid);

    // B 的存檔記下手上的裝備，存檔格式不受影響
    const save = decodeSave(encodeSave(SaveMapper.capture(b, '2026-01-01T00:00:00.000Z'), new Date()));
    expect(save.ok).toBe(true);
  });
});
