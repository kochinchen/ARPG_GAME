import type { Rng } from '../../core/Rng';
import type { DataRegistry } from '../../data/DataRegistry';
import { CORE_SLOTS, type CoreElement, type CoreLine, type CoreSlot, type CoreTypeDef, type CoreTypeId } from '../../data/schema/core';
import { RARITIES, type Rarity, type WeaponType } from '../../data/schema/item';
import type { CoreInstance, CoreRarity, CoreRoll } from './CoreInstance';
import { coreLineValue } from './CoreStats';
import type { ItemInstance } from './ItemInstance';
import { itemStats } from './ItemStats';

/**
 * 融合判定（v0.5.0，SPEC §2）：2～4 把武器 → 一顆熔核；飾品區 0～2 件戒指 / 護身符只提高印記機率。
 * - preview()：不用擲骰就算得出的全部（核種、核階、核色、元素、條數、純度、印記機率、各部位範圍、費用、提醒）
 * - fuse()：用 Seeded Rng 擲出主屬性、副屬性、核色倍率與印記
 * 純函式；投入物的消耗與扣費由呼叫端（商人）處理。
 */

type Data = Pick<DataRegistry, 'balance' | 'cores' | 'items' | 'affixes' | 'legendaries'>;

const ELEMENTS: readonly CoreElement[] = ['fire', 'cold', 'lightning'];
const ELEMENT_OF_STAT: Partial<Record<string, CoreElement>> = { fireDamagePct: 'fire', coldDamagePct: 'cold', lightningDamagePct: 'lightning' };

/** 印記候選：投入的一把橘武器 */
export interface BrandCandidate {
  itemUid: string;
  legendaryId: string;
  /** 強屬性在傳奇定義中的第幾行 */
  line: number;
  /** 強屬性的說明（數值行為屬性 id） */
  text: string;
  /** 數值行：投入那件擲到的數值 */
  roll?: number;
  /** 這把的機率（基礎 + 飾品加成） */
  chance: number;
}

/** 一個部位的主屬性範圍（每個核種一條候選組；同一格兩條時擲骰選一條） */
export interface SlotPreview {
  slot: CoreSlot;
  /** 每個核種的候選；每條附數值範圍 */
  options: { type: CoreTypeId; lines: { line: CoreLine; range: [number, number] }[] }[];
}

export interface FusionPreview {
  /** 有問題時無法融合（例如投入數量不對、放了非武器） */
  problems: string[];
  votes: Partial<Record<WeaponType, number>>;
  types: CoreTypeId[];
  mixed: boolean;
  avgItemLevel: number;
  tier: number;
  weight: number;
  rarity: CoreRarity;
  /** 下一個核色與還差多少權重（已是橘時為 null） */
  next: { rarity: CoreRarity; gap: number } | null;
  /** 靈核的元素；null = 融合時隨機（沒有靈核時也是 null） */
  element: CoreElement | null;
  hasElement: boolean;
  pure: boolean;
  lineCount: number;
  brand: { candidates: BrandCandidate[]; baseChance: number; jewelryBoost: number; chance: number; capped: boolean };
  /** 副屬性池（每條抽中的機率） */
  secondary: { line: CoreLine; chance: number }[];
  slots: SlotPreview[];
  cost: { gold: number; essence: number };
  warnings: string[];
  /** 拿掉後核色會降一級的投入物（uid） */
  rarityCritical: string[];
}

/** 核色：權重加總對照門檻 */
export function coreRarityFor(weight: number, from: Data['balance']['fusion']['rarityFrom']): CoreRarity {
  if (weight >= from.legendary) return 'legendary';
  if (weight >= from.epic) return 'epic';
  if (weight >= from.rare) return 'rare';
  if (weight >= from.magic) return 'magic';
  return 'normal';
}

const NEXT_RARITY: Record<CoreRarity, Exclude<CoreRarity, 'normal'> | null> = { normal: 'magic', magic: 'rare', rare: 'epic', epic: 'legendary', legendary: null };

