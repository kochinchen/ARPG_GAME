import type { Graphics } from 'pixi.js';
import { mix, type FxParticleKind } from './FxColors';

/**
 * 投射物的外觀（畫在本地座標：往 +X 飛，原點為投射物中心）。
 * - 箭：箭桿、箭頭、箭羽，依技能有不同的長度、顏色與拖尾（穿透的螺旋、蓄力的能量、幻影的殘影…）
 * - 魔法：有稜有角的元素造型（火球是翻騰的火舌、冰球是多面水晶、電球是跳動的電弧、冰槍是細長的水晶）
 * - 戰術：淬毒飛刀（滴毒的刀刃）、鉤索（鐵鉤拖著繩子）、擲斧（旋轉的斧頭）、圖騰閃電（鋸齒電光）
 * special（成功組成 Combo 的招式）換成金色調並加亮。
 */

export type ArrowKind = 'plain' | 'pierce' | 'wind' | 'charge' | 'small' | 'dust' | 'weak' | 'rapid' | 'spin' | 'execute' | 'phantom' | 'bone' | 'knife' | 'hook';
export type OrbKind = 'fire' | 'ice' | 'spark' | 'lance' | 'frostBolt' | 'poison' | 'spore' | 'glob' | 'shard' | 'axe' | 'bolt' | 'spider';

export interface ProjectileArt {
  type: 'arrow' | 'orb';
  kind: ArrowKind | OrbKind;
  /** 主色（拖尾、光暈） */
  color: number;
  /** 亮色（箭頭、內核） */
  core: number;
  /** 大小倍率 */
  size: number;
  /** 飛行時沿路留下的粒子 */
  trail: FxParticleKind | null;
  /** 每秒產生的拖尾粒子數 */
  trailRate: number;
}

const arrow = (kind: ArrowKind, color: number, core: number, trail: FxParticleKind | null = null, size = 1, trailRate = 0): ProjectileArt => ({ type: 'arrow', kind, color, core, size, trail, trailRate });
const orb = (kind: OrbKind, color: number, core: number, trail: FxParticleKind, size = 1, trailRate = 40): ProjectileArt => ({ type: 'orb', kind, color, core, size, trail, trailRate });

/** 各技能的投射物外觀 */
const ARTS: Record<string, ProjectileArt> = {
  'ranged.quick_shot': arrow('plain', 0xe8dcc0, 0xffffff),
  'ranged.piercing_shot': arrow('pierce', 0x8fd0ff, 0xe8f6ff, 'spark', 1.15, 30),
  'ranged.backstep_shot': arrow('wind', 0x9fffc8, 0xf0fff8, 'wind', 1, 30),
  'ranged.charge_shot': arrow('charge', 0xffc850, 0xfff4c0, 'ember', 1.45, 60),
  'ranged.spread_shot': arrow('small', 0xffb070, 0xffe8c8, null, 0.8),
  'ranged.pinning_shot': arrow('dust', 0xd8b890, 0xfff0d8, 'dust', 1, 18),
  'ranged.weak_point': arrow('weak', 0xff4a4a, 0xffd0d0, 'spark', 1.05, 16),
  'ranged.rapid_fire': arrow('rapid', 0xf0e8d8, 0xffffff, null, 0.85),
  'ranged.execution_shot': arrow('execute', 0xff2a3a, 0xffd0a0, 'ember', 1.8, 70),
  'ranged.mark_shot': arrow('phantom', 0xb49aff, 0xf0e8ff, 'mote', 1.1, 30),
  'enemy.bow_shot': arrow('bone', 0xd8ccb0, 0xf0e8d8),
  'magic.fireball': orb('fire', 0xff6a1a, 0xffe070, 'ember', 1, 55),
  'magic.ice_orb': orb('ice', 0x7fd4ff, 0xeaf8ff, 'flake', 1.1, 30),
  'magic.spark': orb('spark', 0xf5e663, 0xffffff, 'spark', 0.9, 45),
  'magic.ice_lance': orb('lance', 0xa8e4ff, 0xf4fcff, 'flake', 1, 35),
  'enemy.frost_bolt': orb('frostBolt', 0x7fc8ff, 0xe0f4ff, 'flake', 0.8, 20),
  'enemy.poison_spit': orb('poison', 0x7ed957, 0xd8ffb0, 'drop', 0.85, 20),
  'enemy.frost_spores': orb('spore', 0x8fe8ff, 0xe8ffff, 'flake', 0.8, 18),
  'enemy.fire_glob': orb('glob', 0xff7a2a, 0xffd080, 'ember', 0.9, 30),
  'utility.poison_knife': arrow('knife', 0x7ed957, 0xdfe6ea, 'drop', 1, 14),
  'utility.grapple_hook': arrow('hook', 0xc8a878, 0xc8ccd4),
  // 設計者要求（2026-10-29）：飛斧要更大、更明顯
  'utility.throwing_axe': orb('axe', 0xd84848, 0xc8ccd4, 'spark', 2.6, 40),
  // 冰霜新星：在地上滾的巨大冰球
  'magic.frost_nova': orb('ice', 0x7fd4ff, 0xeaf8ff, 'flake', 3.4, 60),
  // 霜凍投射器射出的冰箭
  'utility.frost_flask': arrow('small', 0x7fd4ff, 0xeaf8ff, 'flake', 1, 18),
  'utility.storm_totem': orb('bolt', 0xf5e663, 0xffffff, 'spark', 1, 50),
  // 投射物指定的外觀（effects 的 look）
  'look.spider': orb('spider', 0x7aff4a, 0xd8ffb0, 'drop', 1.6, 12),
};

