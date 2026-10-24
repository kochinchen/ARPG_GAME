import { reactive } from 'vue';

/**
 * UI → 畫面設定（不是遊戲狀態，不經過 CommandQueue；存在瀏覽器，由 main.ts 連接 Renderer）。
 */
export interface DisplayState {
  /** 顯示頭盔（關掉時主角露出臉與頭髮；頭盔的屬性照常生效） */
  showHelmet: boolean;
}

const KEY = 'arpg.display';
/** 目前的遊戲畫面（每次開始遊戲重新連接，只保留最新的一個） */
let listener: ((state: DisplayState) => void) | null = null;

/** 角色預覽的區域（畫面座標）與方向；null = 關閉 */
export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
  dir: number;
}
let previewListener: ((rect: PreviewRect | null) => void) | null = null;
let lastPreview: PreviewRect | null = null;

/** 地圖：切換小地圖 / 全地圖、小地圖右邊讓出的寬度 */
export interface MapControl {
  toggle(): void;
  setRightInset(px: number): void;
}
let map: MapControl | null = null;
let lastInset = 0;

function load(): DisplayState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DisplayState>;
    return { showHelmet: raw.showHelmet !== false };
  } catch {
    return { showHelmet: true };
  }
}

export const display = reactive<DisplayState>(load());

export const displayBridge = {
  /** 連接遊戲畫面（立刻用目前的設定呼叫一次） */
  connect(value: (state: DisplayState) => void): void {
    listener = value;
    listener({ ...display });
  },
  /** 連接角色預覽（由遊戲畫面在預覽區畫出主角） */
  connectPreview(value: (rect: PreviewRect | null) => void): void {
    previewListener = value;
    value(lastPreview);
  },
  connectMap(value: MapControl): void {
    map = value;
    value.setRightInset(lastInset);
  },
  toggleMap(): void {
    map?.toggle();
  },
  setMapInset(px: number): void {
    lastInset = px;
    map?.setRightInset(px);
  },
  setPreview(rect: PreviewRect | null): void {
    lastPreview = rect;
    previewListener?.(rect);
  },
  set(patch: Partial<DisplayState>): void {
    Object.assign(display, patch);
    try {
      localStorage.setItem(KEY, JSON.stringify(display));
    } catch {
      // 瀏覽器不允許儲存：只在這次遊戲中生效
    }
    listener?.({ ...display });
  },
};
