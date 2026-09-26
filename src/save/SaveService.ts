import { decodeSave, encodeSave } from './Envelope';
import type { SaveData } from './schema';
import type { ISaveStorage } from './storage/ISaveStorage';

/** 輪替備份份數 */
export const SLOT_COUNT = 3;
const slotKey = (i: number) => `main.${i}`;
const POINTER_KEY = 'main.pointer';
export const EMERGENCY_KEY = 'arpg-save.emergency';

/** 同步的鍵值儲存（localStorage 的子集）：關閉分頁時的緊急副本 */
export type SyncStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface Candidate {
  source: string;
  text: string;
}

export interface LoadFailure {
  source: string;
  reason: string;
  savedAt?: string | undefined;
}

export type LoadResult =
  | { status: 'empty' }
  | {
      status: 'ok';
      data: SaveData;
      savedAt: string;
      source: string;
      /** 最新的存檔讀不進來，改用了備份 */
      fellBack: boolean;
      failures: LoadFailure[];
    }
  | { status: 'corrupt'; failures: LoadFailure[]; raw: Candidate[] };

/**
 * 存 / 讀 / 輪替備份 / Checksum 驗證（規格見 docs/SAVE_SYSTEM.md 第 5 節）。
 * - 寫入：寫到下一個輪替位置，成功後才更新 pointer（寫到一半失敗，pointer 仍指向完整的舊存檔）
 * - 讀取：pointer 指向的最新 → 次新 → 最舊，另外比較緊急副本；第一份完全通過的就用它
 * - 全部失敗：回傳 corrupt，絕不自動覆蓋
 */
export class SaveService {
  private latest: number | null = null;

  constructor(
    private readonly storage: ISaveStorage,
    private readonly emergency: SyncStore | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async load(): Promise<LoadResult> {
    const pointer = await this.readPointer();
    const order = pointer === null ? [0, 1, 2] : [0, 1, 2].map((k) => (pointer - k + SLOT_COUNT) % SLOT_COUNT);
    const candidates: Candidate[] = [];
    for (const i of order) {
      const text = await this.storage.get(slotKey(i));
      if (text !== null) candidates.push({ source: slotKey(i), text });
    }
    const emergencyText = this.readEmergency();
    if (emergencyText !== null) candidates.push({ source: EMERGENCY_KEY, text: emergencyText });
    if (candidates.length === 0) return { status: 'empty' };

    const failures: LoadFailure[] = [];
    const valid: { source: string; data: SaveData; savedAt: string }[] = [];
    for (const c of candidates) {
      const result = decodeSave(c.text);
      if (result.ok) valid.push({ source: c.source, data: result.data, savedAt: result.savedAt });
      else failures.push({ source: c.source, reason: `${result.reason}: ${result.message}`, savedAt: result.savedAt });
    }
    if (valid.length === 0) return { status: 'corrupt', failures, raw: candidates };

    // 有 pointer 時依輪替順序取第一份有效的；緊急副本（或沒有 pointer 時）以存檔時間較新者為準
    const slots = valid.filter((v) => v.source !== EMERGENCY_KEY);
    let chosen = pointer === null ? [...slots].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] : slots[0];
    const emergency = valid.find((v) => v.source === EMERGENCY_KEY);
    if (emergency && (!chosen || emergency.savedAt > chosen.savedAt)) chosen = emergency;
    chosen ??= valid[0]!;

    this.latest = pointer;
    const newest = pointer === null ? null : slotKey(pointer);
    const fellBack = newest !== null && failures.some((f) => f.source === newest);
    return { status: 'ok', data: chosen.data, savedAt: chosen.savedAt, source: chosen.source, fellBack, failures };
  }

  /** 寫入下一個輪替位置；成功後才更新 pointer。回傳存檔時間 */
  async write(data: SaveData): Promise<string> {
    if (this.latest === null) this.latest = await this.readPointer();
    const next = this.latest === null ? 0 : (this.latest + 1) % SLOT_COUNT;
    const savedAt = this.now();
    await this.storage.put(slotKey(next), encodeSave(data, savedAt));
    await this.storage.put(POINTER_KEY, JSON.stringify({ latest: next, savedAt: savedAt.toISOString() }));
    this.latest = next;
    return savedAt.toISOString();
  }

  /** 同步寫入緊急副本（關閉分頁時 IndexedDB 不保證寫完）。空間不足時放棄 */
  writeEmergency(data: SaveData): boolean {
    if (!this.emergency) return false;
    try {
      this.emergency.setItem(EMERGENCY_KEY, encodeSave(data, this.now()));
      return true;
    } catch {
      return false;
    }
  }

  /** 清除所有存檔（開發用重置、開新角色） */
  async clear(): Promise<void> {
    for (let i = 0; i < SLOT_COUNT; i++) await this.storage.delete(slotKey(i));
    await this.storage.delete(POINTER_KEY);
    this.emergency?.removeItem(EMERGENCY_KEY);
    this.latest = null;
  }

  /** 所有存檔的原始內容（讀檔失敗時讓玩家匯出，之後可以人工救回） */
  async dumpRaw(): Promise<Candidate[]> {
    const raw: Candidate[] = [];
    for (const key of [...Array.from({ length: SLOT_COUNT }, (_, i) => slotKey(i)), POINTER_KEY]) {
      const text = await this.storage.get(key);
      if (text !== null) raw.push({ source: key, text });
    }
    const emergency = this.readEmergency();
    if (emergency !== null) raw.push({ source: EMERGENCY_KEY, text: emergency });
    return raw;
  }

  private async readPointer(): Promise<number | null> {
    try {
      const text = await this.storage.get(POINTER_KEY);
      if (text === null) return null;
      const latest = (JSON.parse(text) as { latest?: unknown }).latest;
      return typeof latest === 'number' && Number.isInteger(latest) && latest >= 0 && latest < SLOT_COUNT ? latest : null;
    } catch {
      return null;
    }
  }

  private readEmergency(): string | null {
    try {
      return this.emergency?.getItem(EMERGENCY_KEY) ?? null;
    } catch {
      return null;
    }
  }
}
