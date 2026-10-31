import { createApp } from 'vue';
import { enqueue } from './askState';
import AskHost from './components/AskHost.vue';

/**
 * 遊戲內的問答框（取代瀏覽器的 confirm / alert）。
 * 自己掛一個小 Vue 應用在最上層：標題畫面、遊戲中、損毀存檔畫面都能用
 */
export interface AskOptions {
  title: string;
  /** 內文；換行會照原樣顯示 */
  message?: string;
  confirmLabel?: string;
  /** null：只有確定按鈕（通知用） */
  cancelLabel?: string | null;
  /** 確定按鈕是危險動作（刪除、覆蓋、無法復原） */
  danger?: boolean;
}

let mounted = false;
function mount(): void {
  if (mounted) return;
  mounted = true;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1000';
  document.body.appendChild(el);
  createApp(AskHost).mount(el);
}

/** 問一個是 / 否的問題，按確定回傳 true */
export function ask(options: AskOptions): Promise<boolean> {
  mount();
  return new Promise((resolve) =>
    enqueue({
      title: options.title,
      message: options.message ?? '',
      confirmLabel: options.confirmLabel ?? '確定',
      cancelLabel: options.cancelLabel === undefined ? '取消' : options.cancelLabel,
      danger: options.danger ?? false,
      resolve,
    }),
  );
}

/** 只有一個「知道了」按鈕的通知 */
export async function tell(title: string, message = ''): Promise<void> {
  await ask({ title, message, confirmLabel: '知道了', cancelLabel: null });
}
