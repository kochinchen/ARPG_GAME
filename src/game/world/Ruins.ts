import type { Rng } from '../../core/Rng';
import type { Vec2 } from '../../core/math/Vec2';
import { MAP_TILES, type MapDef } from '../../data/schema/map';
import { RUINS, ruinEraFor, type RuinEra } from '../../data/ruins';

/**
 * 地底古城的遺跡擺放（純函式，同一個 Rng 狀態結果相同；只有畫面，不改地圖、不擋路、不能互動）：
 * - 建築：一部分頂替地圖邊緣的牆（占地都是牆格、正面緊貼地板，畫面上那段牆由建築的正面取代，碰撞不變），
 *   其餘放在牆外的實心岩壁裡（離地板 floorGap 以內看得到）；都不碰隱藏房、魔王競技場與固定場景
 * - 石頭地板：地板上幾塊圓形範圍（畫面只在地板格上鋪石板）
 * - 骷髏：地板上散落，有些成堆、有些靠牆坐著；離樓梯口、存檔點、出口、商人、寶箱遠一點
 * 資料在 data/ruins.ts。座標都是 World 單位（1 = 1 Tile）。
 */
export interface RuinBuilding {
  /** 占地中心 */
  x: number;
  y: number;
  /** 沿 X、沿 Y 的大小 */
  w: number;
  d: number;
  /** 正面朝哪一邊（0 = +Y、1 = +X、2 = -Y、3 = -X），決定門與階梯的方向 */
  facing: 0 | 1 | 2 | 3;
  /** wall：頂替邊牆（占地裡的牆格不畫，正面是一道牆）；void：在牆外的黑色區 */
  kind: 'wall' | 'void';
  seed: number;
}

export interface StonePatch {
  x: number;
  y: number;
  radius: number;
  seed: number;
}

/** sit：靠牆坐著；lie：倒在地上（畫面用模型的死亡姿勢） */
export type RemainsPose = 'sit' | 'lie';

export interface SkeletonRemains {
  x: number;
  y: number;
  /** 身體朝向（弧度，World 平面；0 = +X） */
  angle: number;
  pose: RemainsPose;
  /** 體型倍率（同一般怪的隨機體型，1～1.25） */
  size: number;
  seed: number;
}

export interface RuinsLayout {
  era: RuinEra;
  buildings: RuinBuilding[];
  patches: StonePatch[];
  skeletons: SkeletonRemains[];
}

export const EMPTY_RUINS: RuinsLayout = { era: 'hamlet', buildings: [], patches: [], skeletons: [] };

/** 抽樣的次數上限（每種東西） */
const TRIES = 4000;

