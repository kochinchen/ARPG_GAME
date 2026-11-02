import { z } from 'zod';
import type { DataRegistry } from '../data/DataRegistry';
import type { SharedStash, StashEntry } from '../game/items/SharedStash';
import type { AutoSaver } from './AutoSaver';
import { fixSavedItem } from './SaveRepair';
import { toCore, toItem } from './SaveMapper';
import { CoreInstanceSchema, ItemInstanceSchema } from './schema';
import { RotatingStore, type SyncStore } from './SaveService';
import { sha256 } from './sha256';
import type { ISaveStorage } from './storage/ISaveStorage';

/**
 * 共用倉庫的存檔（規格見 docs/SAVE_SYSTEM.md 第 10 節）：所有欄位共用一份，和角色存檔一樣有 3 份輪替備份與緊急副本。
 * 物品格式改變時（SAVE_VERSION 的 Migration 動到物品），STASH_VERSION 也要 + 1，並在 migrateStash 加一步。
 */
export const STASH_VERSION = 1;

const StashEntrySchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('item'), item: ItemInstanceSchema }), z.object({ kind: z.literal('core'), core: CoreInstanceSchema })]);
const StashDataSchema = z.object({ cells: z.array(StashEntrySchema.nullable()) });
export type StashData = z.infer<typeof StashDataSchema>;

const STASH_EMERGENCY_KEY = 'arpg-save.stash.emergency';

function migrateStash(data: unknown, fromVersion: number): unknown {
  if (fromVersion > STASH_VERSION) throw new Error(`倉庫存檔的版本 ${fromVersion} 比遊戲新`);
  return data;
}

export function encodeStash(data: StashData, savedAt: Date): string {
  const payload = JSON.stringify(data);
  return JSON.stringify({ kind: 'stash', schemaVersion: STASH_VERSION, savedAt: savedAt.toISOString(), checksum: sha256(payload), payload });
}

export type StashDecode = { ok: true; data: StashData; savedAt: string } | { ok: false; reason: string; message: string; savedAt?: string };

/** 信封 → Checksum → Migration → Schema；任何一步失敗都回傳原因，不丟例外 */
export function decodeStash(text: string): StashDecode {
  let envelope: { kind?: unknown; schemaVersion?: unknown; savedAt?: unknown; checksum?: unknown; payload?: unknown };
  try {
    envelope = JSON.parse(text) as typeof envelope;
  } catch {
    return { ok: false, reason: 'format', message: '不是有效的 JSON' };
  }
  const { kind, schemaVersion, savedAt, checksum, payload } = envelope ?? {};
  if (kind !== 'stash' || typeof schemaVersion !== 'number' || typeof savedAt !== 'string' || typeof checksum !== 'string' || typeof payload !== 'string') {
    return { ok: false, reason: 'format', message: '不是倉庫檔案' };
  }
  if (sha256(payload) !== checksum) return { ok: false, reason: 'checksum', message: 'Checksum 不符', savedAt };
  let migrated: unknown;
  try {
    migrated = migrateStash(JSON.parse(payload), schemaVersion);
  } catch (error) {
    return { ok: false, reason: 'migration', message: error instanceof Error ? error.message : String(error), savedAt };
  }
  const parsed = StashDataSchema.safeParse(migrated);
  if (!parsed.success) return { ok: false, reason: 'schema', message: parsed.error.message, savedAt };
  return { ok: true, data: parsed.data, savedAt };
}

export class StashService extends RotatingStore<StashData> {
  constructor(storage: ISaveStorage, emergency: SyncStore | null = null, now: () => Date = () => new Date()) {
    super(storage, emergency, now, 'stash', STASH_EMERGENCY_KEY, encodeStash, decodeStash);
  }
}

