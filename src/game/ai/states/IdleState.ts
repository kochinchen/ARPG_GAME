import { distance, vec2 } from '../../../core/math/Vec2';
import type { Actor } from '../../entities/Actor';
import type { AiContext, IAiState } from '../IAiState';

/** 閒置時在出生點附近走動的範圍（Tile）與每次停留的秒數 */
const WANDER_RADIUS = 2.5;
const WANDER_PAUSE: [number, number] = [1.5, 4];

/** 在出生點附近小範圍走動，發現敵人或被攻擊時開始追擊 */
export class IdleState implements IAiState {
  readonly name = 'idle' as const;

  enter({ self, brain, rng }: AiContext): void {
    self.intent = null;
    self.path = [];
    brain.targetId = null;
    brain.wanderTimer = rng.range(WANDER_PAUSE[0], WANDER_PAUSE[1]);
  }

  update(ctx: AiContext) {
    const { self, brain, targeting } = ctx;
    const provoker = brain.provokedBy === null ? null : targeting.getValidTarget(self, brain.provokedBy);
    brain.provokedBy = null;
    const target = provoker ?? findVisibleHostile(ctx);
    if (!target) {
      wander(ctx);
      return null;
    }
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

/** 停一下、走一段：在出生點附近隨機挑一個走得到的點（不會走遠，也不會越走越偏） */
function wander({ self, brain, rng, nav, pathfinder, dt }: AiContext): void {
  if (self.moveSpeed <= 0 || self.isMoving) return;
  brain.wanderTimer -= dt;
  if (brain.wanderTimer > 0) return;
  brain.wanderTimer = rng.range(WANDER_PAUSE[0], WANDER_PAUSE[1]);
  const angle = rng.range(0, Math.PI * 2);
  const r = rng.range(0.8, WANDER_RADIUS);
  const target = vec2(brain.home.x + Math.cos(angle) * r, brain.home.y + Math.sin(angle) * r);
  if (!nav.isClearAt(target, self.radius)) return;
  self.path = pathfinder.findPath(self.position, target, self.radius);
}
