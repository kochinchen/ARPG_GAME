import { decodeSave, encodeSave } from './Envelope';
import type { SaveData } from './schema';
import type { ISaveStorage } from './storage/ISaveStorage';

/** 每個存檔欄位的輪替備份份數 */
export const SLOT_COUNT = 3;
/** 存檔欄位數（標題畫面的「讀取存檔」） */
export const SAVE_SLOTS = 3;
export const EMERGENCY_KEY = 'arpg-save.emergency';
/** 存檔欄位 → 鍵的前綴（欄位 1 沿用舊版的鍵，舊存檔自動成為欄位 1） */
const prefixOf = (slot: number) => (slot === 1 ? 'main' : `slot${slot}`);
/** 各欄位的緊急副本（localStorage） */
export const emergencyKeyOf = (slot: number) => (slot === 1 ? EMERGENCY_KEY : `${EMERGENCY_KEY}.slot${slot}`);

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
  private readonly prefix: string;
  private readonly emergencyKey: string;

  constructor(
    private readonly storage: ISaveStorage,
    private readonly emergency: SyncStore | null = null,
    private readonly now: () => Date = () => new Date(),
    /** 存檔欄位（1～SAVE_SLOTS） */
    readonly slot = 1,
  ) {
    this.prefix = prefixOf(slot);
    this.emergencyKey = emergencyKeyOf(slot);
  }

  private slotKey(i: number): string {
    return `${this.prefix}.${i}`;
  }

  private get pointerKey(): string {
    return `${this.prefix}.pointer`;
  }

  async load(): Promise<LoadResult> {
    const pointer = await this.readPointer();
    const order = pointer === null ? [0, 1, 2] : [0, 1, 2].map((k) => (pointer - k + SLOT_COUNT) % SLOT_COUNT);
    const candidates: Candidate[] = [];
    for (const i of order) {
      const text = await this.storage.get(this.slotKey(i));
      if (text !== null) candidates.push({ source: this.slotKey(i), text });
    }
    const emergencyText = this.readEmergency();
    if (emergencyText !== null) candidates.push({ source: this.emergencyKey, text: emergencyText });
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
    const slots = valid.filter((v) => v.source !== this.emergencyKey);
    let chosen = pointer === null ? [...slots].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] : slots[0];
    const emergency = valid.find((v) => v.source === this.emergencyKey);
    if (emergency && (!chosen || emergency.savedAt > chosen.savedAt)) chosen = emergency;
    chosen ??= valid[0]!;

    this.latest = pointer;
    const newest = pointer === null ? null : this.slotKey(pointer);
    const fellBack = newest !== null && failures.some((f) => f.source === newest);
    return { status: 'ok', data: chosen.data, savedAt: chosen.savedAt, source: chosen.source, fellBack, failures };
  }

  /** 寫入下一個輪替位置；成功後才更新 pointer。回傳存檔時間 */
  async write(data: SaveData): Promise<string> {
    if (this.latest === null) this.latest = await this.readPointer();
    const next = this.latest === null ? 0 : (this.latest + 1) % SLOT_COUNT;
    const savedAt = this.now();
    await this.storage.put(this.slotKey(next), encodeSave(data, savedAt));
    await this.storage.put(this.pointerKey, JSON.stringify({ latest: next, savedAt: savedAt.toISOString() }));
    this.latest = next;
    return savedAt.toISOString();
  }

  /** 同步寫入緊急副本（關閉分頁時 IndexedDB 不保證寫完）。空間不足時放棄 */
  writeEmergency(data: SaveData): boolean {
    if (!this.emergency) return false;
    try {
      this.emergency.setItem(this.emergencyKey, encodeSave(data, this.now()));
      return true;
    } catch {
      return false;
    }
  }

  /** 清除所有存檔（開發用重置、開新角色） */
  async clear(): Promise<void> {
    for (let i = 0; i < SLOT_COUNT; i++) await this.storage.delete(this.slotKey(i));
    await this.storage.delete(this.pointerKey);
    this.emergency?.removeItem(this.emergencyKey);
    this.latest = null;
  }

  /** 所有存檔的原始內容（讀檔失敗時讓玩家匯出，之後可以人工救回） */
  async dumpRaw(): Promise<Candidate[]> {
    const raw: Candidate[] = [];
    for (const key of [...Array.from({ length: SLOT_COUNT }, (_, i) => this.slotKey(i)), this.pointerKey]) {
      const text = await this.storage.get(key);
      if (text !== null) raw.push({ source: key, text });
    }
    const emergency = this.readEmergency();
    if (emergency !== null) raw.push({ source: this.emergencyKey, text: emergency });
    return raw;
  }

  private async readPointer(): Promise<number | null> {
    try {
      const text = await this.storage.get(this.pointerKey);
      if (text === null) return null;
      const latest = (JSON.parse(text) as { latest?: unknown }).latest;
      return typeof latest === 'number' && Number.isInteger(latest) && latest >= 0 && latest < SLOT_COUNT ? latest : null;
    } catch {
      return null;
    }
  }

  private readEmergency(): string | null {
    try {
      return this.emergency?.getItem(this.emergencyKey) ?? null;
    } catch {
      return null;
    }
  }
}
