import type { SaveService } from './SaveService';
import type { SaveData } from './schema';

export interface AutoSaverOptions {
  /** dirty 後最多多久寫一次（秒） */
  throttleSec?: number;
  /** 保底寫入間隔（秒） */
  heartbeatSec?: number;
  onSaved?: (savedAt: string) => void;
  onError?: (error: unknown) => void;
}

/**
 * 自動存檔的時機（docs/SAVE_SYSTEM.md 第 3 節）：
 * - markDirty()：狀態有變，最多每 throttleSec 秒寫一次
 * - markDirty(true)：換層、啟動存檔點，下一幀立即寫
 * - 每 heartbeatSec 秒保底寫一次
 * - flushSync()：關閉分頁時同步寫緊急副本，並嘗試寫 IndexedDB
 * capture() 回傳 null 表示現在不適合存檔（例如玩家倒地中），會在下一幀再試。
 */
export class AutoSaver {
  private dirty = false;
  private immediate = false;
  private pending: Promise<void> | null = null;
  private disabled = false;
  private lastWrite: number | null = null;
  private readonly throttleSec: number;
  private readonly heartbeatSec: number;

  constructor(
    private readonly service: SaveService,
    /** 一般存檔的快照；不適合存檔時回傳 null */
    private readonly capture: () => SaveData | null,
    /** 強制存檔的快照（關閉分頁）：倒地中也要存，存成已重生的狀態 */
    private readonly captureForced: () => SaveData,
    private readonly options: AutoSaverOptions = {},
  ) {
    this.throttleSec = options.throttleSec ?? 2;
    this.heartbeatSec = options.heartbeatSec ?? 60;
  }

  markDirty(immediate = false): void {
    this.dirty = true;
    if (immediate) this.immediate = true;
  }

  /** 每幀（Tick 結束後）呼叫；nowSec 為單調遞增的秒數 */
  update(nowSec: number): void {
    if (this.disabled || this.pending) return;
    if (this.lastWrite === null) this.lastWrite = nowSec;
    const elapsed = nowSec - this.lastWrite;
    const due = this.immediate || (this.dirty && elapsed >= this.throttleSec) || elapsed >= this.heartbeatSec;
    if (!due) return;
    const data = this.capture();
    if (data === null) return;
    this.dirty = false;
    this.immediate = false;
    this.lastWrite = nowSec;
    void this.write(data);
  }

  /** 關閉分頁：同步寫緊急副本（一定完成），IndexedDB 盡量寫 */
  flushSync(): void {
    if (this.disabled) return;
    const data = this.captureForced();
    this.service.writeEmergency(data);
    if (!this.pending) void this.write(data);
  }

  /**
   * 停止所有自動存檔，並等待進行中的寫入完成。
   * 重置 / 匯入前使用：避免清除存檔後，進行中的寫入又把舊狀態寫回去。
   */
  async disable(): Promise<void> {
    this.disabled = true;
    await this.pending;
  }

  private write(data: SaveData): Promise<void> {
    this.pending = (async () => {
      try {
        const savedAt = await this.service.write(data);
        this.options.onSaved?.(savedAt);
      } catch (error) {
        // 寫入失敗：保持 dirty，下次節流時間到再試
        this.dirty = true;
        this.options.onError?.(error);
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }
}
