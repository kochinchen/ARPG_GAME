import { MATERIAL_IDS, type MaterialId } from '../../data/schema/item';

/** 玩家持有的材料（武器精華、防具精華、飛昇碎片）；存檔內容 */
export class Materials {
  private readonly counts = new Map<MaterialId, number>(MATERIAL_IDS.map((id) => [id, 0]));
  private _version = 0;

  get version(): number {
    return this._version;
  }

  get(id: MaterialId): number {
    return this.counts.get(id) ?? 0;
  }

  add(id: MaterialId, amount: number): void {
    if (amount === 0) return;
    this.counts.set(id, Math.max(0, this.get(id) + amount));
    this._version++;
  }

  /** 夠的話扣除並回傳 true */
  spend(cost: Partial<Record<MaterialId, number>>): boolean {
    if (!this.has(cost)) return false;
    for (const [id, n] of Object.entries(cost) as [MaterialId, number][]) this.add(id, -n);
    return true;
  }

  has(cost: Partial<Record<MaterialId, number>>): boolean {
    return (Object.entries(cost) as [MaterialId, number][]).every(([id, n]) => this.get(id) >= n);
  }

  snapshot(): Record<MaterialId, number> {
    return Object.fromEntries(MATERIAL_IDS.map((id) => [id, this.get(id)])) as Record<MaterialId, number>;
  }

  restore(values: Partial<Record<MaterialId, number>>): void {
    for (const id of MATERIAL_IDS) this.counts.set(id, Math.max(0, Math.floor(values[id] ?? 0)));
    this._version++;
  }
}
