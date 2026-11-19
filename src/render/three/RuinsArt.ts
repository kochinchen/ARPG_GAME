import { Rng } from '../../core/Rng';
import type { RuinEra } from '../../data/ruins';
import type { RuinBuilding, RuinsLayout, SkeletonRemains, StonePatch } from '../../game/world/Ruins';
import type { V3 } from '../figure/Poly3D';
import type { PushTriangle } from './WallStones';
import { DEFAULT_MONSTER_MODEL, MONSTER_MODELS } from '../figure/Monsters';
import { figureScale } from '../figure/FigureModel';
import { PolyFigure } from '../figure/PolyFigure';
import { SEATED_AGAINST_WALL } from '../figure/SetPieceProps';

/**
 * 地底古城的遺跡（Three.js 畫法；game/world/Ruins.ts 決定位置）：
 * 牆外黑色區的斷垣殘壁、地板上的石板、散落的白骨（骷髏用遊戲裡的骷髏模型）。建築由一塊塊鑿過的石頭、木樑組成，
 * 每個面切成約 STEP 大小的小三角形（設計者偏好細密的小構面，不要大平面）。參考圖：art/ruins/。
 *
 * 單位：World（1 = 1 Tile），高度也是 World 單位（牆約 0.65 高、人約 1.3 高）。
 * Three.js 座標 (X, Y, Z) = (World x, 高度, World y)。
 */

/** 小三角形的邊長 */
const STEP = 0.2;
/** 鏡頭的方向（只畫朝鏡頭的面） */
const VIEW: V3 = [1, Math.sqrt(2 / 3), 1];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function mixColor(a: number, b: number, t: number, k = 1): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round((((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** 各年代的用色 */
interface Palette {
  stone: number;
  stone2: number;
  trim: number;
  wood: number;
  roof: number;
  accent: number;
  floor: number;
}

const PALETTES: Record<RuinEra, Palette> = {
  hamlet: { stone: 0x6e665a, stone2: 0x58514a, trim: 0x7a7264, wood: 0x5a3e28, roof: 0x5c3a2a, accent: 0x8a5a34, floor: 0x5e574c },
  necropolis: { stone: 0x6a706a, stone2: 0x535a54, trim: 0x7e847c, wood: 0x3e3a34, roof: 0x4c524c, accent: 0x4a6a3a, floor: 0x58605a },
  cathedral: { stone: 0x7c7468, stone2: 0x625b52, trim: 0x928a7c, wood: 0x4a3828, roof: 0x48444a, accent: 0x5a7a9a, floor: 0x6a6258 },
  foundry: { stone: 0x5a5250, stone2: 0x443e3c, trim: 0x7a4434, wood: 0x4e3626, roof: 0x3e3430, accent: 0xff7a30, floor: 0x524a46 },
  citadel: { stone: 0x666e7a, stone2: 0x4e5560, trim: 0x7a828e, wood: 0x4a3626, roof: 0x3a4048, accent: 0x8a2224, floor: 0x5a606a },
  palace: { stone: 0xa49c8a, stone2: 0x8a8272, trim: 0xc8a050, wood: 0x5a3e28, roof: 0x8a8070, accent: 0x8a2028, floor: 0x948c7a },
  sanctum_palace: { stone: 0x4e4060, stone2: 0x3a3048, trim: 0xd0a850, wood: 0x3a2a30, roof: 0x45385a, accent: 0xb45aff, floor: 0x4a3e5a },
};

/** 一組三角形的輸出：本地座標 → World，只畫朝鏡頭的面，每個小三角形輕微色差 */
class Kit {
  private n = 0;

  constructor(
    private readonly out: PushTriangle,
    private readonly toWorld: (p: V3) => V3,
    private readonly rotate: (n: V3) => V3,
    private readonly seed: number,
  ) {}

  private jitter(color: number): number {
    const h1 = hash(this.n++, this.seed);
    const h2 = hash(this.n++, this.seed + 7);
    return mixColor(color, 0x000000, h1 * 0.13, 0.96 + h2 * 0.08);
  }

  /** 朝鏡頭（或接近側面）才畫 */
  facing(normal: V3): boolean {
    return dot(this.rotate(normal), VIEW) > -0.05;
  }

  tri(a: V3, b: V3, c: V3, color: number): void {
    this.out(this.toWorld(a), this.toWorld(b), this.toWorld(c), this.jitter(color));
  }

  /** 四邊形切成小三角形；rough：內部頂點沿法線起伏（× STEP） */
  quad(a: V3, b: V3, c: V3, d: V3, color: number, rough = 0.15, cull = true): void {
    const normal = cross(sub(b, a), sub(d, a));
    if (cull && !this.facing(normal)) return;
    const nn = norm(normal);
    const nu = Math.max(1, Math.round(Math.max(len(sub(b, a)), len(sub(c, d))) / STEP));
    const nv = Math.max(1, Math.round(Math.max(len(sub(d, a)), len(sub(c, b))) / STEP));
    const grid: V3[] = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        let p = lerp(lerp(a, b, i / nu), lerp(d, c, i / nu), j / nv);
        if (i > 0 && i < nu && j > 0 && j < nv && rough > 0) p = add(p, scale(nn, (hash(this.n++, this.seed + 3) - 0.5) * rough * STEP));
        grid.push(p);
      }
    }
    const at = (i: number, j: number) => grid[j * (nu + 1) + i]!;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        this.tri(at(i, j), at(i + 1, j), at(i + 1, j + 1), color);
        this.tri(at(i, j), at(i + 1, j + 1), at(i, j + 1), color);
      }
    }
  }

  /** 三角形切成小三角形 */
  triangle(a: V3, b: V3, c: V3, color: number, cull = true): void {
    if (cull && !this.facing(cross(sub(b, a), sub(c, a)))) return;
    const k = Math.max(1, Math.round(Math.max(len(sub(b, a)), len(sub(c, a)), len(sub(c, b))) / STEP));
    const p = (i: number, j: number) => add(a, add(scale(sub(b, a), i / k), scale(sub(c, a), j / k)));
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < k - j; i++) {
        this.tri(p(i, j), p(i + 1, j), p(i, j + 1), color);
        if (i + j < k - 1) this.tri(p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), color);
      }
    }
  }

  /**
   * 六面體：c 是 8 個角（下 0～3、上 4～7，同一個方向繞），top 是頂面的顏色。
   * 只畫朝鏡頭的面（底面不畫）。
   */
  hexa(c: readonly V3[], color: number, top = color, rough = 0.15): void {
    const center = scale(c.reduce((s, v) => add(s, v), [0, 0, 0] as V3), 1 / 8);
    const face = (i: number, j: number, k: number, l: number, col: number) => {
      const [a, b, cc, d] = [c[i]!, c[j]!, c[k]!, c[l]!];
      const n = cross(sub(b, a), sub(d, a));
      const mid = scale(add(add(a, b), add(cc, d)), 0.25);
      // 法線朝外
      if (dot(n, sub(mid, center)) < 0) this.quad(a, d, cc, b, col, rough);
      else this.quad(a, b, cc, d, col, rough);
    };
    face(4, 5, 6, 7, top);
    face(0, 1, 5, 4, color);
    face(1, 2, 6, 5, color);
    face(2, 3, 7, 6, color);
    face(3, 0, 4, 7, color);
  }

  /** 軸對齊的方塊 */
  block(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, top = color, rough = 0.15): void {
    this.hexa(
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
      color,
      top,
      rough,
    );
  }

  /** 繞 Y 轉 yaw、傾斜 tilt 的方塊（瓦礫、倒下的石塊） */
  stone(center: V3, size: V3, yaw: number, tilt: number, color: number, top = color): void {
    const [hx, hy, hz] = scale(size, 0.5);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const corner = (x: number, y: number, z: number): V3 => {
      const y1 = y * ct - z * st;
      const z1 = y * st + z * ct;
      return [center[0] + x * cy + z1 * sy, center[1] + y1, center[2] - x * sy + z1 * cy];
    };
    this.hexa([corner(-hx, -hy, -hz), corner(hx, -hy, -hz), corner(hx, -hy, hz), corner(-hx, -hy, hz), corner(-hx, hy, -hz), corner(hx, hy, -hz), corner(hx, hy, hz), corner(-hx, hy, hz)], color, top);
  }

  /** 兩點之間的方條（木樑、骨頭） */
  beam(a: V3, b: V3, w: number, h: number, color: number, rough = 0.1): void {
    const u = norm(sub(b, a));
    const side = Math.abs(u[1]) > 0.95 ? ([1, 0, 0] as V3) : norm(cross(u, [0, 1, 0]));
    const up = cross(side, u);
    const s = scale(side, w / 2);
    const t = scale(up, h / 2);
    const at = (p: V3, i: number, j: number) => add(p, add(scale(s, i), scale(t, j)));
    this.hexa([at(a, -1, -1), at(a, 1, -1), at(a, 1, 1), at(a, -1, 1), at(b, -1, -1), at(b, 1, -1), at(b, 1, 1), at(b, -1, 1)], color, color, rough);
  }

  /** 圓柱段（a → b，sides 個面；fluted：凹槽，半徑一凸一凹） */
  drum(a: V3, b: V3, r0: number, r1: number, sides: number, color: number, fluted = false, cap = color): void {
    const u = norm(sub(b, a));
    const side = Math.abs(u[1]) > 0.95 ? ([1, 0, 0] as V3) : norm(cross(u, [0, 1, 0]));
    const up = cross(side, u);
    const ring = (p: V3, r: number) =>
      Array.from({ length: sides }, (_, i) => {
        const angle = (i / sides) * Math.PI * 2;
        const rr = fluted && i % 2 === 1 ? r * 0.9 : r;
        return add(p, add(scale(side, Math.cos(angle) * rr), scale(up, Math.sin(angle) * rr)));
      });
    const ra = ring(a, r0);
    const rb = ring(b, r1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a0 = ra[i]!;
      const a1 = ra[j]!;
      const mid = scale(add(a0, a1), 0.5);
      if (dot(sub(mid, a), cross(sub(a1, a0), sub(rb[i]!, a0))) < 0) this.quad(a0, rb[i]!, rb[j]!, a1, color, 0.1);
      else this.quad(a0, a1, rb[j]!, rb[i]!, color, 0.1);
    }
    // 兩端的蓋子
    for (const [ring2, p, dir] of [
      [rb, b, u],
      [ra, a, scale(u, -1)],
    ] as const) {
      if (!this.facing(dir)) continue;
      for (let i = 0; i < sides; i++) this.triangle(p, ring2[i]!, ring2[(i + 1) % sides]!, cap, false);
    }
  }

  /** 四角錐（尖塔、方尖碑頂） */
  pyramid(cx: number, cz: number, y0: number, half: number, height: number, color: number): void {
    const tip: V3 = [cx, y0 + height, cz];
    const c: V3[] = [
      [cx - half, y0, cz - half],
      [cx + half, y0, cz - half],
      [cx + half, y0, cz + half],
      [cx - half, y0, cz + half],
    ];
    for (let i = 0; i < 4; i++) {
      const a = c[i]!;
      const b = c[(i + 1) % 4]!;
      const n = cross(sub(b, a), sub(tip, a));
      const out = sub(scale(add(a, b), 0.5), [cx, y0, cz]);
      if (dot(n, out) < 0) this.triangle(a, tip, b, color);
      else this.triangle(a, b, tip, color);
    }
  }
}

