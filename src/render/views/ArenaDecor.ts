import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { ArenaStyle } from '../themes';

/**
 * 魔王競技場的佈置（只有畫面，不影響碰撞）：
 * - 地上的大型紋路（發光）：墓穴法陣、血色五芒星、熔岩裂縫與岩漿池、三元素符文環、巨大蛛網、深淵法陣
 * - 周圍一圈擺設：石棺與骨堆、燭台群、熔岩石柱、破旗與插地的劍、卵囊、虛空水晶
 * - 外圈的火盆（光源，會閃爍）
 * 擺設放在外圈（0.84～0.95 R），中間留給戰鬥。
 */

export interface ArenaView {
  center: Vec2;
  radius: number;
  style: ArenaStyle;
}

/** 某個 World 位置屬於競技場的程度：1 = 裡面、0 = 外面（邊緣 3.5 格漸變，包含圍牆） */
export function arenaBlend(arena: ArenaView, p: Vec2): number {
  const d = Math.hypot(p.x - arena.center.x, p.y - arena.center.y);
  return Math.max(0, Math.min(1, (arena.radius + 2.5 - d) / 3.5));
}

/** 固定亂數（同一個競技場每次畫出來都一樣） */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface ArenaDecor {
  /** 地上的發光紋路（放在地板層） */
  glow: Graphics;
  /** 立體擺設與光源（與角色一起依深度排序） */
  props: Graphics[];
  /** 會閃爍的光源 */
  lights: Graphics[];
}

