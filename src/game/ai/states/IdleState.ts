import { distance } from '../../../core/math/Vec2';
import type { Actor } from '../../entities/Actor';
import type { AiContext, IAiState } from '../IAiState';

/** 待在原地，發現敵人或被攻擊時開始追擊 */
export class IdleState implements IAiState {
  readonly name = 'idle' as const;

  enter({ self, brain }: AiContext): void {
    self.attackTarget = null;
    self.path = [];
    brain.targetId = null;
  }

  update(ctx: AiContext) {
    const { self, brain, targeting } = ctx;
    const provoker = brain.provokedBy === null ? null : targeting.getValidTarget(self, brain.provokedBy);
    brain.provokedBy = null;
    const target = provoker ?? findVisibleHostile(ctx);
    if (!target) return null;
    brain.targetId = target.id;
    return 'chase' as const;
  }
}

/** 偵測範圍內、視線未被牆擋住的最近敵人 */
function findVisibleHostile({ self, brain, actors, targeting, nav }: AiContext): Actor | null {
  let best: Actor | null = null;
  let bestDistance = brain.detectRange;
  for (const other of actors) {
    if (!other.alive || !targeting.isHostile(self.faction, other.faction)) continue;
    const d = distance(self.position, other.position);
    if (d > bestDistance || !nav.hasLineOfSight(self.position, other.position, 0)) continue;
    best = other;
    bestDistance = d;
  }
  return best;
}