function hash(i: number, seed: number): number {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ─────────────────────────── 建築零件 ───────────────────────────

interface Opening {
  /** 沿牆的位置（0～1） */
  t0: number;
  t1: number;
  y0: number;
  y1: number;
  arch?: 'round' | 'pointed';
}

interface WallSpec {
  /** 沿牆方向：'x'（牆在 z = at）或 'z'（牆在 x = at） */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  thick: number;
  height: number;
  /** 牆頂高度的比例（t：0～1 沿牆）；斷掉的地方變矮 */
  profile?: (t: number) => number;
  openings?: Opening[];
  color: number;
  color2: number;
  course?: number;
  /** 底部從多高開始（放在台座上） */
  base?: number;
}

/** 一塊塊石頭砌的牆：每層交錯、長短不一，牆頂依 profile 斷裂、開口處留空 */
function masonry(kit: Kit, rng: Rng, s: WallSpec): void {
  const course = s.course ?? 0.36;
  const length = s.to - s.from;
  const gap = 0.025;
  let y = s.base ?? 0;
  const top = (s.base ?? 0) + s.height;
  for (let row = 0; y < top - 0.05; row++) {
    const ch = Math.min(course * rng.range(0.85, 1.15), top - y);
    let p = row % 2 === 0 ? 0 : -rng.range(0.15, 0.35);
    while (p < length) {
      const bl = rng.range(0.38, 0.72);
      const p0 = Math.max(0, p);
      const p1 = Math.min(length, p + bl);
      p += bl;
      if (p1 - p0 < 0.08) continue;
      const tm = (p0 + p1) / 2 / length;
      const limit = (s.base ?? 0) + s.height * (s.profile ? s.profile(tm) : 1);
      if (y + ch * 0.5 > limit) continue;
      // 斷口附近少幾塊
      if (y + ch > limit - course && rng.chance(0.3)) continue;
      const blocked = (s.openings ?? []).some((o) => {
        if (tm < o.t0 || tm > o.t1) return false;
        const local = (tm - o.t0) / (o.t1 - o.t0);
        let oy1 = o.y1;
        if (o.arch) {
          const span = (o.t1 - o.t0) * length;
          const rise = o.arch === 'round' ? span / 2 : span * 0.85;
          const k = Math.abs(local - 0.5) * 2;
          oy1 = o.y1 - rise + rise * (o.arch === 'round' ? Math.sqrt(Math.max(0, 1 - k * k)) : 1 - k ** 1.4);
        }
        return y + ch > o.y0 + 0.02 && y < oy1;
      });
      if (blocked) continue;
      const out = rng.range(-0.025, 0.025);
      const y1 = y + ch - gap;
      const color = rng.chance(0.5) ? s.color : s.color2;
      if (s.axis === 'x') kit.block(s.from + p0 + gap, s.from + p1 - gap, y + gap, y1, s.at - s.thick / 2 + out, s.at + s.thick / 2 + out, color, mixColor(color, 0xffffff, 0.08));
      else kit.block(s.at - s.thick / 2 + out, s.at + s.thick / 2 + out, y + gap, y1, s.from + p0 + gap, s.from + p1 - gap, color, mixColor(color, 0xffffff, 0.08));
    }
    y += ch;
  }
}

/** 斷裂的牆頂：幾個凹口 */
function brokenProfile(rng: Rng, depth = 0.6): (t: number) => number {
  const dips = Array.from({ length: rng.int(1, 3) }, () => ({ at: rng.next(), width: rng.range(0.12, 0.35), depth: rng.range(depth * 0.5, depth) }));
  return (t) => Math.max(0.12, 1 - dips.reduce((s, d) => s + Math.max(0, 1 - Math.abs(t - d.at) / d.width) * d.depth, 0));
}

/** 地上的瓦礫堆 */
function rubble(kit: Kit, rng: Rng, cx: number, cz: number, radius: number, count: number, colors: readonly number[]): void {
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * radius;
    const s = rng.range(0.14, 0.42);
    const color = rng.pick(colors);
    kit.stone([cx + Math.cos(a) * r, s * 0.3 + rng.range(0, 0.12), cz + Math.sin(a) * r], [s * rng.range(0.9, 1.6), s * rng.range(0.6, 1), s], rng.range(0, Math.PI), rng.range(-0.4, 0.4), color, mixColor(color, 0xffffff, 0.07));
  }
}

/** 從黑暗裡冒出來的岩石底座：占地四周一圈參差的碎岩（小塊、尖角朝上） */
function rockSkirt(kit: Kit, rng: Rng, w: number, d: number, rock: number, front = true): void {
  const dark = mixColor(rock, 0x000000, 0.25);
  const edge = (from: V3, to: V3) => {
    const n = Math.ceil(len(sub(to, from)) / 0.3);
    for (let i = 0; i <= n; i++) {
      const p = lerp(from, to, i / n);
      for (let k = 0; k < 2; k++) {
        const s = rng.range(0.18, 0.42);
        const color = rng.chance(0.5) ? rock : dark;
        kit.stone([p[0] + rng.range(-0.35, 0.35), s * 0.3, p[2] + rng.range(-0.35, 0.35)], [s * rng.range(0.8, 1.3), s * rng.range(0.6, 1.2), s], rng.range(0, Math.PI), rng.range(-0.5, 0.5), color, mixColor(color, 0xffffff, 0.05));
      }
    }
  };
  const hx = w / 2 + 0.15;
  const hz = d / 2 + 0.15;
  edge([-hx, 0, -hz], [hx, 0, -hz]);
  edge([hx, 0, -hz], [hx, 0, hz]);
  if (front) edge([hx, 0, hz], [-hx, 0, hz]);
  edge([-hx, 0, hz], [-hx, 0, -hz]);
}

