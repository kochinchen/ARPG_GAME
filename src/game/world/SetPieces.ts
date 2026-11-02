import type { Rng } from '../../core/Rng';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import { MAP_TILES, type MapDef, type PlacedSetPiece } from '../../data/schema/map';
import type { SetPieceDef } from '../../data/schema/setPiece';

/**
 * 把固定場景放進已經產生好的隨機地圖（純函式，同一個 Rng 狀態結果相同）：
 * - wall：找一段主路旁的長牆，把凹凸補平（只會把地板變成牆）
 * - room：從實心岩壁挖一間只有一道門的房間（只會把牆變成地板），門開在靠鏡頭的南、東兩面
 * 每放一個都重新檢查：樓梯口、中途存檔點、出口都走得到，原本走得到的地板也沒有被切斷。
 * 主路旁放不下就退到任何位置；還是放不下就跳過（遊戲照常，遺物維持隨機位置），不會讓地圖產生失敗。
 */

const WALL = 1;
const FLOOR = 0;

/** 主路旁：離起點到出口的最短路徑多少 Tile 以內 */
const ROUTE_REACH = 12;
/** 離樓梯口、中途存檔點、出口至少多少 Tile */
const MARKER_CLEAR = 8;
/** 離出口至少多少 Tile：出口前的首領站在約 16 Tile 外（balance.floor 的 guardDistance），不能站進場景 */
const EXIT_CLEAR = 20;
/** 離魔王競技場至少多少 Tile */
const ARENA_CLEAR = 12;
/** 牆面允許補平的凹凸（Tile） */
const WALL_TOLERANCE = 3;
/** 門寬與連到地板的通道最長（Tile） */
const DOOR_WIDTH = 3;
const TUNNEL_MAX = 12;
/** 房間外圍要留的實心岩壁（Tile） */
const ROCK_MARGIN = 1;
/** 每個場景、每一輪最多驗證幾個候選位置（驗證要跑整張圖的 BFS） */
const MAX_CHECKS = 24;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Front = PlacedSetPiece['front'];

class Grid {
  readonly W: number;
  readonly H: number;
  readonly cells: Uint8Array;
  readonly markers: number[] = [];

  constructor(rows: readonly string[]) {
    this.W = rows[0]!.length;
    this.H = rows.length;
    this.cells = new Uint8Array(this.W * this.H);
    rows.forEach((row, y) => {
      for (let x = 0; x < this.W; x++) {
        const c = row[x]!;
        this.cells[y * this.W + x] = c === MAP_TILES.wall ? WALL : FLOOR;
        if (c === MAP_TILES.spawn) this.markers[0] = y * this.W + x;
        else if (c === MAP_TILES.exit) this.markers[1] = y * this.W + x;
        else if (c === MAP_TILES.midway) this.markers[2] = y * this.W + x;
      }
    });
  }

  /** 從 start 走得到的格子的距離（-1 = 走不到） */
  distances(start: number, cells: Uint8Array = this.cells): { dist: Int32Array; prev: Int32Array } {
    const { W } = this;
    const dist = new Int32Array(cells.length).fill(-1);
    const prev = new Int32Array(cells.length).fill(-1);
    dist[start] = 0;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q]!;
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= cells.length || dist[n] !== -1 || cells[n] === WALL) continue;
        if ((n === c - 1 || n === c + 1) && Math.floor(n / W) !== Math.floor(c / W)) continue;
        dist[n] = dist[c]! + 1;
        prev[n] = c;
        queue.push(n);
      }
    }
    return { dist, prev };
  }

  /** 矩形內的牆數（出界 = -1）的查表 */
  wallCounter(): (x: number, y: number, w: number, h: number) => number {
    const { W, H, cells } = this;
    const stride = W + 1;
    const sum = new Int32Array(stride * (H + 1));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        sum[(y + 1) * stride + x + 1] = cells[y * W + x]! + sum[y * stride + x + 1]! + sum[(y + 1) * stride + x]! - sum[y * stride + x]!;
      }
    }
    return (x, y, w, h) =>
      x < 0 || y < 0 || x + w > W || y + h > H ? -1 : sum[(y + h) * stride + x + w]! - sum[y * stride + x + w]! - sum[(y + h) * stride + x]! + sum[y * stride + x]!;
  }
}