const ELEMENT_ART: Record<string, ProjectileArt> = {
  fire: orb('glob', 0xff7a2a, 0xffd080, 'ember'),
  cold: orb('shard', 0x7fd4ff, 0xeaf8ff, 'flake'),
  lightning: orb('spark', 0xf5e663, 0xffffff, 'spark'),
  poison: orb('poison', 0x7ed957, 0xd8ffb0, 'drop'),
  physical: arrow('plain', 0xe8dcc0, 0xffffff),
};

/** 技能 → 投射物外觀（沒有設定時依元素；遠程標籤的技能用箭） */
export function projectileArt(skillId: string, element: string | null, ranged: boolean): ProjectileArt {
  return ARTS[skillId] ?? (ranged ? ARTS['ranged.quick_shot']! : (ELEMENT_ART[element ?? 'physical'] ?? ELEMENT_ART.physical!));
}

/** Combo 特別招：換成金色調 */
export const SPECIAL = 0xffd76a;
export function specialArt(art: ProjectileArt): ProjectileArt {
  return { ...art, color: mix(art.color, SPECIAL, 0.65), core: 0xffffff, size: art.size * 1.15, trail: art.trail ?? 'spark', trailRate: Math.max(art.trailRate, 30) };
}

/** 畫一個投射物（本地座標，往 +X 飛）；t = 飛行時間（秒），用來做閃爍與旋轉 */
export function drawProjectile(g: Graphics, art: ProjectileArt, t: number, special: boolean): void {
  if (art.type === 'arrow') drawArrow(g, art, t);
  else drawOrb(g, art, t);
  if (special) {
    // 特別招：外圈金色的菱形光
    const s = 9 * art.size;
    g.poly([s * 1.3, 0, 0, -s * 0.6, -s * 1.3, 0, 0, s * 0.6]).stroke({ color: SPECIAL, width: 1.2, alpha: 0.7 + 0.3 * Math.sin(t * 20) });
  }
}

