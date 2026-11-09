import { rankValue } from '../../../data/schema/common';
import type { EffectDef, ZoneEffectDef } from '../../../data/schema/effects';

/**
 * 地面持續範圍的殺傷力分三階（設計者 2026-11-09）：從外觀就看得出能不能踩。
 * 依「每秒傷害倍率」（每跳倍率 ÷ 間隔；有等級的招式用滿級）自動分：< 0.32 灼傷、< 0.6 危險、其他致命；
 * ZoneEffectDef.fxTier 可以手動指定。
 */
export type ZoneTier = 1 | 2 | 3;

const MAX_RANK = 5;

export function zoneDamagePerSecond(effects: readonly EffectDef[], interval: number): number {
  let total = 0;
  for (const e of effects) if (e.type === 'damage') total += e.multiplier === undefined ? 1 : rankValue(e.multiplier, MAX_RANK);
  return total / interval;
}

export function zoneTier(zone: { effects: readonly EffectDef[]; interval: number; fxTier?: ZoneEffectDef['fxTier'] }): ZoneTier {
  if (zone.fxTier) return zone.fxTier;
  const dps = zoneDamagePerSecond(zone.effects, zone.interval);
  return dps < 0.32 ? 1 : dps < 0.6 ? 2 : 3;
}

/** 各階的地面外觀：底色不透明度、外框線寬、地面照明、閃動（週期毫秒、起伏幅度） */
export const ZONE_TIER_LOOK: Record<ZoneTier, { fill: number; stroke: number; light: number; period: number; pulse: number }> = {
  1: { fill: 0.18, stroke: 1.5, light: 0.35, period: 170, pulse: 0.15 },
  2: { fill: 0.28, stroke: 2.5, light: 0.55, period: 90, pulse: 0.3 },
  3: { fill: 0.42, stroke: 4, light: 0.9, period: 45, pulse: 0.38 },
};
