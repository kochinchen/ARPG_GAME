import { distance } from '../../../core/math/Vec2';
import type { AiContext, IAiState } from '../IAiState';
import { findVisibleHostile } from './IdleState';

/** 被硬上限拉回去時：主角比「往回走以來離牠最遠的距離」近這麼多格，就算追上來了（Tile） */
const RETURN_APPROACH = 1.5;
/** 主角追上來而回頭時的憤怒秒數：這段時間內不會又因為離家太遠掉頭 */
const RETURN_ANGER = 3;

/**
 * 走回出生點；途中被攻擊、或又看到敵人（偵測範圍內、視線沒被牆擋住）就回頭追擊，到家後回到閒置。
 * （設計者 2026-11-21：主角衝上去、朝牠們放技能，牠們都頭也不回，很奇怪）
 * 被硬上限（HARD_LEASH）拉回去的：主角站著不動或往後退時不回頭，主角朝牠靠近、或打牠就回頭——
 * 相對位置一改變就繼續追殺；主角跑掉牠就回家，不會追到天涯海角。
 */
export class ReturnState implements IAiState {
  readonly name = 'return' as const;

  enter(ctx: AiContext): void {
    const { self, brain, pathfinder, targeting } = ctx;
    const last = brain.targetId === null ? null : targeting.getActor(brain.targetId);
    brain.homewardGap = last ? distance(self.position, last.position) : 0;
    self.intent = null;
    brain.targetId = null;
    brain.provokedBy = null;
    self.path = pathfinder.findPath(self.position, brain.home, self.radius);
  }

  update(ctx: AiContext) {
    const { self, brain, targeting } = ctx;
    const provoker = brain.provokedBy === null ? null : targeting.getValidTarget(self, brain.provokedBy);
    brain.provokedBy = null;
    if (brain.homeward && distance(self.position, brain.home) <= brain.leashRange) brain.homeward = false;
    let target = provoker;
    if (!target) {
      const seen = findVisibleHostile(ctx);
      if (seen && brain.homeward) {
        const gap = distance(self.position, seen.position);
        brain.homewardGap = Math.max(brain.homewardGap, gap);
        if (gap < brain.homewardGap - RETURN_APPROACH) {
          target = seen;
          brain.angerTimer = Math.max(brain.angerTimer, RETURN_ANGER);
        }
      } else target = seen;
    }
    if (target) {
      brain.homeward = false;
      brain.targetId = target.id;
      return 'chase' as const;
    }
    if (self.isMoving) return null;
    brain.homeward = false;
    return 'idle' as const;
  }
}