/** 頂替邊牆的建築：正面一道完整的牆（不開門，只有窗），斷口不低於原本的牆高；宮殿再加嵌在牆上的半圓柱 */
const FRONTAGE: Record<RuinEra, { height: number; arch?: 'round' | 'pointed'; brick?: boolean; columns?: boolean; crenel?: boolean }> = {
  hamlet: { height: 1.25 },
  necropolis: { height: 1.35, arch: 'round' },
  cathedral: { height: 1.9, arch: 'pointed' },
  foundry: { height: 1.4, brick: true },
  citadel: { height: 2.1, crenel: true },
  palace: { height: 1.7, arch: 'round', columns: true },
  sanctum_palace: { height: 1.9, arch: 'round', columns: true },
};

function frontage(kit: Kit, rng: Rng, era: RuinEra, w: number, d: number, p: Palette): void {
  const f = FRONTAGE[era];
  const z = d / 2 - 0.25;
  const x0 = -w / 2;
  const x1 = w / 2;
  const windows = Math.max(1, Math.floor(w / 2.2));
  const openings: Opening[] = Array.from({ length: windows }, (_, i) => {
    const t = (i + 0.5) / windows;
    return { t0: t - 0.28 / windows, t1: t + 0.28 / windows, y0: 0.75, y1: f.height - 0.2, ...(f.arch ? { arch: f.arch } : {}) };
  });
  const broken = brokenProfile(rng, 0.4);
  const color = f.brick ? p.trim : p.stone;
  const color2 = f.brick ? mixColor(p.trim, 0x000000, 0.2) : p.stone2;
  masonry(kit, rng, { axis: 'x', at: z, from: x0, to: x1, thick: 0.5, height: f.height, profile: (t) => Math.max(0.62 / f.height, broken(t)), openings, color, color2, course: f.brick ? 0.22 : 0.36 });
  // 窗後的黑暗（看不穿到另一邊，不會以為走得進去）
  for (const o of openings) {
    const a = x0 + o.t0 * w;
    const b = x0 + o.t1 * w;
    kit.quad([a, o.y0, z - 0.2], [b, o.y0, z - 0.2], [b, o.y1, z - 0.2], [a, o.y1, z - 0.2], 0x0c0a0e, 0, false);
  }
  // 牆腳的基石
  kit.block(x0, x1, 0, 0.18, z - 0.3, z + 0.32, p.stone2, mixColor(p.stone2, 0xffffff, 0.06), 0.2);
  if (f.columns) {
    for (let x = x0 + 0.7; x < x1 - 0.5; x += 1.5) column(kit, rng, x, z + 0.1, 0, f.height + 0.3, 0.2, p, true, rng.chance(0.3));
  }
  if (f.crenel) {
    for (let x = x0 + 0.2; x < x1 - 0.3; x += 0.7) if (rng.chance(0.7)) kit.block(x, x + 0.4, f.height - 0.05, f.height + 0.38, z - 0.25, z + 0.25, p.stone, p.trim);
  }
}

/** 石板地面（建築內的地板） */
function flagstones(kit: Kit, rng: Rng, x0: number, x1: number, z0: number, z1: number, y: number, colors: readonly number[], keep = 0.85): void {
  for (let z = z0; z < z1 - 0.1; ) {
    const dz = Math.min(rng.range(0.4, 0.65), z1 - z);
    for (let x = x0 + (rng.chance(0.5) ? -0.2 : 0); x < x1 - 0.1; ) {
      const dx = rng.range(0.4, 0.75);
      const a = Math.max(x0, x);
      const b = Math.min(x1, x + dx);
      if (b - a > 0.12 && rng.chance(keep)) {
        const h = y + rng.range(0.02, 0.06);
        kit.block(a + 0.025, b - 0.025, y - 0.02, h, z + 0.025, z + dz - 0.025, rng.pick(colors));
      }
      x += dx;
    }
    z += dz;
  }
}

/** 圓柱：台座、一節節的柱身、柱頭；broken：斷在某一節，頂上歪一點 */
function column(kit: Kit, rng: Rng, cx: number, cz: number, base: number, height: number, r: number, p: Palette, fluted: boolean, broken: boolean): void {
  kit.block(cx - r * 1.45, cx + r * 1.45, base, base + 0.22, cz - r * 1.45, cz + r * 1.45, p.stone2, p.stone);
  const drums = Math.max(2, Math.round(height / 0.5));
  const keep = broken ? rng.int(1, drums - 1) : drums;
  const h = (height - 0.4) / drums;
  let y = base + 0.22;
  for (let i = 0; i < keep; i++) {
    const tilt = broken && i === keep - 1 ? rng.range(-0.06, 0.06) : 0;
    kit.drum([cx, y + 0.01, cz], [cx + tilt, y + h - 0.01, cz + tilt], r, r * 0.98, fluted ? 12 : 8, p.stone, fluted, mixColor(p.stone, 0xffffff, 0.08));
    y += h;
  }
  if (!broken) {
    kit.block(cx - r * 1.35, cx + r * 1.35, y, y + 0.18, cz - r * 1.35, cz + r * 1.35, p.trim, p.trim);
  } else {
    // 掉下來的柱身散在旁邊
    const a = rng.range(0, Math.PI * 2);
    for (let i = 0; i < Math.min(2, drums - keep); i++) {
      const d = 0.6 + i * 0.55;
      const px = cx + Math.cos(a) * d;
      const pz = cz + Math.sin(a) * d;
      const along = a + Math.PI / 2 + rng.range(-0.4, 0.4);
      kit.drum([px - Math.cos(along) * h * 0.45, r, pz - Math.sin(along) * h * 0.45], [px + Math.cos(along) * h * 0.45, r, pz + Math.sin(along) * h * 0.45], r, r, fluted ? 12 : 8, p.stone2, fluted, p.stone);
    }
  }
}

/** 拱（圓拱或尖拱）：拱石沿著弧排列；axis 'x' = 在 z = at 的牆面上 */
function arch(kit: Kit, cx: number, cz: number, axis: 'x' | 'z', span: number, spring: number, thick: number, depth: number, kind: 'round' | 'pointed', color: number, missing: (i: number) => boolean = () => false): void {
  const r = span / 2;
  const n = 9;
  const point = (t: number, rad: number): V3 => {
    // t：0～1 從左到右
    let x: number;
    let y: number;
    if (kind === 'round') {
      const a = Math.PI * (1 - t);
      x = Math.cos(a) * rad;
      y = Math.sin(a) * rad;
    } else {
      // 尖拱（等邊尖拱）：左右兩段圓弧，圓心在對面的起拱點，半徑 = 跨距
      const left = t < 0.5;
      const k = left ? t * 2 : (1 - t) * 2;
      const theta = Math.PI - (Math.PI / 3) * k;
      const R = span + (rad - r);
      const xl = r + R * Math.cos(theta);
      x = left ? xl : -xl;
      y = R * Math.sin(theta);
    }
    return axis === 'x' ? [cx + x, spring + y, cz] : [cx, spring + y, cz + x];
  };
  const off: V3 = axis === 'x' ? [0, 0, depth / 2] : [depth / 2, 0, 0];
  for (let i = 0; i < n; i++) {
    if (missing(i)) continue;
    const t0 = i / n + 0.006;
    const t1 = (i + 1) / n - 0.006;
    const a0 = point(t0, r);
    const a1 = point(t1, r);
    const b0 = point(t0, r + thick);
    const b1 = point(t1, r + thick);
    kit.hexa([sub(a0, off), sub(a1, off), add(a1, off), add(a0, off), sub(b0, off), sub(b1, off), add(b1, off), add(b0, off)], color, mixColor(color, 0xffffff, 0.08));
  }
}

