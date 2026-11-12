import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { StatusKind } from '../../data/schema/effects';

/**
 * 角色身上看得到的狀態（兩種畫法都畫，在角色上方）：
 * - 頭上的霧：弱點（紅）、標記（高光紫）、弱化（黃）、破甲（橘），一團緩緩翻滾的光霧，持續到狀態結束
 * - 霧的上方的圖示（設計者 2026-11-12）：所有角色（主角與怪物）身上的減益都畫——弱化 = 火冰雷三個元素點加往下的箭頭、破甲 = 裂開的盾牌、
 *   弱點 = 紅色準星、標記 = 往下指的紫色標記、減速 = 小靴子加往下的箭頭；其他負面（暈眩、冰凍、浮空、燃燒、中毒、流血）與正面狀態（深綠底）也各有一個圖示，見 GLYPHS
 * - 牽制（牽制射擊的緩速）：腰部拉出幾條發光的線，釘在周圍的地上
 */
export const STATUS_MISTS: Partial<Record<StatusKind, { color: number; alpha: number }>> = {
  weakPoint: { color: 0xff2a2a, alpha: 0.75 },
  marked: { color: 0xd88cff, alpha: 0.85 },
  expose: { color: 0xffe14a, alpha: 0.75 },
  armorBreak: { color: 0xff8a2a, alpha: 0.75 },
};
/** 有圖示的狀態（依序左右排開） */
const STATUS_ICONS: StatusKind[] = [
  // 負面
  'stun', 'freeze', 'airborne', 'slow', 'burn', 'poison', 'bleed', 'expose', 'armorBreak', 'weakPoint', 'marked',
  // 正面（深綠底）
  'guard', 'counter', 'ironWill', 'unstoppable', 'meleeEmpower', 'rangedEmpower',
];
const POSITIVE = new Set<StatusKind>(['guard', 'counter', 'ironWill', 'unstoppable', 'meleeEmpower', 'rangedEmpower']);
/** 沒有霧的狀態，圖示外框的顏色 */
const ICON_COLORS: Partial<Record<StatusKind, number>> = {
  slow: 0x7ac8ff,
  stun: 0xffe14a,
  freeze: 0x9ad8ff,
  airborne: 0xc8e0ff,
  burn: 0xff6a2a,
  poison: 0x8ed04a,
  bleed: 0xe0303a,
  guard: 0xffd060,
  counter: 0xffa040,
  ironWill: 0xc8d0e0,
  unstoppable: 0xb8a0ff,
  meleeEmpower: 0xff7a4a,
  rangedEmpower: 0x7ae07a,
};
/** 圖示的半徑（px，再乘角色大小）與左右間距 */
const ICON = { r: 7, gap: 17 };
/** 霧的大小（px）、團數、翻滾速度 */
const MIST = { width: 30, height: 12, puffs: 6, speed: 1.6 };
/** 牽制的線：條數、地上的釘點半徑（px）、線的顏色 */
const TETHER = { count: 4, radius: 22, color: 0xe8d6a0, glow: 0xffc860 };

let puffTexture: Texture | null = null;
/** 柔和的圓形光點（中心亮、邊緣透明） */
function puff(): Texture {
  if (puffTexture) return puffTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return (puffTexture = Texture.from(canvas));
}

export class StatusAuraView {
  readonly container = new Container();
  private readonly mists = new Map<StatusKind, { group: Container; puffs: Sprite[] }>();
  private readonly tethers = new Graphics();
  private readonly icons = new Map<StatusKind, Graphics>();
  private time = 0;

  constructor(
    /** 頭頂的高度（相對腳底，px；負值往上） */
    private readonly headY: number,
    /** 角色的大小倍率 */
    private readonly size: number,
  ) {
    this.container.addChild(this.tethers);
  }

