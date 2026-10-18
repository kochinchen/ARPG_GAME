import type { DataRegistry } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { StatId } from '../../data/schema/common';
import type { CoreElement, CoreLine, CoreSlot } from '../../data/schema/core';
import type { ItemAction, ItemMechanic, LegendaryDef, ModsInput } from '../../data/schema/legendary';
import type { ModifierKind } from '../stats/StatBlock';
import type { CoreInstance } from './CoreInstance';
import { STAT_LABELS } from './ItemDescriber';

/**
 * 熔核的數值（v0.5.0，SPEC §1.3、§1.6、§2.3）。純函式：
 * - 每條屬性 = T1 範圍擲骰 × 核階倍率（T5 有 t5Value 時改用它）× 核色倍率（core.power）；混核的主屬性再 × mixedMultiplier；
 *   再 × 裝備稀有度倍率（白 0.5 … 橘 1.25；固定數值的屬性如穿透 +1 不乘）
 * - 全身上限：同一條屬性全身合計 ≤ 一顆 T5 橘核的最高值 × bodyCap；同一條印記 ≤ 單顆 × bodyCap（超過的部分不生效）
 * - 印記：投入的橘武器的強屬性（◆）× brand.valueMultiplier；整數（箭數、穿透…）四捨五入、至少 1；永遠不傳效果（✦）
 */

type Data = Pick<DataRegistry, 'balance' | 'cores' | 'legendaries'>;

export interface CoreStatMod {
  stat: StatId;
  kind: ModifierKind;
  value: number;
}

export interface CoreEffects {
  /** 加到角色身上的屬性（已套用全身上限） */
  stats: CoreStatMod[];
  /** 技能加成與印記的機制（交給 ItemEffectSystem；已套用全身上限） */
  mechanics: { key: string; mechanic: ItemMechanic }[];
  /** 達到全身上限的分組（屬性或印記的顯示名稱）：介面顯示「已達熔核上限」 */
  capped: string[];
}

/** 鑲在某個部位的一顆熔核；host = 那件裝備的稀有度倍率（balance.sockets.hostPower，省略 = 1） */
export interface SocketedCore {
  slot: CoreSlot;
  core: CoreInstance;
  host?: number;
}

const ELEMENT_STATS: Record<CoreElement, { damage: StatId; resist: StatId }> = {
  fire: { damage: 'fireDamagePct', resist: 'fireResist' },
  cold: { damage: 'coldDamagePct', resist: 'coldResist' },
  lightning: { damage: 'lightningDamagePct', resist: 'lightningResist' },
};

/** 整數類的技能加成（×倍率後四捨五入、至少 1） */
const INTEGER_MODS = new Set(['pierce', 'projectileCount', 'chainCount', 'hitCount']);

/** 一條熔核屬性的數值（mixed = 混核的主屬性） */
export function coreLineValue(line: CoreLine, core: Pick<CoreInstance, 'tier' | 'power'>, roll: number, balance: Balance, mixed = false): number {
  if (line.scaling === 'none') return line.value[0] + (line.value[1] - line.value[0]) * roll;
  const t5 = core.tier >= 5 && line.t5Value;
  const [lo, hi] = t5 ? line.t5Value! : line.value;
  const tierMult = t5 ? 1 : (balance.fusion.tierMultiplier[core.tier - 1] ?? 1);
  const value = (lo + (hi - lo) * roll) * tierMult * core.power * (mixed ? balance.fusion.mixedMultiplier : 1);
  return line.type === 'mods' && INTEGER_MODS.has(line.mod) ? Math.max(1, Math.round(value)) : value;
}

/** 一顆 T5 橘核的最高值（全身上限的基準） */
export function coreLineMax(line: CoreLine, balance: Balance): number {
  const tier = balance.affixPower.maxTier;
  return coreLineValue(line, { tier, power: balance.affixPower.rarity.legendary[1] }, 1, balance);
}

