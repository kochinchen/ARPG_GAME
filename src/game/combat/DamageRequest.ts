import type { Element } from '../../data/schema/common';
import type { Actor } from '../entities/Actor';

export interface DamageRequest {
  /** null = 環境傷害（陷阱等） */
  source: Actor | null;
  target: Actor;
  min: number;
  max: number;
  element: Element;
  /** 預設 true */
  canCrit?: boolean;
  /** 額外暴擊率（技能條件加成、Combo） */
  extraCritChance?: number;
  /** 無視目標防禦的比例（Combo 穿甲） */
  armorPenetration?: number;
  /** 持續傷害（燃燒）：不暴擊、不觸發命中效果、不觸發反擊、不消耗防禦姿態 */
  isDot?: boolean;
  /** 反擊造成的傷害不會再觸發反擊 */
  noCounter?: boolean;
  /** 吸血倍率（依技能類型：近戰較高、魔法較低），預設 1 */
  lifeStealMultiplier?: number;
}

export interface DamageResult {
  amount: number;
  isCrit: boolean;
  killed: boolean;
}

/** 能造成傷害的對象（DamagePipeline）；讓其他系統不必直接依賴 Pipeline */
export interface DamageDealer {
  apply(request: DamageRequest): DamageResult | null;
}