/** 圓頂：經緯面板，缺了一角；ribs：金色肋條 */
function dome(kit: Kit, rng: Rng, cx: number, cy: number, cz: number, r: number, color: number, rib: number): void {
  const lon = 16;
  const lat = 6;
  const hole = rng.range(0, Math.PI * 2);
  const at = (i: number, j: number): V3 => {
    const a = (i / lon) * Math.PI * 2;
    const t = (j / lat) * (Math.PI / 2);
    return [cx + Math.cos(a) * Math.cos(t) * r, cy + Math.sin(t) * r, cz + Math.sin(a) * Math.cos(t) * r];
  };
  for (let i = 0; i < lon; i++) {
    const a = (i / lon) * Math.PI * 2;
    const da = Math.abs(Math.atan2(Math.sin(a - hole), Math.cos(a - hole)));
    for (let j = 0; j < lat; j++) {
      // 破洞：靠近 hole 的上半部
      if (da < 0.9 && j >= 2 && hash(i * 31 + j, 5) < 0.8) continue;
      const p0 = at(i, j);
      const p1 = at(i + 1, j);
      const p2 = at(i + 1, j + 1);
      const p3 = at(i, j + 1);
      const out = sub(scale(add(add(p0, p1), add(p2, p3)), 0.25), [cx, cy, cz]);
      if (dot(cross(sub(p1, p0), sub(p3, p0)), out) < 0) kit.quad(p0, p3, p2, p1, color, 0.15);
      else kit.quad(p0, p1, p2, p3, color, 0.15);
    }
    if (i % 2 === 0 && !(da < 0.9)) for (let j = 0; j < lat; j++) kit.beam(at(i, j), at(i, j + 1), 0.07, 0.07, rib);
  }
}

/** 階梯（往 +z 下降） */
function stairs(kit: Kit, x0: number, x1: number, zTop: number, height: number, steps: number, depth: number, colors: readonly number[]): void {
  const rise = height / steps;
  for (let i = 0; i < steps; i++) {
    const y1 = height - i * rise;
    kit.block(x0, x1, 0, y1, zTop + i * depth, zTop + (i + 1) * depth - 0.02, colors[i % colors.length]!, mixColor(colors[i % colors.length]!, 0xffffff, 0.1));
  }
}

/** 掛著的旗幟（破爛的下緣） */
function banner(kit: Kit, rng: Rng, x: number, y: number, z: number, axis: 'x' | 'z', width: number, height: number, color: number, trim: number): void {
  const strips = 4;
  for (let i = 0; i < strips; i++) {
    const a = -width / 2 + (i / strips) * width;
    const b = a + width / strips;
    const h = height * rng.range(0.7, 1);
    const p = (u: number, v: number): V3 => (axis === 'x' ? [x + u, v, z] : [x, v, z + u]);
    kit.quad(p(a, y - h), p(b, y - h), p(b, y), p(a, y), color, 0.1, false);
  }
  kit.beam(axis === 'x' ? [x - width / 2 - 0.08, y, z] : [x, y, z - width / 2 - 0.08], axis === 'x' ? [x + width / 2 + 0.08, y, z] : [x, y, z + width / 2 + 0.08], 0.06, 0.06, trim);
}

// ─────────────────────────── 各年代的建築 ───────────────────────────

type Recipe = (kit: Kit, rng: Rng, w: number, d: number, p: Palette, rock: number) => void;

/** 平民石屋：兩間塌了屋頂的石屋，山牆、木樑、半邊屋頂 */
const hamlet: Recipe = (kit, rng, w, d, p) => {
  const houses = w > 7.5 ? 2 : 1;
  for (let h = 0; h < houses; h++) {
    const hw = Math.min(4.2, (w - 1) / houses - 0.4);
    const hd = Math.min(3.6, d - 1.6);
    const cx = -w / 2 + 0.6 + (h + 0.5) * ((w - 1.2) / houses);
    const cz = rng.range(-0.6, 0.6);
    const x0 = cx - hw / 2;
    const x1 = cx + hw / 2;
    const z0 = cz - hd / 2;
    const z1 = cz + hd / 2;
    const wallH = rng.range(1.3, 1.7);
    const ridge = wallH + hw * 0.45;
    // 前後兩面：前面有門和窗
    masonry(kit, rng, { axis: 'x', at: z1, from: x0, to: x1, thick: 0.32, height: wallH, profile: brokenProfile(rng, 0.45), openings: [{ t0: 0.4, t1: 0.62, y0: 0, y1: 1.05 }, { t0: 0.12, t1: 0.27, y0: 0.55, y1: 0.95 }], color: p.stone, color2: p.stone2 });
    masonry(kit, rng, { axis: 'x', at: z0, from: x0, to: x1, thick: 0.32, height: wallH, color: p.stone, color2: p.stone2 });
    // 兩面山牆
    for (const x of [x0, x1]) {
      const gable = (t: number) => (wallH + (ridge - wallH) * (1 - Math.abs(t - 0.5) * 2)) / ridge;
      const broken = x === x1 && rng.chance(0.6) ? brokenProfile(rng, 0.5) : () => 1;
      masonry(kit, rng, { axis: 'z', at: x, from: z0, to: z1, thick: 0.32, height: ridge, profile: (t) => gable(t) * broken(t), color: p.stone, color2: p.stone2 });
    }
    // 屋脊、椽、一部分屋頂木板
    kit.beam([x0, ridge, cz], [x1, ridge, cz], 0.14, 0.14, p.wood);
    const rafters = Math.round(hw / 0.55);
    for (let i = 0; i <= rafters; i++) {
      if (rng.chance(0.25)) continue;
      const x = x0 + (i / rafters) * hw;
      for (const side of [-1, 1]) {
        const end: V3 = [x, wallH - 0.05, cz + side * (hd / 2 + 0.25)];
        // 有些椽斷了一半
        const cut = rng.chance(0.3) ? rng.range(0.4, 0.8) : 1;
        kit.beam([x, ridge, cz], lerp([x, ridge, cz], end, cut), 0.1, 0.1, p.wood);
      }
    }
    // 後半邊的屋頂還在一些（木板瓦）
    const roofX1 = x0 + hw * rng.range(0.35, 0.7);
    for (let z = 0; z < 4; z++) {
      const t0 = z / 4;
      const t1 = (z + 1) / 4;
      const a: V3 = lerp([x0 - 0.15, ridge + 0.08, cz], [x0 - 0.15, wallH, z0 - 0.3], t0);
      const b: V3 = lerp([x0 - 0.15, ridge + 0.08, cz], [x0 - 0.15, wallH, z0 - 0.3], t1);
      const xEnd = roofX1 - rng.range(0, 0.6);
      kit.hexa([a, [xEnd, a[1], a[2]], [xEnd, b[1], b[2]], b, add(a, [0, 0.06, 0]), [xEnd, a[1] + 0.06, a[2]], [xEnd, b[1] + 0.06, b[2]], add(b, [0, 0.06, 0])], p.roof, p.roof);
    }
    flagstones(kit, rng, x0 + 0.2, x1 - 0.2, z0 + 0.2, z1 - 0.2, 0, [p.stone2, p.floor], 0.6);
    // 倒在門口的木桶與屋頂掉下來的木樑
    kit.drum([cx + hw * 0.3, 0.22, z1 + 0.7], [cx + hw * 0.3 + 0.5, 0.22, z1 + 0.9], 0.22, 0.22, 8, p.wood);
    kit.beam([x0 + 0.3, 0.08, z1 + 0.4], [x0 + 1.8, 0.35, z1 + 1.1], 0.12, 0.12, p.wood);
    rubble(kit, rng, x1 - 0.4, z1 + 0.5, 1, 9, [p.stone, p.stone2]);
  }
};