/** 屬性行分組的 key：同一個角色屬性（或同一種技能加成）算一組 */
function groupKey(line: CoreLine, element: CoreElement | undefined): string | null {
  if (line.type === 'stat') return `stat:${line.stat}:${line.modifier}`;
  if (line.type === 'element') return element ? `stat:${ELEMENT_STATS[element][line.kind]}:flat` : null;
  return `mods:${line.mod}:${JSON.stringify(line.when)}`;
}

/** 每一組的全身上限：該組所有屬性行中，一顆 T5 橘核最高值的最大者 × bodyCap */
const capCache = new WeakMap<Data['cores'], Map<string, number>>();
function groupCaps(data: Data): Map<string, number> {
  let caps = capCache.get(data.cores);
  if (caps) return caps;
  caps = new Map();
  for (const line of data.cores.lines.all) {
    const keys = line.type === 'element' ? (Object.keys(ELEMENT_STATS) as CoreElement[]).map((el) => groupKey(line, el)!) : [groupKey(line, undefined)!];
    const max = coreLineMax(line, data.balance) * data.balance.sockets.bodyCap;
    for (const key of keys) caps.set(key, Math.max(caps.get(key) ?? 0, max));
  }
  capCache.set(data.cores, caps);
  return caps;
}

/** 印記的強屬性行（不是強屬性或資料不存在時為 null） */
export function brandLine(core: CoreInstance, data: Pick<DataRegistry, 'legendaries'>): { def: LegendaryDef; line: LegendaryDef['lines'][number] } | null {
  if (!core.brand || !data.legendaries.has(core.brand.legendaryId)) return null;
  const def = data.legendaries.get(core.brand.legendaryId);
  const line = def.lines[core.brand.line];
  return line?.strong ? { def, line } : null;
}

/**
 * 全身熔核的效果。sockets = 目前裝備上所有鑲入的熔核。
 */
export function coreEffects(sockets: readonly SocketedCore[], data: Data): CoreEffects {
  const caps = groupCaps(data);
  const bodyCap = data.balance.sockets.bodyCap;
  const brandFactor = data.balance.fusion.brand.valueMultiplier;
  const groups = new Map<string, { line: CoreLine; element: CoreElement | undefined; total: number }>();
  const brands = new Map<string, { def: LegendaryDef; line: LegendaryDef['lines'][number]; count: number; rolls: number[] }>();

  const add = (line: CoreLine, value: number, element: CoreElement | undefined) => {
    const key = groupKey(line, element);
    if (!key) return;
    const g = groups.get(key) ?? { line, element, total: 0 };
    g.total += value;
    groups.set(key, g);
  };
  for (const { slot, core, host = 1 } of sockets) {
    const mixed = core.types.length === 2;
    const lineValue = (line: CoreLine, roll: number, m: boolean) => coreLineValue(line, core, roll, data.balance, m) * (line.scaling === 'none' ? 1 : host);
    for (const r of core.main[slot] ?? []) {
      if (data.cores.lines.has(r.lineId)) add(data.cores.lines.get(r.lineId), lineValue(data.cores.lines.get(r.lineId), r.roll, mixed), core.element);
    }
    for (const r of core.secondary) {
      if (data.cores.lines.has(r.lineId)) add(data.cores.lines.get(r.lineId), lineValue(data.cores.lines.get(r.lineId), r.roll, false), core.element);
    }
    const brand = brandLine(core, data);
    if (brand) {
      const key = `${core.brand!.legendaryId}:${core.brand!.line}`;
      const b = brands.get(key) ?? { ...brand, count: 0, rolls: [] };
      // 份量：每顆印記依所在裝備的稀有度倍率計算
      b.count += host;
      // 數值行：各顆用投入那件傳奇擲到的數值（沒有記錄時用上限）
      if (brand.line.type === 'stat') b.rolls.push((core.brand!.roll ?? brand.line.value[1]) * host);
      brands.set(key, b);
    }
  }

  const result: CoreEffects = { stats: [], mechanics: [], capped: [] };
  for (const [key, g] of groups) {
    const cap = caps.get(key) ?? Infinity;
    const value = Math.min(g.total, cap);
    if (g.total > cap + 1e-9) result.capped.push(lineLabel(g.line, g.element));
    if (g.line.type === 'mods') {
      const v = INTEGER_MODS.has(g.line.mod) ? Math.floor(value) : value;
      if (v > 0) result.mechanics.push({ key: `core:${key}`, mechanic: { type: 'mods', when: g.line.when, mods: { [g.line.mod]: v } } });
    } else {
      const stat = g.line.type === 'stat' ? g.line.stat : ELEMENT_STATS[g.element!][g.line.kind];
      const kind = g.line.type === 'stat' ? g.line.modifier : 'flat';
      result.stats.push({ stat, kind, value });
    }
  }
  // 印記：同一條全身合計 ≤ 單顆 × bodyCap（單顆 = 強屬性 × brandFactor）
  for (const [key, b] of brands) {
    const copies = Math.min(b.count, bodyCap);
    if (b.count > bodyCap + 1e-9) result.capped.push(b.line.type === 'effect' ? b.line.text : b.def.name);
    const factor = brandFactor * copies;
    if (b.line.type === 'stat') {
      // 數值行：合計再夾到「單顆（強屬性上限）× bodyCap」
      const single = b.line.value[1] * brandFactor;
      const total = b.rolls.reduce((sum, r) => sum + r * brandFactor, 0);
      result.stats.push({ stat: b.line.stat, kind: b.line.modifier, value: Math.min(total, single * bodyCap) });
    } else {
      b.line.mechanics.forEach((m, j) => result.mechanics.push({ key: `brand:${key}:${j}`, mechanic: scaleMechanic(m, factor) }));
    }
  }
  return result;
}

