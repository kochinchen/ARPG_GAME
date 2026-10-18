import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { lerp, normalize, scale, vec2, type Vec2 } from '../../core/math/Vec2';
import type { Actor, ActorId } from '../../game/entities/Actor';
import { PALETTE } from '../palette';

const BAR_WIDTH = 34;

/** 各機關的外觀高度（px，血條畫在上方） */
const HEIGHT: Record<string, number> = {
  'utility.trip_net': 20,
  'utility.frost_mine': 10,
  'utility.storm_totem': 52,
  'utility.powder_keg': 30,
};

interface View {
  container: Container;
  art: Graphics;
  bar: Graphics;
  time: number;
}

/**
 * 機關（戰術 B 路線）的外觀：絆索網（兩根短樁之間的繩網）、霜凍地雷、雷電圖騰、火藥桶，上方有血條。
 * 多個小面拼成，和角色模型的構面風格一致；每幀依狀態重畫（待命、剩餘時間）。
 */
export class DeviceLayer {
  private readonly views = new Map<ActorId, View>();

  constructor(
    private readonly projection: IsoProjection,
    private readonly layer: Container,
  ) {}

  sync(actors: readonly Actor[], alpha: number, dt: number): void {
    const seen = new Set<ActorId>();
    for (const actor of actors) {
      if (!actor.device || !actor.alive) continue;
      seen.add(actor.id);
      let view = this.views.get(actor.id);
      if (!view) {
        const container = new Container();
        const art = new Graphics();
        const bar = new Graphics();
        container.addChild(art, bar);
        this.layer.addChild(container);
        view = { container, art, bar, time: 0 };
        this.views.set(actor.id, view);
      }
      view.time += dt;
      const position = lerp(actor.prevPosition, actor.position, alpha);
      const s = this.projection.toScreen(position);
      view.container.position.set(s.x, s.y);
      view.container.zIndex = this.projection.depth(position);
      this.draw(view, actor);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.container.destroy({ children: true });
      this.views.delete(id);
    }
  }

  private draw(view: View, actor: Actor): void {
    const device = actor.device!;
    const g = view.art.clear();
    const t = view.time;
    switch (device.skillId) {
      case 'utility.trip_net':
        this.drawNet(g, device.direction, device.def.line?.length ?? 8);
        break;
      case 'utility.frost_mine':
        drawMine(g, device.armTimer <= 0, t);
        break;
      case 'utility.storm_totem':
        drawTotem(g, t, device.shotTimer);
        break;
      case 'utility.powder_keg':
        drawKeg(g, t, device.remaining);
        break;
      default:
        g.circle(0, -6, 8).fill({ color: 0x8a7c68 });
    }
    const height = HEIGHT[device.skillId] ?? 16;
    const ratio = Math.max(0, Math.min(1, actor.hp / actor.maxHp));
    view.bar
      .clear()
      .rect(-BAR_WIDTH / 2, -height - 10, BAR_WIDTH, 4)
      .fill({ color: PALETTE.hpBack })
      .rect(-BAR_WIDTH / 2, -height - 10, BAR_WIDTH * ratio, 4)
      .fill({ color: PALETTE.playerHpFill });
  }

  /** 絆索網：垂直於面向橫放，兩端短樁，中間上下兩條繩加交叉網格 */
  private drawNet(g: Graphics, direction: Vec2, length: number): void {
    const dir = normalize(direction);
    const axis = vec2(-dir.y, dir.x);
    const end = this.projection.toScreen(scale(axis, length / 2));
    const a = { x: -end.x, y: -end.y };
    const b = end;
    // 地上的影子
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: PALETTE.shadow, width: 4, alpha: 0.35 });
    const ropeLow = 5;
    const ropeHigh = 14;
    const cells = 12;
    for (let i = 0; i < cells; i++) {
      const p = i / cells;
      const q = (i + 1) / cells;
      const x0 = a.x + (b.x - a.x) * p;
      const y0 = a.y + (b.y - a.y) * p;
      const x1 = a.x + (b.x - a.x) * q;
      const y1 = a.y + (b.y - a.y) * q;
      // 網眼：每格兩條斜線
      g.moveTo(x0, y0 - ropeLow).lineTo(x1, y1 - ropeHigh).moveTo(x0, y0 - ropeHigh).lineTo(x1, y1 - ropeLow).stroke({ color: 0xb89a6a, width: 1, alpha: 0.85 });
    }
    g.moveTo(a.x, a.y - ropeLow).lineTo(b.x, b.y - ropeLow).stroke({ color: 0xd8b880, width: 1.5 });
    g.moveTo(a.x, a.y - ropeHigh).lineTo(b.x, b.y - ropeHigh).stroke({ color: 0xd8b880, width: 1.5 });
    for (const p of [a, b]) drawStake(g, p.x, p.y);
  }
}

