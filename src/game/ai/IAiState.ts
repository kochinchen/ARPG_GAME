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
}

/**
 * AI 狀態只做「決策」：要追誰、要不要放棄。
 * 實際的追擊尋路與出手由 AttackSystem 執行（與玩家共用）。
 */
export interface IAiState {
  readonly name: AiStateName;
  enter(ctx: AiContext): void;
  /** 回傳下一個狀態；維持目前狀態則回傳 null */
  update(ctx: AiContext): AiStateName | null;
}
