import type { DataRegistry } from '../../../data/DataRegistry';
import type { StatId } from '../../../data/schema/common';
import type { Rarity } from '../../../data/schema/item';
import type { ItemInstance } from '../../../game/items/ItemInstance';

/**
 * 裝備外觀的「主題」：由詞綴決定。
 * - 顏色主題（元素、吸血、法術、暴擊、生命）：金屬染色、寶石與發光符文換成主題色、光芒與粒子
 * - 形狀主題（防禦、敏捷、荊棘）：變厚重、長出翅膀、加上尖刺；可與顏色主題疊加
 * 最強的詞綴（強屬性優先，其次依詞綴順序）決定主題，第二個顏色主題決定寶石等點綴色。
 */
export type GearTheme = 'fire' | 'cold' | 'lightning' | 'poison' | 'blood' | 'arcane' | 'crit' | 'vital' | 'guard' | 'speed' | 'thorns' | 'brutal';

export interface ThemeStyle {
  color: number;
  /** 武器光芒的粒子（WeaponGlowView 的粒子種類） */
  particle: 'ember' | 'frost' | 'spark' | 'void' | 'blood' | 'prism' | 'star' | 'holy' | 'rock' | 'wind';
  /** 只改形狀、不改顏色 */
  shape?: boolean;
}

export const THEMES: Record<GearTheme, ThemeStyle> = {
  fire: { color: 0xff7a2a, particle: 'ember' },
  cold: { color: 0x8fdcff, particle: 'frost' },
  lightning: { color: 0x9fc4ff, particle: 'spark' },
  poison: { color: 0x8fe060, particle: 'void' },
  blood: { color: 0xe0303c, particle: 'blood' },
  arcane: { color: 0x7a8cff, particle: 'prism' },
  crit: { color: 0xffd060, particle: 'star' },
  vital: { color: 0x7ee08a, particle: 'holy' },
  guard: { color: 0xd8dde2, particle: 'rock', shape: true },
  speed: { color: 0xb8f0d8, particle: 'wind', shape: true },
  thorns: { color: 0xc87a50, particle: 'rock', shape: true },
  brutal: { color: 0xd8dde2, particle: 'rock', shape: true },
};

/** 屬性 → 主題（沒有列出的屬性不影響外觀） */
const STAT_THEME: Partial<Record<StatId, GearTheme>> = {
  fireDamagePct: 'fire',
  fireResist: 'fire',
  coldDamagePct: 'cold',
  coldResist: 'cold',
  lightningDamagePct: 'lightning',
  lightningResist: 'lightning',
  poisonDamagePct: 'poison',
  poisonResist: 'poison',
  lifeSteal: 'blood',
  manaSteal: 'arcane',
  spellPower: 'arcane',
  spellDamageBonus: 'arcane',
  castSpeed: 'arcane',
  maxMana: 'arcane',
  manaCostReduction: 'arcane',
  critChance: 'crit',
  critDamageBonus: 'crit',
  maxHp: 'vital',
  hpRegenPct: 'vital',
  defense: 'guard',
  damageReduction: 'guard',
  knockbackResist: 'guard',
  stunResist: 'guard',
  attackSpeed: 'speed',
  moveSpeed: 'speed',
  dodgeChance: 'speed',
  rangedDamageBonus: 'speed',
  thorns: 'thorns',
  damageMin: 'brutal',
  damageMax: 'brutal',
  meleeDamageBonus: 'brutal',
};

/** 稀有度 → 染色強度（0～1）與是否有發光符文 */
export const RARITY_TINT: Record<Rarity, number> = { normal: 0, magic: 0.28, rare: 0.42, epic: 0.55, legendary: 0.5, mythic: 0.6 };
export const hasRunes = (rarity: Rarity) => rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic';

/** 一件裝備的主題（依強度排序、不重複）：強屬性 → 一般詞綴；傳奇 / 神話依固定屬性行 */
export function itemThemes(item: ItemInstance, data: Pick<DataRegistry, 'affixes' | 'legendaries'>): GearTheme[] {
  const stats: StatId[] = [];
  if (item.legendaryId && data.legendaries.has(item.legendaryId)) {
    for (const line of data.legendaries.get(item.legendaryId).lines) if (line.type === 'stat') stats.push(line.stat);
  }
  const affixes = item.affixes.filter((a) => data.affixes.has(a.id)).map((a) => data.affixes.get(a.id));
  for (const a of affixes.filter((x) => x.kind === 'strong')) stats.push(a.stat);
  for (const a of affixes.filter((x) => x.kind !== 'strong')) stats.push(a.stat);
  const themes: GearTheme[] = [];
  for (const s of stats) {
    const t = STAT_THEME[s];
    if (t && !themes.includes(t)) themes.push(t);
  }
  return themes;
}

/** 主色（第一個顏色主題）與點綴色（第二個顏色主題） */
export function themeColors(themes: readonly GearTheme[]): { main: GearTheme | null; accent: number | null } {
  const colored = themes.filter((t) => !THEMES[t].shape);
  const main = colored[0] ?? null;
  const accent = colored[1] ? THEMES[colored[1]].color : main ? THEMES[main].color : null;
  return { main, accent };
}

export function mixColor(a: number, b: number, k: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** 金屬染色：往深色版的主題色混，並稍微壓暗（直接混亮色會像皮膚） */
export function tintTones(tones: readonly number[], color: number, k: number): number[] {
  const deep = mixColor(color, 0x1a1410, 0.45);
  return tones.map((t) => mixColor(mixColor(t, deep, k), 0x000000, 0.35 * k));
}