  update(dt: number, statuses: readonly { kind: StatusKind }[], pinned: boolean, lift: number): void {
    this.time += dt;
    const active = new Set(statuses.map((s) => s.kind));
    let stack = 0;
    for (const [kind, style] of Object.entries(STATUS_MISTS) as [StatusKind, { color: number; alpha: number }][]) {
      let mist = this.mists.get(kind);
      if (!active.has(kind)) {
        if (mist) mist.group.visible = false;
        continue;
      }
      if (!mist) {
        const group = new Container();
        const puffs = Array.from({ length: MIST.puffs }, () => {
          const p = new Sprite(puff());
          p.anchor.set(0.5);
          p.tint = style.color;
          p.blendMode = 'add';
          group.addChild(p);
          return p;
        });
        this.container.addChild(group);
        mist = { group, puffs };
        this.mists.set(kind, mist);
      }
      mist.group.visible = true;
      // 兩種以上的霧：往上疊
      mist.group.position.set(0, this.headY - lift - 4 - stack * 9 * this.size);
      stack++;
      const t = this.time * MIST.speed;
      mist.puffs.forEach((p, i) => {
        const a = t + (i / MIST.puffs) * Math.PI * 2;
        const w = MIST.width * this.size;
        p.position.set(Math.cos(a) * w * 0.42, Math.sin(a * 1.3 + i) * MIST.height * 0.35 * this.size);
        const s = (0.55 + 0.25 * Math.sin(a * 0.7 + i * 2)) * this.size;
        p.scale.set(s * 0.9, s * 0.55);
        p.alpha = style.alpha * (0.6 + 0.4 * Math.sin(a * 1.7 + i));
      });
    }
    this.drawIcons(active, stack, lift);
    this.drawTethers(pinned, lift);
  }

  /** 霧的上方排開的圖示，微微上下浮動 */
  private drawIcons(active: Set<StatusKind>, mistStack: number, lift: number): void {
    const shown = STATUS_ICONS.filter((k) => active.has(k));
    const y = this.headY - lift - 4 - mistStack * 9 * this.size - 10 * this.size;
    for (const kind of STATUS_ICONS) {
      let g = this.icons.get(kind);
      const i = shown.indexOf(kind);
      if (i < 0) {
        if (g) g.visible = false;
        continue;
      }
      if (!g) {
        g = drawIcon(kind);
        this.container.addChild(g);
        this.icons.set(kind, g);
      }
      g.visible = true;
      g.scale.set(this.size);
      g.position.set((i - (shown.length - 1) / 2) * ICON.gap * this.size, y + Math.sin(this.time * 2.4 + i) * 1.2 * this.size);
    }
  }

  /** 牽制：腰部（身高的 40%）拉到地上的幾條線，微微顫動 */
  private drawTethers(pinned: boolean, lift: number): void {
    const g = this.tethers.clear();
    if (!pinned) return;
    const waist = this.headY * 0.4 - lift;
    const r = TETHER.radius * this.size;
    for (let i = 0; i < TETHER.count; i++) {
      const a = (i / TETHER.count) * Math.PI * 2 + 0.4;
      const gx = Math.cos(a) * r;
      const gy = Math.sin(a) * r * 0.5;
      const wobble = Math.sin(this.time * 9 + i * 1.7) * 1.2;
      const wx = Math.cos(a) * 4 * this.size;
      // 線的中段稍微下垂
      const mx = (wx + gx) / 2 + wobble;
      const my = (waist + gy) / 2 + 4;
      g.moveTo(wx, waist).quadraticCurveTo(mx, my, gx, gy).stroke({ color: TETHER.glow, width: 3, alpha: 0.25 });
      g.moveTo(wx, waist).quadraticCurveTo(mx, my, gx, gy).stroke({ color: TETHER.color, width: 1.2, alpha: 0.95 });
      // 地上的釘子與一小圈光
      g.ellipse(gx, gy, 3.5 * this.size, 1.8 * this.size).fill({ color: TETHER.glow, alpha: 0.35 });
      g.moveTo(gx, gy).lineTo(gx, gy - 5 * this.size).stroke({ color: 0x8a7a5a, width: 1.6 });
    }
    g.ellipse(0, waist, 6 * this.size, 2.5 * this.size).stroke({ color: TETHER.color, width: 1.2, alpha: 0.9 });
  }
}

