import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import { RARITY_LABELS, WEAPON_TYPE_LABELS, type EquipSlot, type Rarity } from '../../data/schema/item';
import type { ModifierKind } from '../stats/StatBlock';
import type { ItemInstance } from './ItemInstance';
import { nameItem } from './ItemNamer';
import { itemStats, type MainRollTarget } from './ItemStats';

const MAIN_LABELS: Record<MainRollTarget, string> = { damage: '武器傷害', spellPower: '法術強度', defense: '防禦', affixes: '所有詞綴' };

export interface ItemDescription {
  name: string;
  /** 名稱下方的類型說明，例如「史詩 短劍」「稀有 劍 · 長劍」 */
  subtitle: string;
  rarity: Rarity;
  slot: EquipSlot;
  /** 基底屬性（傷害、防禦…） */
  baseLines: string[];
  /** 主倍率，例如「武器傷害 +180%」「所有詞綴 +45%」（沒有時為 null） */
  mainLine: string | null;
  /** 強屬性（紫 1、橘 2、紅 3） */
  strongLines: string[];
  /** 普通詞綴 */
  affixLines: string[];
  /** 傳奇 / 神話：定位、固定屬性與效果（依設計順序）、介紹；其他稀有度為 null */
  legendary: { role: string; lore: string; lines: { text: string; kind: 'normal' | 'strong' | 'unique' }[] } | null;
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
  spellPower: '法術強度',
  attackSpeed: '攻擊速度',
  castSpeed: '施法速度',
  attackRange: '攻擊距離',
  critChance: '暴擊率',
  defense: '防禦',
  damageBonus: '傷害',
  meleeDamageBonus: '近戰傷害',
  rangedDamageBonus: '遠程傷害',
  spellDamageBonus: '法術傷害',
  fireResist: '火焰抗性',
  coldResist: '冰寒抗性',
  lightningResist: '閃電抗性',
  poisonResist: '毒素抗性',
  physicalResist: '物理減傷',
  dodgeChance: '閃避',
  thorns: '荊棘傷害',
  potionEffect: '藥水效果',
  fireDamagePct: '附加火焰傷害',
  coldDamagePct: '附加冰寒傷害',
  lightningDamagePct: '附加閃電傷害',
  poisonDamagePct: '附加毒素傷害',
  damageReduction: '減傷',
  critDamageTaken: '受到暴擊傷害',
  critDamageBonus: '暴擊傷害',
  manaCostReduction: '魔力消耗降低',
  lifeSteal: '生命吸取',
  manaSteal: '魔力吸取',
  manaOnHit: '命中回復魔力',
  hpRegenPct: '每秒回復生命',
  manaRegenPct: '每秒回復魔力',
};

/** 以百分比顯示的屬性 */
const PERCENT_STATS: ReadonlySet<StatId> = new Set([
  'critChance',
  'castSpeed',
  'damageBonus',
  'meleeDamageBonus',
  'rangedDamageBonus',
  'spellDamageBonus',
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  'physicalResist',
  'dodgeChance',
  'potionEffect',
  'fireDamagePct',
  'coldDamagePct',
  'lightningDamagePct',
  'poisonDamagePct',
  'damageReduction',
  'critDamageTaken',
  'critDamageBonus',
  'manaCostReduction',
  'lifeSteal',
  'manaSteal',
  'hpRegenPct',
  'manaRegenPct',
]);

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
export function describeItem(item: ItemInstance, data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>): ItemDescription {
  const stats = itemStats(item, data);
  const base = stats.base;
  const affixes = stats.affixes;

  const def = item.legendaryId !== undefined && data.legendaries.has(item.legendaryId) ? data.legendaries.get(item.legendaryId) : null;
  const name = def?.name ?? nameItem(item, base, affixes.map((a) => a.def));
  const type = base.weaponType ? `${WEAPON_TYPE_LABELS[base.weaponType]} · ${base.name}` : `${SLOT_LABELS[base.slot]} · ${base.name}`;
  const subtitle = `${RARITY_LABELS[item.rarity]} ${type}`;

  const baseLines: string[] = [];
  const { damageMin, damageMax, ...rest } = stats.baseStats;
  // 有主倍率時，最終值後面附上基礎值，例如「傷害 16–31（基礎 5–10）」
  const boosted = stats.quality > 0;
  if (damageMin !== undefined || damageMax !== undefined) {
    const raw = base.baseStats;
    baseLines.push(`傷害 ${damageMin ?? 0}–${damageMax ?? 0}${boosted && stats.mainTarget === 'damage' ? `（基礎 ${raw.damageMin ?? 0}–${raw.damageMax ?? 0}）` : ''}`);
  }
  if (boosted && stats.mainTarget === 'spellPower' && rest.spellPower !== undefined) {
    baseLines.push(`法術強度 ${rest.spellPower}（基礎 ${base.baseStats.spellPower ?? 0}）`);
    delete rest.spellPower;
  }
  if (boosted && stats.mainTarget === 'defense' && rest.defense !== undefined) {
    baseLines.push(`防禦 ${rest.defense}（基礎 ${base.baseStats.defense ?? 0}）`);
    delete rest.defense;
  }
  for (const [stat, value] of Object.entries(rest) as [StatId, number][]) {
    // 百分比屬性（武器種類的加成）寫成「+8% 近戰傷害」，其他寫成「防禦 8」
    baseLines.push(PERCENT_STATS.has(stat) ? `${formatValue(stat, 'flat', value, true)} ${STAT_LABELS[stat]}` : `${STAT_LABELS[stat]} ${formatValue(stat, 'flat', value, false)}`);
  }
  const line = ({ def, value }: (typeof affixes)[number]) => `${formatValue(def.stat, def.modifier, value, true)} ${STAT_LABELS[def.stat]}`;
  const strongLines = affixes.filter((a) => a.def.kind === 'strong').map(line);
  const affixLines = affixes.filter((a) => a.def.kind !== 'strong').map(line);
  const mainLine = stats.quality > 0 ? `${MAIN_LABELS[stats.mainTarget]} +${Math.round(stats.quality * 100)}%` : null;
  // 傳奇 / 神話：固定屬性（已擲骰）與效果文字依設計順序排列
  let legendary: ItemDescription['legendary'] = null;
  if (def) {
    let n = 0;
    const lines = def.lines.map((l) => {
      if (l.type === 'stat') {
        const a = affixes[n++]!;
        return { text: line(a), kind: l.strong ? ('strong' as const) : ('normal' as const) };
      }
      return { text: l.text, kind: l.unique ? ('unique' as const) : l.strong ? ('strong' as const) : ('normal' as const) };
    });
    legendary = { role: def.role, lore: def.lore, lines };
  }
  return {
    name,
    subtitle,
    rarity: item.rarity,
    slot: base.slot,
    baseLines,
    mainLine,
    strongLines,
    affixLines,
    legendary,
    lines: [...baseLines, ...(mainLine ? [mainLine] : []), ...(legendary ? legendary.lines.map((l) => l.text) : [...strongLines, ...affixLines])],
  };
}

export function formatValue(stat: StatId, kind: ModifierKind, value: number, signed: boolean): string {
  const sign = signed && value >= 0 ? '+' : '';
  if (kind !== 'flat' || PERCENT_STATS.has(stat)) return `${sign}${Math.round(value * 1000) / 10}%`;
  return `${sign}${Number.isInteger(value) ? value : value.toFixed(1)}`;
}
