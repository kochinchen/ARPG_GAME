import type { DataTable } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { SkillDef } from '../../data/schema/skill';
import type { EnemyDef } from '../../data/schema/enemy';
import type { Rng } from '../../core/Rng';
import type { Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { GroundItem } from '../entities/Interactable';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import type { AiBrain, AiStateName, CorpseView } from './AiBrain';

/** AI 看得到的地上東西（GameWorld 每個 Tick 傳入） */
export interface AiSurroundings {
  groundItems: readonly GroundItem[];
  corpses: readonly CorpseView[];
}

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
  events: GameEventBus;
  /** 集體戰術與特殊行為的設定 */
  tactics: Balance['enemyTactics'];
  enemies: DataTable<EnemyDef>;
  surroundings: AiSurroundings;
  /** 預判射擊的比例（隨樓層；SkillIntent.lead） */
  lead: number;
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

/** 怪物的尋路：繞開主角放在地上的區域（魔王、正在硬闖的不繞） */
export function findPathFor({ self, brain, pathfinder }: AiContext, to: Vec2): Vec2[] {
  const avoid = self.faction === 'enemy' && !self.isBoss && brain.braveTimer <= 0;
  return pathfinder.findPath(self.position, to, self.radius, avoid);
}
