import { reactive } from 'vue';

/** 遊戲內問答框的狀態（`ask.ts` 放進來，`AskHost.vue` 顯示並回答） */
export interface AskItem {
  title: string;
  message: string;
  confirmLabel: string;
  /** null：只有一個按鈕（通知） */
  cancelLabel: string | null;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export const askState = reactive<{ current: AskItem | null }>({ current: null });
const queue: AskItem[] = [];

/** 一次只顯示一個，其餘排隊 */
export function enqueue(item: AskItem): void {
  if (askState.current) queue.push(item);
  else askState.current = item;
}

export function answer(ok: boolean): void {
  const item = askState.current;
  if (!item) return;
  askState.current = queue.shift() ?? null;
  item.resolve(ok);
}
