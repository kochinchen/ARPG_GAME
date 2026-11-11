import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import { rankValue } from '../../data/schema/common';
import type { Projectile } from '../../game/entities/Projectile';
import type { PendingEffect, Zone } from '../../game/skills/EffectScheduler';
import { originalSkillId } from '../../game/enemies/MimicSkills';
import { firstElement } from '../../game/skills/effects/AreaEffect';
import { ZONE_TIER_LOOK, zoneTier, type ZoneTier } from './fx/ZoneTier';
import { figureScale } from '../figure/FigureModel';
import { PROJECTILE_MODELS } from '../figure/Monsters';
import { PolyFigure } from '../figure/PolyFigure';
import { ELEMENT_COLORS } from '../palette';
import { DarkDomainFx } from './fx/DarkDomainFx';
import { ImpactFx, type ImpactInput } from './fx/ImpactFx';
import { drawProjectile, projectileArt, specialArt, type ProjectileArt } from './fx/ProjectileArt';
import { drawWeb, webNodes } from './fx/WebFx';

const TELEGRAPH_COLOR = 0xff4a3a;
/** 投射物的飛行高度（px） */
const FLIGHT_HEIGHT = 24;
/** 3D 投射物的旋轉速度（弧度 / 秒） */
const FLYING_SPIN = 16;

/** Three.js 畫法提供的 3D 物件（ThreeWorld 會 import 這個檔案的型別，這裡只宣告用到的部分，避免循環相依） */
type FlyingFigure = NonNullable<PolyFigure['sink']> & {
  place(position: Vec2, offset: Vec2, lift: number, tint: number, alpha: number, visible: boolean): void;
  dispose(): void;
};
interface FigureHost {
  createFigure(): FlyingFigure;
}

interface ProjectileView {
  container: Container;
  shadow: Graphics;
  art: Graphics;
  style: ProjectileArt;
  special: boolean;
  age: number;
  trailTimer: number;
  /** 會發光（法術的光球、元素箭）：Three.js 畫法的光源 */
  glows: boolean;
  /** 有 3D 模型的投射物（迴旋飛斧） */
  /** 原始的招式 ID 與最後的位置（投射物消失時在那裡放特效） */
  skillId: string;
  at: Vec2;
  model?: { figure: PolyFigure; three: FlyingFigure | null };
}

/**
 * 發光的特效（Three.js 畫法放一盞點光源照亮周圍、投射影子，並畫光暈、火花、地上的光圈）：
 * id（同一個特效每幀相同）、種類、位置、離地高度（px）、顏色、亮度（0～1）、範圍半徑（World）、進度（0～1；光球與持續區域為 0）
 */
export interface FxGlow {
  id: string;
  /** 哪一招（火牆的火焰、隕石、電擊的殘影依招式畫） */
  skillId?: string;
  /** 地面持續區域的屬性與殺傷力階級（Three.js 畫法依此不斷冒出火焰、冰晶、電光、毒泡泡） */
  element?: string | null;
  tier?: ZoneTier;
  kind: 'orb' | 'flash' | 'zone' | 'pending';
  position: Vec2;
  height: number;
  color: number;
  strength: number;
  radius: number;
  t: number;
  /** 地面持續區域還剩幾秒、形狀的種子（晶網的冰錐長在網的節點上，活到網消失） */
  life?: number;
  seed?: number;
}

/** 開始施放（Three.js 畫法的出招特效：蓄力光、拋射的箭、突進的風、從天而降的火球…） */
export interface FxCast {
  skillId: string;
  caster: Vec2;
  point: Vec2;
  direction: Vec2;
  /** 距離效果觸發還有幾秒 */
  impactIn: number;
  /** 突進的終點（有位移的招式） */
  dashTo?: Vec2;
  /** 延遲效果的秒數（爆裂箭的箭在空中飛的時間） */
  delay?: number;
}

/** 飛行中的投射物（Three.js 畫法：鉤索的鎖鏈、電擊的殘影） */
export interface FxFlying {
  id: number;
  skillId: string;
  position: Vec2;
  direction: Vec2;
}

/**
 * Three.js 畫法的技能特效（ThreeSkillFx）：收到出招、命中、連鎖。
 * impact 回傳 true 表示這一招由 Three.js 完整畫出，不再畫 Pixi 的圖樣（例如直立的重砍刀光、寬雷柱、隕石）。
 */
