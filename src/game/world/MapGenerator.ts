import type { Rng } from '../../core/Rng';
import { MAP_TILES, type MapDef } from '../../data/schema/map';
import type { LayoutDef } from '../../data/schema/floor';

/**
 * 地牢產生器（純函式，同一個 Rng 狀態一定產生同一張地圖）：
 * 1. 放置不規則的房間（矩形大廳、圓形洞窟、十字形）
 * 2. 以最小生成樹 + 幾條額外通道，用彎曲的隧道連接房間
 * 3. 邊緣隨機侵蝕後平滑（細胞自動機），做出不規則的牆面
 * 4. 「開運算」：只保留能放進 3×3 空地的格子，保證通道至少 3 格寬（cellSize 0.5 時 = 1.5 Tile）
 * 5. 只保留最大的連通區域，放置樓梯口（S）、中途存檔點（M）、出口（X）
 */

/** 產生器版本：演算法改變時 + 1，讓舊存檔的樓層判定為佈局不符而重新生成 */
export const GENERATOR_VERSION = 1;

export function generatedMapId(floor: number): string {
  return `map.generated.v${GENERATOR_VERSION}.f${floor}`;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

const WALL = 1;
const FLOOR = 0;

export function generateMap(id: string, rng: Rng, layout: LayoutDef): MapDef {
  // 極少數情況（房間太少、連不起來）重試
  for (let attempt = 0; attempt < 8; attempt++) {
    const map = tryGenerate(id, rng, layout);
    if (map) return map;
  }
  throw new Error(`map generation failed: ${id}`);
}

function tryGenerate(id: string, rng: Rng, layout: LayoutDef): MapDef | null {
  const W = Math.round(layout.width / layout.cellSize);
  const H = Math.round(layout.height / layout.cellSize);
  const grid = new Uint8Array(W * H).fill(WALL);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? WALL : grid[y * W + x]!);
  const set = (x: number, y: number, v: number) => {
    if (x > 1 && y > 1 && x < W - 2 && y < H - 2) grid[y * W + x] = v;
  };

  // ── 1. 房間 ──
  const rooms: Room[] = [];
  const target = rng.int(layout.rooms[0], layout.rooms[1]);
  for (let tries = 0; tries < 900 && rooms.length < target; tries++) {
    const w = rng.int(14, 36);
    const h = rng.int(12, 28);
    const x = rng.int(4, W - w - 5);
    const y = rng.int(4, H - h - 5);
    if (rooms.some((r) => x < r.x + r.w + 6 && x + w + 6 > r.x && y < r.y + r.h + 6 && y + h + 6 > r.y)) continue;
    const room: Room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    rooms.push(room);
    carveRoom(room, rng, set);
  }
  if (rooms.length < 6) return null;

  // ── 2. 通道：最小生成樹 + 額外通道 ──
  const dist = (a: Room, b: Room) => Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
  const connected = new Set([0]);
  const edges: [number, number][] = [];
  while (connected.size < rooms.length) {
    let best: [number, number, number] | null = null;
    for (const i of connected) {
      for (let j = 0; j < rooms.length; j++) {
        if (connected.has(j)) continue;
        const d = dist(rooms[i]!, rooms[j]!);
        if (!best || d < best[0]) best = [d, i, j];
      }
    }
    connected.add(best![2]);
    edges.push([best![1], best![2]]);
  }
  for (let k = 0; k < layout.loops; k++) {
    const i = rng.int(0, rooms.length - 1);
    const j = rng.int(0, rooms.length - 1);
    if (i !== j && dist(rooms[i]!, rooms[j]!) < 90) edges.push([i, j]);
  }
  for (const [i, j] of edges) carveTunnel(rooms[i]!, rooms[j]!, rng, set);

  // ── 3. 邊緣侵蝕 + 平滑 ──
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (at(x, y) === FLOOR && neighbors(at, x, y) > 0 && rng.chance(0.22)) set(x, y, WALL);
      else if (at(x, y) === WALL && neighbors(at, x, y) < 8 && rng.chance(0.18)) set(x, y, FLOOR);
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const copy = grid.slice();
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const walls = neighbors((xx, yy) => copy[yy * W + xx]!, x, y) + copy[y * W + x]!;
        grid[y * W + x] = walls >= 5 ? WALL : FLOOR;
      }
    }
  }

  // ── 4. 開運算：保證通道寬度 ≥ 3 格 ──
  const core = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      let open = true;
      for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1 && open; dx++) if (at(x + dx, y + dy) === WALL) open = false;
      if (open) core[y * W + x] = 1;
    }
  }
  const opened = new Uint8Array(W * H).fill(WALL);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!core[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) opened[(y + dy) * W + (x + dx)] = FLOOR;
    }
  }
  grid.set(opened);

  // ── 5. 最大連通區域 ──
  const region = largestRegion(grid, W, H);
  if (!region) return null;
  for (let i = 0; i < grid.length; i++) if (!region.has(i)) grid[i] = WALL;

  // 大房間放柱子（2×2，間距夠寬，不會擋住通道）
  for (const r of rooms) {
    if (r.w < 26 || r.h < 20 || !rng.chance(0.55)) continue;
    for (let y = r.y + 5; y < r.y + r.h - 6; y += 8) {
      for (let x = r.x + 5; x < r.x + r.w - 6; x += 8) {
        let clear = true;
        for (let dy = -3; dy <= 4 && clear; dy++) for (let dx = -3; dx <= 4 && clear; dx++) if (at(x + dx, y + dy) === WALL) clear = false;
        if (clear) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) grid[(y + dy) * W + (x + dx)] = WALL;
      }
    }
  }

  // ── 6. 樓梯口、中途點、出口（只考慮還在連通區域內的房間） ──
  const floorCell = (x: number, y: number) => nearestFloor(grid, W, H, x, y);
  const reachable = rooms.filter((r) => floorCell(r.cx, r.cy) !== null);
  if (reachable.length < 6) return null;
  rooms.length = 0;
  rooms.push(...reachable);
  const startRoom = rooms.reduce((a, b) => (a.cx + a.cy * 1.3 < b.cx + b.cy * 1.3 ? a : b));
  const s = floorCell(startRoom.cx, startRoom.cy);
  if (s === null) return null;
  const { dist: d, prev } = bfs(grid, W, H, s);
  let far: number | null = null;
  for (const r of rooms) {
    const c = floorCell(r.cx, r.cy);
    if (c === null || d[c]! < 0) continue;
    if (far === null || d[c]! > d[far]!) far = c;
  }
  if (far === null || d[far]! < 80) return null;
  const path: number[] = [];
  for (let c: number = far; c !== s; c = prev[c]!) path.push(c);
  const half = path[Math.floor(path.length / 2)]!;
  let mid: number | null = null;
  for (const r of rooms) {
    const c = floorCell(r.cx, r.cy);
    if (c === null || c === s || c === far || d[c]! < 0) continue;
    const score = Math.abs((c % W) - (half % W)) + Math.abs(Math.floor(c / W) - Math.floor(half / W));
    const best = mid === null ? Infinity : Math.abs((mid % W) - (half % W)) + Math.abs(Math.floor(mid / W) - Math.floor(half / W));
    if (score < best) mid = c;
  }
  if (mid === null) return null;

  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      row += i === s ? MAP_TILES.spawn : i === mid ? MAP_TILES.midway : i === far ? MAP_TILES.exit : grid[i] === WALL ? MAP_TILES.wall : MAP_TILES.floor;
    }
    rows.push(row);
  }
  return { id, rows, cellSize: layout.cellSize, spawns: [], chests: [] };
}

