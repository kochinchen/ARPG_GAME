/**
 * 已發現的 Combo（存檔內容）。只記錄已發現的條目；未發現的「???」由 UI 即時判斷。
 * 戰鬥邏輯不讀取 Codex。
 */
export interface ComboCodexEntry {
  comboId: string;
  ruleId: string;
  comboName: string;
  skills: [string, string, string];
  firstDiscoveredAt: number;
  timesUsed: number;
  effectDescription: string[];
}

export class ComboCodex {
  private readonly entries = new Map<string, ComboCodexEntry>();
  private _version = 0;

  get version(): number {
    return this._version;
  }

  get all(): ComboCodexEntry[] {
    return [...this.entries.values()].sort((a, b) => a.firstDiscoveredAt - b.firstDiscoveredAt);
  }

  has(comboId: string): boolean {
    return this.entries.has(comboId);
  }

  get(comboId: string): ComboCodexEntry | undefined {
    return this.entries.get(comboId);
  }

  /** 記錄一次完整施放；回傳是否為第一次發現 */
  record(entry: Omit<ComboCodexEntry, 'timesUsed' | 'firstDiscoveredAt'>, now: number): boolean {
    const existing = this.entries.get(entry.comboId);
    this._version++;
    if (existing) {
      existing.timesUsed++;
      return false;
    }
    this.entries.set(entry.comboId, { ...entry, firstDiscoveredAt: now, timesUsed: 1 });
    return true;
  }
}
