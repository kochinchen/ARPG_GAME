/** 連段的按鍵數：Q / W / E / R / A / S / D */
export const COMBO_COUNT = 7;
/** 各組連段的按鍵（顯示與輸入共用） */
export const COMBO_KEY_LABELS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D'] as const;
export type ComboKeyLabel = (typeof COMBO_KEY_LABELS)[number];
/** 第幾組連段（0 = Q … 6 = D） */
export type ComboKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** 一組連段的三個步驟 */
export type ComboSlots = [string | null, string | null, string | null];

/**
 * 按鍵配置：
 * - 左鍵：單一主動技能
 * - Q / W / E / R / A / S / D：各一組 3 步連段（依等級解鎖），右鍵依序施放目前選中的那一組
 * - Support：最多 3 個常駐被動
 */
export class PlayerLoadout {
  activeCombo: ComboKey = 0;

  constructor(
    public left: string,
    /** 長度 COMBO_COUNT */
    readonly combos: ComboSlots[],
    readonly supports: ComboSlots,
  ) {}

  select(key: ComboKey): void {
    this.activeCombo = key;
  }
}
