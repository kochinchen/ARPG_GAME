import type { ISaveStorage } from './ISaveStorage';

const PREFIX = 'arpg-save.store.';

/**
 * 備用的存檔位置：瀏覽器不允許 IndexedDB 時（例如部分瀏覽器以 file:// 開啟可攜版）改用 localStorage。
 * 容量較小（約 5MB），但存檔只有數十 KB，足夠三個欄位與輪替備份。
 */
export class LocalStorageStorage implements ISaveStorage {
  constructor(private readonly store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>) {}

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.getItem(PREFIX + key));
  }

  put(key: string, value: string): Promise<void> {
    try {
      this.store.setItem(PREFIX + key, value);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  delete(key: string): Promise<void> {
    this.store.removeItem(PREFIX + key);
    return Promise.resolve();
  }

  keys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < this.store.length; i++) {
      const k = this.store.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
    return Promise.resolve(keys);
  }
}
