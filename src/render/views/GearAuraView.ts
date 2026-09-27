import { Container, Graphics } from 'pixi.js';
import { RARITIES, type Rarity } from '../../data/schema/item';
import { RARITY_COLORS } from '../palette';

/** 光芒等級 1～4 的整體強度 */
const INTENSITY = [0, 0.35, 0.55, 0.8, 1];
/** 武器拖尾保留的點數 */
const TRAIL_POINTS = 9;
/** 武器尖端移動超過這個速度（px / 秒）才畫拖尾 */
const TRAIL_SPEED = 160;
/** 神話：能量脈動的間隔（秒） */
const PULSE_INTERVAL = 2.6;

const atLeast = (rarity: Rarity, min: Rarity) => RARITIES.indexOf(rarity) >= RARITIES.indexOf(min);

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

/**
 * 裝備光芒（只有主角）：強度依 Gear Aura Score 的等級，顏色與特效依身上最高的稀有度。
 * - 藍：腳下與身體邊緣很淡的微光
 * - 黃：淡金色輪廓 + 少量粒子
 * - 紫：紫色微粒 + 武器拖尾
 * - 橘：金橘光芒 + 武器特效 + 少量火花
 * - 紅：深紅光芒 + 地面符文 + 明顯的武器拖尾 + 間歇的能量脈動
 * 保持低調，不要滿身閃光。
 */
export class GearAuraView {
  /** 畫在角色後面（腳下光暈、輪廓、符文） */
  readonly back = new Container();
  /** 畫在角色前面（粒子、火花、拖尾、脈動） */
  readonly front = new Container();
  private readonly feet = new Graphics();
  private readonly halo = new Graphics();
  private readonly runes = new Graphics();
  private readonly motes = new Graphics();
  private readonly trail = new Graphics();
  private readonly pulse = new Graphics();
  private readonly particles: Mote[] = [];
  private readonly tips: { x: number; y: number }[] = [];
  private level = 0;
  private rarity: Rarity = 'normal';
  private color = 0xffffff;
  private time = 0;
  private spawnTimer = 0;
  private pulseTime = 0;

  constructor(private readonly bodyHeight: number) {
    for (const g of [this.feet, this.halo, this.motes, this.trail, this.pulse, this.runes]) g.blendMode = 'add';
    const ground = new Container();
    ground.scale.set(1, 0.5);
    ground.addChild(this.runes);
    this.back.addChild(this.feet, ground, this.halo);
    this.front.addChild(this.trail, this.motes, this.pulse);
  }

  set(level: number, rarity: Rarity): void {
    if (level === this.level && rarity === this.rarity) return;
    this.level = level;
    this.rarity = rarity;
    this.color = RARITY_COLORS[rarity];
    this.redraw();
  }

  /** tip：武器尖端（相對腳底，px）；null = 沒有武器 */
  update(dt: number, tip: { x: number; y: number } | null, alive: boolean): void {
    this.time += dt;
    const on = alive && this.level > 0;
    this.back.visible = this.front.visible = on;
    if (!on) {
      this.particles.length = 0;
      this.tips.length = 0;
      return;
    }
    const k = INTENSITY[this.level]!;
    const t = this.time;
    this.feet.alpha = k * (0.75 + 0.25 * Math.sin(t * 2));
    this.halo.alpha = k * (0.7 + 0.3 * Math.sin(t * 1.6 + 1));
    this.runes.rotation = t * 0.35;
    this.runes.alpha = k * (0.4 + 0.2 * Math.sin(t * 2.5));

    this.updateMotes(dt, k);
    this.updateTrail(dt, tip);
    this.updatePulse(dt);
  }

