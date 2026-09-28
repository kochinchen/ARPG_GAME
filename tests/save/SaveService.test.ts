import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { AutoSaver } from '../../src/save/AutoSaver';
import { decodeSave, encodeSave } from '../../src/save/Envelope';
import { migrate } from '../../src/save/migrations';
import { EMERGENCY_KEY, SaveService, type SyncStore } from '../../src/save/SaveService';
import { repairSave } from '../../src/save/SaveRepair';
import { SAVE_VERSION, SaveDataSchema, type SaveData } from '../../src/save/schema';
import { sha256 } from '../../src/save/sha256';
import { MemoryStorage } from '../../src/save/storage/MemoryStorage';
import { generatedMapId } from '../../src/game/world/MapGenerator';

const data = DataRegistry.load(gameData);

/** 最小的合法存檔；gold 用來分辨是哪一份 */
function sample(gold: number): SaveData {
  const cells: SaveData['inventory']['cells'] = Array.from({ length: 80 }, () => null);
  cells[0] = { kind: 'potion', potionId: 'potion.rejuvenation', count: 3 };
  return {
    meta: { createdAt: '2026-01-01T00:00:00.000Z', playTimeSec: 12, runSeed: 42 },
    character: { level: 1, xp: 0, gold, hp: 50, mana: 20 },
    skills: { ranks: { 'basic.attack': 1, 'melee.heavy_slash': 1, 'magic.fireball': 1 }, unspentPoints: 2, t4Charges: 0, t4Unlocked: [] },
    attributes: { unspent: 0, allocated: {} },
    loadout: {
      left: 'basic.attack',
      combos: [['melee.heavy_slash', null, null], ['magic.fireball', null, null], [null, null, null]],
      activeCombo: 0,
      supports: [null, null, null],
    },
    inventory: { cells, cursor: null },
    equipment: {},
    codex: [],
    floor: { current: 1, highest: 1, mapId: 'map.crypt_a', midwayActive: false, bossGateActive: false, midwayFloors: [], exitOpen: false, killed: [], openedChests: {}, groundItems: [], shopBought: [] },
    endgame: { cleared: false, completedHidden: false },
    bestiary: {},
    collection: [],
    materials: {},
    salvage: [],
    counters: { itemUidCounter: 0 },
    rng: {},
  };
}

class MemoryStore implements SyncStore {
  readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/** 每次呼叫時間 +1 秒 */
function clock(start = Date.parse('2026-05-01T00:00:00Z')) {
  let t = start;
  return () => new Date((t += 1000));
}

function setup() {
  const storage = new MemoryStorage();
  const emergency = new MemoryStore();
  const service = new SaveService(storage, emergency, clock());
  return { storage, emergency, service };
}

async function loadedGold(service: SaveService) {
  const result = await service.load();
  if (result.status !== 'ok') throw new Error(`load ${result.status}`);
  return result;
}

describe('sha256', () => {
  it('符合標準測試向量', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
    expect(sha256('中文存檔')).toHaveLength(64);
  });
});

describe('Envelope', () => {
  it('編碼 → 解碼得到相同內容（匯出 / 匯入）', () => {
    const save = sample(7);
    const decoded = decodeSave(encodeSave(save, new Date('2026-02-03T04:05:06Z')));
    expect(decoded).toMatchObject({ ok: true, data: save, savedAt: '2026-02-03T04:05:06.000Z', schemaVersion: SAVE_VERSION });
  });

  it('內容被竄改：Checksum 不符；不是 JSON / 缺欄位 / 不符 Schema 都被拒絕', () => {
    const text = encodeSave(sample(7), new Date());
    const tampered = JSON.parse(text) as { payload: string };
    tampered.payload = tampered.payload.replace('"gold":7', '"gold":99999');
    expect(decodeSave(JSON.stringify(tampered))).toMatchObject({ ok: false, reason: 'checksum' });
    expect(decodeSave('{ 壞掉')).toMatchObject({ ok: false, reason: 'format' });
    expect(decodeSave('{"hello":1}')).toMatchObject({ ok: false, reason: 'format' });
    const badPayload = JSON.stringify({ level: 'x' });
    const bad = { schemaVersion: SAVE_VERSION, savedAt: 'x', checksum: sha256(badPayload), payload: badPayload };
    expect(decodeSave(JSON.stringify(bad))).toMatchObject({ ok: false, reason: 'schema' });
  });

  it('比遊戲新的存檔版本：拒絕（不嘗試讀取）', () => {
    const payload = JSON.stringify(sample(1));
    const future = { schemaVersion: SAVE_VERSION + 1, savedAt: 'x', checksum: sha256(payload), payload };
    expect(decodeSave(JSON.stringify(future))).toMatchObject({ ok: false, reason: 'migration' });
  });
});