/** 顯示名稱（全身上限提示用） */
function lineLabel(line: CoreLine, element: CoreElement | undefined): string {
  if (line.type === 'mods') return line.label;
  if (line.type === 'element') return element ? STAT_LABELS[ELEMENT_STATS[element][line.kind]] : '元素';
  return STAT_LABELS[line.stat];
}

// ─────────────────────────── 印記的數值縮放 ───────────────────────────

function scaleMods(m: ModsInput, f: number): ModsInput {
  const out: ModsInput = {};
  for (const [k, v] of Object.entries(m) as [keyof ModsInput, ModsInput[keyof ModsInput]][]) {
    if (typeof v === 'number') (out as Record<string, number>)[k] = INTEGER_MODS.has(k) ? Math.max(1, Math.round(v * f)) : v * f;
    else if (k === 'vsStatus' && v && typeof v === 'object' && 'statuses' in v) out.vsStatus = { ...v, damage: v.damage * f, crit: v.crit * f };
    else if (k === 'vsLowHp' && v && typeof v === 'object' && 'below' in v) out.vsLowHp = { ...v, damage: v.damage * f };
  }
  return out;
}

function scaleAction(a: ItemAction, f: number): ItemAction {
  switch (a.type) {
    case 'arm':
      return { ...a, mods: scaleMods(a.mods, f) };
    case 'buff':
      return { ...a, stats: a.stats.map((s) => ({ ...s, value: s.value * f })) };
    case 'effects':
      return a.hitFraction ? { ...a, hitFraction: a.hitFraction * f } : a;
    default:
      return a;
  }
}

/** 強屬性的機制 × 倍率（技能加成、預備加成、增益、條件屬性、hitFraction） */
export function scaleMechanic(m: ItemMechanic, f: number): ItemMechanic {
  switch (m.type) {
    case 'mods':
      return { ...m, mods: scaleMods(m.mods, f) };
    case 'trigger':
      return { ...m, actions: m.actions.map((a) => scaleAction(a, f)) };
    case 'conditional':
      return { ...m, stats: m.stats.map((s) => ({ ...s, value: s.value * f })) };
  }
}
