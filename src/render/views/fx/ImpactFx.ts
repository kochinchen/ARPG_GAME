import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../../core/math/Vec2';
import { mix, type FxParticleKind } from './FxColors';
import { SPECIAL } from './ProjectileArt';

/**
 * 命中與範圍特效：粒子（火星、冰晶、碎石、煙塵…）、範圍爆發（火焰爆炸、冰刺、落雷、重擊震波與地裂、
 * 斬擊弧光、箭雨）、連鎖閃電（多股分岔、每幀重新抖動）與畫面震動。
 * 全部每幀重畫在四張 Graphics 上：地面（一般 / 發光）與上層（一般 / 發光）。
 */

export type ImpactKind = 'fire' | 'frost' | 'lightning' | 'poison' | 'shockwave' | 'slash' | 'whirl' | 'burst' | 'arrowRain';

export interface ImpactInput {
  kind: ImpactKind;
  position: Vec2;
  radius: number;
  color: number;
  direction: Vec2;
  angleDeg: number;
  /** 大招（隕石、絕對零度、毀滅重擊…）：更大、更久、震動更強 */
  big: boolean;
  /** Combo 特別招：金色光環與火花 */
  special: boolean;
}

interface Particle {
  kind: FxParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  max: number;
  size: number;
  color: number;
  rot: number;
  vr: number;
}

interface Impact extends ImpactInput {
  age: number;
  duration: number;
  /** 預先算好的隨機形狀（火舌、地裂、冰刺的角度與長度） */
  seeds: number[];
  /** 地面的畫面座標中心 */
  sx: number;
  sy: number;
}

interface Chain {
  age: number;
  points: { x: number; y: number }[];
  color: number;
  /** 閃電每 0.05 秒重新抖動 */
  paths: number[][];
  jitterAt: number;
}

const CHAIN_TIME = 0.38;
const HEIGHT = 30;

const DURATION: Record<ImpactKind, number> = { fire: 0.75, frost: 0.95, lightning: 0.55, poison: 0.8, shockwave: 0.85, slash: 0.26, whirl: 0.45, burst: 0.35, arrowRain: 0.6 };

