import type { DataTable } from '../../data/DataRegistry';
import type { SkillDef } from '../../data/schema/skill';
import type { Rng } from '../../core/Rng';
import type { Actor } from '../entities/Actor';
import type { NavGrid } from '../movement/NavGrid';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import type { AiBrain, AiStateName } from './AiBrain';

export interface AiContext {
  self: Actor;
  brain: AiBrain;
  actors: readonly Actor[];
  targeting: TargetingService;
  nav: NavGrid;
  pathfinder: Pathfinder;
  skills: DataTable<SkillDef>;
  /** 閒置走動用的亂數（Seeded） */
  rng: Rng;
  dt: number;
}

/**
 * AI 狀態只做「決策」：要追誰、要不要放棄。
 * 實際的追擊尋路與出手由 SkillSystem 執行（與玩家共用）。
 */
export interface IAiState {
  readonly name: AiStateName;
  enter(ctx: AiContext): void;
  /** 回傳下一個狀態；維持目前狀態則回傳 null */
  update(ctx: AiContext): AiStateName | null;
}