/** 一個圖示（以圓心為原點）：圓底（負面深色、正面深綠）、狀態色的外框，中間是圖案 */
function drawIcon(kind: StatusKind): Graphics {
  const g = new Graphics();
  const r = ICON.r;
  const color = STATUS_MISTS[kind]?.color ?? ICON_COLORS[kind] ?? 0xffffff;
  g.circle(0, 0, r + 1.5).fill({ color: 0x000000, alpha: 0.35 });
  g.circle(0, 0, r).fill({ color: POSITIVE.has(kind) ? 0x12261a : 0x1a1418, alpha: 0.9 }).stroke({ color, width: 1.4 });
  GLYPHS[kind]?.(g, color);
  return g;
}

const WHITE = 0xffffff;
/** 往上 / 往下的箭頭（x 位置、從 y0 到 y1，箭頭在 y1） */
function arrow(g: Graphics, x: number, y0: number, y1: number, color: number): void {
  const d = Math.sign(y1 - y0);
  g.moveTo(x, y0).lineTo(x, y1 - d * 1.6).stroke({ color, width: 1.4 });
  g.poly([x - 2, y1 - d * 2.2, x + 2, y1 - d * 2.2, x, y1 + d * 1.2]).fill({ color });
}
/** 水滴（尖端朝上） */
function drop(g: Graphics, color: number, cx = 0, cy = 0.8): void {
  g.poly([cx, cy - 5, cx + 2.4, cy - 1.2, cx + 3, cy + 1, cx + 2, cy + 3.2, cx, cy + 3.9, cx - 2, cy + 3.2, cx - 3, cy + 1, cx - 2.4, cy - 1.2]).fill({ color }).stroke({ color: WHITE, width: 0.6, alpha: 0.6 });
}
/** 五角星 */
function star(g: Graphics, cx: number, cy: number, r: number, color: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r * 0.45 : r;
    pts.push(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
  }
  g.poly(pts).fill({ color });
}

