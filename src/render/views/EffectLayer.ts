import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import type { Projectile } from '../../game/entities/Projectile';
import { PROJECTILE_COLORS } from '../palette';

const RING_LIFETIME = 0.35;

interface Ring {
  graphics: Graphics;
  age: number;
  radiusPx: number;
}

/**
 * 技能特效：投射物與範圍擴散圈。
 */
export class EffectLayer {
  /** 地面層（範圍圈），畫在角色下方 */
  readonly ground = new Container();
  private readonly rings: Ring[] = [];
  private readonly projectileViews = new Map<number, Graphics>();

  constructor(
    private readonly projection: IsoProjection,
    /** 投射物與角色一起依深度排序 */
    private readonly objectLayer: Container,
  ) {}

  /** 範圍效果：等角投影下的圓是 2:1 橢圓 */
  spawnRing(center: Vec2, radius: number, color: number): void {
    const s = this.projection.toScreen(center);
    const radiusPx = radius * this.projection.tileWidth * (Math.SQRT2 / 2);
    const graphics = new Graphics();
    graphics.position.set(s.x, s.y);
    this.ground.addChild(graphics);
    this.rings.push({ graphics, age: 0, radiusPx });
    graphics.tint = color;
  }

  update(dt: number, projectiles: readonly Projectile[], alpha: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]!;
      ring.age += dt;
      const t = ring.age / RING_LIFETIME;
      if (t >= 1) {
        ring.graphics.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      const r = ring.radiusPx * (0.35 + 0.65 * Math.sqrt(t));
      ring.graphics
        .clear()
        .ellipse(0, 0, r, r / 2)
        .fill({ color: 0xffffff, alpha: 0.18 * (1 - t) })
        .stroke({ color: 0xffffff, width: 3, alpha: 1 - t });
    }
    this.syncProjectiles(projectiles, alpha);
  }

  private syncProjectiles(projectiles: readonly Projectile[], alpha: number): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let view = this.projectileViews.get(p.id);
      if (!view) {
        const color = PROJECTILE_COLORS[p.skill.id] ?? 0xffffff;
        const px = p.radius * this.projection.tileWidth * 0.6;
        view = new Graphics()
          .ellipse(0, 0, px * 0.9, px * 0.45)
          .fill({ color: 0x000000, alpha: 0.35 })
          .circle(0, -24, px * 1.6)
          .fill({ color, alpha: 0.25 })
          .circle(0, -24, px)
          .fill({ color });
        this.projectileViews.set(p.id, view);
        this.objectLayer.addChild(view);
      }
      const pos = {
        x: p.prevPosition.x + (p.position.x - p.prevPosition.x) * alpha,
        y: p.prevPosition.y + (p.position.y - p.prevPosition.y) * alpha,
      };
      const s = this.projection.toScreen(pos);
      view.position.set(s.x, s.y);
      view.zIndex = this.projection.depth(pos);
    }
    for (const [id, view] of this.projectileViews) {
      if (seen.has(id)) continue;
      view.destroy();
      this.projectileViews.delete(id);
    }
  }
}
