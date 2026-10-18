import type { DataRegistry } from '../../data/DataRegistry';
import { CORE_SLOTS, type CoreElement, type CoreLine, type CoreSlot } from '../../data/schema/core';
import { RARITY_LABELS } from '../../data/schema/item';
import type { StatId } from '../../data/schema/common';
import type { CoreInstance, CoreRoll } from './CoreInstance';
import { brandLine, coreLineValue } from './CoreStats';
import { formatValue, SLOT_LABELS, STAT_LABELS } from './ItemDescriber';
import type { ItemInstance } from './ItemInstance';

type Data = Pick<DataRegistry, 'cores' | 'balance' | 'legendaries'>;

export const CORE_ELEMENT_LABELS: Record<CoreElement, string> = { fire: '火', cold: '冰', lightning: '雷' };
const ELEMENT_STATS: Record<CoreElement, { damage: StatId; resist: StatId }> = {
  fire: { damage: 'fireDamagePct', resist: 'fireResist' },
  cold: { damage: 'coldDamagePct', resist: 'coldResist' },
  lightning: { damage: 'lightningDamagePct', resist: 'lightningResist' },
};

/** 熔核的名稱：例如「靈核（火）」「混核（銳＋重）」 */
export function coreName(core: CoreInstance, data: Pick<DataRegistry, 'cores'>): string {
  const names = core.types.map((t) => data.cores.types.get(t).name);
  const element = core.element ? `（${CORE_ELEMENT_LABELS[core.element]}）` : '';
  if (names.length === 2) return `混核（${names.map((n) => n.replace('核', '')).join('＋')}）${element}`;
  return `${names[0]}${element}`;
}

/** 一條熔核屬性的文字（與裝備詞綴同樣的寫法：「+3.2% 暴擊率」） */
export function coreLineText(line: CoreLine, value: number, element: CoreElement | undefined): string {
  if (line.type === 'mods') {
    const v = line.mod === 'pierce' ? `+${Math.round(value)}` : `+${Math.round(value * 1000) / 10}%`;
    return `${v} ${line.label}`;
  }
  const stat = line.type === 'stat' ? line.stat : element ? ELEMENT_STATS[element][line.kind] : null;
  if (!stat) return `+${Math.round(value * 1000) / 10}% 元素${line.type === 'element' && line.kind === 'resist' ? '抗性' : '傷害'}`;
  if (stat === 'projectileRange') return `+${value.toFixed(1)} 格射擊距離`;
  const kind = line.type === 'stat' ? line.modifier : 'flat';
  return `${formatValue(stat, kind, value, true)} ${STAT_LABELS[stat]}`;
}

/** 數值範圍的文字（融合預覽）：「+1.4～2.8% 暴擊率」 */
export function coreRangeText(line: CoreLine, [lo, hi]: [number, number], element: CoreElement | null): string {
  const lowText = coreLineText(line, lo, element ?? undefined);
  const highText = coreLineText(line, hi, element ?? undefined);
  if (lowText === highText) return lowText;
  // 取出數字部分組成範圍
  const num = (t: string) => t.match(/^\+?([\d.]+)/)?.[1] ?? '';
  return highText.replace(/^\+?[\d.]+/, `+${num(lowText)}～${num(highText)}`);
}

/** host = 裝備稀有度倍率（熔核單獨看時為 1，以紫裝為準） */
function rollText(r: CoreRoll, core: CoreInstance, data: Data, mixed: boolean, host: number): string | null {
  if (!data.cores.lines.has(r.lineId)) return null;
  const line = data.cores.lines.get(r.lineId);
  return coreLineText(line, coreLineValue(line, core, r.roll, data.balance, mixed) * (line.scaling === 'none' ? 1 : host), core.element);
}

/** 熔核鑲在某個部位時的主屬性文字 */
export function coreMainTexts(core: CoreInstance, slot: CoreSlot, data: Data, host = 1): string[] {
  return (core.main[slot] ?? []).flatMap((r) => rollText(r, core, data, core.types.length === 2, host) ?? []);
}

/** 副屬性與印記的文字 */
export function coreExtraTexts(core: CoreInstance, data: Data, host = 1): { secondary: string[]; brand: string | null } {
  const secondary = core.secondary.flatMap((r) => rollText(r, core, data, false, host) ?? []);
  const b = brandLine(core, data);
  let brand: string | null = null;
  if (b) {
    const f = data.balance.fusion.brand.valueMultiplier;
    brand =
      b.line.type === 'stat'
        ? `印記（${b.def.name}）：${formatValue(b.line.stat, b.line.modifier, (core.brand!.roll ?? b.line.value[1]) * f * host, true)} ${STAT_LABELS[b.line.stat]}`
        : `印記（${b.def.name}）：${b.line.text} × ${+(f * host).toFixed(3)}`;
  }
  return { secondary, brand };
}

export interface CoreDescription {
  name: string;
  subtitle: string;
  /** 五個部位各自的主屬性 */
  slots: { slot: CoreSlot; label: string; texts: string[] }[];
  secondary: string[];
  brand: string | null;
  notes: string[];
}

export function describeCore(core: CoreInstance, data: Data): CoreDescription {
  const { secondary, brand } = coreExtraTexts(core, data);
  const notes: string[] = [];
  if (core.pure) notes.push('純核（四把同種類）');
  if (core.types.length === 2) notes.push(`混核：每個部位兩個核種各一條，數值 ×${data.balance.fusion.mixedMultiplier}`);
  notes.push(`數值以紫裝為準；鑲在${hostPowerText(data)}`);
  return {
    name: coreName(core, data),
    subtitle: `${RARITY_LABELS[core.rarity]}熔核 · T${core.tier}`,
    slots: CORE_SLOTS.map((slot) => ({ slot, label: SLOT_LABELS[slot], texts: coreMainTexts(core, slot, data) })),
    secondary,
    brand,
    notes,
  };
}

/** 「白裝 ×0.5、藍裝 ×0.6 …」 */
export function hostPowerText(data: Pick<DataRegistry, 'balance'>): string {
  const p = data.balance.sockets.hostPower;
  const color = { normal: '白', magic: '藍', rare: '黃', epic: '紫', legendary: '橘' } as const;
  return (['normal', 'magic', 'rare', 'epic', 'legendary'] as const).map((r) => `${color[r]}裝 ×${p[r]}`).join('、');
}

/** 裝備的孔位列：已鑲入的熔核（在這個部位的效果）與空孔 */
export function socketLines(item: ItemInstance, data: Data & Pick<DataRegistry, 'items'>): { text: string; rarity: CoreInstance['rarity'] | null }[] {
  const sockets = item.sockets;
  if (!sockets || sockets.max === 0) return [];
  const slot = data.items.get(item.baseId).slot as CoreSlot;
  const host = data.balance.sockets.hostPower[item.rarity];
  const lines: { text: string; rarity: CoreInstance['rarity'] | null }[] = sockets.cores.map((core) => {
    const { secondary, brand } = coreExtraTexts(core, data, host);
    const parts = [...coreMainTexts(core, slot, data, host), ...secondary, ...(brand ? [brand] : [])];
    return { text: `◆ ${coreName(core, data)} T${core.tier}：${parts.join('、')}`, rarity: core.rarity };
  });
  for (let i = sockets.cores.length; i < sockets.max; i++) lines.push({ text: '◇ 空孔', rarity: null });
  if (host !== 1) lines.push({ text: `${RARITY_LABELS[item.rarity]}裝備：熔核數值 ×${host}`, rarity: null });
  return lines;
}
