import { distance, vec2, type Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { NavGrid } from './NavGrid';

/**
 * 角色之間互相推開，避免多隻怪物疊成一點。
 * 不會移動的角色（moveSpeed = 0，例如訓練木樁）只推別人、自己不動。
 * 推開後的位置若會碰牆就不移動該角色。
 */
export class SeparationSystem {
  constructor(private readonly nav: NavGrid) {}

  update(actors: readonly Actor[]): void {
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < actors.length; j++) {
        const b = actors[j]!;
        if (!b.alive) continue;
        const minDistance = a.radius + b.radius;
        const d = distance(a.position, b.position);
        if (d >= minDistance) continue;

        const aMovable = a.moveSpeed > 0;
        const bMovable = b.moveSpeed > 0;
        if (!aMovable && !bMovable) continue;

        // 完全重疊時用 ID 決定方向，保持結果可重現
        const dir = d > 1e-6 ? vec2((b.position.x - a.position.x) / d, (b.position.y - a.position.y) / d) : fallbackDirection(a.id, b.id);
        const overlap = minDistance - d;
        const aShare = aMovable && bMovable ? 0.5 : aMovable ? 1 : 0;

        // a 被牆擋住推不動時，由 b 承擔全部位移
        const aMoved = aShare > 0 && this.tryMove(a, vec2(a.position.x - dir.x * overlap * aShare, a.position.y - dir.y * overlap * aShare));
        const bShare = aMoved ? 1 - aShare : 1;
        if (bMovable) this.tryMove(b, vec2(b.position.x + dir.x * overlap * bShare, b.position.y + dir.y * overlap * bShare));
      }
    }
  }

  private tryMove(actor: Actor, to: Vec2): boolean {
    if (!this.nav.isClearAt(to, actor.radius)) return false;
    actor.position = to;
    return true;
  }
}

function fallbackDirection(a: number, b: number): Vec2 {
  const angle = ((a * 73 + b * 151) % 360) * (Math.PI / 180);
  return vec2(Math.cos(angle), Math.sin(angle));
}
