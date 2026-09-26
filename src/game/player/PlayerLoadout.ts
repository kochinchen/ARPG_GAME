export type ComboKey = 0 | 1 | 2;
/** 一組連段的三個步驟 */
export type ComboSlots = [string | null, string | null, string | null];

/**
 * 按鍵配置：
 * - 左鍵：單一主動技能
 * - Q / W / E：各一組 3 步連段，右鍵依序施放目前選中的那一組
 * - Support：最多 3 個常駐被動
 */
export class PlayerLoadout {
  activeCombo: ComboKey = 0;

  constructor(
    public left: string,
    readonly combos: [ComboSlots, ComboSlots, ComboSlots],
    readonly supports: ComboSlots,
  ) {}

  select(key: ComboKey): void {
    this.activeCombo = key;
  }
}
