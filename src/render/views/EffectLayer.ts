import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { Projectile } from '../../game/entities/Projectile';
import type { PendingEffect, Zone } from '../../game/skills/EffectScheduler';
import { firstElement } from '../../game/skills/effects/AreaEffect';
import { ELEMENT_COLORS, PROJECTILE_COLORS } from '../palette';

const RING_LIFETIME = 0.35;
const TELEGRAPH_COLOR = 0xff4a3a;
const CHAIN_LIFETIME = 0.25;

interface Ring {
  graphics: Graphics;
  age: number;
  /** 範圍的 World 座標外框（圓或扇形） */
  outline: Vec2[];
  center: Vec2;
}

/** 前搖提示：範圍外框 + 由中心往外填滿，填滿的瞬間命中 */
interface Telegraph {
  graphics: Graphics;
  age: number;
  duration: number;
  outline: Vec2[];
  center: Vec2;
  /** 施放被打斷（暈眩、冰凍、死亡）時提早移除 */
  active: () => boolean;
}

interface Bolt {
  graphics: Graphics;
  age: number;
}

/**
 * 技能特效：投射物與範圍擴散圈。
 */
export class EffectLayer {
  /** 地面層（範圍圈），畫在角色下方 */
  readonly ground = new Container();
  private readonly rings: Ring[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly telegraphs: Telegraph[] = [];
  private readonly projectileViews = new Map<number, Graphics>();
  private readonly zoneViews = new Map<number, Graphics>();
  private readonly pendingViews = new Map<number, Graphics>();

  constructor(
    private readonly projection: IsoProjection,
    /** 投射物與角色一起依深度排序 */
    private readonly objectLayer: Container,
  ) {}

  /** 範圍效果：在 World 座標畫圓或扇形，再投影到畫面（等角下成為橢圓） */
  spawnRing(center: Vec2, radius: number, color: number, direction: Vec2, angleDeg: number): void {
    const graphics = new Graphics();
    graphics.tint = color;
    this.ground.addChild(graphics);
    this.rings.push({ graphics, age: 0, outline: sector(center, radius, direction, angleDeg), center });
  }

  /** 怪物重擊 / 法術的前搖提示：duration 秒後命中 */
  spawnTelegraph(center: Vec2, radius: number, direction: Vec2, angleDeg: number, duration: number, active: () => boolean): void {
    const graphics = new Graphics();
    this.ground.addChild(graphics);
    this.telegraphs.push({ graphics, age: 0, duration, outline: sector(center, radius, direction, angleDeg), center, active });
  }

  /** 連鎖閃電：依序連線 */
  spawnChain(points: readonly Vec2[], color: number): void {
    const g = new Graphics();
    const screen = points.map((p) => this.projection.toScreen(p));
    g.moveTo(screen[0]!.x, screen[0]!.y - 30);
    for (const p of screen.slice(1)) g.lineTo(p.x, p.y - 30);
    g.stroke({ color, width: 3 });
    this.ground.parent?.addChild(g);
    this.bolts.push({ graphics: g, age: 0 });
  }

  update(
    dt: number,
    projectiles: readonly Projectile[],
    alpha: number,
    zones: readonly Zone[],
    pending: readonly PendingEffect[],
  ): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]!;
      ring.age += dt;
      const t = ring.age / RING_LIFETIME;
      if (t >= 1) {
        ring.graphics.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      // 由中心往外擴散
      const k = 0.35 + 0.65 * Math.sqrt(t);
      const points = ring.outline.flatMap((p) => {
        const s = this.projection.toScreen(vec2(ring.center.x + (p.x - ring.center.x) * k, ring.center.y + (p.y - ring.center.y) * k));
        return [s.x, s.y];
      });
      ring.graphics
        .clear()
        .poly(points)
        .fill({ color: 0xffffff, alpha: 0.18 * (1 - t) })
        .stroke({ color: 0xffffff, width: 3, alpha: 1 - t });
    }
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const tg = this.telegraphs[i]!;
      tg.age += dt;
      if (tg.age >= tg.duration || !tg.active()) {
        tg.graphics.destroy();
        this.telegraphs.splice(i, 1);
        continue;
      }
      const t = tg.age / tg.duration;
      const toScreen = (k: number) =>
        tg.outline.flatMap((p) => {
          const s = this.projection.toScreen(vec2(tg.center.x + (p.x - tg.center.x) * k, tg.center.y + (p.y - tg.center.y) * k));
          return [s.x, s.y];
        });
      tg.graphics
        .clear()
        .poly(toScreen(1))
        .fill({ color: TELEGRAPH_COLOR, alpha: 0.12 })
        .stroke({ color: TELEGRAPH_COLOR, width: 2, alpha: 0.85 })
        .poly(toScreen(t))
        .fill({ color: TELEGRAPH_COLOR, alpha: 0.3 });
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i]!;
      bolt.age += dt;
      bolt.graphics.alpha = 1 - bolt.age / CHAIN_LIFETIME;
      if (bolt.age >= CHAIN_LIFETIME) {
        bolt.graphics.destroy();
        this.bolts.splice(i, 1);
      }
    }
    this.syncZones(zones);
    this.syncPending(pending);
    this.syncProjectiles(projectiles, alpha);
  }

  /** 地面持續區域：半透明圓，閃爍表示仍在作用 */
  private syncZones(zones: readonly Zone[]): void {
    const seen = new Set<number>();
    for (const zone of zones) {
      seen.add(zone.id);
      let g = this.zoneViews.get(zone.id);
      if (!g) {
        const color = ELEMENT_COLORS[firstElement(zone.effects) ?? 'fire'] ?? 0xff7a2a;
        g = new Graphics().poly(this.outline(zone.position, zone.radius)).fill({ color, alpha: 0.28 }).stroke({ color, width: 2, alpha: 0.8 });
        this.ground.addChild(g);
        this.zoneViews.set(zone.id, g);
      }
      g.alpha = 0.7 + 0.3 * Math.sin(performance.now() / 90 + zone.id);
    }
    for (const [id, g] of this.zoneViews) {
      if (seen.has(id)) continue;
      g.destroy();
      this.zoneViews.delete(id);
    }
  }

  /** 延遲效果的預警：落點顯示虛線圈 */
  private syncPending(pending: readonly PendingEffect[]): void {
    const seen = new Set<number>();
    for (const p of pending) {
      if (p.followCaster) continue;
      const area = p.effects.find((e) => e.type === 'area');
      if (!area || area.type !== 'area') continue;
      seen.add(p.id);
      let g = this.pendingViews.get(p.id);
      if (!g) {
        const color = ELEMENT_COLORS[firstElement(area.effects) ?? 'physical'] ?? 0xffffff;
        g = new Graphics().poly(this.outline(p.position, area.radius)).stroke({ color, width: 2, alpha: 0.9 });
        this.ground.addChild(g);
        this.pendingViews.set(p.id, g);
      }
      g.alpha = 0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 120));
    }
    for (const [id, g] of this.pendingViews) {
      if (seen.has(id)) continue;
      g.destroy();
      this.pendingViews.delete(id);
    }
  }

  private outline(center: Vec2, radius: number): number[] {
    return sector(center, radius, vec2(1, 0), 360).flatMap((p) => {
      const s = this.projection.toScreen(p);
      return [s.x, s.y];
    });
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

/** World 座標的圓（angleDeg = 360）或朝 direction 的扇形外框 */
function sector(center: Vec2, radius: number, direction: Vec2, angleDeg: number): Vec2[] {
  const full = angleDeg >= 360;
  const base = Math.atan2(direction.y, direction.x);
  const span = (Math.min(angleDeg, 360) * Math.PI) / 180;
  const segments = 32;
  const points: Vec2[] = full ? [] : [center];
  for (let i = 0; i <= segments; i++) {
    if (full && i === segments) break;
    const a = full ? (i / segments) * Math.PI * 2 : base - span / 2 + (span * i) / segments;
    points.push(vec2(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius));
  }
  return points;
}