/** 墓園：陵寢（山花、拱門、十字）、方尖碑、一排排墓碑 */
const necropolis: Recipe = (kit, rng, w, d, p) => {
  const mw = Math.min(3.4, w * 0.45);
  const md = Math.min(3, d * 0.42);
  const mz = -d / 2 + md / 2 + 0.6;
  const H = 2;
  kit.block(-mw / 2 - 0.3, mw / 2 + 0.3, 0, 0.25, mz - md / 2 - 0.3, mz + md / 2 + 0.3, p.stone2, p.stone);
  masonry(kit, rng, { axis: 'x', at: mz + md / 2, from: -mw / 2, to: mw / 2, thick: 0.35, height: H, base: 0.25, openings: [{ t0: 0.33, t1: 0.67, y0: 0.25, y1: 1.65, arch: 'round' }], color: p.stone, color2: p.stone2, course: 0.42 });
  masonry(kit, rng, { axis: 'x', at: mz - md / 2, from: -mw / 2, to: mw / 2, thick: 0.35, height: H, base: 0.25, color: p.stone, color2: p.stone2, course: 0.42 });
  for (const x of [-mw / 2, mw / 2]) masonry(kit, rng, { axis: 'z', at: x, from: mz - md / 2, to: mz + md / 2, thick: 0.35, height: H, base: 0.25, profile: x > 0 ? brokenProfile(rng, 0.35) : () => 1, color: p.stone, color2: p.stone2, course: 0.42 });
  arch(kit, 0, mz + md / 2 + 0.05, 'x', mw * 0.34, 1.65 - mw * 0.17, 0.16, 0.42, 'round', p.trim);
  // 屋頂板與山花（三角形）
  const roofY = H + 0.25;
  kit.block(-mw / 2 - 0.2, mw / 2 + 0.2, roofY, roofY + 0.18, mz - md / 2 - 0.2, mz + md / 2 + 0.2, p.trim, p.stone);
  const pz = mz + md / 2 + 0.2;
  kit.triangle([-mw / 2 - 0.2, roofY + 0.18, pz], [mw / 2 + 0.2, roofY + 0.18, pz], [0, roofY + 0.9, pz], p.trim);
  kit.triangle([-mw / 2 - 0.2, roofY + 0.18, pz], [0, roofY + 0.9, pz], [0, roofY + 0.9, mz - md / 2 - 0.2], p.stone2);
  kit.triangle([mw / 2 + 0.2, roofY + 0.18, pz], [mw / 2 + 0.2, roofY + 0.18, mz - md / 2 - 0.2], [0, roofY + 0.9, mz - md / 2 - 0.2], p.stone);
  kit.quad([0, roofY + 0.9, pz], [mw / 2 + 0.2, roofY + 0.18, pz], [mw / 2 + 0.2, roofY + 0.18, mz - md / 2 - 0.2], [0, roofY + 0.9, mz - md / 2 - 0.2], p.stone, 0.15, false);
  // 十字架
  kit.beam([0, roofY + 0.9, pz - 0.1], [0, roofY + 1.6, pz - 0.1], 0.12, 0.12, p.trim);
  kit.beam([-0.24, roofY + 1.35, pz - 0.1], [0.24, roofY + 1.35, pz - 0.1], 0.1, 0.1, p.trim);
  stairs(kit, -0.6, 0.6, mz + md / 2 + 0.18, 0.25, 2, 0.3, [p.stone2, p.stone]);
  // 方尖碑
  for (const side of [-1, 1]) {
    const ox = side * (mw / 2 + 1.1);
    const oz = mz + md / 2 + 0.4;
    const oh = rng.range(2.2, 3);
    const broken = rng.chance(0.4);
    kit.block(ox - 0.4, ox + 0.4, 0, 0.3, oz - 0.4, oz + 0.4, p.stone2, p.stone);
    const top = broken ? oh * rng.range(0.5, 0.75) : oh;
    kit.hexa(
      [
        [ox - 0.24, 0.3, oz - 0.24],
        [ox + 0.24, 0.3, oz - 0.24],
        [ox + 0.24, 0.3, oz + 0.24],
        [ox - 0.24, 0.3, oz + 0.24],
        [ox - 0.17 + (broken ? 0.02 : 0), top, oz - 0.17],
        [ox + 0.17, top + (broken ? 0.12 : 0), oz - 0.17],
        [ox + 0.17, top, oz + 0.17],
        [ox - 0.17, top - (broken ? 0.1 : 0), oz + 0.17],
      ],
      p.stone,
      p.stone2,
    );
    if (!broken) kit.pyramid(ox, oz, top, 0.17, 0.35, p.trim);
    else rubble(kit, rng, ox + side * 0.6, oz + 0.5, 0.5, 4, [p.stone, p.stone2]);
  }
  // 墓碑：前方幾排，有的歪、有的倒
  for (let row = 0; row < 3; row++) {
    const z = mz + md / 2 + 1.2 + row * 0.95;
    if (z > d / 2 - 0.3) break;
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.4; x += rng.range(0.7, 1.05)) {
      if (rng.chance(0.2)) continue;
      const fallen = rng.chance(0.25);
      const hgt = rng.range(0.45, 0.75);
      if (fallen) kit.stone([x, 0.06, z + 0.2], [0.42, 0.1, hgt], rng.range(-0.5, 0.5), 0, p.stone2, p.stone);
      else kit.stone([x, hgt / 2, z], [0.42, hgt, 0.12], rng.range(-0.2, 0.2), rng.range(-0.25, 0.25), p.stone, mixColor(p.stone, 0xffffff, 0.1));
    }
  }
  // 鐵柵欄的殘樁
  for (let x = -w / 2 + 0.3; x < w / 2; x += 0.35) if (rng.chance(0.6)) kit.beam([x, 0, d / 2 - 0.2], [x + rng.range(-0.08, 0.08), rng.range(0.3, 0.8), d / 2 - 0.2], 0.05, 0.05, 0x2e2c2a);
};

/** 尖拱教堂：長牆上的尖拱窗、高大的正面（玫瑰窗、尖拱門）、扶壁、尖塔 */
const cathedral: Recipe = (kit, rng, w, d, p) => {
  const nw = Math.min(4.6, w - 1.2);
  const z0 = -d / 2 + 0.6;
  const z1 = d / 2 - 0.8;
  const H = rng.range(2.6, 3.2);
  const len = z1 - z0;
  const windows = Math.max(2, Math.round(len / 1.6));
  const openings = Array.from({ length: windows }, (_, i): Opening => {
    const t = (i + 0.5) / windows;
    return { t0: t - 0.32 / windows, t1: t + 0.32 / windows, y0: 0.7, y1: 2.2, arch: 'pointed' };
  });
  for (const side of [-1, 1]) {
    masonry(kit, rng, { axis: 'z', at: (side * nw) / 2, from: z0, to: z1, thick: 0.38, height: H, profile: brokenProfile(rng, 0.7), openings, color: p.stone, color2: p.stone2 });
    // 扶壁
    for (let i = 0; i <= windows; i++) {
      const z = z0 + (i / windows) * len;
      const bh = H * rng.range(0.55, 0.9);
      kit.block((side * nw) / 2 + (side > 0 ? 0.18 : -0.75), (side * nw) / 2 + (side > 0 ? 0.75 : -0.18), 0, bh, z - 0.22, z + 0.22, p.stone2, p.stone);
      kit.pyramid((side * nw) / 2 + side * 0.46, z, bh, 0.24, 0.5, p.trim);
    }
  }
  // 正面
  const FH = H + 1.4;
  const facade = (t: number) => (t > 0.3 && t < 0.7 ? 1 : 0.78) * (t > 0.82 ? 0.55 : 1);
  masonry(kit, rng, {
    axis: 'x',
    at: z1,
    from: -nw / 2 - 0.2,
    to: nw / 2 + 0.2,
    thick: 0.42,
    height: FH,
    profile: facade,
    openings: [{ t0: 0.36, t1: 0.64, y0: 0, y1: 2.1, arch: 'pointed' }],
    color: p.stone,
    color2: p.stone2,
  });
  arch(kit, 0, z1 + 0.25, 'x', nw * 0.28 + 0.1, 2.1 - nw * 0.28 * 0.85, 0.16, 0.2, 'pointed', p.trim);
  // 玫瑰窗：一圈拱石與輻條
  const ry = FH - 0.95;
  const rr = 0.55;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    const at = (a: number, r: number): V3 => [Math.cos(a) * r, ry + Math.sin(a) * r, z1 + 0.24];
    kit.beam(at(a0, rr), at(a1, rr), 0.1, 0.12, p.trim);
    if (i % 2 === 0) kit.beam([0, ry, z1 + 0.24], at(a0, rr), 0.05, 0.06, p.trim);
  }
  kit.quad([-rr, ry - rr, z1 + 0.2], [rr, ry - rr, z1 + 0.2], [rr, ry + rr, z1 + 0.2], [-rr, ry + rr, z1 + 0.2], p.accent, 0, false);
  // 正面兩側的尖塔
  for (const side of [-1, 1]) {
    const x = side * (nw / 2 + 0.25);
    kit.block(x - 0.32, x + 0.32, 0, FH - 0.4, z1 - 0.3, z1 + 0.34, p.stone2, p.stone);
    if (side < 0 || rng.chance(0.5)) kit.pyramid(x, z1 + 0.02, FH - 0.4, 0.32, 1.3, p.trim);
    else rubble(kit, rng, x + 0.8, z1 + 0.9, 0.7, 7, [p.stone, p.trim]);
  }
  // 後殿：一排斷掉的尖拱
  for (let i = 0; i < 3; i++) {
    const x = -nw / 2 + 0.6 + i * ((nw - 1.2) / 2);
    kit.block(x - 0.18, x + 0.18, 0, 1.6, z0 - 0.18, z0 + 0.18, p.stone, p.stone);
  }
  arch(kit, -nw / 4 + 0.15, z0, 'x', (nw - 1.2) / 2 - 0.36, 1.6, 0.18, 0.3, 'pointed', p.stone, (i) => i > 5);
  flagstones(kit, rng, -nw / 2 + 0.25, nw / 2 - 0.25, z0 + 0.3, z1 - 0.3, 0, [p.floor, p.stone2], 0.7);
  // 長椅的殘骸
  for (let z = z0 + 1; z < z1 - 1; z += 0.8) {
    for (const side of [-1, 1]) if (rng.chance(0.55)) kit.stone([side * nw * 0.22, 0.18, z], [nw * 0.3, 0.1, 0.32], rng.range(-0.25, 0.25), rng.range(-0.15, 0.15), p.wood);
  }
  rubble(kit, rng, nw / 2 - 0.5, (z0 + z1) / 2, 1.2, 12, [p.stone, p.stone2]);
};