export function placeRuins(map: MapDef, floor: number, rng: Rng, avoid: readonly Vec2[] = []): RuinsLayout {
  const W = map.rows[0]?.length ?? 0;
  const H = map.rows.length;
  const c = map.cellSize;
  const wall = new Uint8Array(W * H);
  map.rows.forEach((row, y) => {
    for (let x = 0; x < W; x++) wall[y * W + x] = row[x] === MAP_TILES.wall ? 1 : 0;
  });
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || wall[y * W + x] === 1;

  // 每個格子離最近地板幾格（8 方向 BFS）
  const dist = new Int32Array(W * H).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (wall[i] === 0) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (dist[n] !== -1) continue;
        dist[n] = dist[i]! + 1;
        queue.push(n);
      }
    }
  }

  const era = ruinEraFor(floor);
  const between = ([lo, hi]: [number, number]) => rng.range(lo, hi);
  const count = ([lo, hi]: [number, number]) => rng.int(lo, hi);

  // ── 建築：牆外的黑色區 ──
  const hidden = map.hiddenRoom;
  const buildings: RuinBuilding[] = [];
  const perTile = 1 / c;
  /** 不能放建築的地方：隱藏房、競技場、固定場景（World 的矩形 / 圓） */
  const blocked = (cx: number, cy: number, w: number, d: number) => {
    if (buildings.some((b) => Math.hypot(b.x - cx, b.y - cy) < RUINS.buildingSpacing)) return true;
    if (hidden && Math.abs(hidden.x - cx) < hidden.size / 2 + w / 2 + 4 && Math.abs(hidden.y - cy) < hidden.size / 2 + d / 2 + 4) return true;
    for (const a of [...(map.arena ? [map.arena] : []), ...map.subArenas]) {
      if (Math.hypot(Math.max(Math.abs(a.x - cx) - w / 2, 0), Math.max(Math.abs(a.y - cy) - d / 2, 0)) < a.radius + 3) return true;
    }
    return map.setPieces.some((p) => Math.abs(p.x + p.w / 2 - cx) < p.w / 2 + w / 2 + 3 && Math.abs(p.y + p.h / 2 - cy) < p.h / 2 + d / 2 + 3);
  };
  const allWall = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!isWall(x, y) || x < 0 || y < 0 || x >= W || y >= H) return false;
    return true;
  };

  // 頂替邊牆：從貼著地板的牆格出發，占地往牆裡延伸，正面朝地板。只朝 +Y / +X（建築在走道後方，正面朝鏡頭，不擋住走道）
  const wantWall = count(RUINS.wallBuildings);
  const front: readonly { facing: 0 | 1; dx: number; dy: number }[] = [
    { facing: 0, dx: 0, dy: 1 },
    { facing: 1, dx: 1, dy: 0 },
  ];
  for (let t = 0; t < TRIES * 2 && buildings.filter((b) => b.kind === 'wall').length < wantWall; t++) {
    const x = rng.int(1, W - 2);
    const y = rng.int(1, H - 2);
    const f = rng.pick(front);
    if (!isWall(x, y) || isWall(x + f.dx, y + f.dy)) continue;
    const w = Math.round(between(RUINS.buildingSize));
    const d = Math.round(between(RUINS.buildingSize));
    const wc = Math.round(w * perTile);
    const dc = Math.round(d * perTile);
    // 占地（格）：正面那一邊緊貼地板
    const [x0, y0] = f.facing === 0 ? [x - Math.floor(wc / 2), y + 1 - dc] : [x + 1 - wc, y - Math.floor(dc / 2)];
    const x1 = x0 + wc;
    const y1 = y0 + dc;
    const cx = ((x0 + x1) / 2) * c;
    const cy = ((y0 + y1) / 2) * c;
    if (blocked(cx, cy, w, d) || !allWall(x0, y0, x1, y1)) continue;
    // 正面那一排外側：大部分是地板（建築正面真的成為邊界）
    const along = f.facing === 0 ? wc : dc;
    let touching = 0;
    for (let k = 0; k < along; k++) {
      const [fx, fy] = f.facing === 0 ? [x0 + k, y1] : [x1, y0 + k];
      if (!isWall(fx, fy) || !isWall(fx + f.dx, fy + f.dy)) touching++;
    }
    if (touching < along * RUINS.frontFloor) continue;
    buildings.push({ x: cx, y: cy, w: wc * c, d: dc * c, facing: f.facing, kind: 'wall', seed: rng.int(1, 999999) });
  }

  const wantBuildings = buildings.length + count(RUINS.buildings);
  const [gapMin, gapMax] = RUINS.floorGap;
  for (let t = 0; t < TRIES && buildings.length < wantBuildings; t++) {
    const w = Math.round(between(RUINS.buildingSize));
    const d = Math.round(between(RUINS.buildingSize));
    const cx = rng.range(w / 2 + 1, W * c - w / 2 - 1);
    const cy = rng.range(d / 2 + 1, H * c - d / 2 - 1);
    if (blocked(cx, cy, w, d)) continue;
    const x0 = Math.floor((cx - w / 2) / c);
    const x1 = Math.ceil((cx + w / 2) / c);
    const y0 = Math.floor((cy - d / 2) / c);
    const y1 = Math.ceil((cy + d / 2) / c);
    let ok = true;
    let nearest = Infinity;
    let toward: 0 | 1 | 2 | 3 = 0;
    for (let y = y0; y < y1 && ok; y++) {
      for (let x = x0; x < x1; x++) {
        const k = dist[y * W + x];
        if (k === undefined || k < gapMin / c) {
          ok = false;
          break;
        }
        if (k < nearest) {
          nearest = k;
          // 正面朝向最近的地板那一側
          const ex = x - (x0 + x1) / 2;
          const ey = y - (y0 + y1) / 2;
          toward = Math.abs(ex) / (x1 - x0) > Math.abs(ey) / (y1 - y0) ? (ex > 0 ? 1 : 3) : ey > 0 ? 0 : 2;
        }
      }
    }
    if (!ok || nearest > gapMax / c) continue;
    buildings.push({ x: cx, y: cy, w, d, facing: toward, kind: 'void', seed: rng.int(1, 999999) });
  }

  // ── 地板上的東西 ──
  /** World 位置周圍 r 以內都是地板 */
  const clear = (px: number, py: number, r: number) => {
    for (let y = Math.floor((py - r) / c); y <= Math.floor((py + r) / c); y++) {
      for (let x = Math.floor((px - r) / c); x <= Math.floor((px + r) / c); x++) if (isWall(x, y)) return false;
    }
    return true;
  };
  const randomFloor = (): Vec2 | null => {
    for (let t = 0; t < 50; t++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(0, H - 1);
      if (!isWall(x, y)) return { x: (x + rng.next()) * c, y: (y + rng.next()) * c };
    }
    return null;
  };
  const awayFromMarkers = (px: number, py: number) => avoid.every((a) => Math.hypot(a.x - px, a.y - py) >= RUINS.clearOfMarkers);

  const patches: StonePatch[] = [];
  const wantPatches = count(RUINS.patches);
  for (let t = 0; t < TRIES && patches.length < wantPatches; t++) {
    const p = randomFloor();
    if (!p || !clear(p.x, p.y, 1)) continue;
    if (patches.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 7)) continue;
    patches.push({ x: p.x, y: p.y, radius: between(RUINS.patchRadius), seed: rng.int(1, 999999) });
  }

  const skeletons: SkeletonRemains[] = [];
  const wantSkeletons = count(RUINS.skeletons);
  const free = (px: number, py: number) => skeletons.every((s) => Math.hypot(s.x - px, s.y - py) > 0.75);
  const add = (x: number, y: number, angle: number, pose: RemainsPose) =>
    skeletons.push({ x, y, angle, pose, size: rng.range(1, 1.25), seed: rng.int(1, 999999) });
  const DIRS: readonly [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  for (let t = 0; t < TRIES && skeletons.length < wantSkeletons; t++) {
    const p = randomFloor();
    if (!p || !awayFromMarkers(p.x, p.y)) continue;
    if (rng.chance(RUINS.wallSitChance)) {
      // 靠牆坐著：找一個 1.2 Tile 內有牆的地板點（多試幾次），背貼著牆、面朝外
      for (let k = 0; k < 40; k++) {
        const q = k === 0 ? p : randomFloor();
        if (!q) break;
        const [dx, dy] = DIRS[rng.int(0, 3)]!;
        let reach = -1;
        for (let s = 0.25; s <= 1.2; s += c / 2) {
          if (isWall(Math.floor((q.x + dx * s) / c), Math.floor((q.y + dy * s) / c))) {
            reach = s;
            break;
          }
        }
        if (reach < 0) continue;
        const x = q.x + dx * (reach - 0.32);
        const y = q.y + dy * (reach - 0.32);
        if (!clear(x - dx * 0.2, y - dy * 0.2, 0.15) || !free(x, y) || !awayFromMarkers(x, y)) continue;
        add(x, y, Math.atan2(-dy, -dx) + rng.range(-0.35, 0.35), 'sit');
        break;
      }
      continue;
    }
    if (!clear(p.x, p.y, 0.5) || !free(p.x, p.y)) continue;
    add(p.x, p.y, rng.range(0, Math.PI * 2), 'lie');
    // 成堆：旁邊再倒 1～3 具
    if (rng.chance(RUINS.clusterChance)) {
      const more = rng.int(1, 3);
      for (let k = 0; k < more && skeletons.length < wantSkeletons; k++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0.7, 1.4);
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;
        if (!clear(x, y, 0.45) || !free(x, y) || !awayFromMarkers(x, y)) continue;
        add(x, y, rng.range(0, Math.PI * 2), 'lie');
      }
    }
  }

  return { era, buildings, patches, skeletons };
}
