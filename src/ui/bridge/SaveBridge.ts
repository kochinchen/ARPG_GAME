/**
 * UI → 存檔操作（匯出 / 匯入）。存檔不是遊戲狀態，不經過 CommandQueue；由 main.ts 連接到 SaveService。
 */
export interface SaveActions {
  exportSave(): void;
  importSave(file: File): void;
}

let actions: SaveActions | null = null;

export const saveBridge = {
  connect(value: SaveActions): void {
    actions = value;
  },
  exportSave(): void {
    actions?.exportSave();
  },
  importSave(file: File): void {
    actions?.importSave(file);
  },
};
