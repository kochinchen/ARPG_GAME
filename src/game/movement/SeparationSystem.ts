import { distance, vec2, type Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { NavGrid } from './NavGrid';
import { pushOut } from '../entities/BodyShape';

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
      if (!a.alive || a.vanished) continue;
      for (let j = i + 1; j < actors.length; j++) {
        const b = actors[j]!;
        if (!b.alive || b.vanished) continue;
        // 一方有身體輪廓（怪物）、另一方是圓（主角）：把圓推到輪廓外面；兩隻怪物之間照舊用圓
        if (!a.body !== !b.body) {
          this.pushFromBody(a.body ? a : b, a.body ? b : a);
          continue;
        }
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

  /** 圓形的角色碰到有輪廓的角色：大部分由圓形的一方讓開（大型怪不會被主角推著走） */
  private pushFromBody(body: Actor, circle: Actor): void {
    const push = pushOut(body, circle);
    if (!push) return;
    const circleShare = circle.moveSpeed > 0 ? (body.moveSpeed > 0 ? 0.85 : 1) : 0;
    const moved = circleShare > 0 && this.tryMove(circle, vec2(circle.position.x + push.dir.x * push.overlap * circleShare, circle.position.y + push.dir.y * push.overlap * circleShare));
    const bodyShare = moved ? 1 - circleShare : 1;
    if (body.moveSpeed > 0 && bodyShare > 0) this.tryMove(body, vec2(body.position.x - push.dir.x * push.overlap * bodyShare, body.position.y - push.dir.y * push.overlap * bodyShare));
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
