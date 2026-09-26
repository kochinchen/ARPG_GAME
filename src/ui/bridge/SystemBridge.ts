/**
 * UI → 遊戲以外的系統操作：暫停、存檔匯出 / 匯入、開新角色。
 * 這些不是遊戲狀態，不經過 CommandQueue；由 main.ts 連接。
 */
export interface SystemActions {
  setPaused(paused: boolean): void;
  exportSave(): void;
  importSave(file: File): void;
  /** 刪除所有存檔並重新開始（呼叫前由 UI 確認） */
  newCharacter(): void;
}

let actions: SystemActions | null = null;

export const systemBridge = {
  connect(value: SystemActions): void {
    actions = value;
  },
  setPaused(paused: boolean): void {
    actions?.setPaused(paused);
  },
  exportSave(): void {
    actions?.exportSave();
  },
  importSave(file: File): void {
    actions?.importSave(file);
  },
  newCharacter(): void {
    actions?.newCharacter();
  },
};
