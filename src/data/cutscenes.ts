import CUTSCENES from './cutscenes.json';

/**
 * 過場影片（舊紙繪圖 + 英文旁白 + 小字中文）：進入每一環的前導，與擊敗深淵統御者後的終章。
 * 文字在 cutscenes.json（scripts/prelude_audio.py 也讀它來產生旁白）；
 * 圖與聲音在 src/ui/cutscene/media/<media>-<幅>.jpg、<media>-<幅>-<句>.m4a。
 * 每個存檔只自動播一次（PlayerProgress.cutscenes），看過的可以在標題畫面重看。
 */
export interface CutsceneLine {
  en: string;
  zh: string;
}

export interface CutscenePanel {
  /** 圖檔名稱（不含副檔名） */
  image: string;
  title: string;
  lines: CutsceneLine[];
}

export type CutsceneTrigger =
  /** 第一次站在這一層（換層、讀檔、選層都算） */
  | { type: 'floor'; floor: number }
  /** 擊敗第 35 層的深淵統御者之後 */
  | { type: 'hiddenComplete' };

export interface CutsceneDef {
  id: string;
  trigger: CutsceneTrigger;
  /** 標題卡上的小字（第一層、終章…） */
  label: string;
  /** 聲音檔的前綴 */
  media: string;
  panels: CutscenePanel[];
}

export const cutscenes: readonly CutsceneDef[] = CUTSCENES as CutsceneDef[];