/** 短樁：兩面受光不同的四角柱，頂端削尖 */
function drawStake(g: Graphics, x: number, y: number): void {
  const w = 3;
  const h = 20;
  g.poly([x - w, y, x, y + 1.5, x, y - h, x - w, y - h + 1]).fill({ color: 0x5a3e26 });
  g.poly([x, y + 1.5, x + w, y, x + w, y - h + 1, x, y - h]).fill({ color: 0x7a5636 });
  g.poly([x - w, y - h + 1, x, y - h, x + w, y - h + 1, x, y - h - 6]).fill({ color: 0x9a7048 });
}

/** 霜凍地雷：扁平的六角冰晶盤；待命後核心發光閃爍 */
function drawMine(g: Graphics, armed: boolean, t: number): void {
  const r = 13;
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
    pts.push(Math.cos(angle) * r, Math.sin(angle) * r * 0.5 - 3);
  }
  g.ellipse(0, 0, r + 2, (r + 2) / 2).fill({ color: PALETTE.shadow, alpha: 0.4 });
  // 側面
  g.poly([pts[0]!, pts[1]!, pts[2]!, pts[3]!, pts[2]!, pts[3]! + 4, pts[0]!, pts[1]! + 4]).fill({ color: 0x3a6a8a });
  g.poly([pts[2]!, pts[3]!, pts[4]!, pts[5]!, pts[4]!, pts[5]! + 4, pts[2]!, pts[3]! + 4]).fill({ color: 0x2e5a78 });
  // 頂面：六個三角面，亮暗交錯
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    g.poly([0, -4, pts[i * 2]!, pts[i * 2 + 1]!, pts[j * 2]!, pts[j * 2 + 1]!]).fill({ color: i % 2 === 0 ? 0x9fdcff : 0x6fb8e8 });
  }
  const glow = armed ? 0.55 + 0.45 * Math.sin(t * 8) : 0.15;
  g.circle(0, -4, 3.5).fill({ color: 0xe8f8ff, alpha: glow });
}

/** 雷電圖騰：多面柱身，頂端黃色雷晶；快要射擊時雷晶變亮 */
function drawTotem(g: Graphics, t: number, shotTimer: number): void {
  const h = 40;
  g.ellipse(0, 0, 12, 6).fill({ color: PALETTE.shadow, alpha: 0.4 });
  g.poly([-8, 0, -3, 3, -3, -6, -8, -4]).fill({ color: 0x3e3a46 });
  g.poly([-3, 3, 8, 0, 8, -4, -3, -6]).fill({ color: 0x55505e });
  g.poly([-5, -4, 0, -2, 0, -h, -5, -h + 2]).fill({ color: 0x4a4656 });
  g.poly([0, -2, 5, -4, 5, -h + 2, 0, -h]).fill({ color: 0x6a6478 });
  for (const y of [-14, -26]) g.poly([-5, y, 0, y + 2, 5, y, 5, y - 2, 0, y, -5, y - 2]).fill({ color: 0x8a7c68 });
  const charge = 1 - Math.max(0, Math.min(1, shotTimer));
  const bright = 0.5 + 0.5 * charge;
  const top = -h - 2;
  g.poly([0, top - 12, 6, top - 4, 0, top + 2]).fill({ color: 0xf5e663, alpha: bright });
  g.poly([0, top - 12, -6, top - 4, 0, top + 2]).fill({ color: 0xd8c040, alpha: bright });
  g.circle(0, top - 5, 10 + Math.sin(t * 10) * 1.5).fill({ color: 0xf5e663, alpha: 0.12 + 0.18 * charge });
}

/** 火藥桶：木桶加鐵箍與引信；剩餘時間越少，引信火花閃得越快 */
function drawKeg(g: Graphics, t: number, remaining: number): void {
  const w = 11;
  const h = 26;
  g.ellipse(0, 0, w + 2, (w + 2) / 2).fill({ color: PALETTE.shadow, alpha: 0.4 });
  // 桶身：左右兩半受光不同，中段稍微鼓起
  g.poly([-w, -2, 0, 3, 0, -h + 3, -w, -h + 6, -w - 2, -h / 2]).fill({ color: 0x6a4428 });
  g.poly([0, 3, w, -2, w + 2, -h / 2, w, -h + 6, 0, -h + 3]).fill({ color: 0x8a5a34 });
  for (const y of [-5, -h / 2, -h + 7]) {
    const bulge = y === -h / 2 ? 2 : 0;
    g.moveTo(-w - bulge, y).lineTo(0, y + 4).lineTo(w + bulge, y).stroke({ color: 0x3a3a3e, width: 2 });
  }
  g.ellipse(0, -h + 3, w, w / 2).fill({ color: 0x9a6a3e });
  g.moveTo(2, -h + 2).lineTo(5, -h - 6).stroke({ color: 0x2a2a2a, width: 1.5 });
  const rate = remaining < 3 ? 16 : remaining < 6 ? 9 : 5;
  const spark = 0.5 + 0.5 * Math.sin(t * rate);
  g.circle(5, -h - 7, 2.5 + spark * 1.5).fill({ color: 0xffb347, alpha: 0.6 + 0.4 * spark });
}
