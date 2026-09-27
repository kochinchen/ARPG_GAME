import { Container, Graphics } from 'pixi.js';
import { RARITIES, type Rarity } from '../../data/schema/item';
import type { GlowParticle, WeaponGlowStyle } from '../figure/weapons/WeaponLooks';
import { RARITY_COLORS } from '../palette';

type Point = { x: number; y: number };
export interface WeaponAxis {
  a: Point;
  b: Point;
  /** 軸線中點（環繞、螺旋的中心） */
  mid: Point;
  /** 寶珠、斧頭等聚焦點（有才畫聚光） */
  focus: Point | null;
  /** 武器在身體前面（光芒畫在角色前面） */
  front: boolean;
}

/** 各稀有度的光芒強度（白色沒有光） */
const STRENGTH: Record<Rarity, number> = { normal: 0, magic: 0.35, rare: 0.5, epic: 0.65, legendary: 0.85, mythic: 1 };
/** 沿武器移動的亮點（黃以上）間隔（秒） */
const GLINT_INTERVAL = 2.2;
const GLINT_TIME = 0.35;
/** 神話：武器整體閃一下的間隔（秒） */
const PULSE_INTERVAL = 2.4;
const PULSE_TIME = 0.4;
/** 虹彩（全元素）的顏色輪替 */
const PRISM = [0xff6a30, 0x8fdcff, 0xbfd0ff, 0x8fff70];

const atLeast = (rarity: Rarity, min: Rarity) => RARITIES.indexOf(rarity) >= RARITIES.indexOf(min);

interface Mote {
  kind: GlowParticle | 'mote';
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 往下的加速度（px / 秒²） */
  gravity: number;
  life: number;
  max: number;
  size: number;
  color: number;
  /** 螺旋（虛空、虹彩）：繞聚焦點的角度與半徑 */
  angle?: number;
  radius?: number;
}

/**
 * 武器周圍的微光（只有主角）：顏色與強度依武器的稀有度。
 * - 藍：淡淡的光暈
 * - 黃：金色光暈 + 沿刃移動的亮點
 * - 紫：紫色光暈 + 亮點 + 飄散的微粒
 * - 橘：專屬顏色的光暈與內核 + 元素粒子（火星、霜晶、電弧、血滴、暗影、聖光、風、星光、碎石）
 * - 紅：以上全部 + 環繞武器的符文 / 碎片 / 星星 + 間歇的閃光
 * 光芒跟著武器畫在角色前面或後面（武器在身後時被身體擋住）。
 */
export class WeaponGlowView {
  readonly back = new Container();
  readonly front = new Container();
  private readonly g = new Graphics();
  private readonly motes: Mote[] = [];
  private rarity: Rarity = 'normal';
  private style: WeaponGlowStyle | null = null;
  private color = 0xffffff;
  private core = 0xffffff;
  private time = 0;
  private spawn = 0;
  private moteSpawn = 0;

  constructor() {
    this.g.blendMode = 'add';
    this.front.addChild(this.g);
  }

  /** 換武器：稀有度與專屬光芒（橘 / 紅；沒有時依稀有度的顏色） */
  set(rarity: Rarity, style: WeaponGlowStyle | null): void {
    if (rarity === this.rarity && style === this.style) return;
    this.rarity = rarity;
    this.style = atLeast(rarity, 'legendary') ? (style ?? { color: RARITY_COLORS[rarity], particle: rarity === 'mythic' ? 'spark' : 'ember', ...(rarity === 'mythic' ? { orbit: 'runes' as const } : {}) }) : null;
    this.color = this.style?.color ?? RARITY_COLORS[rarity];
    this.core = this.style?.core ?? 0xffffff;
    this.motes.length = 0;
  }