function drawArrow(g: Graphics, art: ProjectileArt, t: number): void {
  if (art.kind === 'knife') return drawKnife(g, art);
  if (art.kind === 'hook') return drawHook(g, art);
  const k = art.size;
  const L = (art.kind === 'rapid' ? 16 : art.kind === 'pierce' ? 24 : 20) * k;
  const tail = -L * 0.55;
  const head = L * 0.45;
  const c = art.color;
  // 拖尾（在箭的後方）
  switch (art.kind) {
    case 'pierce':
      // 螺旋氣流：兩條交錯的正弦線
      for (const phase of [0, Math.PI]) {
        const pts: number[] = [];
        for (let i = 0; i <= 10; i++) {
          const x = tail - i * 3.2;
          pts.push(x, Math.sin(i * 0.9 - t * 30 + phase) * 3 * k);
        }
        g.poly(pts, false).stroke({ color: c, width: 1.1, alpha: 0.7 });
      }
      break;
    case 'charge':
    case 'execute': {
      // 能量彗尾：由寬到窄的三角
      const w = (art.kind === 'execute' ? 7 : 5) * k;
      g.poly([tail + 4, -w, tail - 30 * k, 0, tail + 4, w]).fill({ color: c, alpha: 0.35 });
      g.poly([tail + 4, -w * 0.5, tail - 20 * k, 0, tail + 4, w * 0.5]).fill({ color: art.core, alpha: 0.5 });
      break;
    }
    case 'phantom':
      // 殘影：後方兩支淡淡的箭
      for (const [off, a] of [
        [-10, 0.35],
        [-20, 0.18],
      ] as const) {
        g.moveTo(tail + off * k, 0).lineTo(head + off * k, 0).stroke({ color: c, width: 1.6 * k, alpha: a });
        g.poly([head + off * k + 5 * k, 0, head + off * k, -2.4 * k, head + off * k, 2.4 * k]).fill({ color: c, alpha: a });
      }
      break;
    case 'rapid':
    case 'plain':
    case 'small':
    case 'bone':
    case 'dust':
    case 'weak':
    case 'wind':
    case 'spin':
      // 速度線
      g.moveTo(tail, 0).lineTo(tail - 14 * k, 0).stroke({ color: c, width: 1.2, alpha: 0.35 });
      break;
  }
  // 箭桿
  const shaft = art.kind === 'bone' ? 0xc8bca0 : art.kind === 'phantom' ? mix(c, 0xffffff, 0.3) : art.kind === 'charge' || art.kind === 'execute' ? mix(c, 0xffffff, 0.2) : 0x8a6a48;
  g.moveTo(tail, 0).lineTo(head, 0).stroke({ color: shaft, width: (art.kind === 'execute' ? 2.4 : 1.4) * k, alpha: art.kind === 'phantom' ? 0.75 : 1 });
  // 箭羽（旋轉箭：箭羽寬度隨旋轉變化）
  const spin = art.kind === 'spin' ? Math.cos(t * 40) : 1;
  const fl = 3 * k * spin;
  const fc = art.kind === 'weak' ? 0xd83a3a : art.kind === 'wind' ? 0x7fe0a8 : art.kind === 'phantom' ? c : mix(c, 0xffffff, 0.2);
  g.poly([tail + 5 * k, 0, tail, -fl, tail - 2 * k, -fl, tail + 2 * k, 0]).fill({ color: fc });
  g.poly([tail + 5 * k, 0, tail, fl, tail - 2 * k, fl, tail + 2 * k, 0]).fill({ color: mix(fc, 0x000000, 0.25) });
  // 箭頭：菱形兩面（亮 / 暗）
  const hl = (art.kind === 'execute' ? 9 : art.kind === 'charge' ? 7.5 : 5.5) * k;
  const hw = (art.kind === 'execute' ? 4.2 : 2.6) * k;
  const tip = head + hl;
  g.poly([tip, 0, head, -hw, head + hl * 0.25, 0]).fill({ color: art.core });
  g.poly([tip, 0, head, hw, head + hl * 0.25, 0]).fill({ color: mix(art.core, c, 0.6) });
  // 發光的箭頭
  if (art.kind !== 'plain' && art.kind !== 'bone' && art.kind !== 'rapid' && art.kind !== 'small') {
    g.circle(head + hl * 0.4, 0, (art.kind === 'execute' ? 9 : 5) * k).fill({ color: c, alpha: 0.28 + 0.12 * Math.sin(t * 25) });
  }
  if (art.kind === 'weak') {
    // 弱點射擊：箭頭前方的準星
    const r = 5 * k;
    g.circle(tip + 3, 0, r).stroke({ color: c, width: 1, alpha: 0.8 });
    g.moveTo(tip + 3 - r - 2, 0).lineTo(tip + 3 + r + 2, 0).moveTo(tip + 3, -r - 2).lineTo(tip + 3, r + 2).stroke({ color: c, width: 0.8, alpha: 0.8 });
  }
  if (art.kind === 'execute') {
    // 處決：暗紅的鋸齒光環
    const pts: number[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 6;
      const r = (i % 2 ? 7 : 11) * k;
      pts.push(head + Math.cos(a) * r, Math.sin(a) * r * 0.7);
    }
    g.poly(pts).stroke({ color: c, width: 1.2, alpha: 0.8 });
  }
}

