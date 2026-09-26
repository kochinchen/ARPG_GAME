import type { AiContext, IAiState } from '../IAiState';

/** 走回出生點；途中不理會玩家，到家後回到閒置 */
export class ReturnState implements IAiState {
  readonly name = 'return' as const;

  enter({ self, brain, pathfinder }: AiContext): void {
    self.intent = null;
    brain.targetId = null;
    brain.provokedBy = null;
    self.path = pathfinder.findPath(self.position, brain.home, self.radius);
  }

  update({ self }: AiContext) {
    return self.isMoving ? null : ('idle' as const);
  }
}