describe('Migration', () => {
  it('v0 假資料 → 目前版本：通過 Schema，修復後內容合理', () => {
    const v0 = {
      character: { level: 3, xp: 10, gold: 55 },
      skills: {
        learned: { 'basic.attack': 1, 'melee.heavy_slash': 2, 'magic.fireball': 1 },
        unspentPoints: 3,
        t4UnlockCharges: 0,
        t4UnlockedCategories: [],
        loadout: { left: 'basic.attack', right: ['melee.heavy_slash', 'magic.fireball', null], activeRight: 1 },
      },
      inventory: [{ uid: '1-000001', baseId: data.items.all[0]!.id, rarity: 'normal', itemLevel: 1, affixes: [] }],
      equipment: {},
      potions: 23,
      progress: { currentFloor: 2, highestFloor: 2, checkpoint: 'midway' },
    };
    const v1 = SaveDataSchema.parse(migrate(v0, 0));
    // v2：過去 2 級補發屬性點
    expect(v1.attributes).toEqual({ unspent: 6, allocated: {} });
    expect(v1.loadout.combos).toEqual([['melee.heavy_slash', null, null], ['magic.fireball', null, null], [null, null, null]]);
    expect(v1.loadout.activeCombo).toBe(1);
    expect(v1.inventory.cells.filter((c) => c?.kind === 'potion').map((c) => c?.kind === 'potion' && c.count)).toEqual([20, 3]);
    expect(v1.inventory.cells).toHaveLength(80);

    const { data: repaired } = repairSave(v1, data);
    expect(repaired.floor.mapId).toBe(generatedMapId(2));
    expect(repaired.counters.itemUidCounter).toBe(1);
    // v0 → v1 經由 Envelope 也能讀
    const payload = JSON.stringify(v0);
    const envelope = { schemaVersion: 0, savedAt: '2025-01-01T00:00:00.000Z', checksum: sha256(payload), payload };
    expect(decodeSave(JSON.stringify(envelope)).ok).toBe(true);
  });
});

describe('Migration v1 → v2（屬性點）', () => {
  it('舊角色補發過去每一級的屬性點；其他內容不變', () => {
    const { attributes: _drop, ...v1 } = { ...sample(5), character: { ...sample(5).character, level: 10 } };
    const v2 = SaveDataSchema.parse(migrate(v1, 1));
    expect(v2.attributes).toEqual({ unspent: 27, allocated: {} });
    expect(v2.character.level).toBe(10);
    expect(v2.character.gold).toBe(5);
    // 修復：與目前規則一致（每級 3 點）時不做改動
    expect(repairSave({ ...v2, skills: { ...v2.skills, unspentPoints: 2 + 9 } }, data).data.attributes).toEqual({ unspent: 27, allocated: {} });
  });
});

describe('Migration v3 → v4（怪物圖鑑）', () => {
  it('舊存檔從空的圖鑑開始', () => {
    const { bestiary: _drop, ...v3 } = sample(7);
    const v4 = SaveDataSchema.parse(migrate(v3, 3));
    expect(v4.bestiary).toEqual({});
    expect(v4.character.gold).toBe(7);
  });
});

describe('Migration v4 → v5（主倍率）', () => {
  it('舊裝備補上稀有度區間的中間值；飾品用飾品的區間；已經有的不變', () => {
    const v4 = structuredClone(sample(3)) as unknown as Record<string, unknown> & SaveData;
    v4.inventory.cells[1] = { kind: 'item', item: { uid: 'a', baseId: 'weapon.short_sword', rarity: 'rare', itemLevel: 3, affixes: [] } };
    v4.inventory.cells[2] = { kind: 'item', item: { uid: 'b', baseId: 'ring.plain', rarity: 'epic', itemLevel: 3, affixes: [] } };
    v4.equipment = { armor: { uid: 'c', baseId: 'armor.quilted', rarity: 'normal', itemLevel: 1, affixes: [] } };
    v4.inventory.cells[3] = { kind: 'item', item: { uid: 'd', baseId: 'boots.leather', rarity: 'magic', itemLevel: 1, affixes: [], quality: 0.3 } };
    const v5 = SaveDataSchema.parse(migrate(v4, 4));
    const item = (i: number) => (v5.inventory.cells[i] as { item: { quality?: number } }).item;
    expect(item(1).quality).toBeCloseTo(1.1);
    expect(item(2).quality).toBeCloseTo(0.525);
    expect(item(3).quality).toBeCloseTo(0.3);
    expect(v5.equipment.armor!.quality).toBe(0);
  });
});