function shuffled(count: number, rng: Rng): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function placeSetPieces(map: MapDef, defs: readonly SetPieceDef[], rng: Rng): MapDef {
  if (defs.length === 0) return map;
  const grid = new Grid(map.rows);
  const start = grid.markers[0];
  const exit = grid.markers[1];
  if (start === undefined || exit === undefined) return map;
  const perTile = 1 / map.cellSize;

  // 主路：起點到出口的最短路徑；旁邊 ROUTE_REACH 以內算「主路旁」
  const near = new Uint8Array(grid.cells.length);
  const { dist, prev } = grid.distances(start);
  if (dist[exit]! < 0) return map;
  const reach = Math.round(ROUTE_REACH * perTile);
  for (let c = exit; c !== start; c = prev[c]!) {
    const cx = c % grid.W;
    const cy = Math.floor(c / grid.W);
    for (let y = Math.max(0, cy - reach); y <= Math.min(grid.H - 1, cy + reach); y += 2) {
      for (let x = Math.max(0, cx - reach); x <= Math.min(grid.W - 1, cx + reach); x += 2) {
        near[y * grid.W + x] = 1;
        if (x + 1 < grid.W) near[y * grid.W + x + 1] = 1;
        if (y + 1 < grid.H) near[(y + 1) * grid.W + x] = 1;
        if (x + 1 < grid.W && y + 1 < grid.H) near[(y + 1) * grid.W + x + 1] = 1;
      }
    }
  }

  const used: Box[] = [];
  const placed: PlacedSetPiece[] = [];
  const zoneClear = (box: Box): boolean => {
    for (const marker of grid.markers) {
      const clear = Math.round((marker === exit ? EXIT_CLEAR : MARKER_CLEAR) * perTile);
      const mx = marker % grid.W;
      const my = Math.floor(marker / grid.W);
      if (mx > box.x - clear && mx < box.x + box.w + clear && my > box.y - clear && my < box.y + box.h + clear) return false;
    }
    const hidden = map.hiddenRoom ? [{ x: map.hiddenRoom.x, y: map.hiddenRoom.y, radius: map.hiddenRoom.size * 0.72 }] : [];
    const arenas = [...(map.arena ? [map.arena] : []), ...map.subArenas, ...hidden];
    for (const a of arenas) {
      const ax = a.x * perTile;
      const ay = a.y * perTile;
      const dx = Math.max(box.x - ax, 0, ax - box.x - box.w);
      const dy = Math.max(box.y - ay, 0, ay - box.y - box.h);
      if (Math.hypot(dx, dy) < (a.radius + ARENA_CLEAR) * perTile) return false;
    }
    return !used.some((u) => box.x < u.x + u.w + 8 && box.x + box.w + 8 > u.x && box.y < u.y + u.h + 8 && box.y + box.h + 8 > u.y);
  };
  const isNear = (box: Box) => near[Math.floor(box.y + box.h / 2) * grid.W + Math.floor(box.x + box.w / 2)] === 1;

  /** 改完地形後：所有記號都走得到，原本走得到的地板沒有被切斷 */
  const accept = (next: Uint8Array): boolean => {
    const before = grid.distances(start).dist;
    const after = grid.distances(start, next).dist;
    if (grid.markers.some((m) => m !== undefined && after[m]! < 0)) return false;
    for (let i = 0; i < next.length; i++) if (next[i] === FLOOR && before[i]! >= 0 && after[i]! < 0) return false;
    return true;
  };

  const placeWall = (def: SetPieceDef, routeOnly: boolean): (Box & { front: Front }) | null => {
    const len = Math.round(def.width * perTile);
    const depth = Math.round(def.depth * perTile);
    const band = Math.round(WALL_TOLERANCE * perTile);
    const walls = grid.wallCounter();
    let checks = 0;
    for (const index of shuffled(grid.W * grid.H, rng)) {
      const x = index % grid.W;
      const y = Math.floor(index / grid.W);
      for (const front of ['S', 'E'] as const) {
        const box: Box = front === 'S' ? { x, y, w: len, h: depth } : { x, y, w: depth, h: len };
        if (walls(box.x, box.y, box.w, box.h) !== 0 || !zoneClear(box) || (routeOnly && !isNear(box))) continue;
        const next = grid.cells.slice();
        let flat = true;
        for (let k = 0; k < len && flat; k++) {
          // 往牆的方向找牆：找得到就把中間的凹陷補平；找不到代表那裡是開口（通道），不能放
          let found = false;
          for (let t = 1; t <= band && !found; t++) {
            const i = front === 'S' ? (y - t) * grid.W + x + k : (y + k) * grid.W + x - t;
            if (i < 0 || i >= next.length) break;
            if (grid.cells[i] === WALL) found = true;
            else next[i] = WALL;
          }
          if (!found) flat = false;
        }
        if (!flat) continue;
        if (++checks > MAX_CHECKS) return null;
        if (!accept(next)) continue;
        grid.cells.set(next);
        return Object.assign(box, { front });
      }
    }
    return null;
  };

  const placeRoom = (def: SetPieceDef, routeOnly: boolean): (Box & { front: Front }) | null => {
    const w = Math.round(def.width * perTile);
    const d = Math.round(def.depth * perTile);
    const margin = Math.round(ROCK_MARGIN * perTile);
    const door = Math.round(DOOR_WIDTH * perTile);
    const tunnelMax = Math.round(TUNNEL_MAX * perTile);
    const walls = grid.wallCounter();
    let checks = 0;
    for (const index of shuffled(grid.W * grid.H, rng)) {
      const x = index % grid.W;
      const y = Math.floor(index / grid.W);
      // 門只開在南、東（靠鏡頭那兩面）：後牆在北、西，牆上的東西才看得到。門在南時 寬 = width；門在東時 寬 = depth
      for (const front of (rng.chance(0.5) ? ['S', 'E'] : ['E', 'S']) as Front[]) {
        const horizontal = front === 'N' || front === 'S';
        const box: Box = horizontal ? { x, y, w, h: d } : { x, y, w: d, h: w };
        if (box.x < 6 || box.y < 6 || box.x + box.w > grid.W - 6 || box.y + box.h > grid.H - 6) continue;
        const area = (box.w + margin * 2) * (box.h + margin * 2);
        if (walls(box.x - margin, box.y - margin, box.w + margin * 2, box.h + margin * 2) !== area) continue;
        if (!zoneClear(box) || (routeOnly && !isNear(box))) continue;
        const dx = front === 'E' ? 1 : front === 'W' ? -1 : 0;
        const dy = front === 'S' ? 1 : front === 'N' ? -1 : 0;
        const doorX = front === 'E' ? box.x + box.w : front === 'W' ? box.x - 1 : box.x + Math.floor((box.w - door) / 2);
        const doorY = front === 'S' ? box.y + box.h : front === 'N' ? box.y - 1 : box.y + Math.floor((box.h - door) / 2);
        const dw = horizontal ? door : 1;
        const dh = horizontal ? 1 : door;
        // 從門往外挖，直到整個切面都碰到地板；半牆半地代表形狀不乾淨，放棄
        let length = -1;
        for (let n = 0; n <= tunnelMax; n++) {
          const count = walls(doorX + dx * n, doorY + dy * n, dw, dh);
          if (count < 0) break;
          if (count === 0) {
            length = n;
            break;
          }
          if (count !== dw * dh) break;
        }
        if (length <= 0) continue;
        if (++checks > MAX_CHECKS) return null;
        const next = grid.cells.slice();
        for (let yy = box.y; yy < box.y + box.h; yy++) for (let xx = box.x; xx < box.x + box.w; xx++) next[yy * grid.W + xx] = FLOOR;
        for (let n = 0; n < length; n++) {
          for (let b = 0; b < dh; b++) for (let a = 0; a < dw; a++) next[(doorY + dy * n + b) * grid.W + doorX + dx * n + a] = FLOOR;
        }
        if (!accept(next)) continue;
        if (grid.distances(start, next).dist[Math.floor(box.y + box.h / 2) * grid.W + Math.floor(box.x + box.w / 2)]! < 0) continue;
        grid.cells.set(next);
        return Object.assign(box, { front });
      }
    }
    return null;
  };

  for (const def of defs) {
    const place = def.kind === 'wall' ? placeWall : placeRoom;
    const box = place(def, true) ?? place(def, false);
    if (!box) continue;
    used.push(box);
    placed.push({ id: def.id, x: box.x * map.cellSize, y: box.y * map.cellSize, w: box.w * map.cellSize, h: box.h * map.cellSize, front: box.front });
  }
  if (placed.length === 0) return map;

  const rows = map.rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < grid.W; x++) {
      const c = row[x]!;
      out += c === MAP_TILES.floor || c === MAP_TILES.wall ? (grid.cells[y * grid.W + x] === WALL ? MAP_TILES.wall : MAP_TILES.floor) : c;
    }
    return out;
  });
  return { ...map, rows, setPieces: [...map.setPieces, ...placed] };
}

/**
 * 場景內的 World 位置：u 沿牆（0～1）、v 從後牆到前方（0～1）。
 * front 是「從後牆往前」的方向（房間就是門的方向）。
 */
export function setPieceSpot(piece: PlacedSetPiece, u: number, v: number): Vec2 {
  switch (piece.front) {
    case 'S':
      return vec2(piece.x + piece.w * u, piece.y + piece.h * v);
    case 'N':
      return vec2(piece.x + piece.w * u, piece.y + piece.h * (1 - v));
    case 'E':
      return vec2(piece.x + piece.w * v, piece.y + piece.h * u);
    case 'W':
      return vec2(piece.x + piece.w * (1 - v), piece.y + piece.h * u);
  }
}

/** 從後牆往前的方向 */
export function setPieceForward(piece: PlacedSetPiece): Vec2 {
  return vec2(piece.front === 'E' ? 1 : piece.front === 'W' ? -1 : 0, piece.front === 'S' ? 1 : piece.front === 'N' ? -1 : 0);
}