/** 淬毒飛刀：鋼刃兩面（亮 / 暗）、纏布刀柄，刀刃滴著毒 */
function drawKnife(g: Graphics, art: ProjectileArt): void {
  const k = art.size;
  g.moveTo(-8 * k, 0).lineTo(-20 * k, 0).stroke({ color: art.color, width: 1.2, alpha: 0.35 });
  g.poly([10 * k, 0, -1 * k, -2.6 * k, -2 * k, 0]).fill({ color: art.core });
  g.poly([10 * k, 0, -1 * k, 2.6 * k, -2 * k, 0]).fill({ color: mix(art.core, 0x2a3036, 0.45) });
  g.poly([-2 * k, -3.4 * k, -1 * k, -3.4 * k, -1 * k, 3.4 * k, -2 * k, 3.4 * k]).fill({ color: 0x6a6a72 });
  g.poly([-2 * k, -1.4 * k, -8 * k, -1.2 * k, -8 * k, 1.2 * k, -2 * k, 1.4 * k]).fill({ color: 0x4a3a2a });
  g.ellipse(4 * k, 0, 6 * k, 2.4 * k).fill({ color: art.color, alpha: 0.35 });
}

/** 鉤索：三爪鐵鉤，後方拖著一段繩子 */
function drawHook(g: Graphics, art: ProjectileArt): void {
  const k = art.size;
  const rope: number[] = [];
  for (let i = 0; i <= 8; i++) rope.push(-4 * k - i * 6 * k, Math.sin(i * 1.3) * 1.5 * k);
  g.poly(rope, false).stroke({ color: art.color, width: 1.6 * k });
  g.moveTo(-4 * k, 0).lineTo(5 * k, 0).stroke({ color: 0x6a6a72, width: 2.2 * k });
  for (const side of [-1, 1]) {
    g.poly([5 * k, 0, 9 * k, side * 1.5 * k, 7 * k, side * 6 * k, 4 * k, side * 4.5 * k, 6 * k, side * 1.5 * k]).fill({ color: side < 0 ? art.core : mix(art.core, 0x2a3036, 0.4) });
  }
  g.poly([5 * k, -1.2 * k, 11 * k, 0, 5 * k, 1.2 * k]).fill({ color: art.core });
}

