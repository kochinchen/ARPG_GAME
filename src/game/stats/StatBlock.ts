import { ELEMENT_RESIST_STATS, type StatId } from '../../data/schema/common';

export type { StatId };

/** 全元素抗性：讀火、冰、雷、毒任何一種抗性時，連同它的基礎值與 Modifier 一起算 */
const ALL_ELEMENTS: StatId = 'elementResist';
const ELEMENT_RESISTS: ReadonlySet<StatId> = new Set(ELEMENT_RESIST_STATS);

/**
 * flat：加在基礎值上；increased：同類相加後一起乘；more：各自獨立相乘。
 * 最終值 = (base + Σflat) × (1 + Σincreased) × Π(1 + more)
 */
export type ModifierKind = 'flat' | 'increased' | 'more';

export interface StatModifier {
  stat: StatId;
  kind: ModifierKind;
  value: number;
  /** 來源識別（例如 'item:uid-123'、'buff:battle_cry'），移除時使用 */
  source: string;
}

/**
 * 角色屬性：基礎值 + Modifier 清單。裝備、Buff、被動技能、Elite 詞綴全部透過 Modifier 影響屬性。
 */
export class StatBlock {
  private readonly base = new Map<StatId, number>();
  private modifiers: StatModifier[] = [];
  private readonly cache = new Map<StatId, number>();

  constructor(base: Partial<Record<StatId, number>> = {}) {
    for (const [stat, value] of Object.entries(base) as [StatId, number][]) this.base.set(stat, value);
  }

  get(stat: StatId): number {
    const cached = this.cache.get(stat);
    if (cached !== undefined) return cached;

    const shared = ELEMENT_RESISTS.has(stat) ? ALL_ELEMENTS : null;
    let flat = shared ? this.getBase(shared) : 0;
    let increased = 0;
    let more = 1;
    for (const m of this.modifiers) {
      if (m.stat !== stat && m.stat !== shared) continue;
      if (m.kind === 'flat') flat += m.value;
      else if (m.kind === 'increased') increased += m.value;
      else more *= 1 + m.value;
    }
    const value = (this.getBase(stat) + flat) * (1 + increased) * more;
    this.cache.set(stat, value);
    return value;
  }

  getBase(stat: StatId): number {
    return this.base.get(stat) ?? 0;
  }

  setBase(stat: StatId, value: number): void {
    this.base.set(stat, value);
    this.invalidate(stat);
  }

  addModifier(modifier: StatModifier): void {
    this.modifiers.push(modifier);
    this.invalidate(modifier.stat);
  }

  private invalidate(stat: StatId): void {
    this.cache.delete(stat);
    if (stat === ALL_ELEMENTS) for (const resist of ELEMENT_RESISTS) this.cache.delete(resist);
  }

  /** 移除某個來源的全部 Modifier（例如脫下裝備） */
  removeBySource(source: string): void {
    this.modifiers = this.modifiers.filter((m) => m.source !== source);
    this.cache.clear();
  }
}