const rarityAtLeast = (rarity: Rarity, min: Rarity | undefined) => !min || RARITIES.indexOf(rarity) >= RARITIES.indexOf(min);

export function previewFusion(inputs: readonly ItemInstance[], jewelry: readonly ItemInstance[], data: Data): FusionPreview {
  const { balance } = data;
  const f = balance.fusion;
  const problems: string[] = [];
  if (inputs.length < f.inputs.min || inputs.length > f.inputs.max) problems.push(`請放入 ${f.inputs.min}～${f.inputs.max} 把武器`);
  const weapons = inputs.filter((i) => data.items.get(i.baseId).weaponType !== undefined);
  if (weapons.length !== inputs.length) problems.push('合成區只能放武器');
  if (jewelry.length > f.jewelrySlots) problems.push(`飾品區最多 ${f.jewelrySlots} 件`);
  for (const j of jewelry) {
    const slot = data.items.get(j.baseId).slot;
    if (slot !== 'ring' && slot !== 'amulet') problems.push('飾品區只能放戒指或護身符');
    else if (j.rarity === 'normal') problems.push('普通（白）飾品不能放進飾品區');
  }

  // 核種：武器種類多數決；平手 → 混核（取票數最高的兩種；超過兩種平手時取物品等級最高的兩種）
  const votes: Partial<Record<WeaponType, number>> = {};
  const topLevel: Partial<Record<WeaponType, number>> = {};
  for (const item of weapons) {
    const w = data.items.get(item.baseId).weaponType!;
    votes[w] = (votes[w] ?? 0) + 1;
    topLevel[w] = Math.max(topLevel[w] ?? 0, item.itemLevel);
  }
  const ranked = (Object.keys(votes) as WeaponType[]).sort((a, b) => votes[b]! - votes[a]! || topLevel[b]! - topLevel[a]!);
  const best = ranked.length ? votes[ranked[0]!]! : 0;
  const tied = ranked.filter((w) => votes[w] === best);
  const chosen = tied.length >= 2 ? tied.slice(0, 2) : ranked.slice(0, 1);
  const types = chosen.map((w) => attackCoreFor(w, data).id);
  const mixed = types.length === 2;

  // 核階：平均物品等級；核色：稀有度權重加總
  const levels = inputs.map((i) => i.itemLevel);
  const avgItemLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const tier = Math.min(balance.affixPower.maxTier, Math.floor(avgItemLevel / balance.affixPower.levelsPerTier) + 1);
  const weightOf = (r: Rarity) => balance.gearAura.weights[r];
  const weight = inputs.reduce((sum, i) => sum + weightOf(i.rarity), 0);
  const rarity = coreRarityFor(weight, f.rarityFrom);
  const nextRarity = NEXT_RARITY[rarity];
  const next = nextRarity ? { rarity: nextRarity, gap: f.rarityFrom[nextRarity] - weight } : null;

  // 靈核的元素：投入法杖的元素詞綴（含傳奇的數值行）最多的那一種；平手或沒有 = 融合時隨機
  const hasElement = types.some((t) => data.cores.types.get(t).slots.weapon?.some((l) => l.type === 'element'));
  const element = hasElement ? majorityElement(weapons.filter((i) => data.items.get(i.baseId).weaponType === 'staff'), data) : null;

  const pure = inputs.length === f.inputs.max && ranked.length === 1;
  const lineCount = f.lineCount[rarity];

  // 印記：每把橘武器（有強屬性）的機率 = 基礎 + 飾品加成；總機率 = 1 − Π(1 − p)，上限 chanceCap
  const jewelryBoost = jewelry.reduce((sum, j) => sum + (f.jewelryBoost[j.rarity] ?? 0), 0);
  const p = Math.min(1, f.brand.chance + jewelryBoost);
  const candidates = brandCandidates(inputs, data, p);
  const rawChance = candidates.length ? 1 - (1 - p) ** candidates.length : 0;
  const chance = Math.min(rawChance, f.brand.chanceCap);

  // 副屬性池：核種在武器以外各部位的屬性（去掉同 ID）＋通用池；均等抽 lineCount − 1 條不重複
  const pool = secondaryPool(types, rarity, data);
  const picks = Math.min(lineCount - 1, pool.length);
  const secondary = pool.map((line) => ({ line, chance: pool.length ? picks / pool.length : 0 }));

  // 各部位主屬性範圍（核色倍率取區間兩端；混核 × mixedMultiplier）
  const [powLo, powHi] = balance.affixPower.rarity[rarity];
  const slots: SlotPreview[] = CORE_SLOTS.map((slot) => ({
    slot,
    options: types.map((type) => ({
      type,
      lines: mainCandidates(data.cores.types.get(type), slot, rarity).map((line) => ({
        line,
        range: [coreLineValue(line, { tier, power: powLo }, 0, balance, mixed), coreLineValue(line, { tier, power: powHi }, 1, balance, mixed)] as [number, number],
      })),
    })),
  }));

  const sumLevel = levels.reduce((a, b) => a + b, 0);
  const cost = {
    gold: Math.round(f.cost.goldBase + f.cost.goldPerItemLevel * sumLevel),
    essence: f.cost.essenceBase + levels.reduce((sum, lv) => sum + Math.ceil(lv / f.cost.essenceLevelDivisor), 0),
  };

  const warnings: string[] = [];
  if ([...inputs, ...jewelry].some((i) => i.rarity === 'legendary' || i.rarity === 'mythic')) warnings.push('投入傳奇 / 神話裝備，融合後無法復原');
  if (candidates.length && rawChance > f.brand.chanceCap) warnings.push(`印記機率已達上限 ${Math.round(f.brand.chanceCap * 100)}%`);
  const rarityCritical = inputs.filter((i) => coreRarityFor(weight - weightOf(i.rarity), f.rarityFrom) !== rarity).map((i) => i.uid);

  return {
    problems,
    votes,
    types,
    mixed,
    avgItemLevel,
    tier,
    weight,
    rarity,
    next,
    element,
    hasElement,
    pure,
    lineCount,
    brand: { candidates, baseChance: f.brand.chance, jewelryBoost, chance, capped: rawChance > f.brand.chanceCap },
    secondary,
    slots,
    cost,
    warnings,
    rarityCritical,
  };
}

