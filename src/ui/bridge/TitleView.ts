/** 標題畫面上每個存檔欄位的摘要（由 main.ts 讀取存檔後提供） */
export interface SlotSummary {
  slot: number;
  status: 'empty' | 'ok' | 'corrupt';
  level?: number;
  floor?: number;
  highestFloor?: number;
  /** 已通關（第 30 層）/ 已完成隱藏難關（第 35 層） */
  cleared?: boolean;
  completedHidden?: boolean;
  /** 讀檔時可以選擇前往的樓層（空 = 只能從存檔位置繼續；docs/ENDGAME.md 第 2 節） */
  floors?: number[];
  /** 顯示用的存檔時間 */
  savedAt?: string;
}

export interface TitleState {
  slots: SlotSummary[];
  /** 上次遊玩的欄位（「繼續遊戲」） */
  lastSlot: number | null;
  /** 版本字串（標題畫面右下角） */
  version: string;
  /** 瀏覽器還不允許出聲（第一次點擊 / 按鍵之後才會有音樂） */
  soundLocked?: boolean;
}