  private redraw(): void {
    const c = this.color;
    const h = this.bodyHeight;
    this.feet.clear();
    this.halo.clear();
    this.runes.clear();
    if (this.level === 0) return;
    // 腳下光暈
    this.feet.ellipse(0, 0, 26, 12).fill({ color: c, alpha: 0.18 }).ellipse(0, 0, 15, 7).fill({ color: c, alpha: 0.22 });
    // 身體邊緣的微光 / 輪廓（黃以上較明顯）
    const rim = atLeast(this.rarity, 'rare') ? 0.14 : 0.07;
    this.halo
      .ellipse(0, -h * 0.5, 17, h * 0.55)
      .fill({ color: c, alpha: rim * 0.6 })
      .ellipse(0, -h * 0.5, 12, h * 0.48)
      .fill({ color: c, alpha: rim * 0.5 });
    // 神話：地面符文
    if (atLeast(this.rarity, 'mythic')) {
      this.runes.circle(0, 0, 29).stroke({ color: c, width: 1.2, alpha: 0.7 }).circle(0, 0, 24).stroke({ color: c, width: 0.8, alpha: 0.45 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const x = Math.cos(a) * 26.5;
        const y = Math.sin(a) * 26.5;
        this.runes.poly([x - 2.2, y, x, y - 3.4, x + 2.2, y, x, y + 3.4]).fill({ color: c, alpha: 0.85 });
      }
    }
  }

  /** 粒子（黃以上）與火花（橘以上） */
  private updateMotes(dt: number, k: number): void {
    const r = this.rarity;
    const h = this.bodyHeight;
    if (atLeast(r, 'rare')) {
      const rate = (atLeast(r, 'epic') ? 7 : 3) * k;
      this.spawnTimer -= dt * rate;
      while (this.spawnTimer <= 0) {
        this.spawnTimer += 1;
        this.particles.push({ x: (Math.random() - 0.5) * 26, y: -Math.random() * h * 0.8, vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10, life: 0, max: 1.2 + Math.random(), size: 1.1 });
        // 橘以上：偶爾噴出一顆火花
        if (atLeast(r, 'legendary') && Math.random() < 0.18) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({ x: 0, y: -h * 0.5, vx: Math.cos(a) * 45, vy: Math.sin(a) * 30 - 20, life: 0, max: 0.45, size: 1.6 });
        }
      }
    }
    const g = this.motes.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      g.circle(p.x, p.y, p.size).fill({ color: this.color, alpha: 0.85 * (1 - p.life / p.max) });
    }
  }

  /** 武器拖尾（紫以上）：武器快速移動時留下漸淡的光帶 */
  private updateTrail(dt: number, tip: { x: number; y: number } | null): void {
    const g = this.trail.clear();
    if (!tip || !atLeast(this.rarity, 'epic')) {
      this.tips.length = 0;
      return;
    }
    const last = this.tips[this.tips.length - 1];
    const speed = last && dt > 0 ? Math.hypot(tip.x - last.x, tip.y - last.y) / dt : 0;
    if (speed > TRAIL_SPEED) this.tips.push({ ...tip });
    else this.tips.shift();
    while (this.tips.length > TRAIL_POINTS) this.tips.shift();
    const width = atLeast(this.rarity, 'mythic') ? 4 : atLeast(this.rarity, 'legendary') ? 3.2 : 2.4;
    for (let i = 1; i < this.tips.length; i++) {
      const a = this.tips[i - 1]!;
      const b = this.tips[i]!;
      const f = i / this.tips.length;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: this.color, width: width * f, alpha: 0.75 * f, cap: 'round' });
    }
    // 橘以上：武器尖端有一點光
    if (atLeast(this.rarity, 'legendary')) g.circle(tip.x, tip.y, 2.4 + Math.sin(this.time * 6)).fill({ color: this.color, alpha: 0.6 });
  }

  /** 神話：間歇的能量脈動（從腳下擴散的光環） */
  private updatePulse(dt: number): void {
    const g = this.pulse.clear();
    if (!atLeast(this.rarity, 'mythic')) return;
    this.pulseTime = (this.pulseTime + dt) % PULSE_INTERVAL;
    const p = this.pulseTime / 0.7;
    if (p >= 1) return;
    g.ellipse(0, 0, 14 + p * 40, 7 + p * 20).stroke({ color: this.color, width: 2.5 * (1 - p), alpha: 0.8 * (1 - p) });
  }
}
