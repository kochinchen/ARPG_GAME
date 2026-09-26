import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import { PALETTE } from '../palette';

/**
 * 角色的暫用外觀：影子 + 身體 + 面向指示。
 */
export class ActorView {
  readonly container = new Container();
  private readonly facingMark = new Graphics();

  constructor(
    private readonly projection: IsoProjection,
    radius: number,
  ) {
    const px = radius * projection.tileWidth;
    const shadow = new Graphics().ellipse(0, 0, px, px / 2).fill({ color: PALETTE.shadow, alpha: 0.45 });
    const body = new Graphics()
      .roundRect(-px * 0.55, -44, px * 1.1, 40, 7)
      .fill({ color: PALETTE.player })
      .stroke({ color: PALETTE.playerDark, width: 2 });
    const head = new Graphics().circle(0, -50, 8).fill({ color: PALETTE.player }).stroke({ color: PALETTE.playerDark, width: 2 });
    this.facingMark.circle(0, 0, 3).fill({ color: PALETTE.marker });
    this.container.addChild(shadow, this.facingMark, body, head);
  }

  update(position: Vec2, facing: Vec2): void {
    const s = this.projection.toScreen(position);
    this.container.position.set(s.x, s.y);
    this.container.zIndex = this.projection.depth(position);
    const f = this.projection.toScreen(facing);
    const len = Math.hypot(f.x, f.y) || 1;
    this.facingMark.position.set((f.x / len) * 22, (f.y / len) * 11);
  }
}
