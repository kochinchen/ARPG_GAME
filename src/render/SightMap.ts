import type { Vec2 } from '../core/math/Vec2';
import type { NavGrid } from '../game/movement/NavGrid';

/**
 * 主角的視線（設計者 2026-11-21）：牆會擋住視線，畫面上只看得到視線內的怪物與投射物，
 * 隔壁通道裡的怪物看不到。地形分三種：視線內（正常亮度）、來過但現在看不到（變暗，只剩地形）、
 * 從沒看過（全黑）。小地圖也只揭開看過的地方。只影響畫面，怪物的索敵本來就要有視線（IdleState）。
 */
export const SIGHT = {
  /** 視線的距離（World）：燭光亮區半徑 × reach，至少 min */
  reach: 1.35,
  min: 14,
  /** 來過但現在看不到的地方的亮度（× 原本的顏色） */
  seen: 0.38,
  /** 視線半徑這個比例以外漸暗到 seen（邊緣柔和） */
  edge: 0.8,
  /** 亮度每秒變化多少（0～1；走進、走出視線時淡入淡出） */
  fadeSpeed: 5,
  /**
   * 房間裡的石柱、石塊（相連的牆格少於這個數量的小塊）不擋視線：
   * 擋住的話每根柱子後面都拖一條全黑的影子，房間被切得很碎；通道之間的牆都和外圍相連，照樣擋住
   */
  pillarCells: 48,
};

/** 視線半徑（World）：隨燭光（等級）變大 */
export function sightRadius(lightRadius: number): number {
  return Math.max(SIGHT.min, lightRadius * SIGHT.reach);
}

const SEEN = Math.round(SIGHT.seen * 255);

/** 八個方向的座標轉換（遞迴陰影投射） */
const OCTANTS: readonly (readonly [number, number, number, number])[] = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

export class SightMap {
  readonly width: number;
  readonly height: number;
  /** 每格的目標亮度（0 從沒看過、SEEN 看過、到 255 視線內） */
  private readonly target: Uint8Array;
  /** 每格目前的亮度（往 target 淡入淡出；Three.js 地形的迷霧貼圖直接用這個） */
  readonly fog: Uint8Array;
  /** 曾經看過的格子 */
  private readonly seenCells: Uint8Array;
  /** 目前在視線內的格子（下次重算時把它們退回「看過」） */
  private visibleList: number[] = [];
  /** 亮度還沒到目標的格子 */
  private active: number[] = [];
  private readonly inActive: Uint8Array;
  /** 擋視線的格子（牆，但不含房間裡的小石柱） */
  private readonly blocks: Uint8Array;
  /** 這次新看到的格子（小地圖揭開用；讀了就清空） */
  private fresh: number[] = [];
  private lastCell = -1;
  private lastRadius = -1;
  /** fog 有變動（Three.js 要重新上傳貼圖） */
  dirty = true;

  constructor(private readonly nav: NavGrid) {
    this.width = nav.width;
    this.height = nav.height;
    const n = this.width * this.height;
    this.target = new Uint8Array(n);
    this.fog = new Uint8Array(n);
    this.seenCells = new Uint8Array(n);
    this.inActive = new Uint8Array(n);
    this.blocks = blockingWalls(nav);
  }

  get cell(): number {
    return this.nav.cell;
  }

  /** 每幀呼叫：主角換格子或視線半徑改變時重算視線，並讓亮度淡入淡出 */
  update(player: Vec2, radius: number, dt: number): void {
    const c = this.nav.cellOf(player);
    const index = c.y * this.width + c.x;
    if (index !== this.lastCell || radius !== this.lastRadius) {
      this.lastCell = index;
      this.lastRadius = radius;
      this.recompute(c.x, c.y, radius / this.nav.cell);
    }
    this.fade(dt);
  }

  /** 第一次（剛進樓層、傳送）直接到位，不淡入 */
  snap(): void {
    for (const i of this.active) {
      this.fog[i] = this.target[i]!;
      this.inActive[i] = 0;
    }
    this.active = [];
    this.dirty = true;
  }

  /** World 座標現在在不在視線內 */
  isVisible(p: Vec2): boolean {
    const i = this.indexOf(p);
    return i >= 0 && this.target[i]! > SEEN;
  }