/** 擲骰產生熔核；preview 有 problems 時丟錯（呼叫前應先檢查） */
export function fuse(inputs: readonly ItemInstance[], jewelry: readonly ItemInstance[], data: Data, rng: Rng, uid: string): CoreInstance {
  const pv = previewFusion(inputs, jewelry, data);
  if (pv.problems.length) throw new Error(`fusion not allowed: ${pv.problems.join('；')}`);
  const [lo, hi] = data.balance.affixPower.rarity[pv.rarity];
  const power = lo === hi ? lo : rng.range(lo, hi);
  const element = pv.hasElement ? (pv.element ?? rng.pick(ELEMENTS)) : undefined;

  // 主屬性：每個部位、每個核種擲一條（同一格兩條時選一條）
  const main = {} as Record<CoreSlot, CoreRoll[]>;
  for (const slot of CORE_SLOTS) {
    main[slot] = pv.types.map((type) => {
      const line = rng.pick(mainCandidates(data.cores.types.get(type), slot, pv.rarity));
      return { lineId: line.id, roll: rng.next() };
    });
  }
  // 副屬性：不重複
  const pool = pv.secondary.map((s) => s.line);
  const secondary: CoreRoll[] = [];
  for (let n = 0; n < pv.lineCount - 1 && pool.length > 0; n++) {
    const line = pool.splice(Math.floor(rng.next() * pool.length), 1)[0]!;
    secondary.push({ lineId: line.id, roll: rng.next() });
  }
  // 印記：總機率命中後，在候選中等機率擇一（每把的機率相同）
  let brand: CoreInstance['brand'];
  if (pv.brand.candidates.length && rng.chance(pv.brand.chance)) {
    const c = rng.pick(pv.brand.candidates);
    brand = c.roll === undefined ? { legendaryId: c.legendaryId, line: c.line } : { legendaryId: c.legendaryId, line: c.line, roll: c.roll };
  }

  const core: CoreInstance = {
    uid,
    types: pv.types.length === 2 ? [pv.types[0]!, pv.types[1]!] : [pv.types[0]!],
    tier: pv.tier,
    rarity: pv.rarity,
    power,
    itemLevel: Math.round(pv.avgItemLevel),
    main,
    secondary,
  };
  if (element) core.element = element;
  if (pv.pure) core.pure = true;
  if (brand) core.brand = brand;
  return core;
}

