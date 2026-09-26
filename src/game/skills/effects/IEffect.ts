import type { Vec2 } from '../../../core/math/Vec2';
import type { EffectDef, EffectType } from '../../../data/schema/effects';
import type { SkillDef } from '../../../data/schema/skill';
import type { DamagePipeline } from '../../combat/DamagePipeline';
import type { Actor } from '../../entities/Actor';
import type { Projectile } from '../../entities/Projectile';
import type { GameEventBus } from '../../GameEvents';
import type { TargetingService } from '../../targeting/TargetingService';

export interface EffectServices {
  pipeline: DamagePipeline;
  targeting: TargetingService;
  events: GameEventBus;
  spawnProjectile: (projectile: Omit<Projectile, 'id'>) => void;
}

export interface EffectContext {
  caster: Actor;
  skill: SkillDef;
  rank: number;
  /** 目前作用的對象（範圍效果會對每個目標各執行一次） */
  target: Actor | null;
  /** 效果發生的位置（施放者、投射物擊中點、範圍中心） */
  origin: Vec2;
  /** 施放方向（單位向量） */
  direction: Vec2;
  services: EffectServices;
  /** 執行巢狀效果 */
  run: (effects: readonly EffectDef[], ctx: EffectContext) => void;
}

/** 單一效果的執行邏輯；格式定義在 data/schema/effects.ts */
export interface IEffect<T extends EffectType = EffectType> {
  readonly type: T;
  apply(def: Extract<EffectDef, { type: T }>, ctx: EffectContext): void;
}

/** 技能等級加成：Lv1 = 1，每升一級 + pct */
export const rankMultiplier = (rank: number, pct: number): number => 1 + pct * Math.max(0, rank - 1);
