import type { Rng } from '../../core/Rng';
import { MAP_TILES, type MapDef } from '../../data/schema/map';
import type { LayoutDef } from '../../data/schema/floor';

/**
 * 地牢產生器（純函式，同一個 Rng 狀態一定產生同一張地圖）：
 * 1. 放置不規則的房間（矩形大廳、圓形洞窟、十字形）
 * 2. 以最小生成樹 + 幾條額外通道，用彎曲的隧道連接房間
 * 3. 邊緣隨機侵蝕後平滑（細胞自動機），做出不規則的牆面
 * 4. 「開運算」：只保留能放進 5×5 空地的格子，保證通道至少 5 格寬（cellSize 0.5 時 = 2.5 Tile）
 * 5. 只保留最大的連通區域，放置樓梯口（S）、中途存檔點（M）、出口（X）
 * 魔王層（arena）：先在地圖右下方挖出圓形競技場（不放柱子、不放怪），魔王在圓心；
 * 競技場遠端（右下）再接一間小房間（出口與商人），只能穿過競技場進去。
 * 挑戰樓層另有中途小王的圓形空地（subArenas），和一般房間一樣連進通道。
 * 最後一層（王座廳）改用 generateThroneMap：整層只有一個圓形大空間
 */

/** 產生器版本：演算法改變時 + 1，讓舊存檔的樓層判定為佈局不符而重新生成 */
export const GENERATOR_VERSION = 4;

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

/** 房間之間的最小間隔（格） */
const GAP = 5;
const WALL = 1;
const FLOOR = 0;

/** 競技場後方小房間的半徑（格；cellSize 0.5 時 = 7 Tile）與連接通道的長度、半寬（邊緣侵蝕後約 6 Tile 寬） */
const ANTEROOM_R = 14;
const ANTEROOM_LINK = 10;
const ANTEROOM_LINK_HALF = 7;

/** 魔王競技場：直徑（World 單位）；subArenas：中途小王空地的直徑（放得下幾個就放幾個） */
export interface ArenaSpec {
  diameter: number;
  subArenas?: readonly number[];
}

export function generateMap(id: string, rng: Rng, layout: LayoutDef, arena?: ArenaSpec): MapDef {
  // 極少數情況（房間太少、連不起來）重試
  for (let attempt = 0; attempt < 8; attempt++) {
    const map = tryGenerate(id, rng, layout, arena);
    if (map) return map;
  }
  throw new Error(`map generation failed: ${id}`);
}