/** 礦城鍛造廠：磚牆、斷掉的磚造煙囪、熔爐（裡面還有餘燼）、木造屋架、礦車軌道 */
const foundry: Recipe = (kit, rng, w, d, p) => {
  const fw = Math.min(5, w - 1.4);
  const fd = Math.min(4.2, d - 2.2);
  const z0 = -d / 2 + 0.6;
  const z1 = z0 + fd;
  const H = 1.5;
  masonry(kit, rng, { axis: 'x', at: z0, from: -fw / 2, to: fw / 2, thick: 0.34, height: H, color: p.trim, color2: mixColor(p.trim, 0x000000, 0.2), course: 0.22 });
  masonry(kit, rng, { axis: 'z', at: -fw / 2, from: z0, to: z1, thick: 0.34, height: H, profile: brokenProfile(rng, 0.5), color: p.trim, color2: mixColor(p.trim, 0x000000, 0.2), course: 0.22 });
  masonry(kit, rng, { axis: 'z', at: fw / 2, from: z0, to: z1, thick: 0.34, height: H * 0.7, profile: brokenProfile(rng, 0.6), color: p.stone, color2: p.stone2 });
  // 熔爐：石頭圓頂，前面一個發光的爐口
  const ox = -fw / 2 + 1.3;
  const oz = z0 + 1.3;
  kit.block(ox - 1, ox + 1, 0, 0.6, oz - 1, oz + 1, p.stone2, p.stone);
  dome(kit, rng, ox, 0.6, oz, 0.95, p.stone, p.stone2);
  kit.quad([ox - 0.35, 0.65, oz + 0.99], [ox + 0.35, 0.65, oz + 0.99], [ox + 0.35, 1.15, oz + 0.99], [ox - 0.35, 1.15, oz + 0.99], p.accent, 0.2, false);
  kit.quad([ox - 0.3, 0.62, oz + 1.0], [ox + 0.3, 0.62, oz + 1.0], [ox + 0.3, 0.7, oz + 1.4], [ox - 0.3, 0.7, oz + 1.4], mixColor(p.accent, 0x000000, 0.3), 0.2, false);
  // 煙囪（方形磚造，頂端斷裂）
  const cx = -fw / 2 + 0.5;
  const cz = z0 + 0.3;
  const CH = rng.range(3.4, 4.2);
  for (let y = 0; y < CH; y += 0.22) {
    const ring = 0.42 - (y / CH) * 0.08;
    if (y > CH - 0.6 && rng.chance(0.5)) continue;
    for (let s = 0; s < 4; s++) {
      if (y > CH - 0.9 && s === 2) continue;
      const brick = rng.chance(0.5) ? p.trim : mixColor(p.trim, 0x000000, 0.25);
      if (s === 0) kit.block(cx - ring, cx + ring, y, y + 0.2, cz - ring, cz - ring + 0.16, brick);
      if (s === 1) kit.block(cx + ring - 0.16, cx + ring, y, y + 0.2, cz - ring, cz + ring, brick);
      if (s === 2) kit.block(cx - ring, cx + ring, y, y + 0.2, cz + ring - 0.16, cz + ring, brick);
      if (s === 3) kit.block(cx - ring, cx - ring + 0.16, y, y + 0.2, cz - ring, cz + ring, brick);
    }
  }
  // 屋架（只剩木頭骨架）
  const ridge = H + 1.2;
  for (let i = 0; i <= 3; i++) {
    const z = z0 + (i / 3) * fd;
    if (i > 0 && rng.chance(0.3)) continue;
    kit.beam([-fw / 2, H, z], [0, ridge, z], 0.12, 0.12, p.wood);
    if (rng.chance(0.7)) kit.beam([0, ridge, z], [fw / 2, H, z], 0.12, 0.12, p.wood);
    kit.beam([fw / 2 - 0.1, 0, z], [fw / 2 - 0.1, H, z], 0.16, 0.16, p.wood);
  }
  kit.beam([0, ridge, z0], [0, ridge - 0.3, z1 - 0.5], 0.12, 0.12, p.wood);
  // 鐵砧
  kit.block(0.6, 1.1, 0, 0.35, z1 - 1.2, z1 - 0.9, p.wood);
  kit.block(0.45, 1.25, 0.35, 0.55, z1 - 1.22, z1 - 0.88, 0x3a3a40, 0x5a5a62);
  // 礦車軌道與翻倒的礦車
  for (const off of [-0.32, 0.32]) kit.beam([w / 2 - 1.3 + off, 0.05, -d / 2 + 0.4], [w / 2 - 1.3 + off, 0.05, d / 2 - 0.3], 0.06, 0.08, 0x4a4a50);
  for (let z = -d / 2 + 0.5; z < d / 2 - 0.3; z += 0.45) kit.block(w / 2 - 1.75, w / 2 - 0.85, 0, 0.05, z, z + 0.16, p.wood);
  kit.stone([w / 2 - 1.1, 0.35, d / 2 - 1.4], [0.8, 0.55, 1.1], 0.3, 0.5, 0x4a4446, 0x3a3436);
  rubble(kit, rng, 0.6, z1 + 0.5, 1.1, 12, [p.trim, p.stone2, 0x2a2624]);
};