export function buildArena(arena: ArenaView, projection: IsoProjection, floorLayer: Container, objectLayer: Container): ArenaDecor {
  const { center, radius: R, style } = arena;
  const at = (angle: number, r: number) => projection.toScreen(vec2(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r));
  const glow = new Graphics();
  glow.blendMode = 'add';
  const solid = new Graphics();
  floorLayer.addChild(solid, glow);

  const ring = (g: Graphics, r: number, color: number, width: number, alpha: number) => {
    const pts: number[] = [];
    for (let i = 0; i < 64; i++) {
      const p = at((i / 64) * Math.PI * 2, r);
      pts.push(p.x, p.y);
    }
    g.poly(pts).stroke({ color, width, alpha });
  };
  const disc = (g: Graphics, r: number, color: number, alpha: number, cx = center.x, cy = center.y) => {
    const pts: number[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const p = projection.toScreen(vec2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      pts.push(p.x, p.y);
    }
    g.poly(pts).fill({ color, alpha });
  };
  const line = (g: Graphics, a1: number, r1: number, a2: number, r2: number, color: number, width: number, alpha: number) => {
    const p = at(a1, r1);
    const q = at(a2, r2);
    g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ color, width, alpha, cap: 'round' });
  };
  /** 從 r0 往外、左右抖動的裂縫 */
  const crack = (i: number, r0: number, r1: number, color: number, core: number) => {
    let a = rand(i, 1) * Math.PI * 2;
    const pts: number[] = [];
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      a += (rand(i * 7 + k, 2) - 0.5) * 0.25;
      const p = at(a, r0 + ((r1 - r0) * k) / steps);
      pts.push(p.x, p.y);
    }
    glow.poly(pts, false).stroke({ color, width: 6, alpha: 0.28, join: 'round' });
    glow.poly(pts, false).stroke({ color: core, width: 1.8, alpha: 0.9, join: 'round' });
  };
  const c = style.glow;

  switch (style.pattern) {
    case 'ring': {
      // 守墓法陣：三圈、八條輻線、刻印
      disc(glow, R * 0.26, c, 0.1);
      for (const [r, w, a] of [
        [0.26, 2.5, 0.6],
        [0.5, 2, 0.45],
        [0.78, 3, 0.55],
      ] as const)
        ring(glow, R * r, c, w, a);
      for (let i = 0; i < 8; i++) line(glow, (i / 8) * Math.PI * 2, R * 0.26, (i / 8) * Math.PI * 2, R * 0.78, c, 1.5, 0.35);
      for (let i = 0; i < 16; i++) {
        const a = ((i + 0.5) / 16) * Math.PI * 2;
        const p = at(a, R * 0.64);
        glow.poly([p.x, p.y - 5, p.x + 4, p.y, p.x, p.y + 5, p.x - 4, p.y]).fill({ color: c, alpha: 0.7 });
      }
      break;
    }
    case 'pentagram': {
      // 血色五芒星：雙圈 + 五角星 + 內圈，地上有血跡
      for (let i = 0; i < 7; i++) disc(solid, 0.8 + rand(i, 3) * 1.4, 0x3a0c0c, 0.55, center.x + (rand(i, 4) - 0.5) * R * 1.2, center.y + (rand(i, 5) - 0.5) * R * 1.2);
      disc(glow, R * 0.8, c, 0.05);
      ring(glow, R * 0.8, c, 3, 0.7);
      ring(glow, R * 0.87, c, 1.5, 0.45);
      ring(glow, R * 0.32, c, 2, 0.55);
      const star = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      for (let i = 0; i < 5; i++) line(glow, star(i), R * 0.8, star(i + 2), R * 0.8, c, 3, 0.75);
      for (let i = 0; i < 5; i++) {
        const p = at(star(i), R * 0.8);
        glow.circle(p.x, p.y, 7).fill({ color: style.accent, alpha: 0.35 });
      }
      break;
    }
    case 'lava': {
      // 熔岩：焦黑的中央、發光的裂縫、幾個岩漿池
      disc(solid, R * 0.55, 0x0e0906, 0.5);
      for (let i = 0; i < 16; i++) crack(i, R * (0.1 + rand(i, 6) * 0.3), R * (0.7 + rand(i, 7) * 0.3), c, style.accent);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rand(i, 8);
        const r = R * (0.45 + rand(i, 9) * 0.35);
        const x = center.x + Math.cos(a) * r;
        const y = center.y + Math.sin(a) * r;
        const size = 1.1 + rand(i, 10) * 1.1;
        disc(solid, size * 1.25, 0x140a06, 0.9, x, y);
        disc(glow, size, c, 0.75, x, y);
        disc(glow, size * 0.55, style.accent, 0.7, x, y);
      }
      break;
    }
    case 'checker': {
      // 騎士的決鬥場：棋盤地磚（地板顏色另外處理）+ 火 / 冰 / 雷 三段符文環
      const elements = [0xff7a2a, 0x7fd4ff, 0xf5e663];
      ring(glow, R * 0.5, c, 2, 0.45);
      elements.forEach((color, k) => {
        const pts: number[] = [];
        for (let i = 0; i <= 20; i++) {
          const p = at(((k + i / 20) * 2 * Math.PI) / 3 + 0.08, R * 0.66);
          pts.push(p.x, p.y);
        }
        glow.poly(pts, false).stroke({ color, width: 4, alpha: 0.7, cap: 'round' });
        const mid = at(((k + 0.5) * 2 * Math.PI) / 3, R * 0.66);
        glow.circle(mid.x, mid.y, 9).stroke({ color, width: 2, alpha: 0.85 }).circle(mid.x, mid.y, 4).fill({ color, alpha: 0.8 });
      });
      for (let i = 0; i < 12; i++) line(glow, (i / 12) * Math.PI * 2, R * 0.5, (i / 12) * Math.PI * 2, R * 0.6, c, 1.5, 0.5);
      break;
    }
    case 'web': {
      // 巨大蛛網：輻線 + 同心多邊形（淡色實線），加上幾灘毒液
      const spokes = 12;
      for (let i = 0; i < spokes; i++) line(solid, (i / spokes) * Math.PI * 2, R * 0.05, (i / spokes) * Math.PI * 2, R * 1.02, style.accent, 1.3, 0.45);
      for (let k = 1; k <= 7; k++) {
        const r = R * (0.12 * k + 0.04);
        const pts: number[] = [];
        for (let i = 0; i <= spokes; i++) {
          const p = at((i / spokes) * Math.PI * 2, r * (i % 2 ? 0.94 : 1));
          pts.push(p.x, p.y);
        }
        solid.poly(pts, false).stroke({ color: style.accent, width: 1, alpha: 0.38 });
      }
      for (let i = 0; i < 5; i++) {
        const a = rand(i, 11) * Math.PI * 2;
        const r = R * (0.3 + rand(i, 12) * 0.45);
        disc(glow, 0.9 + rand(i, 13) * 0.8, c, 0.35, center.x + Math.cos(a) * r, center.y + Math.sin(a) * r);
      }
      break;
    }
    case 'void': {
      // 深淵法陣：雙圈、六芒星、符文，加上紫色的裂縫
      for (let i = 0; i < 10; i++) crack(i + 40, R * 0.75, R * 1.0, c, style.accent);
      disc(glow, R * 0.3, style.accent, 0.12);
      ring(glow, R * 0.3, c, 2.5, 0.6);
      ring(glow, R * 0.68, c, 3, 0.7);
      ring(glow, R * 0.77, c, 1.5, 0.5);
      for (let t = 0; t < 2; t++) {
        for (let i = 0; i < 3; i++) {
          const a1 = -Math.PI / 2 + t * Math.PI + (i * 2 * Math.PI) / 3;
          line(glow, a1, R * 0.68, a1 + (2 * Math.PI) / 3, R * 0.68, c, 2.5, 0.6);
        }
      }
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const p = at(a, R * 0.725);
        const s = 3.5;
        const kind = i % 3;
        if (kind === 0) glow.moveTo(p.x - s, p.y - s).lineTo(p.x + s, p.y - s).lineTo(p.x - s, p.y + s).lineTo(p.x + s, p.y + s).stroke({ color: style.accent, width: 1.3, alpha: 0.85 });
        else if (kind === 1) glow.moveTo(p.x, p.y - s).lineTo(p.x, p.y + s).moveTo(p.x - s, p.y).lineTo(p.x + s * 0.5, p.y - s * 0.6).stroke({ color: style.accent, width: 1.3, alpha: 0.85 });
        else glow.circle(p.x, p.y, s * 0.7).stroke({ color: style.accent, width: 1.3, alpha: 0.85 });
      }
      break;
    }
  }

  // ── 外圈擺設 ──
  const props: Graphics[] = [];
  const lights: Graphics[] = [];
  const place = (world: Vec2, g: Graphics) => {
    g.zIndex = projection.depth(world);
    objectLayer.addChild(g);
    props.push(g);
  };
  const count = Math.round(10 + R * 0.25);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(i, 20) * 0.2;
    const r = R * (0.84 + rand(i, 21) * 0.1);
    const world = vec2(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r);
    const p = projection.toScreen(world);
    const g = new Graphics();
    prop(g, style, p.x, p.y, i);
    place(world, g);
    if (style.props === 'candles') lights.push(g);
  }
  // 火盆：外圈 8 個光源
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const world = vec2(center.x + Math.cos(a) * R * 0.96, center.y + Math.sin(a) * R * 0.96);
    const p = projection.toScreen(world);
    const g = new Graphics();
    g.ellipse(p.x, p.y, 70, 35).fill({ color: c, alpha: 0.07 }).ellipse(p.x, p.y, 38, 19).fill({ color: c, alpha: 0.1 });
    g.poly([p.x - 7, p.y, p.x + 7, p.y, p.x + 4, p.y - 10, p.x - 4, p.y - 10]).fill({ color: 0x2a2220 });
    g.ellipse(p.x, p.y - 12, 6, 3).fill({ color: 0x3a302a });
    g.poly([p.x - 5, p.y - 12, p.x, p.y - 26, p.x + 5, p.y - 12]).fill({ color: c, alpha: 0.9 });
    g.poly([p.x - 2.5, p.y - 12, p.x, p.y - 20, p.x + 2.5, p.y - 12]).fill({ color: 0xffffff, alpha: 0.7 });
    place(world, g);
    lights.push(g);
  }
  return { glow, props: [solid, ...props], lights };
}