/** 房間形狀：矩形大廳、圓形洞窟、十字形 */
function carveRoom(r: Room, rng: Rng, set: (x: number, y: number, v: number) => void): void {
  const shape = rng.int(0, 2);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const nx = (x - r.cx) / (r.w / 2);
      const ny = (y - r.cy) / (r.h / 2);
      const inside =
        shape === 0 ? true : shape === 1 ? nx * nx + ny * ny <= 1 : Math.abs(nx) < 0.38 || Math.abs(ny) < 0.38 || nx * nx + ny * ny < 0.35;
      if (inside) set(x, y, FLOOR);
    }
  }
}

/** 彎曲的隧道：往目標前進時隨機偏移，寬度 5～7 格（邊緣侵蝕後仍然夠寬） */
function carveTunnel(a: Room, b: Room, rng: Rng, set: (x: number, y: number, v: number) => void): void {
  let x = a.cx;
  let y = a.cy;
  const r = rng.int(3, 4);
  for (let steps = 0; steps < 2000 && (x !== b.cx || y !== b.cy); steps++) {
    for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) if (dx * dx + dy * dy < r * r) set(x + dx, y + dy, FLOOR);
    const towardX = rng.chance(Math.abs(b.cx - x) / (Math.abs(b.cx - x) + Math.abs(b.cy - y) + 0.001));
    if (rng.chance(0.2)) {
      // 隨機偏移：讓通道彎曲
      if (towardX) y += rng.chance(0.5) ? 1 : -1;
      else x += rng.chance(0.5) ? 1 : -1;
    } else if (towardX) x += Math.sign(b.cx - x);
    else y += Math.sign(b.cy - y);
  }
}

function neighbors(at: (x: number, y: number) => number, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === WALL) n++;
  return n;
}

function largestRegion(grid: Uint8Array, W: number, H: number): Set<number> | null {
  const seen = new Uint8Array(W * H);
  let best: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === WALL || seen[i]) continue;
    const region: number[] = [];
    const queue = [i];
    seen[i] = 1;
    while (queue.length) {
      const c = queue.pop()!;
      region.push(c);
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= grid.length || seen[n] || grid[n] === WALL) continue;
        if ((n === c - 1 || n === c + 1) && Math.floor(n / W) !== Math.floor(c / W)) continue;
        seen[n] = 1;
        queue.push(n);
      }
    }
    if (region.length > best.length) best = region;
  }
  return best.length > 0 ? new Set(best) : null;
}

function bfs(grid: Uint8Array, W: number, H: number, start: number): { dist: Int32Array; prev: Int32Array } {
  const dist = new Int32Array(W * H).fill(-1);
  const prev = new Int32Array(W * H).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]!;
    for (const n of [c - 1, c + 1, c - W, c + W]) {
      if (n < 0 || n >= grid.length || dist[n] !== -1 || grid[n] === WALL) continue;
      if ((n === c - 1 || n === c + 1) && Math.floor(n / W) !== Math.floor(c / W)) continue;
      dist[n] = dist[c]! + 1;
      prev[n] = c;
      queue.push(n);
    }
  }
  return { dist, prev };
}

/** 離 (x, y) 最近的地板格（房間中心可能剛好是柱子） */
function nearestFloor(grid: Uint8Array, W: number, H: number, x: number, y: number): number | null {
  for (let r = 0; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        // 放置記號的格子四周也要是地板（角色站得下）
        let ok = true;
        for (let ey = -1; ey <= 1 && ok; ey++) for (let ex = -1; ex <= 1 && ok; ex++) if (grid[(yy + ey) * W + (xx + ex)] === WALL) ok = false;
        if (ok) return yy * W + xx;
      }
    }
  }
  return null;
}