/** 不規則多邊形（每幀重算：火焰翻騰、電弧跳動） */
function jagged(n: number, r0: number, r1: number, rot: number, seed: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rot;
    const noise = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const f = noise - Math.floor(noise);
    const r = i % 2 === 0 ? r1 * (0.75 + f * 0.35) : r0 * (0.8 + f * 0.3);
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

function drawOrb(g: Graphics, art: ProjectileArt, t: number): void {
  const k = art.size;
  const c = art.color;
  const core = art.core;
  const flicker = Math.floor(t * 24);
  switch (art.kind) {
    case 'spider': {
      // 毒蛛：紫黑的腹部與頭、綠色的毒斑，八隻腳交替擺動（往 +X 爬）
      const r = 4.2 * k;
      const step = Math.sin(t * 38);
      for (const sy of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const x0 = r * (0.5 - i * 0.35);
          const swing = (i % 2 === 0 ? step : -step) * r * 0.35;
          const knee = [x0 + r * (0.5 - i * 0.3) + swing, sy * r * 1.25];
          const foot = [x0 + r * (0.7 - i * 0.55) + swing, sy * r * 1.9];
          g.moveTo(x0, sy * r * 0.3).lineTo(knee[0]!, knee[1]!).lineTo(foot[0]!, foot[1]!).stroke({ color: 0x9a7aa8, width: 1.1 * k });
        }
      g.circle(0, 0, r * 2.2).fill({ color: c, alpha: 0.2 });
      g.ellipse(-r * 0.75, 0, r * 1.05, r * 0.85).fill({ color: 0x4a2e5a });
      g.ellipse(r * 0.55, 0, r * 0.6, r * 0.5).fill({ color: 0x5a3a6e });
      g.poly([-r * 0.75, -r * 0.45, -r * 0.4, 0, -r * 0.75, r * 0.45, -r * 1.1, 0]).fill({ color: c });
      g.circle(r * 0.85, -r * 0.2, r * 0.13).fill({ color: core });
      g.circle(r * 0.85, r * 0.2, r * 0.13).fill({ color: core });
      break;
    }
    case 'fire':
    case 'glob': {
      // 火舌往後拖：三層由外到內的尖角多邊形
      const r = (art.kind === 'fire' ? 8 : 6.5) * k;
      g.poly([r * 0.6, -r * 0.8, -r * 3.2, -r * 0.2 + Math.sin(t * 30) * 2, -r * 2.2, 0, -r * 3.4, r * 0.3 + Math.cos(t * 27) * 2, r * 0.6, r * 0.8]).fill({ color: c, alpha: 0.55 });
      g.poly(jagged(12, r * 0.7, r * 1.25, t * 4, flicker)).fill({ color: c, alpha: 0.9 });
      g.poly(jagged(10, r * 0.45, r * 0.85, -t * 6, flicker + 7)).fill({ color: mix(c, core, 0.55) });
      g.poly(jagged(6, r * 0.25, r * 0.5, t * 9, flicker + 3)).fill({ color: core });
      g.circle(0, 0, r * 2).fill({ color: c, alpha: 0.12 });
      break;
    }
    case 'ice':
    case 'shard': {
      // 多面水晶：六角形分成 6 個三角面（亮暗交錯），外圍 6 根冰刺
      const r = (art.kind === 'ice' ? 8 : 6) * k;
      const rot = t * 2.2;
      for (let i = 0; i < 6; i++) {
        const a0 = rot + (i / 6) * Math.PI * 2;
        const a1 = rot + ((i + 1) / 6) * Math.PI * 2;
        const spike = rot + ((i + 0.5) / 6) * Math.PI * 2;
        g.poly([Math.cos(a0) * r * 0.7, Math.sin(a0) * r * 0.7, Math.cos(spike) * r * 1.55, Math.sin(spike) * r * 1.55, Math.cos(a1) * r * 0.7, Math.sin(a1) * r * 0.7]).fill({ color: mix(c, 0xffffff, 0.2), alpha: 0.85 });
        g.poly([0, 0, Math.cos(a0) * r * 0.7, Math.sin(a0) * r * 0.7, Math.cos(a1) * r * 0.7, Math.sin(a1) * r * 0.7]).fill({ color: i % 3 === 0 ? core : i % 3 === 1 ? c : mix(c, 0x1a3a5a, 0.35) });
      }
      g.circle(0, 0, r * 1.9).fill({ color: c, alpha: 0.12 });
      break;
    }
    case 'spark': {
      // 電球：跳動的尖星 + 三條隨機電弧
      const r = 7 * k;
      g.circle(0, 0, r * 2.2).fill({ color: c, alpha: 0.14 });
      g.poly(jagged(14, r * 0.45, r * 1.3, t * 10, flicker)).fill({ color: c, alpha: 0.9 });
      g.poly(jagged(8, r * 0.3, r * 0.6, -t * 14, flicker + 5)).fill({ color: core });
      for (let i = 0; i < 3; i++) {
        const a = ((flicker * 7 + i * 137) % 360) * (Math.PI / 180);
        let x = Math.cos(a) * r * 0.6;
        let y = Math.sin(a) * r * 0.6;
        g.moveTo(x, y);
        for (let j = 0; j < 3; j++) {
          x += Math.cos(a + (j % 2 ? 0.7 : -0.7)) * r * 0.7;
          y += Math.sin(a + (j % 2 ? 0.7 : -0.7)) * r * 0.7;
          g.lineTo(x, y);
        }
        g.stroke({ color: core, width: 1.1, alpha: 0.95 });
      }
      break;
    }
    case 'lance':
    case 'frostBolt': {
      // 冰槍：細長的菱形水晶（上下兩面亮暗），後方有碎冰
      const L = (art.kind === 'lance' ? 22 : 13) * k;
      const w = (art.kind === 'lance' ? 3.6 : 3) * k;
      g.poly([L * 0.55, 0, -L * 0.1, -w, -L * 0.45, 0]).fill({ color: core });
      g.poly([L * 0.55, 0, -L * 0.1, w, -L * 0.45, 0]).fill({ color: c });
      g.poly([L * 0.55, 0, L * 0.1, -w * 0.45, -L * 0.1, 0]).fill({ color: 0xffffff, alpha: 0.8 });
      g.poly([-L * 0.4, 0, -L * 0.65, -w * 1.2, -L * 0.55, 0]).fill({ color: c, alpha: 0.7 });
      g.poly([-L * 0.4, 0, -L * 0.7, w * 1.1, -L * 0.52, 0]).fill({ color: mix(c, 0x1a3a5a, 0.3), alpha: 0.7 });
      g.ellipse(0, 0, L * 0.7, w * 2.4).fill({ color: c, alpha: 0.12 });
      break;
    }
    case 'poison': {
      // 毒液：不規則的綠色團塊 + 幾顆飛濺的液滴
      const r = 6 * k;
      g.poly(jagged(9, r * 0.75, r * 1.1, t * 3, flicker >> 1)).fill({ color: c, alpha: 0.9 });
      g.poly(jagged(7, r * 0.4, r * 0.65, -t * 4, (flicker >> 1) + 3)).fill({ color: core, alpha: 0.8 });
      for (const [x, y] of [
        [-r * 1.6, -r * 0.6],
        [-r * 2.3, r * 0.4],
      ] as const) g.circle(x, y, r * 0.3).fill({ color: c, alpha: 0.8 });
      break;
    }
    case 'axe': {
      // 擲斧：整把斧頭旋轉，斧刃兩面亮暗、後方帶紅色殘影
      const r = 7 * k;
      const a = t * 22;
      const rot = (x: number, y: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
      const pts = (list: [number, number][]) => list.flatMap(([x, y]) => rot(x, y));
      g.circle(0, 0, r * 1.6).fill({ color: c, alpha: 0.12 });
      g.poly(pts([[-r, -0.5], [r * 0.6, -0.5], [r * 0.6, 0.5], [-r, 0.5]])).fill({ color: 0x6a4a2e });
      g.poly(pts([[r * 0.3, -0.6], [r * 1.1, -r * 0.9], [r * 1.3, 0], [r * 0.3, 0]])).fill({ color: core });
      g.poly(pts([[r * 0.3, 0], [r * 1.3, 0], [r * 1.1, r * 0.9], [r * 0.3, 0.6]])).fill({ color: mix(core, 0x2a3036, 0.45) });
      g.poly(pts([[r * 1.1, -r * 0.9], [r * 1.35, 0], [r * 1.1, r * 0.9]]), false).stroke({ color: c, width: 1.2, alpha: 0.8 });
      break;
    }
    case 'bolt': {
      // 圖騰閃電：沿飛行方向的鋸齒電光（每幀重新跳動）
      const L = 26 * k;
      const pts: number[] = [];
      for (let i = 0; i <= 7; i++) {
        const noise = Math.sin((flicker + i) * 12.9898) * 43758.5453;
        const f = noise - Math.floor(noise);
        pts.push(L * 0.5 - (i / 7) * L, (i === 0 || i === 7 ? 0 : (f - 0.5) * 8) * k);
      }
      g.poly(pts, false).stroke({ color: c, width: 4 * k, alpha: 0.35 });
      g.poly(pts, false).stroke({ color: core, width: 1.6 * k });
      g.circle(L * 0.5, 0, 4 * k).fill({ color: core, alpha: 0.9 });
      break;
    }
    case 'spore': {
      // 孢子：尖刺球
      const r = 5.5 * k;
      g.poly(jagged(16, r * 0.6, r * 1.35, t * 3, 1)).fill({ color: c, alpha: 0.85 });
      g.circle(0, 0, r * 0.5).fill({ color: core });
      break;
    }
  }
}