describe('Migration v10 → v11（魔王門前存檔點、到過中途的樓層）', () => {
  it('魔王門前一律未啟動；目前這一層的中途已啟動時記為到過中途', () => {
    const make = (midwayActive: boolean) => {
      const v10 = structuredClone(sample(3)) as unknown as Record<string, unknown> & SaveData;
      const floor = v10.floor as Partial<SaveData['floor']>;
      delete floor.bossGateActive;
      delete floor.midwayFloors;
      floor.current = 4;
      floor.midwayActive = midwayActive;
      return SaveDataSchema.parse(migrate(v10, 10));
    };
    expect(make(true).floor).toMatchObject({ bossGateActive: false, midwayFloors: [4] });
    expect(make(false).floor).toMatchObject({ bossGateActive: false, midwayFloors: [] });
  });
});

describe('SaveService', () => {
  it('沒有存檔：empty', async () => {
    expect((await setup().service.load()).status).toBe('empty');
  });

  it('輪替：連存 4 次只有 3 份，最舊的被覆蓋；讀到最新的', async () => {
    const { storage, service } = setup();
    for (const gold of [1, 2, 3, 4]) await service.write(sample(gold));
    const slots = [...storage.data.keys()].filter((k) => k.startsWith('main.') && k !== 'main.pointer');
    expect(slots.sort()).toEqual(['main.0', 'main.1', 'main.2']);
    const golds = slots.map((k) => {
      const d = decodeSave(storage.data.get(k)!);
      return d.ok ? d.data.character.gold : -1;
    });
    expect(golds.sort()).toEqual([2, 3, 4]);
    expect((await loadedGold(new SaveService(storage))).data.character.gold).toBe(4);
  });

  it('最新存檔 Checksum 不符：退回次新的備份，並回報', async () => {
    const { storage, service } = setup();
    for (const gold of [1, 2, 3]) await service.write(sample(gold));
    const pointer = JSON.parse(storage.data.get('main.pointer')!) as { latest: number };
    const key = `main.${pointer.latest}`;
    storage.data.set(key, storage.data.get(key)!.replace('"gold\\":3', '"gold\\":999'));
    const result = await loadedGold(new SaveService(storage));
    expect(result.data.character.gold).toBe(2);
    expect(result.fellBack).toBe(true);
    expect(result.failures.map((f) => f.source)).toEqual([key]);
  });

  it('三份全壞：回傳 corrupt，不改動任何存檔', async () => {
    const { storage, service } = setup();
    for (const gold of [1, 2, 3]) await service.write(sample(gold));
    for (const k of ['main.0', 'main.1', 'main.2']) storage.data.set(k, 'garbage');
    const before = new Map(storage.data);
    const result = await new SaveService(storage).load();
    expect(result.status).toBe('corrupt');
    if (result.status === 'corrupt') expect(result.raw).toHaveLength(3);
    expect(storage.data).toEqual(before);
  });

  it('寫入途中失敗：pointer 仍指向舊存檔，舊存檔可讀', async () => {
    const { storage, service } = setup();
    await service.write(sample(1));
    storage.failWrites = true;
    await expect(service.write(sample(2))).rejects.toThrow();
    storage.failWrites = false;
    expect((await loadedGold(new SaveService(storage))).data.character.gold).toBe(1);
  });

  it('pointer 遺失：依存檔時間取最新的', async () => {
    const { storage, service } = setup();
    for (const gold of [1, 2, 3, 4]) await service.write(sample(gold));
    storage.data.delete('main.pointer');
    expect((await loadedGold(new SaveService(storage))).data.character.gold).toBe(4);
  });

  it('緊急副本（關閉分頁時寫的）比 IndexedDB 新：用緊急副本；比較舊：忽略', async () => {
    const { storage, emergency, service } = setup();
    await service.write(sample(1));
    service.writeEmergency(sample(2));
    expect((await loadedGold(new SaveService(storage, emergency))).data.character.gold).toBe(2);
    await service.write(sample(3));
    expect((await loadedGold(new SaveService(storage, emergency))).data.character.gold).toBe(3);
  });

  it('clear：刪除所有存檔與緊急副本', async () => {
    const { storage, emergency, service } = setup();
    await service.write(sample(1));
    service.writeEmergency(sample(1));
    await service.clear();
    expect(storage.data.size).toBe(0);
    expect(emergency.getItem(EMERGENCY_KEY)).toBeNull();
    expect((await service.load()).status).toBe('empty');
  });
});

