import type { ISaveStorage } from './ISaveStorage';

const DB_NAME = 'arpg-save';
const STORE = 'slots';

/** Web 版存檔：IndexedDB（比 localStorage 容量大、寫入有交易保證） */
export class IndexedDbStorage implements ISaveStorage {
  private db: Promise<IDBDatabase> | null = null;

  async get(key: string): Promise<string | null> {
    const result = await this.run<unknown>('readonly', (store) => store.get(key));
    return typeof result === 'string' ? result : null;
  }

  async put(key: string, value: string): Promise<void> {
    await this.run('readwrite', (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(key));
  }

  async keys(): Promise<string[]> {
    const keys = await this.run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    return keys.map(String);
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
    });
    return this.db;
  }

  /** 等交易 oncomplete 才 resolve：確保資料真的寫入 */
  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
    });
  }
}
