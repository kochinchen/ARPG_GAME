import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import type { EquipSlot, Rarity } from '../../data/schema/item';
import type { ModifierKind } from '../stats/StatBlock';
import type { ItemInstance } from './ItemInstance';

export interface ItemDescription {
  name: string;
  rarity: Rarity;
  slot: EquipSlot;
  /** 基底屬性（傷害、防禦…） */
  baseLines: string[];
  /** 詞綴 */
  affixLines: string[];
  /** baseLines + affixLines */
  lines: string[];
}

export const STAT_LABELS: Record<StatId, string> = {
  maxHp: '生命上限',
  maxMana: '魔力上限',
  manaRegen: '魔力回復 / 秒',
  moveSpeed: '移動速度',
  damageMin: '最小傷害',
  damageMax: '最大傷害',
  attackSpeed: '攻擊速度',
  attackRange: '攻擊距離',
  critChance: '暴擊率',
  defense: '防禦',
};

/** 以百分比顯示的屬性 */
const PERCENT_STATS: ReadonlySet<StatId> = new Set(['critChance']);

export const SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: '武器',
  helmet: '頭盔',
  armor: '盔甲',
  gloves: '手套',
  boots: '鞋子',
  ring: '戒指',
  amulet: '護身符',
};

/**
 * 由 ItemInstance（ID + 擲骰值）推導顯示用的名稱與屬性說明。
 */
export function describeItem(item: ItemInstance, data: Pick<DataRegistry, 'items' | 'affixes'>): ItemDescription {
  const base = data.items.get(item.baseId);
  const affixes = item.affixes.map((a) => ({ def: data.affixes.get(a.id), value: a.rolls[0] ?? 0 }));

  // Magic：第一個詞綴 + 基底名稱（例如「鋒利的短劍」）；其他稀有度顯示基底名稱
  const name = item.rarity === 'magic' && affixes[0] ? `${affixes[0].def.name}${base.name}` : base.name;

  const baseLines: string[] = [];
  const { damageMin, damageMax, ...rest } = base.baseStats;
  if (damageMin !== undefined || damageMax !== undefined) baseLines.push(`傷害 ${damageMin ?? 0}–${damageMax ?? 0}`);
  for (const [stat, value] of Object.entries(rest) as [StatId, number][]) {
    baseLines.push(`${STAT_LABELS[stat]} ${formatValue(stat, 'flat', value, false)}`);
  }
  const affixLines = affixes.map(({ def, value }) => `${formatValue(def.stat, def.modifier, value, true)} ${STAT_LABELS[def.stat]}`);
  return { name, rarity: item.rarity, slot: base.slot, baseLines, affixLines, lines: [...baseLines, ...affixLines] };
}

export function formatValue(stat: StatId, kind: ModifierKind, value: number, signed: boolean): string {
  const sign = signed && value >= 0 ? '+' : '';
  if (kind !== 'flat' || PERCENT_STATS.has(stat)) return `${sign}${Math.round(value * 100)}%`;
  return `${sign}${Number.isInteger(value) ? value : value.toFixed(1)}`;
}
