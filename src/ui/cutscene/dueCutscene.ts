import type { CutsceneDef } from '../../data/cutscenes';

export interface CutsceneState {
  /** 目前所在樓層 */
  floor: number;
  /** 已擊敗第 35 層的深淵統御者 */
  completedHidden: boolean;
  /** 這個存檔看過的過場影片 */
  seen: ReadonlySet<string>;
}

/** 現在應該自動播放的過場影片（還沒看過、條件成立的第一部）；沒有則回傳 null */
export function dueCutscene(list: readonly CutsceneDef[], state: CutsceneState): CutsceneDef | null {
  for (const def of list) {
    if (state.seen.has(def.id)) continue;
    const t = def.trigger;
    if (t.type === 'floor' ? state.floor === t.floor : state.completedHidden) return def;
  }
  return null;
}

/** 標題畫面「過場影片」：任一存檔看過的都可以重看 */
export function watchedCutscenes(list: readonly CutsceneDef[], perSlot: readonly (readonly string[])[]): Set<string> {
  const seen = new Set(perSlot.flat());
  return new Set(list.filter((d) => seen.has(d.id)).map((d) => d.id));
}