export interface SkillFxListener {
  cast(c: FxCast): void;
  impact(i: ImpactInput): boolean;
  chain(points: readonly Vec2[], color: number): void;
}

/** 爆炸、命中瞬間的閃光：持續秒數（大招較久）、光源離地高度（px；火光往上竄，比飛行高度高，矮的物件影子才不會拉得很長） */
const FLASH_HEIGHT = 40;
const FLASH_TIME = 0.35;
const BIG_FLASH_TIME = 0.6;
const CHAIN_FLASH_TIME = 0.25;
/** 地面持續區域（火牆、毒池…）與延遲效果（隕星、落雷的預警）的光：離地高度（px） */
const ZONE_GLOW_HEIGHT = 20;

/** 魔王模擬器的範圍預覽：一個圈 */
export interface RangeRing {
  radius: number;
  angleDeg: number;
  color: number;
  width: number;
  fill: number;
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
  /** 範圍跟著移動（噬界足眼的印記） */
  follow?: () => Vec2 | null;
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
  private three: FigureHost | null = null;
  /** 地面持續區域上每幀重畫的特效層 */
  private readonly zoneFx = new Map<number, Graphics>();
  private readonly zoneViews = new Map<number, Graphics>();
  /** 區域生成時的畫面位置（跟著施放者移動的區域用來算位移） */
  private readonly zoneOrigins = new Map<number, { x: number; y: number }>();
  private readonly domains = new Map<number, DarkDomainFx>();
  /** 暗黑領域結束了，骷髏還在漂 */
  private readonly fadingDomains: DarkDomainFx[] = [];
  /** 裝備條件成立時，主角腳下的暗黑領域 */
  private playerDomain: { fx: DarkDomainFx; radius: number } | null = null;
  private readonly pendingViews = new Map<number, Graphics>();
  private readonly flashes: { id: number; position: Vec2; color: number; age: number; duration: number; strength: number; radius: number }[] = [];
  private flashId = 0;
  /** 延遲效果第一次出現時的剩餘時間（預警的光由暗漸亮） */
  private readonly pendingStart = new Map<number, number>();
  /** 這一幀發光的特效（飛行中的光球、爆炸閃光）；每次 update 重算 */
  readonly glows: FxGlow[] = [];
  /** 這一幀飛行中的投射物 */
  readonly flying: FxFlying[] = [];
  /** 開發工具（魔王模擬器）：把範圍畫在地上；null = 不畫 */
  rangePreview: { center: Vec2; direction: Vec2; rings: readonly RangeRing[] } | null = null;
  private readonly rangeGraphics = new Graphics();
  /** Three.js 畫法的技能特效（Renderer 在 Three.js 畫法時設定） */
  listener: SkillFxListener | null = null;

  constructor(
    private readonly projection: IsoProjection,
    /** 投射物與角色一起依深度排序 */
    private readonly objectLayer: Container,
  ) {
    this.fx = new ImpactFx(projection);
    this.ground.addChild(this.fx.ground);
    this.ground.addChild(this.rangeGraphics);
  }

  /** 畫面震動（Renderer 加在 World 圖層的位移上） */
  get shake(): { x: number; y: number } {
    return this.fx.shake;
  }

  /** 範圍效果：依種類畫出爆炸、冰刺、落雷、震波、斬擊… */
  spawnImpact(input: ImpactInput): void {
    if (!this.listener?.impact(input)) this.fx.impact(input);
    if (input.glow) this.flashes.push({ id: ++this.flashId, position: input.position, color: input.color, age: 0, duration: input.big ? BIG_FLASH_TIME : FLASH_TIME, strength: input.big ? 1.6 : 1, radius: input.radius });
  }

  /** 開始施放（只有 Three.js 畫法有出招特效） */
  cast(c: FxCast): void {
    this.listener?.cast(c);
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
    /** 範圍跟著移動（噬界足眼的印記）；回傳 null 時留在原地 */
    follow?: () => Vec2 | null,
  ): void {
    const graphics = new Graphics();
    this.ground.addChild(graphics);
    const outline = line ? rectangle(center, direction, line.length, line.width) : sector(center, radius, direction, angleDeg);
    this.telegraphs.push({ graphics, age: 0, duration, outline, center, active, ...(follow ? { follow } : {}) });
  }

