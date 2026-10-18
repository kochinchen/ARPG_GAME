import type { AiContext, IAiState } from '../IAiState';

/** 走回出生點；途中只在被攻擊時回頭追擊，到家後回到閒置 */
export class ReturnState implements IAiState {
  readonly name = 'return' as const;

  enter({ self, brain, pathfinder }: AiContext): void {
    self.intent = null;
    brain.targetId = null;
    brain.provokedBy = null;
    self.path = pathfinder.findPath(self.position, brain.home, self.radius);
  }

  update({ self, brain, targeting }: AiContext) {
    const provoker = brain.provokedBy === null ? null : targeting.getValidTarget(self, brain.provokedBy);
    brain.provokedBy = null;
    if (provoker) {
      brain.targetId = provoker.id;
      return 'chase' as const;
    }
    return self.isMoving ? null : ('idle' as const);
  }
}
