import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import { rankValue } from '../../data/schema/common';
import type { Projectile } from '../../game/entities/Projectile';
import type { PendingEffect, Zone } from '../../game/skills/EffectScheduler';
import { firstElement } from '../../game/skills/effects/AreaEffect';
import { ELEMENT_COLORS } from '../palette';
import { ImpactFx, type ImpactInput } from './fx/ImpactFx';
import { drawProjectile, projectileArt, specialArt, type ProjectileArt } from './fx/ProjectileArt';

const TELEGRAPH_COLOR = 0xff4a3a;
/** 投射物的飛行高度（px） */
const FLIGHT_HEIGHT = 24;

interface ProjectileView {
  container: Container;
  shadow: Graphics;
  art: Graphics;
  style: ProjectileArt;
  special: boolean;
  age: number;
  trailTimer: number;
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

/**
 * 技能特效：投射物（箭、元素法術的多邊形造型與拖尾）、範圍爆發、連鎖閃電、前搖提示、地面持續區域。
 * 爆發與粒子由 ImpactFx 繪製。
 */
export class EffectLayer {
  /** 地面層（範圍圈），畫在角色下方 */
  readonly ground = new Container();
  private readonly fx: ImpactFx;
  private readonly telegraphs: Telegraph[] = [];
  private readonly projectileViews = new Map<number, ProjectileView>();
  private readonly zoneViews = new Map<number, Graphics>();
  private readonly pendingViews = new Map<number, Graphics>();

  constructor(
    private readonly projection: IsoProjection,
    /** 投射物與角色一起依深度排序 */
    private readonly objectLayer: Container,
  ) {
    this.fx = new ImpactFx(projection);
    this.ground.addChild(this.fx.ground);
  }

  /** 畫面震動（Renderer 加在 World 圖層的位移上） */
  get shake(): { x: number; y: number } {
    return this.fx.shake;
  }

  /** 範圍效果：依種類畫出爆炸、冰刺、落雷、震波、斬擊… */
  spawnImpact(input: ImpactInput): void {
    this.fx.impact(input);
  }

  /** 怪物重擊 / 法術的前搖提示：duration 秒後命中 */
  spawnTelegraph(
    center: Vec2,
    radius: number,
    direction: Vec2,
    angleDeg: number,
    duration: number,
    active: () => boolean,
    /** 直線範圍（長方形）：從 center 沿 direction 延伸 */
    line?: { length: number; width: number },
  ): void {
    const graphics = new Graphics();
    this.ground.addChild(graphics);
    const outline = line ? rectangle(center, direction, line.length, line.width) : sector(center, radius, direction, angleDeg);
    this.telegraphs.push({ graphics, age: 0, duration, outline, center, active });
  }

  /** 連鎖閃電：多股分岔、抖動的電弧 */
  spawnChain(points: readonly Vec2[], color: number, special: boolean): void {
    this.fx.chain(points, color, special);
  }

  update(
    dt: number,
    projectiles: readonly Projectile[],
    alpha: number,
    zones: readonly Zone[],
    pending: readonly PendingEffect[],
  ): void {
    // 上層特效（粒子、爆發）畫在角色之上
    if (!this.fx.top.parent && this.objectLayer.parent) this.objectLayer.parent.addChildAt(this.fx.top, this.objectLayer.parent.getChildIndex(this.objectLayer) + 1);
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
    this.syncZones(zones);
    this.syncPending(pending);
    this.syncProjectiles(projectiles, alpha, dt);
    this.fx.update(dt);
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
        g = new Graphics().poly(this.outline(p.position, rankValue(area.radius, p.ctx.rank) * (1 + p.ctx.mods.aoeRadius))).stroke({ color, width: 2, alpha: 0.9 });
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

  private syncProjectiles(projectiles: readonly Projectile[], alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let view = this.projectileViews.get(p.id);
      if (!view) {
        const element = firstElement(p.onHit);
        const special = p.mods.combo?.success ?? false;
        const base = projectileArt(p.skill.id, element, p.skill.tags.includes('ranged'));
        const style = special ? specialArt(base) : base;
        const container = new Container();
        const px = p.radius * this.projection.tileWidth * 0.6;
        const shadow = new Graphics().ellipse(0, 0, px * 1.2, px * 0.5).fill({ color: 0x000000, alpha: 0.3 });
        const art = new Graphics();
        art.blendMode = 'normal';
        art.position.set(0, -FLIGHT_HEIGHT);
        container.addChild(shadow, art);
        view = { container, shadow, art, style, special, age: 0, trailTimer: 0 };
        this.projectileViews.set(p.id, view);
        this.objectLayer.addChild(container);
      }
      view.age += dt;
      const pos = {
        x: p.prevPosition.x + (p.position.x - p.prevPosition.x) * alpha,
        y: p.prevPosition.y + (p.position.y - p.prevPosition.y) * alpha,
      };
      const s = this.projection.toScreen(pos);
      view.container.position.set(s.x, s.y);
      view.container.zIndex = this.projection.depth(pos);
      // 依畫面上的飛行方向轉動（箭、冰槍朝前；火球的火舌往後拖）
      const d0 = this.projection.toScreen(vec2(0, 0));
      const d1 = this.projection.toScreen(p.direction);
      const angle = Math.atan2(d1.y - d0.y, d1.x - d0.x);
      view.art.rotation = angle;
      drawProjectile(view.art.clear(), view.style, view.age, view.special);
      // 拖尾粒子
      const st = view.style;
      if (st.trail && st.trailRate > 0) {
        view.trailTimer -= dt * st.trailRate;
        while (view.trailTimer <= 0) {
          view.trailTimer += 1;
          const back = 8 * st.size;
          this.fx.emit(st.trail, s.x - Math.cos(angle) * back, s.y - FLIGHT_HEIGHT - Math.sin(angle) * back, st.trail === 'ember' || st.trail === 'spark' ? (Math.random() < 0.5 ? st.core : st.color) : st.color, 0.35);
        }
      }
    }
    for (const [id, view] of this.projectileViews) {
      if (seen.has(id)) continue;
      view.container.destroy({ children: true });
      this.projectileViews.delete(id);
    }
  }
}

/** World 座標的圓（angleDeg = 360）或朝 direction 的扇形外框 */
/** 從 start 沿 direction 延伸 length、寬 width 的長方形 */
function rectangle(start: Vec2, direction: Vec2, length: number, width: number): Vec2[] {
  const n = vec2(-direction.y * (width / 2), direction.x * (width / 2));
  const end = vec2(start.x + direction.x * length, start.y + direction.y * length);
  return [vec2(start.x + n.x, start.y + n.y), vec2(end.x + n.x, end.y + n.y), vec2(end.x - n.x, end.y - n.y), vec2(start.x - n.x, start.y - n.y)];
}

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