  /** 連鎖閃電：多股分岔、抖動的電弧 */
  spawnChain(points: readonly Vec2[], color: number, special: boolean): void {
    this.fx.chain(points, color, special);
    this.listener?.chain(points, color);
    // 電弧經過的每一點都閃一下
    for (const position of points) this.flashes.push({ id: ++this.flashId, position, color, age: 0, duration: CHAIN_FLASH_TIME, strength: 0.9, radius: 0.5 });
  }

  update(
    dt: number,
    projectiles: readonly Projectile[],
    alpha: number,
    zones: readonly Zone[],
    pending: readonly PendingEffect[],
    /** 主角腳下的暗黑領域（裝備的條件效果）；沒有為 null */
    playerAura: { position: Vec2; radius: number } | null = null,
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
      const at = tg.follow?.() ?? tg.center;
      const toScreen = (k: number) =>
        tg.outline.flatMap((p) => {
          const s = this.projection.toScreen(vec2(at.x + (p.x - tg.center.x) * k, at.y + (p.y - tg.center.y) * k));
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
    this.glows.length = 0;
    this.flying.length = 0;
    this.syncPlayerDomain(playerAura, dt);
    this.drawRangePreview();
    this.syncZones(zones, dt);
    this.syncPending(pending);
    this.syncProjectiles(projectiles, alpha, dt);
    this.fx.update(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.age += dt;
      if (f.age >= f.duration) {
        this.flashes.splice(i, 1);
        continue;
      }
      // 一閃即逝：亮度由 1 快速減弱
      const k = 1 - f.age / f.duration;
      this.glows.push({ id: `f${f.id}`, kind: 'flash', position: f.position, height: FLASH_HEIGHT, color: f.color, strength: k * k * f.strength, radius: f.radius, t: f.age / f.duration });
    }
  }

  /** 沒有 Three.js 時才全部畫平面的火舌 / 冰晶；Three.js 畫法由 ThreeSkillFx 放立體的，這裡只補二階以上的電弧 */
  private zoneHasFx(zone: Zone, element: string | null, tier: ZoneTier): boolean {
    if (zone.followCaster || !element) return false;
    return !this.listener || (element === 'lightning' && tier >= 2);
  }

  /** 晶網：地上的蜘蛛網從中心張開，節點長出冰錐（Three.js 畫立體的；沒有 Three.js 時畫在網上），結束前淡掉 */
  private syncIceWeb(zone: Zone, dt: number): void {
    let g = this.zoneViews.get(zone.id);
    if (!g) {
      g = new Graphics();
      const toScreen = (x: number, y: number) => this.projection.toScreen(vec2(x, y));
      drawWeb(g, zone.position.x, zone.position.y, zone.radius, zone.id, { strand: 0xdff0ff, under: 0x5a4a9a, ground: 0x6a70c0 }, toScreen);
      if (!this.listener) {
        for (const n of webNodes(zone.radius, zone.id)) {
          const p = toScreen(zone.position.x + n.x, zone.position.y + n.y);
          g.poly([p.x - 3, p.y, p.x, p.y - 14, p.x + 3, p.y, p.x, p.y + 2]).fill({ color: 0xa8e0ff, alpha: 0.9 });
        }
      }
      const c = toScreen(zone.position.x, zone.position.y);
      g.pivot.set(c.x, c.y);
      g.position.set(c.x, c.y);
      g.scale.set(0.05);
      this.ground.addChild(g);
      this.zoneViews.set(zone.id, g);
    }
    g.scale.set(Math.min(1, g.scale.x + dt / 0.28));
    g.alpha = Math.min(1, zone.remaining / 0.35);
    this.glows.push({ skillId: originalSkillId(zone.ctx.skill.id), element: 'cold', tier: 1, id: `z${zone.id}`, kind: 'zone', position: zone.position, height: ZONE_GLOW_HEIGHT, color: 0xa8d8ff, strength: 0.5 * g.alpha, radius: zone.radius, t: 0, life: zone.remaining, seed: zone.id });
  }

  /** 地面持續區域：半透明圓，閃爍表示仍在作用 */
  private syncZones(zones: readonly Zone[], dt: number): void {
    const seen = new Set<number>();
    for (const zone of zones) {
      seen.add(zone.id);
      const element = zone.followCaster ? null : zoneFxElement(zone);
      const tier = zoneTier(zone);
      if (zone.look === 'acid') continue;
      if (zone.look === 'iceWeb') {
        this.syncIceWeb(zone, dt);
        continue;
      }
      if (zone.look === 'darkDomain') {
        this.syncDomain(zone, dt);
        continue;
      }
      let g = this.zoneViews.get(zone.id);
      if (!g) {
        const color = ELEMENT_COLORS[zoneElement(zone.effects)] ?? 0xff7a2a;
        // 殺傷力分三階（物理的區域沒有階級，維持原樣）
        const look = element ? ZONE_TIER_LOOK[tier] : null;
        g = new Graphics().poly(this.outline(zone.position, zone.radius)).fill({ color, alpha: zone.followCaster ? 0.1 : (look?.fill ?? 0.28) }).stroke({ color, width: look?.stroke ?? 2, alpha: 0.8 });
        if (element && tier === 3) drawZoneCracks(g, zone, element, (x, y) => this.projection.toScreen(vec2(x, y)));
        // 不斷冒出的特效：Three.js 畫法由 ThreeSkillFx 放立體的，這裡只畫電弧；沒有 Three.js 時全部畫在這裡
        if (this.zoneHasFx(zone, element, tier)) {
          const fx = new Graphics();
          g.addChild(fx);
          this.zoneFx.set(zone.id, fx);
        }
        this.ground.addChild(g);
        this.zoneViews.set(zone.id, g);
        this.zoneOrigins.set(zone.id, this.projection.toScreen(zone.position));
      }
      // 跟著施放者移動的區域（劍刃旋舞）：整個圓跟著位移
      if (zone.followCaster) {
        const from = this.zoneOrigins.get(zone.id)!;
        const now = this.projection.toScreen(zone.position);
        g.position.set(now.x - from.x, now.y - from.y);
      }
      const look = ZONE_TIER_LOOK[element ? tier : 2];
      g.alpha = 1 - look.pulse + look.pulse * Math.sin(performance.now() / look.period + zone.id);
      const fx = this.zoneFx.get(zone.id);
      if (fx) drawZoneElement(fx, zone, zoneElement(zone.effects), performance.now() / 1000, (x, y) => this.projection.toScreen(vec2(x, y)), tier);
      // 持續區域一直亮著（火牆、毒池、冰霜地面），亮度隨閃爍起伏
      const color = ELEMENT_COLORS[zoneElement(zone.effects)] ?? 0xff7a2a;
      this.glows.push({ skillId: originalSkillId(zone.ctx.skill.id), element, tier, id: `z${zone.id}`, kind: 'zone', position: zone.position, height: ZONE_GLOW_HEIGHT, color, strength: look.light * g.alpha, radius: zone.radius, t: 0 });
    }
    for (const [id, g] of this.zoneViews) {
      if (seen.has(id)) continue;
      g.destroy({ children: true });
      this.zoneViews.delete(id);
      this.zoneFx.delete(id);
      this.zoneOrigins.delete(id);
    }
    for (const [id, domain] of this.domains) {
      if (seen.has(id)) continue;
      this.domains.delete(id);
      this.fadingDomains.push(domain);
    }
    for (let i = this.fadingDomains.length - 1; i >= 0; i--) {
      if (!this.fadingDomains[i]!.drain(dt)) this.fadingDomains.splice(i, 1);
    }
  }

  private drawRangePreview(): void {
    const g = this.rangeGraphics.clear();
    const preview = this.rangePreview;
    if (!preview) return;
    for (const ring of preview.rings) {
      const points = sector(preview.center, ring.radius, preview.direction, ring.angleDeg).flatMap((p) => {
        const s = this.projection.toScreen(p);
        return [s.x, s.y];
      });
      g.poly(points);
      if (ring.fill > 0) g.fill({ color: ring.color, alpha: ring.fill });
      g.stroke({ color: ring.color, width: ring.width, alpha: 0.95 });
    }
  }

  private syncPlayerDomain(aura: { position: Vec2; radius: number } | null, dt: number): void {
    if (this.playerDomain && this.playerDomain.radius !== aura?.radius) {
      this.fadingDomains.push(this.playerDomain.fx);
      this.playerDomain = null;
    }
    if (!aura) return;
    this.playerDomain ??= { fx: this.createDomain(aura.position, aura.radius), radius: aura.radius };
    this.playerDomain.fx.moveTo(this.projection.toScreen(aura.position));
    this.playerDomain.fx.update(dt, Infinity, performance.now() / 1000);
  }

  private createDomain(position: Vec2, radius: number): DarkDomainFx {
    return new DarkDomainFx(this.outline(position, radius), this.projection.toScreen(position), Math.PI * radius * radius, this.ground, this.fx.top);
  }

  /** 暗黑領域：黑底紅圈、漂出骷髏；不發光（領域是暗的） */
  private syncDomain(zone: Zone, dt: number): void {
    let domain = this.domains.get(zone.id);
    if (!domain) {
      domain = this.createDomain(zone.position, zone.radius);
      this.domains.set(zone.id, domain);
    }
    domain.update(dt, zone.remaining, performance.now() / 1000);
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
      // 即將落下（隕星、落雷）：落點的光由暗漸亮
      const start = this.pendingStart.get(p.id) ?? p.remaining;
      this.pendingStart.set(p.id, start);
      const k = start > 0 ? 1 - p.remaining / start : 1;
      const color = ELEMENT_COLORS[firstElement(area.effects) ?? 'physical'] ?? 0xffffff;
      const radius = rankValue(area.radius, p.ctx.rank) * (1 + p.ctx.mods.aoeRadius);
      this.glows.push({ skillId: originalSkillId(p.ctx.skill.id), id: `p${p.id}`, kind: 'pending', position: p.position, height: ZONE_GLOW_HEIGHT, color, strength: 0.15 + 0.6 * k * k, radius, t: k });
    }
    for (const [id, g] of this.pendingViews) {
      if (seen.has(id)) continue;
      this.pendingStart.delete(id);
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

  /** Three.js 畫法：有 3D 模型的投射物交給 Three.js（Pixi 的圖形與假影子不畫） */
  setThree(world: FigureHost | null): void {
    this.three = world;
    for (const view of this.projectileViews.values()) this.syncFlying(view);
  }

  private attachFlying(view: ProjectileView, p: Projectile): void {
    const model = PROJECTILE_MODELS[originalSkillId(p.skill.id)];
    if (!model) return;
    view.model = { figure: new PolyFigure(model, figureScale(model, p.caster.visualRadius)), three: null };
    view.container.addChild(view.model.figure.graphics);
    view.model.figure.graphics.visible = false;
    this.syncFlying(view);
  }

  private syncFlying(view: ProjectileView): void {
    const model = view.model;
    if (!model || !!model.three === !!this.three) return;
    model.three?.dispose();
    model.three = this.three?.createFigure() ?? null;
    model.figure.sink = model.three;
    view.art.visible = !model.three;
    view.shadow.visible = !model.three;
    view.glows = !model.three && view.style.type === 'orb';
  }

  private syncProjectiles(projectiles: readonly Projectile[], alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const p of projectiles) {
      seen.add(p.id);
      let view = this.projectileViews.get(p.id);
      if (!view) {
        const element = firstElement(p.onHit);
        const special = p.mods.combo?.success ?? false;
        const base = projectileArt(p.look ? `look.${p.look}` : originalSkillId(p.skill.id), element, p.skill.tags.includes('ranged'));
        const style = special ? specialArt(base) : base;
        const container = new Container();
        const px = p.radius * this.projection.tileWidth * 0.6;
        const shadow = new Graphics().ellipse(0, 0, px * 1.2, px * 0.5).fill({ color: 0x000000, alpha: 0.3 });
        const art = new Graphics();
        art.blendMode = 'normal';
        // 冰霜新星的冰球貼著地面滾
        art.position.set(0, p.skill.id === 'magic.frost_nova' ? -px * 1.6 : -FLIGHT_HEIGHT);
        container.addChild(shadow, art);
        // 物理箭不發光；法術的光球與元素箭會照亮周圍
        const glows = base.type === 'orb' || (element !== null && element !== 'physical');
        view = { container, shadow, art, style, special, age: 0, trailTimer: 0, glows, skillId: originalSkillId(p.skill.id), at: p.position };
        this.projectileViews.set(p.id, view);
        this.objectLayer.addChild(container);
        this.attachFlying(view, p);
      }
      view.age += dt;
      view.at = vec2(p.position.x, p.position.y);
      const pos = {
        x: p.prevPosition.x + (p.position.x - p.prevPosition.x) * alpha,
        y: p.prevPosition.y + (p.position.y - p.prevPosition.y) * alpha,
      };
      const s = this.projection.toScreen(pos);
      view.container.position.set(s.x, s.y);
      view.container.zIndex = this.projection.depth(pos);
      this.flying.push({ id: p.id, skillId: originalSkillId(p.skill.id), position: vec2(pos.x, pos.y), direction: p.direction });
      if (view.glows) this.glows.push({ skillId: originalSkillId(p.skill.id), id: `o${p.id}`, kind: 'orb', position: vec2(pos.x, pos.y), height: FLIGHT_HEIGHT, color: view.style.color, strength: 0.6 + 0.4 * Math.min(1, view.style.size), radius: p.radius * view.style.size, t: 0 });
      // 依畫面上的飛行方向轉動（箭、冰槍朝前；火球的火舌往後拖）
      const d0 = this.projection.toScreen(vec2(0, 0));
      const d1 = this.projection.toScreen(p.direction);
      const angle = Math.atan2(d1.y - d0.y, d1.x - d0.x);
      // 滾動的冰球：一面前進一面轉
      view.art.rotation = p.skill.id === 'magic.frost_nova' ? angle + view.age * p.speed * 1.5 : angle;
      if (view.model?.three) {
        // 3D 模型：水平旋轉，影子由 Three.js 投射
        view.model.figure.showPose({ rootY: 0, angles: { root: [0, view.age * FLYING_SPIN, 0] } }, { x: 0, y: 1 });
        view.model.three.place(pos, { x: 0, y: 0 }, 0, 0xffffff, 1, true);
      } else drawProjectile(view.art.clear(), view.style, view.age, view.special);
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
      // 吐網：投射物消失（命中或飛到盡頭）的地方攤開一張毒網
      if (view.skillId === 'enemy.web_spit') this.spawnImpact({ kind: 'poisonWeb', position: view.at, radius: 0.85, color: 0x7ed957, direction: vec2(1, 0), angleDeg: 360, big: false, special: false, skillId: 'enemy.web_spit', element: 'poison' });
      view.model?.three?.dispose();
      view.container.destroy({ children: true });
      this.projectileViews.delete(id);
    }
  }
}

/** 持續區域的顏色：有傷害看元素；只有緩速 / 冰凍（絕對零度的冰凍地面）是冰色；其他是火 */
/** 固定的亂數（同一個區域每次一樣）：0～1 */
const zoneRand = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** 區域裡的屬性動畫：火焰往上竄、冰柱立在地上、電弧閃爍、毒泡泡冒出來破掉 */
/** 地面持續區域的屬性（要不斷冒出特效的）；物理與純增益的區域回傳 null */
function zoneFxElement(zone: Zone): string | null {
  const element = firstElement(zone.effects);
  if (element) return element === 'physical' ? null : element;
  return zone.effects.some((e) => e.type === 'status' && (e.status === 'slow' || e.status === 'freeze')) ? 'cold' : null;
}

/** 三階的地面：熔岩紋、冰裂、焦痕，毒是發黑的地面（只畫一次） */
function drawZoneCracks(g: Graphics, zone: Zone, element: string, toScreen: (x: number, y: number) => { x: number; y: number }): void {
  const at = (a: number, r: number) => toScreen(zone.position.x + Math.cos(a) * r, zone.position.y + Math.sin(a) * r);
  if (element === 'poison') {
    const pts: number[] = [];
    for (let i = 0; i < 20; i++) {
      const p = at((i / 20) * Math.PI * 2, zone.radius * (0.55 + zoneRand(zone.id + i) * 0.3));
      pts.push(p.x, p.y);
    }
    g.poly(pts).fill({ color: 0x0c1a08, alpha: 0.55 });
    return;
  }
  const color = element === 'fire' ? 0xff7a24 : element === 'cold' ? 0xe8f8ff : 0xd8c4ff;
  const n = Math.round(6 + zone.radius * 4);
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + zoneRand(zone.id * 3 + i) * 0.5;
    const pts: number[] = [];
    for (let k = 0; k <= 5; k++) {
      const p = at(a, (zone.radius * 0.92 * k) / 5);
      pts.push(p.x, p.y);
      a += (zoneRand(zone.id + i * 7 + k) - 0.5) * 0.5;
    }
    g.poly(pts, false).stroke({ color: 0x0a0604, width: 3.5, alpha: 0.7 }).poly(pts, false).stroke({ color, width: 1.6, alpha: 0.95 });
  }
}

function drawZoneElement(g: Graphics, zone: Zone, element: string, now: number, toScreen: (x: number, y: number) => { x: number; y: number }, tier: ZoneTier = 2): void {
  g.clear();
  const tierK = [0.6, 1, 1.4][tier - 1]!;
  const count = Math.round((4 + zone.radius * 7) * [0.6, 1, 1.5][tier - 1]!);
  const spot = (i: number) => {
    const angle = zoneRand(zone.id * 7 + i) * Math.PI * 2;
    const r = Math.sqrt(zoneRand(zone.id * 13 + i * 3)) * zone.radius * 0.85;
    return toScreen(zone.position.x + Math.cos(angle) * r, zone.position.y + Math.sin(angle) * r);
  };
  for (let i = 0; i < count; i++) {
    const p = spot(i);
    const size = (0.6 + zoneRand(zone.id + i * 11) * 0.8) * tierK;
    const life = (now * (0.8 + zoneRand(i) * 0.7) + zoneRand(zone.id + i)) % 1;
    if (element === 'fire') {
      const h = 22 * size * (1 - life * 0.6);
      const w = 6 * size * (1 - life);
      const y = p.y - life * 10;
      g.poly([p.x - w, y, p.x + w, y, p.x, y - h]).fill({ color: life < 0.45 ? 0xffd24a : 0xff5a14, alpha: 0.9 * (1 - life) });
    } else if (element === 'cold') {
      // 冰晶從地面長出來、停一下、碎掉，再換下一根
      const grow = Math.min(1, life / 0.3);
      const fade = life > 0.8 ? (1 - life) / 0.2 : 1;
      const h = 26 * size * grow;
      const w = 5 * size * grow;
      g.poly([p.x - w, p.y, p.x, p.y + w * 0.5, p.x, p.y - h]).fill({ color: 0x8fd8ff, alpha: 0.9 * fade });
      g.poly([p.x + w, p.y, p.x, p.y + w * 0.5, p.x, p.y - h]).fill({ color: 0xe4f8ff, alpha: 0.95 * fade });
    } else if (element === 'lightning') {
      if (i % 3 !== 0) continue;
      // 每秒換 12 次形狀，看起來在閃
      const beat = Math.floor(now * 12);
      const q = spot((i + 1 + (beat % 4)) % count);
      const points = [p.x, p.y - 4];
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        points.push(p.x + (q.x - p.x) * t + (zoneRand(beat + i * 5 + k) - 0.5) * 16, p.y + (q.y - p.y) * t - 4 + (zoneRand(beat + i * 7 + k) - 0.5) * 12);
      }
      points.push(q.x, q.y - 4);
      g.poly(points, false).stroke({ color: tier === 3 ? 0xf4ecff : 0xd8c4ff, width: tier === 3 ? 3.5 : 2, alpha: 0.95 });
      g.circle(p.x, p.y - 4, 2.5).fill({ color: 0xf4eaff, alpha: 0.9 });
    } else if (element === 'poison') {
      const r = (2 + 6 * life) * size;
      const y = p.y - life * 14;
      g.circle(p.x, y, r).fill({ color: 0x6ce030, alpha: 0.35 * (1 - life * 0.5) }).stroke({ color: 0xc8ff80, width: 1.5, alpha: life > 0.9 ? 0.2 : 0.9 });
    }
  }
}

function zoneElement(effects: readonly Zone['effects'][number][]): string {
  const element = firstElement(effects);
  if (element) return element;
  return effects.some((e) => e.type === 'status' && (e.status === 'slow' || e.status === 'freeze')) ? 'cold' : 'fire';
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
