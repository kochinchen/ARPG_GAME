import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import type { AffixDef, ItemBaseDef } from '../../data/schema/item';
import type { ItemInstance } from './ItemInstance';

/** 主倍率套用在哪裡：武器 = 基礎傷害、防具 = 基礎防禦、飾品 = 所有詞綴 */
export type MainRollTarget = 'damage' | 'defense' | 'affixes';

export interface ItemStats {
  base: ItemBaseDef;
  /** 基礎屬性（已套用主倍率） */
  baseStats: Partial<Record<StatId, number>>;
  /** 詞綴與實際數值（飾品已套用主倍率） */
  affixes: { def: AffixDef; value: number }[];
  /** 主倍率（0 = 無） */
  quality: number;
  mainTarget: MainRollTarget;
}

/** 主倍率的作用對象 */
export function mainTargetOf(base: ItemBaseDef): MainRollTarget {
  if (base.slot === 'weapon') return 'damage';
  if (base.slot === 'ring' || base.slot === 'amulet') return 'affixes';
  return 'defense';
}

/**
 * 一件物品實際提供的屬性（裝備時的 Modifier 與 Tooltip 共用，確保兩者一致）：
 * 主倍率只乘在基礎傷害（武器，法杖的法術強度不乘）或基礎防禦（防具）；飾品則乘在所有詞綴。
 */
export function itemStats(item: ItemInstance, data: Pick<DataRegistry, 'items' | 'affixes'>): ItemStats {
  const base = data.items.get(item.baseId);
  const quality = item.quality ?? 0;
  const mainTarget = mainTargetOf(base);
  const mult = 1 + quality;
  const baseStats: Partial<Record<StatId, number>> = { ...base.baseStats };
  if (mainTarget === 'damage') {
    if (baseStats.damageMin !== undefined) baseStats.damageMin = Math.round(baseStats.damageMin * mult);
    if (baseStats.damageMax !== undefined) baseStats.damageMax = Math.round(baseStats.damageMax * mult);
  } else if (mainTarget === 'defense' && baseStats.defense !== undefined) {
    baseStats.defense = Math.round(baseStats.defense * mult);
  }
  const affixes = item.affixes.map((a) => {
    const def = data.affixes.get(a.id);
    const raw = a.rolls[0] ?? 0;
    if (mainTarget !== 'affixes' || quality === 0) return { def, value: raw };
    const scaled = raw * mult;
    return { def, value: Number.isInteger(raw) ? Math.round(scaled) : Math.round(scaled * 10000) / 10000 };
  });
  return { base, baseStats, affixes, quality, mainTarget };
}
