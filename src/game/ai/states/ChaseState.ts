import { distance } from '../../../core/math/Vec2';
import type { AiContext, IAiState } from '../IAiState';

/** 追擊並攻擊目標（交給 AttackSystem 執行）；目標消失或離家太遠就放棄 */
export class ChaseState implements IAiState {
  readonly name = 'chase' as const;

  enter({ self, brain }: AiContext): void {
    self.attackTarget = brain.targetId;
    self.attackHold = true;
    self.repathCooldown = 0;
  }

  update({ self, brain, targeting }: AiContext) {
    const target = brain.targetId === null ? null : targeting.getValidTarget(self, brain.targetId);
    if (!target) return 'return' as const;
    if (distance(self.position, brain.home) > brain.leashRange) return 'return' as const;
    // AttackSystem 可能因暫時無效而清掉目標，這裡保持追擊意圖
    self.attackTarget = target.id;
    return null;
  }
}