const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class ImpactFx {
  readonly ground = new Container();
  readonly top = new Container();
  private readonly groundSolid = new Graphics();
  private readonly groundGlow = new Graphics();
  private readonly topSolid = new Graphics();
  private readonly topGlow = new Graphics();
  private readonly particles: Particle[] = [];
  private readonly impacts: Impact[] = [];
  private readonly chains: Chain[] = [];
  private shakeAmount = 0;
  private time = 0;

  constructor(private readonly projection: IsoProjection) {
    this.groundGlow.blendMode = 'add';
    this.topGlow.blendMode = 'add';
    this.ground.addChild(this.groundSolid, this.groundGlow);
    this.top.addChild(this.topSolid, this.topGlow);
  }

  /** 畫面震動的位移（Renderer 加在 World 圖層上） */
  get shake(): { x: number; y: number } {
    const s = this.shakeAmount;
    return s < 0.2 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * s * 2, y: (Math.random() - 0.5) * s };
  }

  addShake(amount: number): void {
    this.shakeAmount = Math.min(10, Math.max(this.shakeAmount, amount));
  }

  private screen(p: Vec2): { x: number; y: number } {
    return this.projection.toScreen(p);
  }

  /** 以地面中心、角度、World 半徑取畫面座標（等角下自然成為橢圓） */
  private at(impact: Impact, angle: number, r: number): [number, number] {
    const s = this.screen(vec2(impact.position.x + Math.cos(angle) * r, impact.position.y + Math.sin(angle) * r));
    return [s.x, s.y];
  }

  // ─────────────────────────── 粒子 ───────────────────────────

  emit(kind: FxParticleKind, x: number, y: number, color: number, spread = 1): void {
    const p: Particle = { kind, x, y, vx: 0, vy: 0, gravity: 0, drag: 0, life: 0, max: 0.6, size: 1.2, color, rot: rand(0, 6), vr: rand(-8, 8) };
    switch (kind) {
      case 'ember':
        Object.assign(p, { vx: rand(-25, 25) * spread, vy: rand(-50, -15) * spread, gravity: 30, max: rand(0.35, 0.8), size: rand(1, 1.8) });
        break;
      case 'flake':
        Object.assign(p, { vx: rand(-14, 14) * spread, vy: rand(-18, 4) * spread, gravity: 12, max: rand(0.5, 0.9), size: rand(1, 1.8) });
        break;
      case 'spark':
        Object.assign(p, { vx: rand(-90, 90) * spread, vy: rand(-90, 50) * spread, gravity: 60, drag: 3, max: rand(0.12, 0.3), size: 1 });
        break;
      case 'smoke':
        Object.assign(p, { vx: rand(-10, 10) * spread, vy: rand(-22, -8), max: rand(0.7, 1.2), size: rand(4, 7) });
        break;
      case 'dust':
        Object.assign(p, { vx: rand(-18, 18) * spread, vy: rand(-12, -2), drag: 2, max: rand(0.5, 0.9), size: rand(3, 5.5) });
        break;
      case 'debris':
        Object.assign(p, { vx: rand(-70, 70) * spread, vy: rand(-150, -60) * spread, gravity: 380, max: rand(0.5, 0.8), size: rand(1.8, 3.6) });
        break;
      case 'shard':
        Object.assign(p, { vx: rand(-80, 80) * spread, vy: rand(-110, -30) * spread, gravity: 260, max: rand(0.45, 0.75), size: rand(2, 3.4) });
        break;
      case 'drop':
        Object.assign(p, { vx: rand(-45, 45) * spread, vy: rand(-90, -30) * spread, gravity: 240, max: rand(0.4, 0.7), size: rand(1.4, 2.4) });
        break;
      case 'wind':
        Object.assign(p, { vx: rand(-40, 40), vy: rand(-8, 8), max: rand(0.2, 0.35), size: 1 });
        break;
      case 'mote':
        Object.assign(p, { vx: rand(-6, 6), vy: rand(-14, -4), max: rand(0.4, 0.8), size: rand(0.8, 1.4) });
        break;
    }
    this.particles.push(p);
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
  }

  // ─────────────────────────── 範圍爆發 ───────────────────────────

  impact(input: ImpactInput): void {
    const s = this.screen(input.position);
    const duration = DURATION[input.kind] * (input.big ? 1.35 : 1);
    const seeds = Array.from({ length: 48 }, () => Math.random());
    const impact: Impact = { ...input, color: input.special ? mix(input.color, SPECIAL, 0.55) : input.color, age: 0, duration, seeds, sx: s.x, sy: s.y };
    this.impacts.push(impact);
    const c = impact.color;
    const R = input.radius * this.projection.tileWidth * 0.5;
    const burst = (kind: FxParticleKind, n: number, color: number, spread = 1, lift = 0) => {
      for (let i = 0; i < n; i++) this.emit(kind, s.x + rand(-R, R) * 0.4, s.y - lift + rand(-R, R) * 0.2, color, spread);
    };
    const size = Math.min(2.2, 0.6 + input.radius * 0.45) * (input.big ? 1.4 : 1);
    switch (input.kind) {
      case 'fire':
        burst('ember', Math.round(22 * size), c, size, 8);
        burst('ember', Math.round(10 * size), 0xffe070, size * 0.7, 8);
        burst('smoke', Math.round(6 * size), 0x2a2420, size);
        this.addShake(input.big ? 7 : 1.5 + input.radius);
        break;
      case 'frost':
        burst('shard', Math.round(14 * size), mix(c, 0xffffff, 0.3), size, 4);
        burst('flake', Math.round(16 * size), 0xeaf8ff, size, 6);
        this.addShake(input.big ? 5 : 1);
        break;
      case 'lightning':
        burst('spark', Math.round(18 * size), 0xffffff, size);
        burst('spark', Math.round(12 * size), c, size);
        this.addShake(input.big ? 5 : 2);
        break;
      case 'poison':
        burst('drop', Math.round(18 * size), c, size, 4);
        burst('smoke', Math.round(4 * size), mix(c, 0x203018, 0.6), size);
        break;
      case 'shockwave':
        burst('debris', Math.round(18 * size), 0x5a4a3a, size);
        burst('debris', Math.round(8 * size), 0x8a7a66, size);
        burst('dust', Math.round(12 * size), 0x8a7a66, size * 1.6);
        burst('spark', Math.round(8 * size), c, size);
        this.addShake(input.big ? 9 : 3 + input.radius * 1.5);
        break;
      case 'slash':
        burst('spark', 6, c, 0.8, 10);
        break;
      case 'whirl':
        burst('spark', 12, c, 1.2, 10);
        this.addShake(1.5);
        break;
      case 'burst':
        burst('spark', 10, c, 1, 8);
        break;
      case 'arrowRain':
        break;
    }
    if (input.special) burst('spark', 14, SPECIAL, 1.2, 10);
  }

  // ─────────────────────────── 連鎖閃電 ───────────────────────────

  chain(points: readonly Vec2[], color: number, special: boolean): void {
    const pts = points.map((p) => {
      const s = this.screen(p);
      return { x: s.x, y: s.y - HEIGHT };
    });
    const c = special ? mix(color, SPECIAL, 0.6) : color;
    this.chains.push({ age: 0, points: pts, color: c, paths: [], jitterAt: -1 });
    for (const p of pts.slice(1)) for (let i = 0; i < 8; i++) this.emit('spark', p.x, p.y, i % 2 ? 0xffffff : c, 1);
    this.addShake(1.5);
  }

  // ─────────────────────────── 每幀更新 ───────────────────────────

  update(dt: number): void {
    this.time += dt;
    this.shakeAmount *= Math.exp(-dt * 9);
    for (const g of [this.groundSolid, this.groundGlow, this.topSolid, this.topGlow]) g.clear();
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i]!;
      im.age += dt;
      // 地裂、焦痕留得比爆發本身久
      if (im.age >= im.duration * 1.8) {
        this.impacts.splice(i, 1);
        continue;
      }
      this.drawImpact(im, im.age / im.duration);
    }
    for (let i = this.chains.length - 1; i >= 0; i--) {
      const ch = this.chains[i]!;
      ch.age += dt;
      if (ch.age >= CHAIN_TIME) {
        this.chains.splice(i, 1);
        continue;
      }
      this.drawChain(ch);
    }
    this.drawParticles(dt);
  }

  private drawParticles(dt: number): void {
    const solid = this.topSolid;
    const glow = this.topGlow;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      const f = p.life / p.max;
      const fade = 1 - f;
      if (p.drag > 0) {
        p.vx *= Math.exp(-p.drag * dt);
        p.vy *= Math.exp(-p.drag * dt);
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      switch (p.kind) {
        case 'ember':
          glow.circle(p.x, p.y, p.size * (1 - f * 0.6)).fill({ color: mix(0xffe070, p.color, f), alpha: fade });
          break;
        case 'spark':
          glow.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03).stroke({ color: p.color, width: 1.1, alpha: fade });
          break;
        case 'wind':
          glow.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.15, p.y - p.vy * 0.15).stroke({ color: p.color, width: 0.9, alpha: 0.7 * Math.sin(f * Math.PI) });
          break;
        case 'mote':
          glow.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: 0.8 * fade });
          break;
        case 'flake': {
          const s = p.size;
          glow.poly([p.x, p.y - s * 1.8, p.x + s * 0.5, p.y, p.x, p.y + s * 1.8, p.x - s * 0.5, p.y]).fill({ color: p.color, alpha: 0.9 * fade });
          break;
        }
        case 'shard': {
          const s = p.size;
          const c = Math.cos(p.rot);
          const sn = Math.sin(p.rot);
          glow.poly([p.x + c * s * 1.8, p.y + sn * s * 1.8, p.x - sn * s * 0.6, p.y + c * s * 0.6, p.x - c * s * 1.2, p.y - sn * s * 1.2]).fill({ color: p.color, alpha: 0.95 * fade });
          break;
        }
        case 'drop':
          solid.circle(p.x, p.y, p.size * (1 - f * 0.3)).fill({ color: p.color, alpha: 0.9 * fade });
          break;
        case 'debris': {
          const s = p.size;
          const c = Math.cos(p.rot) * s;
          const sn = Math.sin(p.rot) * s;
          solid.poly([p.x + c, p.y + sn, p.x - sn * 0.8, p.y + c * 0.8, p.x - c, p.y - sn, p.x + sn * 0.7, p.y - c * 0.7]).fill({ color: p.color, alpha: Math.min(1, fade * 2) });
          break;
        }
        case 'smoke':
          solid.circle(p.x, p.y, p.size * (1 + f * 1.4)).fill({ color: p.color, alpha: 0.32 * fade });
          break;
        case 'dust':
          solid.circle(p.x, p.y, p.size * (1 + f * 1.8)).fill({ color: p.color, alpha: 0.3 * fade });
          break;
      }
    }
  }

  // ─────────────────────────── 各種範圍爆發 ───────────────────────────

  private drawImpact(im: Impact, t: number): void {
    const R = im.radius;
    const main = clamp01(t);
    const live = t < 1;
    const fade = 1 - main;
    const c = im.color;
    const gg = this.groundGlow;
    const gs = this.groundSolid;
    const tg = this.topGlow;
    const ts = this.topSolid;
    const ring = (r: number, width: number, alpha: number, color = c) => {
      const pts: number[] = [];
      for (let i = 0; i < 32; i++) pts.push(...this.at(im, (i / 32) * Math.PI * 2, r));
      gg.poly(pts).stroke({ color, width, alpha });
    };
    const disc = (r: number, alpha: number, color = c, g: Graphics = gg) => {
      const pts: number[] = [];
      for (let i = 0; i < 24; i++) pts.push(...this.at(im, (i / 24) * Math.PI * 2, r));
      g.poly(pts).fill({ color, alpha });
    };
    // 前 0.12 的白色閃光（大招更亮）
    const flash = clamp01(1 - t / 0.14);
    if (flash > 0 && im.kind !== 'slash' && im.kind !== 'whirl') disc(R * 0.75, flash * (im.big ? 0.8 : 0.5), 0xffffff);

    switch (im.kind) {
      case 'fire': {
        // 焦痕（留得較久）
        disc(R * 0.8, 0.35 * clamp01(1.8 - t) * 0.6, 0x1a0e08, gs);
        if (!live) break;
        const grow = easeOut(clamp01(t * 1.7));
        ring(R * (0.3 + 0.8 * grow), 6 * fade, 0.8 * fade);
        // 火舌：由中心往外的尖角（外層橘、內層黃），往上翻騰
        const n = im.big ? 18 : 13;
        for (let layer = 0; layer < 2; layer++) {
          const scale = layer ? 0.6 : 1;
          const color = layer ? 0xffe070 : c;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + im.seeds[i]! * 0.5;
            const len = R * (0.65 + im.seeds[i + 20]! * 0.55) * grow * scale;
            const [bx1, by1] = this.at(im, a - 0.16, R * 0.18 * grow);
            const [bx2, by2] = this.at(im, a + 0.16, R * 0.18 * grow);
            const [tx, ty] = this.at(im, a, len);
            const rise = (8 + im.seeds[i + 10]! * 14) * grow * (im.big ? 1.6 : 1);
            tg.poly([bx1, by1, tx, ty - rise, bx2, by2]).fill({ color, alpha: 0.85 * fade });
          }
        }
        tg.circle(im.sx, im.sy - 6, R * 12 * (0.4 + grow * 0.6) * (im.big ? 1.3 : 1)).fill({ color: 0xffd070, alpha: 0.3 * fade });
        break;
      }
      case 'frost': {
        disc(R * 0.9, 0.18 * clamp01(1.8 - t), 0xbfe8ff);
        ring(R * (0.4 + 0.6 * easeOut(clamp01(t * 2))), 3 * fade + 1, 0.8 * clamp01(1.6 - t));
        // 冰刺：一圈（大招兩圈）往上冒出的多面冰晶，先快速長出、停留、最後碎裂變淡
        const rise = easeOut(clamp01(t * 5));
        const alpha = clamp01((1.7 - t) * 1.2);
        const rings = im.big ? [0.45, 0.85] : [0.6];
        rings.forEach((rr, ri) => {
          const n = Math.round(6 + R * 3) + ri * 4;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + im.seeds[i]! * 0.3 + ri * 0.4;
            const [x, y] = this.at(im, a, R * rr * (0.85 + im.seeds[i + 8]! * 0.3));
            const h = (12 + im.seeds[i + 16]! * 16) * (im.big ? 1.5 : 1) * rise;
            const w = 3 + im.seeds[i + 24]! * 2.5;
            const lean = (im.seeds[i + 32]! - 0.5) * 8;
            ts.poly([x - w, y, x + lean, y - h, x, y + 1]).fill({ color: 0xd8f4ff, alpha });
            ts.poly([x, y + 1, x + lean, y - h, x + w, y]).fill({ color: mix(c, 0x2a5a80, 0.35), alpha });
            tg.moveTo(x + lean * 0.9, y - h * 0.9).lineTo(x + lean * 0.4, y - h * 0.4).stroke({ color: 0xffffff, width: 0.8, alpha: alpha * 0.8 });
          }
        });
        if (im.big) {
          // 絕對零度：地上的雪花紋
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const [x1, y1] = this.at(im, a, R * 0.95);
            gg.moveTo(im.sx, im.sy).lineTo(x1, y1).stroke({ color: 0xeaf8ff, width: 2, alpha: 0.6 * alpha });
            for (const k of [0.45, 0.7]) {
              const [bx, by] = this.at(im, a, R * k);
              const [lx, ly] = this.at(im, a - 0.35, R * (k + 0.2));
              const [rx, ry] = this.at(im, a + 0.35, R * (k + 0.2));
              gg.moveTo(lx, ly).lineTo(bx, by).lineTo(rx, ry).stroke({ color: 0xeaf8ff, width: 1.4, alpha: 0.5 * alpha });
            }
          }
        }
        break;
      }
      case 'lightning': {
        if (!live) break;
        // 從天而降的閃電（每 0.05 秒重新抖動）+ 地面的電弧
        const seed = Math.floor(this.time * 20);
        const top = { x: im.sx + (im.seeds[0]! - 0.5) * 40, y: im.sy - 190 };
        const path = bolt(top, { x: im.sx, y: im.sy }, 5, 26, seed);
        const a = fade * (0.7 + 0.3 * Math.sin(this.time * 60));
        strokeBolt(tg, path, c, a, im.big ? 1.5 : 1);
        for (let b = 0; b < 2; b++) {
          const k = Math.floor(path.length / 2 / 2) * 2 + b * 4;
          const from = { x: path[k] ?? im.sx, y: path[k + 1] ?? im.sy };
          strokeBolt(tg, bolt(from, { x: from.x + (b ? 30 : -30), y: from.y + 40 }, 3, 12, seed + b * 9), c, a * 0.6, 0.6);
        }
        disc(R * 0.9, 0.35 * fade, c);
        const n = im.big ? 8 : 5;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + im.seeds[i]! * 0.8;
          const [x, y] = this.at(im, ang, R * (0.6 + im.seeds[i + 10]! * 0.5));
          strokeBolt(gg, bolt({ x: im.sx, y: im.sy }, { x, y }, 3, 8, seed + i), c, a * 0.8, 0.6);
        }
        break;
      }
      case 'poison': {
        // 毒液水窪：不規則的邊緣
        const pts: number[] = [];
        for (let i = 0; i < 16; i++) pts.push(...this.at(im, (i / 16) * Math.PI * 2, R * (0.65 + im.seeds[i]! * 0.35) * easeOut(clamp01(t * 3))));
        gs.poly(pts).fill({ color: mix(c, 0x102008, 0.4), alpha: 0.45 * clamp01(1.8 - t) });
        gg.poly(pts).stroke({ color: c, width: 1.5, alpha: 0.6 * clamp01(1.8 - t) });
        if (live) ring(R * (0.3 + 0.7 * easeOut(t)), 3 * fade, 0.7 * fade);
        break;
      }
      case 'shockwave': {
        // 地裂（深色鋸齒線 + 發光的裂縫），留得較久
        const crackAlpha = clamp01(1.8 - t);
        const n = im.big ? 11 : 8;
        const grow = easeOut(clamp01(t * 4));
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2 + im.seeds[i]! * 0.5;
          const len = R * (0.7 + im.seeds[i + 12]! * 0.5) * grow;
          const pts: number[] = [im.sx, im.sy];
          let a = a0;
          for (let k = 1; k <= 4; k++) {
            a += (im.seeds[(i * 4 + k) % 48]! - 0.5) * 0.7;
            pts.push(...this.at(im, a, (len * k) / 4));
          }
          gs.poly(pts, false).stroke({ color: 0x140e0a, width: (im.big ? 4 : 3) * (1 - 0.3 * main), alpha: 0.85 * crackAlpha, join: 'miter' });
          gg.poly(pts, false).stroke({ color: mix(c, 0xffa050, 0.5), width: 1.2, alpha: 0.9 * crackAlpha * clamp01(1.4 - t) });
        }
        if (!live) break;
        // 兩道往外擴散的震波
        ring(R * (0.2 + 1.0 * easeOut(t)), 10 * fade + 1, 0.85 * fade, mix(c, 0xffffff, 0.4));
        const t2 = clamp01((t - 0.15) / 0.85);
        if (t2 > 0) ring(R * (0.2 + 1.2 * easeOut(t2)), 5 * (1 - t2) + 0.5, 0.6 * (1 - t2));
        disc(R * 0.5 * (1 - t * 0.5), 0.25 * fade, 0xffe8c0);
        break;
      }
      case 'slash': {
        if (!live) break;
        // 斬擊弧光：沿扇形掃過的月牙（兩端尖、中間寬），外緣一條亮線
        const base = Math.atan2(im.direction.y, im.direction.x);
        const span = (Math.min(im.angleDeg, 200) * Math.PI) / 180;
        const sweep = easeOut(clamp01(t * 2.2));
        const from = base - span / 2;
        const to = from + span * sweep;
        const outer: number[] = [];
        const inner: [number, number][] = [];
        const steps = 14;
        for (let i = 0; i <= steps; i++) {
          const k = i / steps;
          const a = from + (to - from) * k;
          const w = Math.sin(k * Math.PI) * 0.45 + 0.05;
          outer.push(...this.at(im, a, R * 1.05));
          inner.push(this.at(im, a, R * (1.05 - w)));
        }
        // 外緣順向、內緣反向，組成封閉的月牙
        const pts = [...outer];
        for (let i = inner.length - 1; i >= 0; i--) pts.push(...inner[i]!);
        const edge = outer;
        const lift = (arr: number[]) => arr.map((v, i) => (i % 2 ? v - 16 : v));
        tg.poly(lift(pts)).fill({ color: c, alpha: 0.55 * fade });
        tg.poly(lift(edge), false).stroke({ color: 0xffffff, width: 2, alpha: 0.9 * fade });
        break;
      }
      case 'whirl': {
        if (!live) break;
        // 劍舞：三道繞著中心旋轉的弧光
        for (let k = 0; k < 3; k++) {
          const start = this.time * 14 + (k / 3) * Math.PI * 2;
          const pts: number[] = [];
          for (let i = 0; i <= 8; i++) pts.push(...this.at(im, start + i * 0.18, R * (0.75 + k * 0.1)));
          tg.poly(pts.map((v, i) => (i % 2 ? v - 14 : v)), false).stroke({ color: c, width: 4 * fade + 1, alpha: 0.75 * fade, cap: 'round' });
        }
        ring(R, 2, 0.5 * fade);
        break;
      }
      case 'burst': {
        if (!live) break;
        ring(R * (0.3 + 0.7 * easeOut(t)), 4 * fade, 0.9 * fade);
        const pts: number[] = [];
        for (let i = 0; i < 12; i++) pts.push(...this.at(im, (i / 12) * Math.PI * 2, R * (i % 2 ? 0.25 : 0.7) * easeOut(clamp01(t * 3))));
        tg.poly(pts.map((v, i) => (i % 2 ? v - 10 : v))).fill({ color: c, alpha: 0.6 * fade });
        break;
      }
      case 'arrowRain': {
        if (!live) break;
        // 幾支箭從天而降，落地後揚起塵土
        for (let i = 0; i < 4; i++) {
          const [x, y] = this.at(im, im.seeds[i]! * Math.PI * 2, R * im.seeds[i + 4]! * 0.9);
          const land = clamp01((t - im.seeds[i + 8]! * 0.25) / 0.35);
          if (land <= 0) continue;
          const yy = y - 120 * (1 - land);
          const xx = x - 30 * (1 - land);
          ts.moveTo(xx - 6, yy - 14).lineTo(xx, yy).stroke({ color: 0x8a6a48, width: 1.4 });
          ts.poly([xx + 1.5, yy + 3, xx - 2.2, yy - 1, xx + 1, yy - 2.4]).fill({ color: 0xe8ecf0 });
          if (land < 1) tg.moveTo(xx - 12, yy - 28).lineTo(xx - 6, yy - 14).stroke({ color: c, width: 1, alpha: 0.5 });
          else if (im.seeds[i + 12]! < 0.6) this.emit('dust', x, y, 0x8a7a66, 0.5);
        }
        break;
      }
    }
    if (im.special && live) ring(R * (0.9 + 0.3 * easeOut(t)), 2, 0.9 * fade, SPECIAL);
  }

  private drawChain(ch: Chain): void {
    const t = ch.age / CHAIN_TIME;
    const seed = Math.floor(ch.age * 20);
    if (seed !== ch.jitterAt) {
      ch.jitterAt = seed;
      ch.paths = [];
      for (let i = 1; i < ch.points.length; i++) {
        const a = ch.points[i - 1]!;
        const b = ch.points[i]!;
        // 主幹兩股（各自抖動）+ 兩條分岔
        ch.paths.push(bolt(a, b, 5, 16, seed * 31 + i), bolt(a, b, 4, 11, seed * 17 + i + 5));
        for (let k = 0; k < 2; k++) {
          const m = 0.3 + 0.4 * rnd(seed + i * 7 + k);
          const from = { x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m };
          const to = { x: from.x + (rnd(seed + k + i) - 0.5) * 50, y: from.y + (rnd(seed + k * 3 + i) - 0.3) * 40 };
          ch.paths.push(bolt(from, to, 3, 7, seed + k * 13 + i));
        }
      }
    }
    const alpha = (1 - t) * (0.75 + 0.25 * Math.sin(ch.age * 70));
    ch.paths.forEach((p, i) => strokeBolt(this.topGlow, p, ch.color, alpha * (i % 4 < 2 ? 1 : 0.6), i % 4 === 0 ? 1.2 : i % 4 === 1 ? 0.8 : 0.5));
    // 每個被打到的點：閃光
    for (const p of ch.points.slice(1)) this.topGlow.circle(p.x, p.y, 10 * (1 - t) + 3).fill({ color: ch.color, alpha: 0.35 * (1 - t) }).circle(p.x, p.y, 3).fill({ color: 0xffffff, alpha: 0.9 * (1 - t) });
  }
}

