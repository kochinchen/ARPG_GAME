import type { DataRegistry } from '../../data/DataRegistry';
import type { CoreInstance } from './CoreInstance';
import type { ItemInstance } from './ItemInstance';
import { itemStats } from './ItemStats';

/**
 * 武器灌注（設計者 2026-11-21）：把法杖的法術強度灌進劍、斧、弓。
 * - 每次灌注：武器＋一把法杖（唯一的法術強度來源）＋ 2～6 顆法杖純核；重新灌注也一定要放一把新的法杖。
 * - 總點數 = 每顆純核的核階（T1～T5 = 1～5 點）＋核色加分；繼承率在「最低～最高」之間擲骰，兩端都只隨點數增加。
 * - 武器記錄「法杖的法術強度」與「繼承率」，重新灌注時各自取較高的：結果不會變差，投入的純核照樣消耗。
 * 純函式；投入物的消耗由呼叫端（商人）處理。
 */
type Data = Pick<DataRegistry, 'balance' | 'items' | 'affixes' | 'legendaries'>;

export interface InfusionPreview {
  /** 有問題時不能灌注 */
  problems: string[];
  /** 總灌注點數 */
  points: number;
  /** 繼承率範圍（0～1） */
  range: [number, number];
  /** 這次放進去的法杖的法術強度（沒放 = null） */
  staffPower: number | null;
  /** 灌注後武器記錄的法術強度（新舊法杖取較高） */
  sourcePower: number;
  /** 武器目前的灌注（還沒灌注過 = null） */
  current: { spellPower: number; rate: number } | null;
  /** 灌注後武器得到的法術強度範圍（已經和目前的繼承率取較高） */
  gain: [number, number];
}

const INFUSABLE = ['sword', 'axe', 'bow'];
const hasCores = (item: ItemInstance): boolean => (item.sockets?.cores.length ?? 0) > 0;

/** 一顆純核提供的點數：核階＋核色加分 */
export function infusionPointsOf(core: CoreInstance, balance: Data['balance']): number {
  return core.tier + balance.infusion.rarityBonus[core.rarity];
}

/** 總點數對應的繼承率範圍（最低、最高都只隨點數增加，並各有上限） */
export function infusionRange(points: number, balance: Data['balance']): [number, number] {
  const { minRate, maxRate } = balance.infusion;
  return [Math.min(minRate.cap, minRate.base + minRate.perPoint * points), Math.min(maxRate.cap, maxRate.base + maxRate.perPoint * points)];
}

/** 法杖加成後的法術強度：基底 × 主倍率＋法術強度詞綴；不算法杖上的熔核 */
export function staffSpellPower(staff: ItemInstance, data: Data): number {
  const { sockets: _, ...bare } = staff;
  const stats = itemStats(bare, data);
  const flat = stats.affixes.reduce((sum, a) => sum + (a.def.stat === 'spellPower' && a.def.modifier === 'flat' ? a.value : 0), 0);
  return Math.round((stats.baseStats.spellPower ?? 0) + flat);
}

/** 灌注給武器的法術強度 */
export function infusedSpellPower(infusion: NonNullable<ItemInstance['infusion']>): number {
  return Math.round(infusion.spellPower * infusion.rate);
}

/** 是不是法杖純核（四把法杖熔成的單一靈核） */
export function isStaffPureCore(core: CoreInstance, balance: Data['balance']): boolean {
  return core.pure === true && core.types.length === 1 && core.types[0] === balance.infusion.coreType;
}

export function previewInfusion(weapon: ItemInstance | null, staff: ItemInstance | null, cores: readonly CoreInstance[], data: Data): InfusionPreview {
  const cfg = data.balance.infusion;
  const problems: string[] = [];
  const weaponType = weapon ? data.items.get(weapon.baseId).weaponType : undefined;
  if (!weapon || !weaponType || !INFUSABLE.includes(weaponType)) problems.push('請放入一把劍、斧或弓');
  else if (hasCores(weapon)) problems.push('先取下武器上的熔核（灌注後孔數不變，可以再鑲回去）');
  const current = weapon?.infusion ?? null;
  if (staff) {
    if (data.items.get(staff.baseId).weaponType !== 'staff') problems.push('法杖格只能放法杖');
    else if (hasCores(staff)) problems.push('先取下法杖上的熔核');
  } else if (weapon) problems.push(current ? '重新灌注也要放一把新的法杖' : '請放入一把法杖');
  if (cores.some((c) => !isStaffPureCore(c, data.balance))) problems.push('只能放法杖純核（四把法杖熔成的靈核）');
  if (cores.length < cfg.cores.min || cores.length > cfg.cores.max) problems.push(`請放入 ${cfg.cores.min}～${cfg.cores.max} 顆法杖純核`);

  const points = cores.reduce((sum, c) => sum + infusionPointsOf(c, data.balance), 0);
  const range = infusionRange(points, data.balance);
  const staffPower = staff && data.items.get(staff.baseId).weaponType === 'staff' ? staffSpellPower(staff, data) : null;
  const sourcePower = Math.max(current?.spellPower ?? 0, staffPower ?? 0);
  const rateFloor = current?.rate ?? 0;
  const gain: [number, number] = [Math.round(sourcePower * Math.max(rateFloor, range[0])), Math.round(sourcePower * Math.max(rateFloor, range[1]))];
  return { problems, points, range, staffPower, sourcePower, current, gain };
}

/** 擲出繼承率並算出灌注後的結果：法術強度來源與繼承率各自取較高的 */
export function resolveInfusion(pv: InfusionPreview, roll: number): { spellPower: number; rate: number; rolled: number } {
  const rolled = pv.range[0] + (pv.range[1] - pv.range[0]) * roll;
  return { spellPower: pv.sourcePower, rate: Math.max(pv.current?.rate ?? 0, rolled), rolled };
}