/** 讀檔時修正資料表刪改造成的不一致（和角色存檔同一套規則）；格數變少時往前補，放不下的才列在 notes。純函式 */
export function repairStash(input: StashData, data: DataRegistry): { data: StashData; notes: string[] } {
  const notes: string[] = [];
  const { pages, cols, rows } = data.balance.stash;
  const capacity = pages * cols * rows;
  const fixed = input.cells.map((entry) => {
    if (entry?.kind !== 'item') return entry;
    const item = fixSavedItem(entry.item, data, notes);
    return item ? { kind: 'item' as const, item } : null;
  });
  const cells = fixed.slice(0, capacity);
  while (cells.length < capacity) cells.push(null);
  let lost = 0;
  for (const entry of fixed.slice(capacity)) {
    if (!entry) continue;
    const empty = cells.indexOf(null);
    if (empty < 0) lost++;
    else cells[empty] = entry;
  }
  if (lost > 0) notes.push(`倉庫格數變少，有 ${lost} 件放不下`);
  return { data: { cells }, notes };
}

export function captureStash(stash: SharedStash): StashData {
  return { cells: stash.cells.map((c) => (c ? structuredClone(c) : null)) };
}

export function restoreStash(stash: SharedStash, data: StashData): void {
  stash.restore(data.cells.map((c): StashEntry | null => (c === null ? null : c.kind === 'item' ? { kind: 'item', item: toItem(c.item) } : { kind: 'core', core: toCore(c.core) })));
}

/**
 * 倉庫和角色存在兩個地方，兩邊要一起寫。物品有變動時：
 * 1. 同一個 JS 工作裡同步寫兩邊的緊急副本（localStorage）：讀檔時兩邊都用這份，等於同時寫入
 * 2. 再依序寫 IndexedDB：放進去先寫倉庫、拿出來先寫角色。沒有 localStorage、又剛好在兩次寫入之間當機時，最壞是多一件，不會少一件
 */
export class StashSync {
  private savedVersion: number;
  private savedCount: number;
  private pending: Promise<void> | null = null;
  private retryAt = 0;
  private stopped = false;

  constructor(
    private readonly stash: SharedStash,
    private readonly service: StashService,
    private readonly autoSaver: Pick<AutoSaver, 'flushEmergency' | 'saveNow'>,
    private readonly onError: (error: unknown) => void,
  ) {
    this.savedVersion = stash.version;
    this.savedCount = stash.count;
  }

  /** 每幀（Tick 結束後）呼叫 */
  update(nowSec: number): void {
    if (this.stopped || this.pending || this.stash.locked || this.stash.version === this.savedVersion || nowSec < this.retryAt) return;
    void this.persist(nowSec);
  }

  /** 等目前的寫入完成，並把還沒寫的變動寫完（返回標題、離開、匯入前呼叫） */
  async flush(): Promise<void> {
    await this.pending;
    if (!this.stash.locked && this.stash.version !== this.savedVersion) await this.persist(0);
  }

  /** 關閉分頁：同步寫緊急副本（角色的緊急副本由 AutoSaver 自己寫） */
  flushSync(): void {
    if (!this.stopped && !this.stash.locked && this.stash.version !== this.savedVersion) this.service.writeEmergency(captureStash(this.stash));
  }

  /** 之後不再寫入（匯入倉庫時，避免舊內容被寫回去） */
  async stop(): Promise<void> {
    this.stopped = true;
    await this.pending;
  }

  private persist(nowSec: number): Promise<void> {
    const version = this.stash.version;
    const count = this.stash.count;
    const data = captureStash(this.stash);
    this.service.writeEmergency(data);
    this.autoSaver.flushEmergency();
    const deposited = count > this.savedCount;
    this.pending = (async () => {
      try {
        if (deposited) await this.service.write(data);
        await this.autoSaver.saveNow(true);
        if (!deposited) await this.service.write(data);
        this.savedVersion = version;
        this.savedCount = count;
      } catch (error) {
        this.retryAt = nowSec + 2;
        this.onError(error);
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }
}
