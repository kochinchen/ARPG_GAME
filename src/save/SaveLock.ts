/**
 * 同一個存檔只能在一個分頁中遊玩：用 Web Locks 取得存檔鎖，分頁關閉時自動釋放。
 * 不支援 Web Locks 的瀏覽器直接放行。
 */
export function acquireSaveLock(name = 'arpg-save'): Promise<boolean> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      // 持有到分頁關閉
      return new Promise<void>(() => {});
    });
  });
}
