import type { DataRegistry } from '../../data/DataRegistry';
import type { StatId } from '../../data/schema/common';
import { WEAPON_TYPE_LABELS, type ItemBaseDef } from '../../data/schema/item';
import type { LegendaryDef, LegendaryKind } from '../../data/schema/legendary';
import { formatValue, SLOT_LABELS, STAT_LABELS } from '../../game/items/ItemDescriber';

/**
 * 裝備圖鑑的內容（由遊戲資料推導，不存檔）：
 * - 白色基底：所有基礎裝備（藍、黃、紫是由基底隨機產生，所以只列基底）
 * - 橘 / 紅：每一件固定設計的名稱、定位、固定屬性範圍與特殊效果
 * 拿到過的紀錄另外由 gameView.collection 提供（'base:<ID>'、'legendary:<ID>'）。
 */

/** 圖鑑的分組（依顯示順序） */
export const KIND_ORDER: LegendaryKind[] = ['sword', 'axe', 'bow', 'staff', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet'];
export const KIND_LABELS: Record<LegendaryKind, string> = {
  sword: '劍',
  axe: '斧',
  bow: '弓',
  staff: '法杖',
  helmet: SLOT_LABELS.helmet,
  armor: SLOT_LABELS.armor,
  gloves: SLOT_LABELS.gloves,
  boots: SLOT_LABELS.boots,
  ring: SLOT_LABELS.ring,
  amulet: SLOT_LABELS.amulet,
};
const GLYPHS: Record<LegendaryKind, string> = { sword: '劍', axe: '斧', bow: '弓', staff: '杖', helmet: '盔', armor: '甲', gloves: '手', boots: '靴', ring: '戒', amulet: '符' };

export interface BaseCodexEntry {
  key: string;
  id: string;
  name: string;
  kind: LegendaryKind;
  glyph: string;
  levelReq: number;
  /** 基礎傷害 / 防禦與武器種類的內建加成 */
  lines: string[];
}

export interface UniqueCodexEntry {
  key: string;
  id: string;
  name: string;
  rarity: 'legendary' | 'mythic';
  kind: LegendaryKind;
  glyph: string;
  role: string;
  lore: string;
  /** 出現樓層 */
  minItemLevel: number;
  /** 主倍率，例如「武器傷害 +235%～255%」；戒指 / 護身符為 null */
  main: string | null;
  lines: { text: string; kind: 'normal' | 'strong' | 'unique' }[];
}

const kindOf = (base: ItemBaseDef): LegendaryKind => base.weaponType ?? (base.slot as LegendaryKind);

function baseLines(base: ItemBaseDef): string[] {
  const { damageMin, damageMax, ...rest } = base.baseStats;
  const lines: string[] = [];
  if (damageMin !== undefined || damageMax !== undefined) lines.push(`傷害 ${damageMin ?? 0}–${damageMax ?? 0}`);
  for (const [stat, value] of Object.entries(rest) as [StatId, number][]) {
    lines.push(stat === 'defense' || stat === 'spellPower' ? `${STAT_LABELS[stat]} ${value}` : `${formatValue(stat, 'flat', value, true)} ${STAT_LABELS[stat]}`);
  }
  return lines;
}

function uniqueLines(def: LegendaryDef): UniqueCodexEntry['lines'] {
  return def.lines.map((l) => {
    if (l.type === 'effect') return { text: l.text, kind: l.unique ? 'unique' : l.strong ? 'strong' : 'normal' };
    const [min, max] = l.value;
    const range = min === max ? formatValue(l.stat, l.modifier, min, true) : `${formatValue(l.stat, l.modifier, min, true)}～${formatValue(l.stat, l.modifier, max, false)}`;
    return { text: `${range} ${STAT_LABELS[l.stat]}`, kind: l.strong ? 'strong' : 'normal' };
  });
}

export function buildItemCodex(data: DataRegistry): { bases: BaseCodexEntry[]; uniques: UniqueCodexEntry[] } {
  const bases = data.items.all
    .map((b) => ({ key: `base:${b.id}`, id: b.id, name: b.name, kind: kindOf(b), glyph: GLYPHS[kindOf(b)], levelReq: b.levelReq, lines: baseLines(b) }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.levelReq - b.levelReq);
  const uniques = data.legendaries.all
    .map((d) => {
      const target = d.kind === 'ring' || d.kind === 'amulet' ? null : ['sword', 'axe', 'bow', 'staff'].includes(d.kind) ? '武器傷害' : '防禦';
      return {
        key: `legendary:${d.id}`,
        id: d.id,
        name: d.name,
        rarity: d.rarity,
        kind: d.kind,
        glyph: GLYPHS[d.kind],
        role: d.role,
        lore: d.lore,
        minItemLevel: d.minItemLevel,
        main: d.main && target ? `${target} +${Math.round(d.main[0] * 100)}%～${Math.round(d.main[1] * 100)}%` : null,
        lines: uniqueLines(d),
      };
    })
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.minItemLevel - b.minItemLevel);
  return { bases, uniques };
}

/** 武器種類的中文（基底表格的副標） */
export const weaponTypeLabel = (kind: LegendaryKind): string =>
  kind === 'sword' || kind === 'axe' || kind === 'bow' || kind === 'staff' ? WEAPON_TYPE_LABELS[kind] : KIND_LABELS[kind];

/** 圖鑑面板使用的資料來源（main.ts 啟動時設定） */
export const itemCodexBridge = {
  bases: [] as BaseCodexEntry[],
  uniques: [] as UniqueCodexEntry[],
  init(data: DataRegistry): void {
    const codex = buildItemCodex(data);
    this.bases = codex.bases;
    this.uniques = codex.uniques;
  },
};