  update(dt: number, axis: WeaponAxis | null, alive: boolean): void {
    this.time += dt;
    const g = this.g.clear();
    const k = STRENGTH[this.rarity];
    if (!axis || !alive || k === 0) {
      this.motes.length = 0;
      return;
    }
    // 武器在身後：光芒也畫在身後
    const parent = axis.front ? this.front : this.back;
    if (g.parent !== parent) parent.addChild(g);

    const t = this.time;
    const breathe = 0.8 + 0.2 * Math.sin(t * 2.4);
    const pulse = this.rarity === 'mythic' ? Math.max(0, 1 - ((t % PULSE_INTERVAL) / PULSE_TIME)) : 0;
    const { a, b } = axis;
    const center = axis.focus ?? axis.mid;
    // 光暈：沿武器的三層光帶（外層淡、內層亮）
    const w = 2.2 + k * 2.4 + pulse * 3;
    const layers: [number, number][] = [
      [w * 3, 0.06],
      [w * 1.9, 0.1],
      [w, 0.18],
    ];
    for (const [width, alpha] of layers) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: this.color, width, alpha: alpha * k * breathe * (1 + pulse), cap: 'round' });
    // 橘以上：白熱的內核
    if (this.style) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: this.core, width: 1 + pulse * 1.5, alpha: 0.45 * breathe + pulse * 0.5, cap: 'round' });
    // 聚焦點（寶珠、斧頭）的光暈
    if (atLeast(this.rarity, 'rare') && axis.focus) {
      const focus = axis.focus;
      const r = 2 + k * 2.6;
      g.circle(focus.x, focus.y, r * 1.8).fill({ color: this.color, alpha: 0.08 * k * breathe }).circle(focus.x, focus.y, r).fill({ color: this.color, alpha: 0.16 * k * breathe });
    }
    // 黃以上：沿刃移動的亮點
    if (atLeast(this.rarity, 'rare')) {
      const p = (t % GLINT_INTERVAL) / GLINT_TIME;
      if (p < 1) {
        const x = a.x + (b.x - a.x) * p;
        const y = a.y + (b.y - a.y) * p;
        g.circle(x, y, 1.8).fill({ color: this.core, alpha: 0.7 * Math.sin(p * Math.PI) }).circle(x, y, 4).fill({ color: this.color, alpha: 0.25 * Math.sin(p * Math.PI) });
      }
    }
    this.emit(dt, axis);
    this.drawMotes(dt, g, center);
    if (this.style?.orbit) this.drawOrbit(g, center, this.style.orbit);
  }

  /** 產生粒子：紫以上的微粒、橘 / 紅的元素粒子 */
  private emit(dt: number, axis: WeaponAxis): void {
    const along = (): Point => {
      const s = Math.random();
      return { x: axis.a.x + (axis.b.x - axis.a.x) * s, y: axis.a.y + (axis.b.y - axis.a.y) * s };
    };
    if (atLeast(this.rarity, 'epic')) {
      this.moteSpawn -= dt * (this.style ? 2 : 4);
      while (this.moteSpawn <= 0) {
        this.moteSpawn += 1;
        const p = along();
        this.motes.push({ kind: 'mote', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 8, vy: -8 - Math.random() * 8, gravity: 0, life: 0, max: 1 + Math.random() * 0.6, size: 0.9, color: this.color });
      }
    }
    const style = this.style;
    if (!style) return;
    const rate = (this.rarity === 'mythic' ? 16 : 10) * RATE[style.particle];
    this.spawn -= dt * rate;
    while (this.spawn <= 0) {
      this.spawn += 1;
      this.motes.push(particle(style.particle, along(), axis.focus ?? axis.mid, this.color, this.core));
    }
    if (this.motes.length > 80) this.motes.splice(0, this.motes.length - 80);
  }

  private drawMotes(dt: number, g: Graphics, focus: Point): void {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i]!;
      m.life += dt;
      if (m.life >= m.max) {
        this.motes.splice(i, 1);
        continue;
      }
      const f = m.life / m.max;
      const fade = 1 - f;
      if (m.angle !== undefined && m.radius !== undefined) {
        // 螺旋收進聚焦點
        m.angle += dt * 5;
        const r = m.radius * fade;
        m.x = focus.x + Math.cos(m.angle) * r;
        m.y = focus.y + Math.sin(m.angle) * r * 0.55;
      } else {
        m.vy += m.gravity * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
      }
      switch (m.kind) {
        case 'frost':
        case 'star': {
          // 四角星（霜晶 / 星光）：一閃一閃
          const s = m.size * (m.kind === 'star' ? Math.sin(f * Math.PI) * 1.6 : 1);
          g.poly([m.x, m.y - s * 2, m.x + s * 0.5, m.y - s * 0.5, m.x + s * 2, m.y, m.x + s * 0.5, m.y + s * 0.5, m.x, m.y + s * 2, m.x - s * 0.5, m.y + s * 0.5, m.x - s * 2, m.y, m.x - s * 0.5, m.y - s * 0.5]).fill({ color: m.color, alpha: 0.9 * (m.kind === 'star' ? 1 : fade) });
          break;
        }
        case 'spark': {
          // 短短的電弧：三段折線，每幀隨機
          let x = m.x;
          let y = m.y;
          g.moveTo(x, y);
          for (let j = 0; j < 3; j++) {
            x += m.vx * 0.04 + (Math.random() - 0.5) * 4;
            y += m.vy * 0.04 + (Math.random() - 0.5) * 4;
            g.lineTo(x, y);
          }
          g.stroke({ color: m.color, width: 1, alpha: 0.95 * fade });
          break;
        }
        case 'wind':
          g.moveTo(m.x, m.y).lineTo(m.x - m.vx * 0.12, m.y - m.vy * 0.12).stroke({ color: m.color, width: 0.9, alpha: 0.7 * Math.sin(f * Math.PI), cap: 'round' });
          break;
        case 'holy':
          g.moveTo(m.x, m.y).lineTo(m.x + m.vx * 0.15, m.y + m.vy * 0.15).stroke({ color: m.color, width: 1.1, alpha: 0.6 * fade, cap: 'round' });
          break;
        case 'rock':
          g.rect(m.x - m.size / 2, m.y - m.size / 2, m.size, m.size).fill({ color: m.color, alpha: 0.85 * fade });
          break;
        case 'shadow':
          g.circle(m.x, m.y, m.size * (1 + f)).fill({ color: m.color, alpha: 0.28 * fade });
          break;
        default:
          g.circle(m.x, m.y, m.size * (m.kind === 'ember' ? 1 - f * 0.5 : 1)).fill({ color: m.color, alpha: 0.85 * fade });
      }
    }
  }

  /** 神話：環繞武器聚焦點的符文 / 碎片 / 星星（等角橢圓；轉到後面時較暗） */
  private drawOrbit(g: Graphics, focus: Point, kind: 'runes' | 'shards' | 'stars'): void {
    const n = kind === 'stars' ? 5 : kind === 'runes' ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const ang = this.time * (kind === 'shards' ? 2.2 : 1.4) + (i / n) * Math.PI * 2;
      const x = focus.x + Math.cos(ang) * 11;
      const y = focus.y + Math.sin(ang) * 5.5 - 2;
      const alpha = 0.45 + 0.4 * (Math.sin(ang) + 1) / 2;
      if (kind === 'runes') {
        g.poly([x, y - 2.6, x + 1.8, y, x, y + 2.6, x - 1.8, y]).stroke({ color: this.core, width: 0.9, alpha }).moveTo(x, y - 1.2).lineTo(x, y + 1.2).stroke({ color: this.color, width: 0.9, alpha });
      } else if (kind === 'shards') {
        const dx = Math.cos(ang + Math.PI / 2) * 1.2;
        g.poly([x - dx, y - 3, x + 1.2, y + 1.5, x - 1.2 + dx, y + 1]).fill({ color: this.color, alpha }).poly([x - dx, y - 3, x + 1.2, y + 1.5, x - 1.2 + dx, y + 1]).stroke({ color: this.core, width: 0.5, alpha: alpha * 0.8 });
      } else {
        const s = 1.2 + 0.5 * Math.sin(this.time * 6 + i);
        g.poly([x, y - s * 2, x + s * 0.5, y - s * 0.5, x + s * 2, y, x + s * 0.5, y + s * 0.5, x, y + s * 2, x - s * 0.5, y + s * 0.5, x - s * 2, y, x - s * 0.5, y - s * 0.5]).fill({ color: this.core, alpha });
      }
    }
  }
}