/** 要塞城樓：兩座圓塔（城垛）、中間的城門牆、紅色旗幟 */
const citadel: Recipe = (kit, rng, w, d, p) => {
  const gap = Math.min(3.4, w - 3.4);
  const tz = rng.range(-0.4, 0.4);
  const towerH = [rng.range(3.4, 4.3), rng.range(2.4, 3.6)];
  const tr = 1.05;
  [-1, 1].forEach((side, k) => {
    const cx = side * (gap / 2 + tr * 0.7);
    const H = towerH[k]!;
    // 圓塔：一圈圈石塊
    const ringCount = 12;
    for (let y = 0, row = 0; y < H; y += 0.34, row++) {
      for (let i = 0; i < ringCount; i++) {
        const a0 = ((i + (row % 2) * 0.5) / ringCount) * Math.PI * 2;
        const a1 = a0 + ((Math.PI * 2) / ringCount) * 0.95;
        if (y > H - 0.9 && hash(i + row * 13, k) < 0.35) continue;
        const pt = (a: number, r: number, yy: number): V3 => [cx + Math.cos(a) * r, yy, tz + Math.sin(a) * r];
        const color = hash(i * 7 + row, k + 3) < 0.5 ? p.stone : p.stone2;
        kit.hexa([pt(a0, tr - 0.3, y), pt(a1, tr - 0.3, y), pt(a1, tr, y), pt(a0, tr, y), pt(a0, tr - 0.3, y + 0.32), pt(a1, tr - 0.3, y + 0.32), pt(a1, tr, y + 0.32), pt(a0, tr, y + 0.32)], color, mixColor(color, 0xffffff, 0.08));
      }
    }
    // 城垛
    for (let i = 0; i < 10; i += 2) {
      if (k === 1 && hash(i, 9) < 0.4) continue;
      const a0 = (i / 10) * Math.PI * 2;
      const a1 = ((i + 1) / 10) * Math.PI * 2;
      const pt = (a: number, r: number, yy: number): V3 => [cx + Math.cos(a) * r, yy, tz + Math.sin(a) * r];
      kit.hexa([pt(a0, tr - 0.25, H), pt(a1, tr - 0.25, H), pt(a1, tr + 0.08, H), pt(a0, tr + 0.08, H), pt(a0, tr - 0.25, H + 0.4), pt(a1, tr - 0.25, H + 0.4), pt(a1, tr + 0.08, H + 0.4), pt(a0, tr + 0.08, H + 0.4)], p.stone, p.trim);
    }
    // 箭孔
    kit.quad([cx + 0.05, H * 0.55, tz + tr + 0.01], [cx + 0.15, H * 0.55, tz + tr + 0.01], [cx + 0.15, H * 0.55 + 0.45, tz + tr + 0.01], [cx + 0.05, H * 0.55 + 0.45, tz + tr + 0.01], 0x141418, 0, false);
    banner(kit, rng, cx + side * 0.1, H - 0.3, tz + tr + 0.06, 'x', 0.6, 1.3, p.accent, p.trim);
  });
  // 城門牆
  const wallH = Math.min(...towerH) - 0.6;
  masonry(kit, rng, { axis: 'x', at: tz + 0.2, from: -gap / 2 - 0.3, to: gap / 2 + 0.3, thick: 0.6, height: wallH, profile: brokenProfile(rng, 0.35), openings: [{ t0: 0.3, t1: 0.7, y0: 0, y1: 2.1, arch: 'round' }], color: p.stone, color2: p.stone2, course: 0.34 });
  const span = (gap + 0.6) * 0.4;
  arch(kit, 0, tz + 0.52, 'x', span, 2.1 - span / 2, 0.2, 0.1, 'round', p.trim);
  // 落下一半的鐵柵門
  for (let x = -span / 2 + 0.12; x < span / 2; x += 0.24) kit.beam([x, rng.range(0.5, 0.9), tz + 0.45], [x, 2.1 - span / 2 + Math.sqrt(Math.max(0, (span / 2) ** 2 - x * x)) - 0.05, tz + 0.45], 0.05, 0.05, 0x2e2e34);
  // 城門前的石板路與兩側的城牆殘段
  flagstones(kit, rng, -span / 2 - 0.2, span / 2 + 0.2, tz + 0.6, d / 2 - 0.2, 0, [p.floor, p.stone2], 0.8);
  for (const side of [-1, 1]) masonry(kit, rng, { axis: 'z', at: side * (w / 2 - 0.4), from: tz - d / 2 + 0.8, to: tz + 0.8, thick: 0.5, height: 1.4, profile: brokenProfile(rng, 0.7), color: p.stone, color2: p.stone2 });
  rubble(kit, rng, gap / 2 + 1.4, tz + 1.8, 1.2, 14, [p.stone, p.stone2]);
};

/** 王宮：台座、大階梯、凹槽圓柱的列柱（有的斷了、倒在地上）、橫樑、後牆、破了一角的圓頂、旗幟 */
const palace = (deep: boolean): Recipe => (kit, rng, w, d, p) => {
  const base = 0.55;
  const x0 = -w / 2 + 0.4;
  const x1 = w / 2 - 0.4;
  const z0 = -d / 2 + 0.4;
  const z1 = d / 2 - 1.6;
  kit.block(x0, x1, 0, base, z0, z1, p.stone2, p.stone);
  // 台座邊緣的金色飾條
  kit.block(x0 - 0.05, x1 + 0.05, base - 0.08, base + 0.02, z1 - 0.06, z1 + 0.04, p.trim, p.trim);
  flagstones(kit, rng, x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, base, [p.floor, p.stone, mixColor(p.floor, 0xffffff, 0.12)], 0.92);
  // 大階梯
  const sw = Math.min(3.2, (x1 - x0) * 0.5);
  stairs(kit, -sw / 2, sw / 2, z1, base, 4, 0.3, [p.stone, p.stone2]);
  for (const side of [-1, 1]) kit.block(side * (sw / 2) - (side > 0 ? 0 : 0.3), side * (sw / 2) + (side > 0 ? 0.3 : 0), 0, base + 0.25, z1, z1 + 1.2, p.stone2, p.trim);
  // 後牆
  const H = deep ? 3.6 : 3.2;
  masonry(kit, rng, { axis: 'x', at: z0 + 0.3, from: x0 + 0.2, to: x1 - 0.2, thick: 0.45, height: H, base, profile: brokenProfile(rng, 0.45), openings: [{ t0: 0.42, t1: 0.58, y0: base, y1: base + 2.3, arch: 'round' }], color: p.stone, color2: p.stone2, course: 0.42 });
  // 列柱：前排（深淵的宮殿是雙排）
  const rows = deep ? [z1 - 0.6, z1 - 1.8] : [z1 - 0.7];
  const colH = H - 0.2;
  const count = Math.max(4, Math.round((x1 - x0) / 1.25));
  rows.forEach((z, r) => {
    let intact: number[] = [];
    for (let i = 0; i < count; i++) {
      const x = x0 + 0.55 + (i / (count - 1)) * (x1 - x0 - 1.1);
      const broken = rng.chance(r === 0 ? 0.4 : 0.3);
      column(kit, rng, x, z, base, colH, 0.24, p, true, broken);
      if (!broken) intact.push(x);
      else intact = [];
      // 相鄰兩根完整的柱子之間還架著橫樑
      if (intact.length >= 2) {
        const a = intact[intact.length - 2]!;
        kit.block(a - 0.3, x + 0.3, base + colH, base + colH + 0.36, z - 0.32, z + 0.32, p.stone, p.stone);
        kit.block(a - 0.32, x + 0.32, base + colH + 0.08, base + colH + 0.16, z + 0.3, z + 0.34, p.trim, p.trim);
      }
    }
  });
  // 圓頂（立在後牆前的鼓座上）
  const dz = z0 + Math.min(2.2, d * 0.28);
  const dr = Math.min(1.9, w * 0.2);
  const drumH = H - 0.4;
  for (let y = base, row = 0; y < base + drumH; y += 0.42, row++) {
    for (let i = 0; i < 16; i++) {
      const a0 = ((i + (row % 2) * 0.5) / 16) * Math.PI * 2;
      const a1 = a0 + ((Math.PI * 2) / 16) * 0.95;
      const pt = (a: number, rr: number, yy: number): V3 => [Math.cos(a) * rr, yy, dz + Math.sin(a) * rr];
      if (Math.sin(a0) > 0.35 && y < base + 2) continue;
      const color = hash(i + row * 17, 4) < 0.5 ? p.stone : p.stone2;
      kit.hexa([pt(a0, dr - 0.25, y), pt(a1, dr - 0.25, y), pt(a1, dr, y), pt(a0, dr, y), pt(a0, dr - 0.25, y + 0.4), pt(a1, dr - 0.25, y + 0.4), pt(a1, dr, y + 0.4), pt(a0, dr, y + 0.4)], color, mixColor(color, 0xffffff, 0.08));
    }
  }
  dome(kit, rng, 0, base + drumH, dz, dr, deep ? p.roof : mixColor(p.stone, 0x000000, 0.1), p.trim);
  // 旗幟
  for (const side of [-1, 1]) banner(kit, rng, side * (w * 0.28), base + H - 0.2, z0 + 0.56, 'x', 0.55, 1.6, p.accent, p.trim);
  if (deep) {
    // 王座台與王座
    kit.block(-0.9, 0.9, base, base + 0.3, dz - 0.6, dz + 0.6, p.stone2, p.trim);
    kit.block(-0.45, 0.45, base + 0.3, base + 0.7, dz - 0.4, dz + 0.1, p.trim, p.trim);
    kit.block(-0.45, 0.45, base + 0.3, base + 1.7, dz - 0.5, dz - 0.32, p.trim, p.trim);
    kit.pyramid(0, dz - 0.41, base + 1.7, 0.2, 0.4, p.trim);
    // 冒出來的紫水晶
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      const cx = Math.cos(a) * rng.range(1, w * 0.4);
      const cz = dz + 1.5 + Math.sin(a) * rng.range(0.4, 1.2);
      kit.pyramid(cx, cz, base, 0.12, rng.range(0.5, 1.1), p.accent);
    }
  } else {
    // 石獅（大略的形狀）坐在階梯兩旁
    for (const side of [-1, 1]) {
      const lx = side * (sw / 2 + 0.15);
      kit.stone([lx, base + 0.5, z1 + 0.35], [0.4, 0.5, 0.75], 0, 0, p.stone, p.stone);
      kit.stone([lx, base + 0.88, z1 + 0.6], [0.38, 0.38, 0.36], 0, 0.2, p.stone, p.stone);
    }
  }
  rubble(kit, rng, x1 - 1, z1 + 0.6, 1.1, 12, [p.stone, p.stone2, p.trim]);
};

