import type { Element } from '../../data/schema/common';
import type { StatusKind } from '../../data/schema/effects';

/**
 * 這一招在 Q / W / E 連段中的位置（傳奇 / 神話裝備的條件判定用；不是加成本身）。
 * 跟著 StepMods 一起傳到投射物、延遲效果，所以命中時也知道是第幾段。
 */
export interface ComboCastInfo {
  /** 第幾段（1～3） */
  step: number;
  /** 這組連段的三個技能 */
  skills: readonly string[];
  /** 是否成功組成 Combo */
  success: boolean;
  /** Combo 的 ID 與規則層級（1 = 秘密 Combo） */
  comboId: string | null;
  ruleTier: number | null;
  /** Q / W / E（0～2） */
  slot: number | null;
}

/**
 * 某一步技能身上的 Combo 加成（已套用 LevelFactor）。
 * 各效果在施放時讀取自己需要的欄位；對不適用的技能自動無效。
 * 百分比以比例表示（0.25 = +25%）；數量類為整數；機率類為百分點。
 */
export interface StepMods {
  damage: number;
  crit: number;
  aoeRadius: number;
  projectileSize: number;
  projectileSpeed: number;
  projectileCount: number;
  pierce: number;
  armorPenetration: number;
  knockback: number;
  /** 硬直系統尚未實作，暫不生效 */
  stagger: number;
  attackSpeed: number;
  castSpeed: number;
  animationSpeed: number;
  burn: number;
  freezeChance: number;
  freezeDuration: number;
  statusChance: number;
  chainCount: number;
  hitCount: number;
  mp: number;
  movementSpeed: number;
  /** 每一擊額外追加的元素傷害（該擊傷害 × value） */
  elementDamage: { element: Element; value: number }[];
  /** 命中時目標有指定狀態才生效的加成 */
  vsTarget: { type: 'damage' | 'crit' | 'stagger'; statuses: StatusKind[]; value: number }[];
  /** 目標生命低於 below 時的傷害加成（傳奇裝備：處決類） */
  vsLowHp: { below: number; damage: number }[];
  /** 這一招在連段中的位置（非連段施放時為 null） */
  combo: ComboCastInfo | null;
}

export type NumericModKey = Exclude<keyof StepMods, 'elementDamage' | 'vsTarget' | 'vsLowHp' | 'combo'>;

export function emptyMods(): StepMods {
  return {
    damage: 0,
    crit: 0,
    aoeRadius: 0,
    projectileSize: 0,
    projectileSpeed: 0,
    projectileCount: 0,
    pierce: 0,
    armorPenetration: 0,
    knockback: 0,
    stagger: 0,
    attackSpeed: 0,
    castSpeed: 0,
    animationSpeed: 0,
    burn: 0,
    freezeChance: 0,
    freezeDuration: 0,
    statusChance: 0,
    chainCount: 0,
    hitCount: 0,
    mp: 0,
    movementSpeed: 0,
    elementDamage: [],
    vsTarget: [],
    vsLowHp: [],
    combo: null,
  };
}

/** 沒有 Combo 加成時使用（不可修改） */
export const NO_MODS: Readonly<StepMods> = Object.freeze(emptyMods());
