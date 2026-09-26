import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { NavGrid } from '../movement/NavGrid';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import type { AiStateName } from './AiBrain';
import type { AiContext, IAiState } from './IAiState';
import { ChaseState } from './states/ChaseState';
import { IdleState } from './states/IdleState';
import { ReturnState } from './states/ReturnState';

/**
 * 對每個有 AiBrain 的 Actor 執行狀態機。怪物與（未來的）召喚物共用，只是敵對陣營不同。
 */
export class AiSystem {
  private readonly states: Record<AiStateName, IAiState> = {
    idle: new IdleState(),
    chase: new ChaseState(),
    return: new ReturnState(),
  };

  constructor(
    private readonly targeting: TargetingService,
    private readonly nav: NavGrid,
    private readonly pathfinder: Pathfinder,
    events: GameEventBus,
  ) {
    // 被攻擊時記錄仇恨來源
    events.on('ActorDamaged', (e) => {
      const target = targeting.getActor(e.targetId);
      if (target?.ai && e.sourceId !== null) target.ai.provokedBy = e.sourceId;
    });
  }

  update(actors: readonly Actor[]): void {
    for (const self of actors) {
      const brain = self.ai;
      if (!brain || !self.alive || self.isDisabled) continue;
      const ctx: AiContext = { self, brain, actors, targeting: this.targeting, nav: this.nav, pathfinder: this.pathfinder };
      const next = this.states[brain.state].update(ctx);
      if (next !== null && next !== brain.state) {
        brain.state = next;
        this.states[next].enter(ctx);
      }
    }
  }
}