function tryGenerate(id: string, rng: Rng, layout: LayoutDef, arenaSpec?: ArenaSpec): MapDef | null {
  const W = Math.round(layout.width / layout.cellSize);
  const H = Math.round(layout.height / layout.cellSize);
  const grid = new Uint8Array(W * H).fill(WALL);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? WALL : grid[y * W + x]!);
  const set = (x: number, y: number, v: number) => {
    if (x > 1 && y > 1 && x < W - 2 && y < H - 2) grid[y * W + x] = v;
  };

  // ── 1. 房間（魔王層先放競技場：右下方的大圓，其他房間避開它） ──
  const rooms: Room[] = [];
  /** 其他房間不能放的區域（競技場後方的小房間與通道；不參與通道連接） */
  const reserved: Room[] = [];
  let arena: Room | null = null;
  let anteroom: Room | null = null;
  if (arenaSpec) {
    const r = Math.ceil(arenaSpec.diameter / 2 / layout.cellSize);
    // 小房間在競技場的右下對角線上：圓心距離 = 競技場半徑 + 通道 + 小房間半徑
    const d = Math.round((r + ANTEROOM_LINK + ANTEROOM_R) / Math.SQRT2);
    const cx = W - d - ANTEROOM_R - 8 - rng.int(0, Math.floor(W * 0.06));
    const cy = H - d - ANTEROOM_R - 8 - rng.int(0, Math.floor(H * 0.06));
    if (cx - r < 6 || cy - r < 6) return null;
    arena = { x: cx - r, y: cy - r, w: r * 2 + 1, h: r * 2 + 1, cx, cy };
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, FLOOR);
    rooms.push(arena);
    const ax = cx + d;
    const ay = cy + d;
    const R = ANTEROOM_R;
    anteroom = { x: ax - R, y: ay - R, w: R * 2 + 1, h: R * 2 + 1, cx: ax, cy: ay };
    for (let y = ay - R; y <= ay + R; y++) for (let x = ax - R; x <= ax + R; x++) if ((x - ax) ** 2 + (y - ay) ** 2 <= R * R) set(x, y, FLOOR);
    // 通道：沿對角線從競技場圓心挖到小房間圓心（半寬 ANTEROOM_LINK_HALF）
    for (let t = 0; t <= d; t++) {
      const px = cx + t;
      const py = cy + t;
      const h = ANTEROOM_LINK_HALF;
      for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) if (dx * dx + dy * dy <= h * h) set(px + dx, py + dy, FLOOR);
    }
    // 保留區：從競技場邊緣到小房間外緣的方框
    const edge = Math.round(r * 0.6);
    reserved.push({ x: cx + edge, y: cy + edge, w: ax + R - (cx + edge) + 1, h: ay + R - (cy + edge) + 1, cx: ax, cy: ay });
  }
  const blocked = (x: number, y: number, w: number, h: number) =>
    [...rooms, ...reserved].some((r) => x < r.x + r.w + GAP && x + w + GAP > r.x && y < r.y + r.h + GAP && y + h + GAP > r.y);
  // 中途小王的圓形空地：先放（尺寸大），放不下就少放
  const subs: Room[] = [];
  for (const diameter of arenaSpec?.subArenas ?? []) {
    const r = Math.ceil(diameter / 2 / layout.cellSize);
    for (let tries = 0; tries < 400; tries++) {
      const x = rng.int(4, W - r * 2 - 5);
      const y = rng.int(4, H - r * 2 - 5);
      if (x < 4 || y < 4 || blocked(x, y, r * 2 + 1, r * 2 + 1)) continue;
      const room: Room = { x, y, w: r * 2 + 1, h: r * 2 + 1, cx: x + r, cy: y + r };
      for (let yy = y; yy <= y + r * 2; yy++) for (let xx = x; xx <= x + r * 2; xx++) if ((xx - room.cx) ** 2 + (yy - room.cy) ** 2 <= r * r) set(xx, yy, FLOOR);
      rooms.push(room);
      subs.push(room);
      break;
    }
  }
  /** 特殊房間（競技場、小王空地）：不放柱子，不當樓梯口或中途存檔點 */
  const special = (r: Room) => r === arena || subs.includes(r);
  const target = rng.int(layout.rooms[0], layout.rooms[1]);
  // 房間大（寬 22～54、高 18～42 格）、彼此間隔 5 格：地圖被房間填滿，不留大片空白
  for (let tries = 0; tries < 4000 && rooms.length < target; tries++) {
    const w = rng.int(22, 54);
    const h = rng.int(18, 42);
    const x = rng.int(4, W - w - 5);
    const y = rng.int(4, H - h - 5);
    if (blocked(x, y, w, h)) continue;
    const room: Room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    rooms.push(room);
    carveRoom(room, rng, set);
  }
  if (rooms.length < (arena ? 7 : 6)) return null;
  // 填空：大房間放完後，空白處還放得下的地方再放中型房間（避免地圖上留下大片沒用到的區域）
  for (let tries = 0; tries < 3000; tries++) {
    const w = rng.int(18, 30);
    const h = rng.int(16, 26);
    const x = rng.int(4, W - w - 5);
    const y = rng.int(4, H - h - 5);
    if (blocked(x, y, w, h)) continue;
    const room: Room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    rooms.push(room);
    carveRoom(room, rng, set);
  }

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
    if (i !== j && dist(rooms[i]!, rooms[j]!) < 130) edges.push([i, j]);
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

  // ── 4. 開運算：保證通道寬度 ≥ 5 格 ──
  const O = 2;
  const core = new Uint8Array(W * H);
  for (let y = O; y < H - O; y++) {
    for (let x = O; x < W - O; x++) {
      let open = true;
      for (let dy = -O; dy <= O && open; dy++) for (let dx = -O; dx <= O && open; dx++) if (at(x + dx, y + dy) === WALL) open = false;
      if (open) core[y * W + x] = 1;
    }
  }
  const opened = new Uint8Array(W * H).fill(WALL);
  for (let y = O; y < H - O; y++) {
    for (let x = O; x < W - O; x++) {
      if (!core[y * W + x]) continue;
      for (let dy = -O; dy <= O; dy++) for (let dx = -O; dx <= O; dx++) opened[(y + dy) * W + (x + dx)] = FLOOR;
    }
  }
  grid.set(opened);

  // ── 5. 最大連通區域 ──
  const region = largestRegion(grid, W, H);
  if (!region) return null;
  for (let i = 0; i < grid.length; i++) if (!region.has(i)) grid[i] = WALL;

  // 大房間放柱子（2×2，間距夠寬，不會擋住通道）
  for (const r of rooms) {
    if (special(r) || r.w < 36 || r.h < 28 || !rng.chance(0.55)) continue;
    for (let y = r.y + 7; y < r.y + r.h - 8; y += 11) {
      for (let x = r.x + 7; x < r.x + r.w - 8; x += 11) {
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
  const startRoom = rooms.filter((r) => !special(r)).reduce((a, b) => (a.cx + a.cy * 1.3 < b.cx + b.cy * 1.3 ? a : b));
  const s = floorCell(startRoom.cx, startRoom.cy);
  if (s === null) return null;
  const { dist: d, prev } = bfs(grid, W, H, s);
  let far: number | null = null;
  if (arena && anteroom) {
    // 魔王層：出口在競技場後方小房間的遠端；必須走得到，而且只能穿過競技場進去
    far = floorCell(anteroom.cx + Math.round(ANTEROOM_R * 0.35), anteroom.cy + Math.round(ANTEROOM_R * 0.35));
    if (far === null || d[far]! < 0) return null;
    // 把競技場（含侵蝕後外擴的邊緣）整個封起來，小房間應該就走不到了
    const sealed = grid.slice();
    const outer = arena.w / 2 + 3;
    for (let y = Math.floor(arena.cy - outer); y <= arena.cy + outer; y++) {
      for (let x = Math.floor(arena.cx - outer); x <= arena.cx + outer; x++) {
        if (x >= 0 && y >= 0 && x < W && y < H && (x - arena.cx) ** 2 + (y - arena.cy) ** 2 <= outer * outer) sealed[y * W + x] = WALL;
      }
    }
    if (bfs(sealed, W, H, s).dist[far]! >= 0) return null;
  } else {
    for (const r of rooms) {
      const c = floorCell(r.cx, r.cy);
      if (c === null || d[c]! < 0) continue;
      if (far === null || d[c]! > d[far]!) far = c;
    }
  }
  if (far === null || d[far]! < 120) return null;
  const path: number[] = [];
  for (let c: number = far; c !== s; c = prev[c]!) path.push(c);
  const half = path[Math.floor(path.length / 2)]!;
  let mid: number | null = null;
  for (const r of rooms) {
    if (special(r)) continue;
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
  const c = layout.cellSize;
  return {
    id,
    rows,
    cellSize: c,
    spawns: [],
    chests: [],
    ...(arena ? { arena: { x: (arena.cx + 0.5) * c, y: (arena.cy + 0.5) * c, radius: (arena.w / 2) * c } } : {}),
    subArenas: subs.filter((r) => rooms.includes(r)).map((r) => ({ x: (r.cx + 0.5) * c, y: (r.cy + 0.5) * c, radius: (r.w / 2) * c })),
  };
}

/**
 * 最後一層（王座廳）：整層只有一個直徑 diameter（World 單位）的圓形大空間，魔王在圓心。
 * 樓梯口在左上邊緣，中途存檔點在樓梯口與圓心之間（都在魔王的偵測範圍外）；沒有出口。
 */
export function generateThroneMap(id: string, diameter: number, cellSize: number): MapDef {
  const R = Math.ceil(diameter / 2 / cellSize);
  const margin = 4;
  const size = R * 2 + 1 + margin * 2;
  const c = margin + R;
  // 樓梯口：往左上（-1, -1）方向、離邊緣 8 格；中途存檔點：同方向、離圓心 55%
  const along = (dist: number) => Math.round(c - dist / Math.SQRT2);
  const s = { x: along(R - 8), y: along(R - 8) };
  const m = { x: along(R * 0.55), y: along(R * 0.55) };
  const rows: string[] = [];
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      const inside = (x - c) ** 2 + (y - c) ** 2 <= R * R;
      row += x === s.x && y === s.y ? MAP_TILES.spawn : x === m.x && y === m.y ? MAP_TILES.midway : inside ? MAP_TILES.floor : MAP_TILES.wall;
    }
    rows.push(row);
  }
  return { id, rows, cellSize, spawns: [], chests: [], arena: { x: (c + 0.5) * cellSize, y: (c + 0.5) * cellSize, radius: (R + 0.5) * cellSize }, subArenas: [] };
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

/** 彎曲的隧道：往目標前進時隨機偏移，寬度 11～15 格（約 5.5～7.5 Tile，邊緣侵蝕後仍然夠寬） */
function carveTunnel(a: Room, b: Room, rng: Rng, set: (x: number, y: number, v: number) => void): void {
  let x = a.cx;
  let y = a.cy;
  const r = rng.int(6, 8);
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
  for (let r = 0; r < 20; r++) {
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
