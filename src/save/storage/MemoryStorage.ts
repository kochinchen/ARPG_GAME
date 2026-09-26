import type { ISaveStorage } from './ISaveStorage';

/** 測試用：存在記憶體；failWrites 可模擬寫入失敗 */
export class MemoryStorage implements ISaveStorage {
  readonly data = new Map<string, string>();
  failWrites = false;

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error('write failed');
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this.data.keys()];
  }
}
