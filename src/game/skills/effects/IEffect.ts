import type { Balance } from '../../../data/schema/balance';
import type { Rng } from '../../../core/Rng';
import type { Vec2 } from '../../../core/math/Vec2';
import type { DelayedEffectDef, EffectDef, EffectType, ZoneEffectDef } from '../../../data/schema/effects';
import type { SkillDef } from '../../../data/schema/skill';
import type { DamagePipeline } from '../../combat/DamagePipeline';
import type { StatusEffectSystem } from '../../combat/StatusEffectSystem';
import type { Actor } from '../../entities/Actor';
import type { Projectile } from '../../entities/Projectile';
import type { GameEventBus } from '../../GameEvents';
import type { NavGrid } from '../../movement/NavGrid';
import type { TargetingService } from '../../targeting/TargetingService';
import type { StepMods } from '../../combo/StepMods';

/** 需要「之後」才發生的效果（實作：EffectScheduler） */
export interface EffectSchedulerPort {
  spawnZone(def: ZoneEffectDef, ctx: EffectContext): void;
  schedule(def: DelayedEffectDef, ctx: EffectContext): void;
}

export interface EffectServices {
  pipeline: DamagePipeline;
  targeting: TargetingService;
  statuses: StatusEffectSystem;
  events: GameEventBus;
  nav: NavGrid;
  rng: Rng;
  scheduler: EffectSchedulerPort;
  spawnProjectile: (projectile: Omit<Projectile, 'id'>) => void;
  /** 近戰 / 遠程 / 魔法的共通倍率（吸血） */
  categoryTraits: Balance['skillCategories'];
}

/**
 * 效果執行時的情境。同一次施放的效果共用同一個物件，
 * 所以位移（dash）更新 origin 後，後續效果會從新位置發出。
 */
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
  /** Combo 加成（沒有 Combo 時為 NO_MODS） */
  mods: Readonly<StepMods>;
  /** 執行巢狀效果 */
  run: (effects: readonly EffectDef[], ctx: EffectContext) => void;
}

/** 單一效果的執行邏輯；格式定義在 data/schema/effects.ts */
export interface IEffect<T extends EffectType = EffectType> {
  readonly type: T;
  apply(def: Extract<EffectDef, { type: T }>, ctx: EffectContext): void;
}
