import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import type { AffixDef, ItemBaseDef } from '../../data/schema/item';
import type { LegendaryDef } from '../../data/schema/legendary';
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
export function itemStats(item: ItemInstance, data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>): ItemStats {
  const base = data.items.get(item.baseId);
  const legendary = item.legendaryId !== undefined && data.legendaries.has(item.legendaryId) ? data.legendaries.get(item.legendaryId) : null;
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
  // 傳奇 / 神話：固定屬性行（主倍率只作用在基礎攻防；飾品沒有主倍率）
  if (legendary) return { base, baseStats, affixes: legendaryAffixes(legendary, item), quality, mainTarget };
  const affixes = item.affixes.map((a) => {
    const def = data.affixes.get(a.id);
    const raw = a.rolls[0] ?? 0;
    if (mainTarget !== 'affixes' || quality === 0) return { def, value: raw };
    const scaled = raw * mult;
    return { def, value: Number.isInteger(raw) ? Math.round(scaled) : Math.round(scaled * 10000) / 10000 };
  });
  return { base, baseStats, affixes, quality, mainTarget };
}

/** 傳奇 / 神話的固定屬性行，轉成與詞綴相同的格式（裝備與 Tooltip 共用） */
function legendaryAffixes(def: LegendaryDef, item: ItemInstance): ItemStats['affixes'] {
  const rolls = item.legendaryRolls ?? [];
  const out: ItemStats['affixes'] = [];
  let n = 0;
  def.lines.forEach((line, i) => {
    if (line.type !== 'stat') return;
    const value = rolls[n] ?? (line.value[0] + line.value[1]) / 2;
    n++;
    out.push({
      def: {
        id: `${def.id}#${i}`,
        name: '',
        kind: line.strong ? 'strong' : 'item',
        stat: line.stat,
        modifier: line.modifier,
        value: line.value,
        minItemLevel: 0,
        weight: 1,
        growth: line.growth,
      },
      value,
    });
  });
  return out;
}