const GLYPHS: Partial<Record<StatusKind, (g: Graphics, color: number) => void>> = {
  // ── 負面 ──
  // 暈眩：頭上轉圈的三顆星
  stun: (g, c) => {
    star(g, 0, -2.6, 2.6, c);
    star(g, -3.2, 2, 1.9, c);
    star(g, 3.2, 2, 1.9, c);
  },
  // 冰凍：雪花
  freeze: (g) => {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 2;
      const [x, y] = [Math.cos(a) * 4.8, Math.sin(a) * 4.8];
      g.moveTo(-x, -y).lineTo(x, y).stroke({ color: WHITE, width: 1.2 });
    }
    g.circle(0, 0, 1.2).fill({ color: 0x9ad8ff });
  },
  // 浮空：往上的箭頭，下面兩道氣流
  airborne: (g, c) => {
    arrow(g, 0, 2, -4.8, WHITE);
    g.moveTo(-4, 4.2).quadraticCurveTo(-2, 2.6, 0, 4.2).quadraticCurveTo(2, 5.8, 4, 4.2).stroke({ color: c, width: 1.1 });
  },
  // 減速：小靴子（鞋尖朝右）加往下的箭頭
  slow: (g, c) => {
    g.poly([-4.6, -4.4, -1.8, -4.4, -1.8, -0.4, 0.8, 0.6, 0.8, 2.4, -4.6, 2.4]).fill({ color: 0xc8a070 }).stroke({ color: WHITE, width: 0.7, alpha: 0.8 });
    arrow(g, 3.4, -4.4, 3.6, c);
  },
  // 燃燒：火焰（外橘內黃）
  burn: (g, c) => {
    g.poly([0, -5.2, 2.2, -2, 3.6, -2.8, 3.6, 1.4, 2, 4.4, -2, 4.4, -3.6, 1.4, -3, -1.6, -1.6, -0.4]).fill({ color: c });
    g.poly([0, -1.4, 1.6, 1.2, 1, 3.8, -1, 3.8, -1.6, 1.2]).fill({ color: 0xffe080 });
  },
  // 中毒：綠色水滴加一個氣泡
  poison: (g, c) => {
    drop(g, c, -0.8, 0.8);
    g.circle(3.4, -2.6, 1.3).stroke({ color: c, width: 0.9 });
  },
  // 流血：紅色血滴
  bleed: (g, c) => drop(g, c),
  // 弱化：火、冰、雷三個點，下面一個往下的箭頭
  expose: (g) => {
    ([[-3.4, -2.6, 0xff5a2a], [0, -3.8, 0x6ac8ff], [3.4, -2.6, 0xffe14a]] as const).forEach(([x, y, c]) => g.circle(x, y, 1.6).fill({ color: c }));
    arrow(g, 0, -0.6, 4.6, WHITE);
  },
  // 破甲：盾牌，中間一道裂痕
  armorBreak: (g, c) => {
    g.poly([-4, -4.5, 4, -4.5, 4, 0, 0, 5, -4, 0]).fill({ color: 0x9a9aa4 }).stroke({ color: WHITE, width: 0.8, alpha: 0.8 });
    g.moveTo(0.6, -4.5).lineTo(-1, -1.5).lineTo(1, 0.5).lineTo(-0.4, 4.2).stroke({ color: c, width: 1.3 });
  },
  // 弱點：準星
  weakPoint: (g, c) => {
    g.circle(0, 0, 3.8).stroke({ color: WHITE, width: 1.1 });
    for (const [x, y] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) g.moveTo(x * 2, y * 2).lineTo(x * 5.4, y * 5.4).stroke({ color: WHITE, width: 1.1 });
    g.circle(0, 0, 1.4).fill({ color: c });
  },
  // 標記：往下指的標記
  marked: (g, c) => {
    g.poly([0, 5, -4, -1, -1.6, -1, -1.6, -4.6, 1.6, -4.6, 1.6, -1, 4, -1]).fill({ color: c }).stroke({ color: WHITE, width: 0.8 });
  },
  // ── 正面 ──
  // 格擋姿態：完整的金色盾牌
  guard: (g, c) => {
    g.poly([-4, -4.5, 4, -4.5, 4, 0, 0, 5, -4, 0]).fill({ color: c }).stroke({ color: WHITE, width: 0.8 });
    g.moveTo(0, -3.6).lineTo(0, 3).stroke({ color: 0x8a6a2a, width: 1 });
  },
  // 反擊：往回彎的箭頭
  counter: (g, c) => {
    g.moveTo(3.6, 3.6).lineTo(3.6, -0.6).quadraticCurveTo(3.6, -3.6, 0, -3.6).lineTo(-1.6, -3.6).stroke({ color: c, width: 1.6 });
    g.poly([-1.2, -6, -1.2, -1.2, -4.8, -3.6]).fill({ color: c });
  },
  // 鋼鐵意志：鉚釘鐵板
  ironWill: (g, c) => {
    g.rect(-4, -4, 8, 8).fill({ color: c }).stroke({ color: WHITE, width: 0.8 });
    for (const [x, y] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]] as const) g.circle(x, y, 0.9).fill({ color: 0x5a6070 });
  },
  // 不動（免疫擊退）：釘在地上的樁
  unstoppable: (g, c) => {
    g.rect(-1.4, -5, 2.8, 6.4).fill({ color: c });
    g.poly([-4.6, 1.4, 4.6, 1.4, 3.2, 4.4, -3.2, 4.4]).fill({ color: c }).stroke({ color: WHITE, width: 0.7 });
  },
  // 近戰強化：往上的劍加一個 +
  meleeEmpower: (g, c) => {
    g.poly([-1, 3, -1, -3.6, 0, -5.2, 1, -3.6, 1, 3]).fill({ color: WHITE });
    g.rect(-2.8, 2.2, 5.6, 1.1).fill({ color: c });
    g.rect(-0.6, 3.3, 1.2, 1.8).fill({ color: c });
    g.moveTo(3.6, -3.6).lineTo(3.6, -0.4).moveTo(2, -2).lineTo(5.2, -2).stroke({ color: c, width: 1.2 });
  },
  // 遠程強化：往上的箭加一個 +
  rangedEmpower: (g, c) => {
    g.moveTo(-1, 5).lineTo(-1, -2.6).stroke({ color: WHITE, width: 1.1 });
    g.poly([-3, -2.2, 1, -2.2, -1, -5.2]).fill({ color: WHITE });
    g.poly([-1, 3, -2.8, 5, -2.8, 3.2]).fill({ color: c });
    g.poly([-1, 3, 0.8, 5, 0.8, 3.2]).fill({ color: c });
    g.moveTo(3.6, -1.6).lineTo(3.6, 1.6).moveTo(2, 0).lineTo(5.2, 0).stroke({ color: c, width: 1.2 });
  },
};
