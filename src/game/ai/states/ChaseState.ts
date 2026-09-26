import { distance } from '../../../core/math/Vec2';
import type { AiContext, IAiState } from '../IAiState';

/** 追擊並攻擊目標（交給 SkillSystem 執行）；目標消失或離家太遠就放棄 */
export class ChaseState implements IAiState {
  readonly name = 'chase' as const;

  enter(ctx: AiContext): void {
    ctx.self.repathCooldown = 0;
    this.keepChasing(ctx);
  }

  update(ctx: AiContext) {
    const { self, brain, targeting } = ctx;
    const target = brain.targetId === null ? null : targeting.getValidTarget(self, brain.targetId);
    if (!target) return 'return' as const;
    if (distance(self.position, brain.home) > brain.leashRange) return 'return' as const;
    this.keepChasing(ctx);
    return null;
  }

  /** SkillSystem 在目標暫時無效時會清掉意圖，這裡持續維持追擊 */
  private keepChasing({ self, brain }: AiContext): void {
    if (brain.targetId === null || self.intent?.targetId === brain.targetId) return;
    self.intent = { skillId: brain.skillId, targetId: brain.targetId, point: self.position, hold: true };
  }
}