const RECIPES: Record<RuinEra, Recipe> = {
  hamlet,
  necropolis,
  cathedral,
  foundry,
  citadel,
  palace: palace(false),
  sanctum_palace: palace(true),
};

/** 一棟建築的所有三角形 */
export function buildingTriangles(b: RuinBuilding, era: RuinEra, rock: number, push: PushTriangle): void {
  const angle = (b.facing * Math.PI) / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // 本地 +z（正面）→ facing 方向：0 = +Y、1 = +X、2 = -Y、3 = -X（Three.js 的 Z = World y）
  const rotate = (v: V3): V3 => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  const toWorld = (v: V3): V3 => {
    const r = rotate(v);
    return [b.x + r[0], r[1] - 0.15, b.y + r[2]];
  };
  const kit = new Kit(push, toWorld, rotate, b.seed);
  const rng = new Rng(b.seed);
  // 轉 90 度時占地的寬、深互換
  const [w, d] = b.facing % 2 === 0 ? [b.w, b.d] : [b.d, b.w];
  rockSkirt(kit, rng, w, d, rock, b.kind === 'void');
  RECIPES[era](kit, rng, w, d, PALETTES[era], rock);
  if (b.kind === 'wall') frontage(kit, rng, era, w, d, PALETTES[era]);
}

/** 建築的大約高度（判斷擋住玩家時變半透明用） */
export const BUILDING_HEIGHT = 4.5;

// ─────────────────────────── 石頭地板 ───────────────────────────

/** 一塊石頭地板：在圓形範圍內鋪交錯的石板，只鋪在地板格上（離牆 0.2 以上），邊緣參差、偶有缺塊與裂開 */
export function patchTriangles(patch: StonePatch, era: RuinEra, walkable: (x: number, y: number) => boolean, push: PushTriangle): void {
  const p = PALETTES[era];
  const rng = new Rng(patch.seed);
  const kit = new Kit(push, (v) => v, (n) => n, patch.seed);
  const colors = [p.floor, mixColor(p.floor, 0xffffff, 0.1), mixColor(p.floor, 0x000000, 0.12), p.stone2];
  const r = patch.radius;
  const along = rng.chance(0.5);
  for (let v = -r; v < r; ) {
    const dv = rng.range(0.38, 0.6);
    let u = -r - rng.range(0, 0.4);
    while (u < r) {
      const du = rng.range(0.42, 0.8);
      const cu = u + du / 2;
      const cv = v + dv / 2;
      u += du;
      const edge = r * (0.75 + hash(Math.round(cu * 10) + Math.round(cv * 10) * 97, patch.seed) * 0.35);
      if (Math.hypot(cu, cv) > edge || rng.chance(0.08)) continue;
      const [x0, x1, y0, y1] = along ? [cu - du / 2, cu + du / 2, cv - dv / 2, cv + dv / 2] : [cv - dv / 2, cv + dv / 2, cu - du / 2, cu + du / 2];
      const wx0 = patch.x + x0 + 0.025;
      const wx1 = patch.x + x1 - 0.025;
      const wy0 = patch.y + y0 + 0.025;
      const wy1 = patch.y + y1 - 0.025;
      const ok = [wx0 - 0.15, wx1 + 0.15].every((x) => [wy0 - 0.15, wy1 + 0.15].every((y) => walkable(x, y)));
      if (!ok) continue;
      const h = rng.range(0.012, 0.035);
      const color = rng.pick(colors);
      const top = mixColor(color, 0xffffff, 0.05);
      if (rng.chance(0.15)) {
        // 裂成兩半，一半下沉一點
        const mid = (wx0 + wx1) / 2 + rng.range(-0.08, 0.08);
        kit.block(wx0, mid - 0.02, -0.02, h, wy0, wy1, color, top, 0.25);
        kit.block(mid + 0.02, wx1, -0.02, h * 0.4, wy0, wy1, color, mixColor(top, 0x000000, 0.1), 0.25);
      } else {
        kit.block(wx0, wx1, -0.02, h, wy0, wy1, color, top, 0.25);
      }
    }
    v += dv;
  }
}

// ─────────────────────────── 骷髏 ───────────────────────────

/** PolyFigure 的模型座標 → World（與 ThreeWorld 的 FIGURE_SCALE 相同） */
const PX_PER_UNIT = 32 * Math.SQRT2;
const PX_PER_HEIGHT = 16 * Math.sqrt(6);
const MODEL_HEIGHT = 0.94 / PX_PER_HEIGHT;
/** 骷髏貼在地上、光影不明顯，只上白色（設計者 2026-11-19） */
const BONE_WHITE = 0xf2efe6;
const BONE_GRAY = 0xa8a49a;

/**
 * 地上的骷髏：直接用遊戲裡的骷髏戰士與縮小 20% 的重甲骷髏（設計者 2026-11-19），
 * 躺著的用模型的死亡姿勢（和倒下的怪物一樣），坐著的用靠牆坐姿（第 18 層的女屍）。
 * 姿勢只算一次，三角形併進地面的靜態網格。
 */
const REMAINS = [
  { id: 'enemy.skeleton', radius: 0.32 },
  { id: 'enemy.skeleton', radius: 0.32 },
  { id: 'enemy.armored_skeleton', radius: 0.42 * 0.8 },
] as const;

export function skeletonTriangles(s: SkeletonRemains, push: PushTriangle): void {
  const kind = REMAINS[s.seed % REMAINS.length]!;
  const model = MONSTER_MODELS[kind.id] ?? DEFAULT_MONSTER_MODEL;
  const figure = new PolyFigure(model, figureScale(model, kind.radius * s.size));
  const map = (v: V3): V3 => [s.x + v[0] / PX_PER_UNIT, v[1] * MODEL_HEIGHT, s.y + v[2] / PX_PER_UNIT];
  figure.sink = {
    begin() {},
    triangle(a, b, c, color) {
      // 一律上成白色：原本暗的地方（盔甲、破布）只稍微灰一點，看得出形狀
      const lum = (((color >> 16) & 0xff) * 0.3 + ((color >> 8) & 0xff) * 0.59 + (color & 0xff) * 0.11) / 255;
      push(map(a), map(b), map(c), mixColor(BONE_WHITE, BONE_GRAY, (1 - lum) * 0.55));
    },
    end() {},
  };
  const facing = { x: Math.cos(s.angle), y: Math.sin(s.angle) };
  if (s.pose === 'sit') figure.showPose(SEATED_AGAINST_WALL, facing);
  // 倒下的過程走完，停在死亡姿勢
  else figure.update(5, { facing, moving: false, alive: false });
}

/** 整層的遺跡三角形：每棟建築一組（擋住玩家時變半透明）；石板一組；骷髏另一組（白色、幾乎不受光影影響） */
export function ruinsTriangles(layout: RuinsLayout, rock: number, walkable: (x: number, y: number) => boolean) {
  return {
    buildings: layout.buildings.map((b) => ({ building: b, build: (push: PushTriangle) => buildingTriangles(b, layout.era, rock, push) })),
    ground: (push: PushTriangle) => {
      for (const p of layout.patches) patchTriangles(p, layout.era, walkable, push);
    },
    remains: (push: PushTriangle) => {
      for (const s of layout.skeletons) skeletonTriangles(s, push);
    },
  };
}