describe('AutoSaver', () => {
  function autoSaver(capture: () => SaveData | null = () => sample(1)) {
    const { storage, emergency, service } = setup();
    const writes: string[] = [];
    const saver = new AutoSaver(service, capture, () => sample(9), { onSaved: (at) => writes.push(at) });
    const flush = () => new Promise((r) => setTimeout(r, 0));
    return { storage, emergency, saver, writes, flush };
  }

  it('節流：2 秒內 10 次 dirty 只寫 1 次；immediate 立即寫；60 秒保底', async () => {
    const { saver, writes, flush } = autoSaver();
    saver.update(0);
    for (let i = 0; i < 10; i++) {
      saver.markDirty();
      saver.update(0.1 * i);
    }
    await flush();
    expect(writes).toHaveLength(0);
    saver.update(2);
    await flush();
    expect(writes).toHaveLength(1);

    saver.markDirty(true);
    saver.update(2.1);
    await flush();
    expect(writes).toHaveLength(2);

    saver.update(30);
    await flush();
    expect(writes).toHaveLength(2);
    saver.update(62.2);
    await flush();
    expect(writes).toHaveLength(3);
  });

  it('capture 回傳 null（倒地中）時不寫，之後再試', async () => {
    let dead = true;
    const { saver, writes, flush } = autoSaver(() => (dead ? null : sample(1)));
    saver.update(0);
    saver.markDirty(true);
    saver.update(0.1);
    await flush();
    expect(writes).toHaveLength(0);
    dead = false;
    saver.update(0.2);
    await flush();
    expect(writes).toHaveLength(1);
  });

  it('flushSync：同步寫緊急副本；disable 後不再寫入', async () => {
    const { saver, emergency, storage, flush } = autoSaver();
    saver.flushSync();
    const text = emergency.getItem(EMERGENCY_KEY);
    expect(text).not.toBeNull();
    expect(decodeSave(text!)).toMatchObject({ ok: true, data: { character: { gold: 9 } } });
    await saver.disable();
    const before = new Map(storage.data);
    saver.markDirty(true);
    saver.update(100);
    saver.flushSync();
    await flush();
    expect(storage.data).toEqual(before);
  });
});

describe('存檔欄位', () => {
  it('三個欄位互不影響；欄位 1 沿用舊版的鍵（舊存檔自動成為欄位 1）', async () => {
    const storage = new MemoryStorage();
    const emergency = new MemoryStore();
    const slot = (n: number) => new SaveService(storage, emergency, clock(), n);
    await slot(1).write(sample(11));
    await slot(2).write(sample(22));
    expect((await loadedGold(slot(1))).data.character.gold).toBe(11);
    expect((await loadedGold(slot(2))).data.character.gold).toBe(22);
    expect((await slot(3).load()).status).toBe('empty');
    // 舊版（沒有欄位參數）讀到的就是欄位 1
    expect((await loadedGold(new SaveService(storage, emergency, clock()))).data.character.gold).toBe(11);
    // 各欄位的緊急副本分開
    slot(2).writeEmergency(sample(23));
    expect(emergency.getItem(EMERGENCY_KEY)).toBeNull();
    // 刪除欄位 2 不影響欄位 1
    await slot(2).clear();
    expect((await slot(2).load()).status).toBe('empty');
    expect((await loadedGold(slot(1))).data.character.gold).toBe(11);
  });

  it('立即存檔：等進行中的寫入完成後寫入；不適合存檔時回傳 null（forced 仍會存）', async () => {
    const { service } = setup();
    let alive = false;
    const saver = new AutoSaver(service, () => (alive ? sample(5) : null), () => sample(6));
    expect(await saver.saveNow()).toBeNull();
    expect(await saver.saveNow(true)).not.toBeNull();
    expect((await loadedGold(service)).data.character.gold).toBe(6);
    alive = true;
    expect(await saver.saveNow()).not.toBeNull();
    expect((await loadedGold(service)).data.character.gold).toBe(5);
  });
});