  /** World 座標曾經看過嗎（寶箱、火把等擺設看過才顯示） */
  wasSeen(p: Vec2): boolean {
    const i = this.indexOf(p);
    return i >= 0 && this.seenCells[i] === 1;
  }

  /** 這次新看到的格子（index = y × width + x）；讀了就清空 */
  takeFresh(): number[] {
    const out = this.fresh;
    this.fresh = [];
    return out;
  }

  private indexOf(p: Vec2): number {
    const x = Math.floor(p.x / this.nav.cell);
    const y = Math.floor(p.y / this.nav.cell);
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? -1 : y * this.width + x;
  }

  private opaque(x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= this.width || y >= this.height || this.blocks[y * this.width + x] === 1;
  }

  private recompute(ox: number, oy: number, r: number): void {
    for (const i of this.visibleList) this.setTarget(i, SEEN);
    this.visibleList = [];
    this.light(ox, oy, 0, r);
    for (const [xx, xy, yx, yy] of OCTANTS) this.cast(ox, oy, 1, 1, 0, r, xx, xy, yx, yy);
  }

  /** 一格進入視線：亮度依距離（邊緣漸暗），第一次看到就記下 */
  private light(x: number, y: number, d: number, r: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    const t = d / r;
    const k = t <= SIGHT.edge ? 1 : 1 - (t - SIGHT.edge) / (1 - SIGHT.edge);
    const value = Math.max(SEEN + 1, Math.round(SEEN + (255 - SEEN) * k));
    // 同一格從不同方向看到：取較亮的
    if (this.target[i]! <= SEEN) this.visibleList.push(i);
    else if (this.target[i]! >= value) return;
    this.setTarget(i, value);
    if (!this.seenCells[i]) {
      this.seenCells[i] = 1;
      this.fresh.push(i);
    }
  }

  private setTarget(i: number, value: number): void {
    this.target[i] = value;
    if (this.fog[i] !== value && !this.inActive[i]) {
      this.inActive[i] = 1;
      this.active.push(i);
    }
  }

  /** 遞迴陰影投射（Björn Bergström）：一個八分之一圓，牆擋住後面的格子；牆本身看得到 */
  private cast(ox: number, oy: number, row: number, start: number, end: number, r: number, xx: number, xy: number, yx: number, yy: number): void {
    if (start < end) return;
    const r2 = r * r;
    let newStart = 0;
    for (let j = row; j <= Math.ceil(r); j++) {
      let blocked = false;
      for (let dx = -j, dy = -j; dx <= 0; dx++) {
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        const x = ox + dx * xx + dy * xy;
        const y = oy + dx * yx + dy * yy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) this.light(x, y, Math.sqrt(d2), r);
        const wall = this.opaque(x, y);
        if (blocked) {
          if (wall) {
            newStart = rSlope;
            continue;
          }
          blocked = false;
          start = newStart;
        } else if (wall && j < r) {
          blocked = true;
          this.cast(ox, oy, j + 1, start, lSlope, r, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  }

  private fade(dt: number): void {
    if (this.active.length === 0) return;
    const step = Math.max(1, Math.round(SIGHT.fadeSpeed * 255 * dt));
    const still: number[] = [];
    for (const i of this.active) {
      const t = this.target[i]!;
      const f = this.fog[i]!;
      const next = f < t ? Math.min(t, f + step) : Math.max(t, f - step);
      this.fog[i] = next;
      if (next === t) this.inActive[i] = 0;
      else still.push(i);
    }
    this.active = still;
    this.dirty = true;
  }
}

/** 擋視線的牆：所有牆格，扣掉相連（上下左右）格數少於 SIGHT.pillarCells、又不碰地圖邊緣的小塊 */
function blockingWalls(nav: NavGrid): Uint8Array {
  const w = nav.width;
  const h = nav.height;
  const blocks = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (visited[start] || nav.isWalkable(start % w, Math.floor(start / w))) continue;
    const group: number[] = [];
    let edge = false;
    visited[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      const x = i % w;
      const y = Math.floor(i / w);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (visited[j] || nav.isWalkable(nx, ny)) continue;
        visited[j] = 1;
        stack.push(j);
      }
    }
    if (edge || group.length >= SIGHT.pillarCells) for (const i of group) blocks[i] = 1;
  }
  return blocks;
}