// ─────────────────────────── 輔助 ───────────────────────────

function attackCoreFor(weapon: WeaponType, data: Data): CoreTypeDef {
  return data.cores.types.all.find((t) => t.enabled && t.family === 'attack' && t.weapon === weapon)!;
}

/** 某部位可抽的主屬性（排除核色不足的，例如穿透 +1 需要紫以上） */
function mainCandidates(type: CoreTypeDef, slot: CoreSlot, rarity: CoreRarity): CoreLine[] {
  const lines = (type.slots[slot] ?? []).filter((l) => rarityAtLeast(rarity, l.minRarity));
  return lines.length ? lines : (type.slots[slot] ?? []).slice(0, 1);
}

function secondaryPool(types: readonly CoreTypeId[], rarity: CoreRarity, data: Data): CoreLine[] {
  const seen = new Set<string>();
  const out: CoreLine[] = [];
  const push = (l: CoreLine) => {
    if (seen.has(l.id) || !rarityAtLeast(rarity, l.minRarity)) return;
    seen.add(l.id);
    out.push(l);
  };
  // 不抽「武器欄」的屬性（2026-10-18 定案）：輸出主要靠武器欄的主屬性，防具上的熔核偏防禦與通用
  for (const t of types) for (const slot of CORE_SLOTS) if (slot !== 'weapon') for (const l of data.cores.types.get(t).slots[slot] ?? []) push(l);
  for (const l of data.cores.shared) push(l);
  return out;
}

function majorityElement(staffs: readonly ItemInstance[], data: Data): CoreElement | null {
  const count: Record<CoreElement, number> = { fire: 0, cold: 0, lightning: 0 };
  for (const item of staffs) {
    for (const { def } of itemStats(item, data).affixes) {
      const el = ELEMENT_OF_STAT[def.stat];
      if (el) count[el]++;
    }
  }
  const max = Math.max(...Object.values(count));
  const top = ELEMENTS.filter((el) => count[el] === max);
  return max > 0 && top.length === 1 ? top[0]! : null;
}

function brandCandidates(inputs: readonly ItemInstance[], data: Data, chance: number): BrandCandidate[] {
  const out: BrandCandidate[] = [];
  for (const item of inputs) {
    if (item.rarity !== 'legendary' || !item.legendaryId || !data.legendaries.has(item.legendaryId)) continue;
    const def = data.legendaries.get(item.legendaryId);
    const line = def.lines.findIndex((l) => l.strong);
    if (line < 0) continue;
    const l = def.lines[line]!;
    if (l.type === 'effect') {
      out.push({ itemUid: item.uid, legendaryId: def.id, line, text: l.text, chance });
    } else {
      const rolled = itemStats(item, data).affixes.find((a) => a.def.id === `${def.id}#${line}`)?.value;
      out.push({ itemUid: item.uid, legendaryId: def.id, line, text: l.stat, chance, ...(rolled !== undefined ? { roll: rolled } : {}) });
    }
  }
  return out;
}
