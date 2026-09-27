import { Container, Graphics } from 'pixi.js';
import type { Rarity } from '../../data/schema/item';
import { RARITY_COLORS } from '../palette';

interface BeamStyle {
  /** 光柱高度與寬度（px）；0 = 沒有光柱 */
  height: number;
  width: number;
  /** 光柱周圍的粒子數 */
  particles: number;
  /** 粒子繞著光柱旋轉（史詩以上） */
  orbit: boolean;
  /** 出現時的爆光（傳奇以上） */
  burst: boolean;
  /** 地面符文與脈動（神話） */
  runes: boolean;
}

/**
 * 地上裝備的稀有度光柱：遠遠就看得出「那邊有值得撿的東西」。
 * 白：淡淡小光點；藍：短光柱；黃：光柱 + 小粒子；紫：光柱 + 緩慢旋轉粒子；
 * 橘：金橘光柱 + 出現時爆光 + 火花；紅：紅色光柱 + 地面符文 + 脈動。
 */
const STYLES: Record<Rarity, BeamStyle> = {
  normal: { height: 0, width: 0, particles: 0, orbit: false, burst: false, runes: false },
  magic: { height: 38, width: 5, particles: 0, orbit: false, burst: false, runes: false },
  rare: { height: 70, width: 6, particles: 4, orbit: false, burst: false, runes: false },
  epic: { height: 95, width: 7, particles: 6, orbit: true, burst: false, runes: false },
  legendary: { height: 125, width: 9, particles: 8, orbit: true, burst: true, runes: false },
  mythic: { height: 145, width: 10, particles: 10, orbit: true, burst: true, runes: true },
};

const BURST_TIME = 0.9;

export class LootBeam {
  readonly container = new Container();
  private readonly glow = new Graphics();
  private readonly beam = new Graphics();
  private readonly sparks = new Graphics();
  private readonly runes = new Graphics();
  private readonly burst = new Graphics();
  private readonly style: BeamStyle;
  private readonly color: number;
  private time = Math.random() * 10;
  private burstTime: number;

  constructor(rarity: Rarity) {
    this.style = STYLES[rarity];
    this.color = RARITY_COLORS[rarity];
    this.burstTime = this.style.burst ? BURST_TIME : 0;
    for (const g of [this.glow, this.beam, this.sparks, this.burst]) g.blendMode = 'add';
    this.runes.blendMode = 'add';
    this.drawStatic();
    // 符文在圓上旋轉，外層再壓扁成地面的透視
    const ground = new Container();
    ground.scale.set(1, 0.5);
    ground.addChild(this.runes);
    this.container.addChild(ground, this.glow, this.beam, this.sparks, this.burst);
  }

  update(dt: number): void {
    this.time += dt;
    const s = this.style;
    const t = this.time;
    // 光點 / 光柱的呼吸
    const pulse = s.runes ? 0.75 + 0.25 * Math.sin(t * 4) : 0.85 + 0.15 * Math.sin(t * 2.2);
    this.beam.alpha = pulse;
    this.glow.alpha = s.height === 0 ? 0.35 + 0.2 * Math.sin(t * 2.5) : pulse;
    if (s.runes) {
      this.runes.rotation = t * 0.4;
      this.runes.alpha = 0.55 + 0.35 * Math.sin(t * 3);
    }

    // 粒子：沿光柱往上飄；史詩以上繞著光柱旋轉
    const g = this.sparks.clear();
    for (let i = 0; i < s.particles; i++) {
      const phase = (t * (s.orbit ? 0.35 : 0.5) + i / s.particles) % 1;
      const y = -phase * s.height;
      const angle = s.orbit ? t * 1.2 + (i / s.particles) * Math.PI * 2 : i * 2.4;
      const r = s.orbit ? 9 + 3 * Math.sin(t + i) : 4 + (i % 3) * 2;
      const x = Math.cos(angle) * r;
      const size = s.burst ? 1.6 : 1.3;
      g.circle(x, y + Math.sin(angle) * r * 0.3, size).fill({ color: this.color, alpha: 0.9 * (1 - phase) });
    }

    // 出現時的爆光：擴散的光環 + 閃光
    if (this.burstTime > 0) {
      this.burstTime = Math.max(0, this.burstTime - dt);
      const k = 1 - this.burstTime / BURST_TIME;
      this.burst
        .clear()
        .ellipse(0, 0, 10 + k * 60, 5 + k * 30)
        .stroke({ color: this.color, width: 3 * (1 - k), alpha: 1 - k })
        .circle(0, -s.height * 0.35, 18 * (1 - k))
        .fill({ color: 0xffffff, alpha: 0.6 * (1 - k) });
    } else if (this.burst.visible) {
      this.burst.clear();
      this.burst.visible = false;
    }
  }

  private drawStatic(): void {
    const s = this.style;
    const c = this.color;
    // 地面光暈
    const r = s.height === 0 ? 7 : 10 + s.width * 1.2;
    this.glow.ellipse(0, 0, r, r * 0.5).fill({ color: c, alpha: 0.35 }).ellipse(0, 0, r * 0.5, r * 0.25).fill({ color: 0xffffff, alpha: 0.25 });
    if (s.height > 0) {
      // 光柱：由下往上變細變淡的三層
      for (const [w, a] of [
        [s.width * 2.2, 0.12],
        [s.width, 0.3],
        [s.width * 0.35, 0.55],
      ] as const) {
        this.beam.poly([-w / 2, 0, w / 2, 0, w * 0.15, -s.height, -w * 0.15, -s.height]).fill({ color: c, alpha: a });
      }
      this.beam.poly([-s.width * 0.15, 0, s.width * 0.15, 0, 0, -s.height * 0.8]).fill({ color: 0xffffff, alpha: 0.35 });
    }
    if (s.runes) {
      // 地面符文：兩圈光環 + 八個符文刻痕
      const g = this.runes;
      g.circle(0, 0, 26).stroke({ color: c, width: 1.5, alpha: 0.8 }).circle(0, 0, 20).stroke({ color: c, width: 1, alpha: 0.6 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * 23;
        const y = Math.sin(a) * 23;
        g.poly([x - 2, y, x, y - 3, x + 2, y, x, y + 3]).fill({ color: c, alpha: 0.9 });
      }
    }
  }
}