/** 各種粒子的產生速度倍率 */
const RATE: Record<GlowParticle, number> = { ember: 1, frost: 0.6, spark: 0.9, blood: 0.5, shadow: 0.7, holy: 0.6, void: 0.9, wind: 0.8, star: 0.5, rock: 0.5, prism: 1 };

function particle(kind: GlowParticle, p: Point, focus: Point, color: number, core: number): Mote {
  const r = Math.random;
  const base = { kind, x: p.x, y: p.y, vx: 0, vy: 0, gravity: 0, life: 0, size: 1, color };
  switch (kind) {
    case 'ember':
      return { ...base, vx: (r() - 0.5) * 10, vy: -18 - r() * 18, max: 0.7 + r() * 0.6, size: 1.1 + r() * 0.5, color: r() < 0.35 ? core : color };
    case 'frost':
      return { ...base, x: p.x + (r() - 0.5) * 8, vx: (r() - 0.5) * 4, vy: 4 + r() * 5, max: 1.2 + r() * 0.6, size: 0.8 + r() * 0.5, color: r() < 0.5 ? core : color };
    case 'spark':
      return { ...base, vx: (r() - 0.5) * 60, vy: (r() - 0.5) * 60, max: 0.1 + r() * 0.12, color: r() < 0.5 ? core : color };
    case 'blood':
      return { ...base, vx: (r() - 0.5) * 6, vy: 2, gravity: 70, max: 0.6 + r() * 0.4, size: 1 + r() * 0.5 };
    case 'shadow':
      return { ...base, vx: (r() - 0.5) * 14, vy: -6 - r() * 8, max: 1 + r() * 0.5, size: 1.8 + r() };
    case 'holy': {
      const a = r() * Math.PI * 2;
      return { ...base, vx: Math.cos(a) * 30, vy: Math.sin(a) * 18 - 6, max: 0.5 + r() * 0.3, color: r() < 0.5 ? core : color };
    }
    case 'wind': {
      const sd = r() < 0.5 ? -1 : 1;
      return { ...base, x: p.x - sd * 6, vx: sd * (40 + r() * 30), vy: -4 - r() * 6, max: 0.35 + r() * 0.25, color: r() < 0.4 ? core : color };
    }
    case 'star':
      return { ...base, x: p.x + (r() - 0.5) * 16, y: p.y + (r() - 0.5) * 10, max: 0.6 + r() * 0.5, size: 0.9 + r() * 0.5, color: r() < 0.5 ? core : color };
    case 'rock':
      return { ...base, vx: (r() - 0.5) * 18, vy: -10 - r() * 10, gravity: 90, max: 0.6 + r() * 0.3, size: 1 + r() * 1.2, color: r() < 0.5 ? 0x8a6a48 : color };
    case 'void':
    case 'prism':
      return { ...base, x: focus.x, y: focus.y, angle: r() * Math.PI * 2, radius: 9 + r() * 6, max: 0.8 + r() * 0.4, size: 1 + r() * 0.5, color: kind === 'prism' ? PRISM[Math.floor(r() * PRISM.length)]! : r() < 0.4 ? core : color };
  }
}