/** 一個擺設（腳底在 x, y） */
function prop(g: Graphics, style: ArenaStyle, x: number, y: number, i: number): void {
  const c = style.glow;
  switch (style.props) {
    case 'sarcophagi': {
      if (i % 2) {
        // 骨堆
        g.ellipse(x, y, 12, 5).fill({ color: 0x1a1612, alpha: 0.5 });
        for (let k = 0; k < 5; k++) g.poly([x - 9 + k * 4, y - 2, x - 3 + k * 4, y - 5 + (k % 2) * 3, x - 2 + k * 4, y - 3 + (k % 2) * 3, x - 8 + k * 4, y]).fill({ color: style.accent });
        g.circle(x + 2, y - 5, 3.2).fill({ color: style.accent }).circle(x + 1, y - 5.5, 0.9).fill({ color: 0x1a1612 }).circle(x + 3.2, y - 5.5, 0.9).fill({ color: 0x1a1612 });
      } else {
        // 石棺：等角的長方體 + 棺蓋 + 綠色的縫
        const w = 16;
        const h = 12;
        g.poly([x - w, y, x, y + w / 2, x, y + w / 2 - h, x - w, y - h]).fill({ color: 0x3a463f });
        g.poly([x, y + w / 2, x + w, y, x + w, y - h, x, y + w / 2 - h]).fill({ color: 0x2c3530 });
        g.poly([x - w, y - h, x, y + w / 2 - h, x + w, y - h, x, y - w / 2 - h]).fill({ color: 0x5a6a60 });
        g.moveTo(x - w + 3, y - h - 1).lineTo(x + w - 3, y - h - 1).stroke({ color: c, width: 1.2, alpha: 0.8 });
      }
      break;
    }
    case 'candles': {
      // 燭台群：3～5 根高低不同的蠟燭與火焰
      g.ellipse(x, y, 26, 13).fill({ color: c, alpha: 0.08 });
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) {
        const cx = x + (k - (n - 1) / 2) * 5;
        const cy = y + (k % 2) * 2;
        const h = 8 + ((i * 3 + k * 5) % 7);
        g.rect(cx - 1.5, cy - h, 3, h).fill({ color: 0xe8dcc0 });
        g.ellipse(cx, cy - h - 3, 1.8, 3.2).fill({ color: style.accent });
        g.ellipse(cx, cy - h - 2.4, 0.8, 1.4).fill({ color: 0xffffff });
      }
      break;
    }
    case 'spires': {
      // 熔岩石柱：黑色尖柱，中間有發光的熔岩縫
      const h = 34 + (i % 3) * 12;
      g.poly([x - 10, y, x - 4, y - h * 0.6, x + 1, y - h, x + 6, y - h * 0.55, x + 10, y]).fill({ color: 0x2a1c18 });
      g.poly([x + 1, y - h, x + 6, y - h * 0.55, x + 10, y, x + 2, y + 2]).fill({ color: 0x1a110e });
      g.moveTo(x - 2, y - 2).lineTo(x - 1, y - h * 0.4).lineTo(x + 1, y - h * 0.75).stroke({ color: c, width: 1.6, alpha: 0.9 });
      g.ellipse(x, y, 14, 6).fill({ color: c, alpha: 0.12 });
      break;
    }
    case 'banners': {
      if (i % 2) {
        // 插在地上的劍
        g.moveTo(x, y).lineTo(x + 2, y - 18).stroke({ color: 0xb0b8c2, width: 2 });
        g.moveTo(x - 4, y - 15).lineTo(x + 6, y - 17).stroke({ color: 0x6a5a3a, width: 2 });
        g.moveTo(x + 2, y - 18).lineTo(x + 2.5, y - 23).stroke({ color: 0x4a3a2a, width: 2 });
      } else {
        // 破旗：旗桿 + 殘破的旗面
        g.rect(x - 1, y - 52, 2, 52).fill({ color: 0x4a4038 });
        g.poly([x + 1, y - 50, x + 16, y - 48, x + 14, y - 30, x + 10, y - 34, x + 7, y - 26, x + 1, y - 30]).fill({ color: 0x6a1a20 });
        g.poly([x + 4, y - 44, x + 11, y - 43, x + 9, y - 37, x + 5, y - 38]).fill({ color: 0xc8a048, alpha: 0.8 });
      }
      break;
    }
    case 'eggs': {
      // 卵囊：幾顆半透明的綠色卵，發出微光，上面有蛛絲
      g.ellipse(x, y, 20, 9).fill({ color: c, alpha: 0.1 });
      for (let k = 0; k < 3 + (i % 3); k++) {
        const ex = x + (k - 1.5) * 6 + ((i * 7 + k) % 3);
        const ey = y - (k % 2) * 3;
        g.ellipse(ex, ey - 7, 5, 7).fill({ color: 0xb8d0a0, alpha: 0.85 });
        g.ellipse(ex - 1, ey - 8, 2.4, 3.6).fill({ color: c, alpha: 0.55 });
      }
      g.moveTo(x - 12, y - 16).lineTo(x + 10, y - 10).moveTo(x - 8, y - 4).lineTo(x + 12, y - 18).stroke({ color: style.accent, width: 0.7, alpha: 0.6 });
      break;
    }
    case 'crystals': {
      // 虛空水晶：三根高低不同的紫色水晶
      g.ellipse(x, y, 18, 8).fill({ color: c, alpha: 0.12 });
      for (const [dx, h, w] of [
        [-6, 22, 4],
        [2, 34, 5],
        [9, 16, 3.5],
      ] as const) {
        const hh = h + (i % 3) * 5;
        g.poly([x + dx - w, y, x + dx, y - hh, x + dx, y + 1]).fill({ color: 0x9a5aff });
        g.poly([x + dx, y + 1, x + dx, y - hh, x + dx + w, y]).fill({ color: 0x5a2a9a });
        g.moveTo(x + dx - w * 0.3, y - hh * 0.3).lineTo(x + dx, y - hh * 0.85).stroke({ color: style.accent, width: 0.8, alpha: 0.8 });
      }
      break;
    }
  }
}
