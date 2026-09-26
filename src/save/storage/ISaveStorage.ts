/**
 * 存檔的儲存位置。Web 版用 IndexedDB；未來桌面版（Tauri 本機檔案）、雲端存檔各實作一份。
 * 見 ARCHITECTURE.md 第 1.4 節、第 F 節。
 */
export interface ISaveStorage {
  get(key: string): Promise<string | null>;
  /** 寫入完成（交易 commit）後才 resolve；失敗時 reject */
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}