/** 可重現的亂數（同一個 seed 得到同一個值） */
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 中點位移的鋸齒閃電：回傳 [x0, y0, x1, y1, …] */
function bolt(a: { x: number; y: number }, b: { x: number; y: number }, depth: number, spread: number, seed: number): number[] {
  let pts: { x: number; y: number }[] = [a, b];
  let s = spread;
  for (let d = 0; d < depth; d++) {
    const next: { x: number; y: number }[] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (rnd(seed + d * 101 + i * 13) - 0.5) * s;
      next.push({ x: (p.x + q.x) / 2 - (dy / len) * off, y: (p.y + q.y) / 2 + (dx / len) * off }, q);
    }
    pts = next;
    s *= 0.55;
  }
  return pts.flatMap((p) => [p.x, p.y]);
}

/** 三層筆畫：寬的外光、中間的顏色、白色內核 */
function strokeBolt(g: Graphics, path: number[], color: number, alpha: number, width: number): void {
  if (path.length < 4) return;
  g.poly(path, false).stroke({ color, width: 7 * width, alpha: 0.18 * alpha, join: 'round', cap: 'round' });
  g.poly(path, false).stroke({ color, width: 3 * width, alpha: 0.7 * alpha, join: 'round', cap: 'round' });
  g.poly(path, false).stroke({ color: 0xffffff, width: 1.1 * width, alpha, join: 'round', cap: 'round' });
}
