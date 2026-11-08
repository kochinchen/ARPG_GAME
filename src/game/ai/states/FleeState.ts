import { distance } from '../../../core/math/Vec2';
import { findPathFor, type AiContext, type IAiState } from '../IAiState';

/**
 * 誘敵：血少的怪往另一群閒置的怪逃（Errands.pickLure 決定方向），不出手、也不叫醒牠們；
 * 追過來的主角走進那一群的視野就會被一起打。到了（arriveDistance）或 maxTime 秒後回頭打原本的目標。
 * 召喚者死掉時潰散（AiSystem.rout）也用這個狀態，秒數是 brain.fleeFor。
 */
export class FleeState implements IAiState {
  readonly name = 'flee' as const;

  enter(ctx: AiContext): void {
    const { self, brain, tactics } = ctx;
    self.intent = null;
    brain.slot = null;
    brain.waiting = false;
    brain.flanking = false;
    brain.fleeTimer = brain.fleeFor ?? tactics.lure.maxTime;
    brain.fleeFor = null;
    self.path = brain.fleeTo ? findPathFor(ctx, brain.fleeTo) : [];
  }

  update(ctx: AiContext) {
    const { self, brain, targeting, tactics, dt } = ctx;
    const target = brain.targetId === null ? null : targeting.getValidTarget(self, brain.targetId);
    brain.fleeTimer -= dt;
    const spot = brain.fleeTo;
    const arrived = !spot || distance(self.position, spot) <= tactics.lure.arriveDistance;
    if (!target || arrived || brain.fleeTimer <= 0) return this.done(ctx, target !== null);
    if (!self.isMoving && brain.dodgeTimer <= 0) {
      self.path = findPathFor(ctx, spot);
      if (self.path.length === 0) return this.done(ctx, true);
    }
    return null;
  }

  private done({ self, brain }: AiContext, hasTarget: boolean) {
    brain.fleeTo = null;
    self.path = [];
    return hasTarget ? ('chase' as const) : ('return' as const);
  }
}
