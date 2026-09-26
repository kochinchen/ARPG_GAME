import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { Checkpoint } from '../../game/world/CheckpointSystem';
import { FLOOR_COLORS } from '../palette';

/**
 * 地面上的存檔點符文：未啟動為灰色，啟動後發藍光。
 */
export class FloorMarkersView {
  readonly container = new Container();
  private views: { checkpoint: Checkpoint; graphics: Graphics }[] = [];

  constructor(private readonly projection: IsoProjection) {}

  rebuild(checkpoints: readonly Checkpoint[]): void {
    this.container.removeChildren().forEach((c) => c.destroy());
    this.views = checkpoints.map((checkpoint) => {
      const graphics = new Graphics();
      this.container.addChild(graphics);
      return { checkpoint, graphics };
    });
  }

  update(time: number): void {
    for (const { checkpoint, graphics } of this.views) {
      const color = checkpoint.kind === 'stairs' ? FLOOR_COLORS.stairs : checkpoint.active ? FLOOR_COLORS.checkpointActive : FLOOR_COLORS.checkpointIdle;
      const pulse = checkpoint.active ? 0.55 + 0.25 * Math.sin(time / 300) : 0.45;
      graphics.clear();
      graphics.poly(this.circle(checkpoint.position, 0.9)).fill({ color, alpha: 0.15 * pulse }).stroke({ color, width: 2, alpha: pulse });
      graphics.poly(this.circle(checkpoint.position, 0.45)).stroke({ color, width: 1.5, alpha: pulse });
    }
  }

  private circle(center: Vec2, radius: number): number[] {
    const points: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const s = this.projection.toScreen(vec2(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius));
      points.push(s.x, s.y);
    }
    return points;
  }
}
