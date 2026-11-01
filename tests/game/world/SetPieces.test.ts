import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { findMarker, reachableTiles } from '../../../src/data/mapAnalysis';
import { MAP_TILES, MapDefSchema, type MapDef } from '../../../src/data/schema/map';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { floorDefFor } from '../../../src/game/world/FloorManager';
import { generateMap } from '../../../src/game/world/MapGenerator';
import { placeSetPieces, setPieceSpot } from '../../../src/game/world/SetPieces';

/** 小說的固定場景：放進隨機地圖不能造成任何地圖問題。SET_PIECE_SEEDS 可以調高做壓力測試 */
const data = DataRegistry.load(gameData);
const SEEDS = Number(process.env.SET_PIECE_SEEDS ?? 8);
const WORLD_SEEDS = Number(process.env.SET_PIECE_WORLD_SEEDS ?? 3);
const FLOORS = [...new Set(data.setPieces.all.map((p) => p.floor))];
const SLOW = { timeout: 600_000 };

function generate(floor: number, seed: number) {
  const def = floorDefFor(data, floor);
  const base = generateMap('map.test', new Rng(seed).fork(`map-${floor}`), def.layout!);
  const pieces = data.setPieces.all.filter((p) => p.floor === floor);
  return { base, map: placeSetPieces(base, pieces, new Rng(seed).fork(`set-piece-${floor}`)), pieces };
}

/** 從起點走得到的地板格（含記號） */
const reachable = (map: MapDef) => reachableTiles(map, findMarker(map, MAP_TILES.spawn)!);

function shortestPathNear(map: MapDef, x: number, y: number, tiles: number): boolean {
  const W = map.rows[0]!.length;
  const H = map.rows.length;
  const open = (c: number) => map.rows[Math.floor(c / W)]![c % W] !== MAP_TILES.wall;
  const s = findMarker(map, MAP_TILES.spawn)!;
  const e = findMarker(map, MAP_TILES.exit)!;
  const from = s.y * W + s.x;
  const to = e.y * W + e.x;
  const prev = new Int32Array(W * H).fill(-2);
  prev[from] = -1;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]!;
    for (const n of [c - 1, c + 1, c - W, c + W]) {
      if (n < 0 || n >= W * H || prev[n] !== -2 || !open(n)) continue;
      if ((n === c - 1 || n === c + 1) && Math.floor(n / W) !== Math.floor(c / W)) continue;
      prev[n] = c;
      queue.push(n);
    }
  }
  const reach = tiles / map.cellSize + 2;
  for (let c = to; c !== -1; c = prev[c]!) {
    if (Math.abs((c % W) - x / map.cellSize) <= reach && Math.abs(Math.floor(c / W) - y / map.cellSize) <= reach) return true;
  }
  return false;
}

describe('固定場景', () => {
  it('資料：五個第一批場景，各在小說對應的樓層', () => {
    expect(data.setPieces.all.map((p) => `${p.id}@${p.floor}`).sort()).toEqual(
      ['piece.captain_room@9', 'piece.chalk_wall@4', 'piece.dead_supper@2', 'piece.hand_wall@19', 'piece.master_room@23'].sort(),
    );
  });

  it('同一個種子結果相同；不會動到樓梯口、存檔點與出口', () => {
    for (const floor of FLOORS) {
      const a = generate(floor, 77);
      expect(generate(floor, 77).map).toEqual(a.map);
      for (const marker of [MAP_TILES.spawn, MAP_TILES.midway, MAP_TILES.exit]) expect(findMarker(a.map, marker)).toEqual(findMarker(a.base, marker));
    }
  });

  for (const floor of FLOORS) {
    it(`第 ${floor} 層：${SEEDS} 個種子都放得下、在主路旁、地圖依然合法`, SLOW, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { base, map, pieces } = generate(floor, seed * 37 + floor);
        // 通過地圖格式驗證（S / M / X 各一個、大小一致）
        expect(MapDefSchema.safeParse(map).success, `seed ${seed}`).toBe(true);
        expect(map.setPieces.map((p) => p.id), `seed ${seed}`).toEqual(pieces.map((p) => p.id));
        const after = reachable(map);
        for (const marker of [MAP_TILES.spawn, MAP_TILES.midway, MAP_TILES.exit]) {
          const p = findMarker(map, marker)!;
          expect(after.has(`${p.x},${p.y}`), `seed ${seed} ${marker}`).toBe(true);
        }
        // 原本走得到的地板：只有被補平成牆的可以消失，不能被切斷
        const H = map.rows.length;
        const W = map.rows[0]!.length;
        const before = reachable(base);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (map.rows[y]![x] !== MAP_TILES.wall && before.has(`${x},${y}`)) expect(after.has(`${x},${y}`), `seed ${seed} (${x},${y})`).toBe(true);
            // 不會留下走不到的地板
            if (map.rows[y]![x] !== MAP_TILES.wall) expect(after.has(`${x},${y}`), `seed ${seed} 孤立 (${x},${y})`).toBe(true);
          }
        }
        for (const piece of map.setPieces) {
          const center = setPieceSpot(piece, 0.5, 0.5);
          expect(shortestPathNear(map, center.x, center.y, 16), `seed ${seed} ${piece.id} 不在主路旁`).toBe(true);
          // 場景內部都是走得到的地板
          for (let y = piece.y; y < piece.y + piece.h; y += 0.5) {
            for (let x = piece.x; x < piece.x + piece.w; x += 0.5) {
              expect(after.has(`${Math.floor(x / map.cellSize)},${Math.floor(y / map.cellSize)}`), `seed ${seed} ${piece.id}`).toBe(true);
            }
          }
        }
      }
    });
  }

  for (const floor of FLOORS) {
    it(`第 ${floor} 層：實際進入樓層，遺物在場景內，怪物與寶箱不在房間裡`, SLOW, () => {
      for (let seed = 1; seed <= WORLD_SEEDS; seed++) {
        const world = new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: seed * 101 + floor });
        const def = data.setPieces.all.find((p) => p.floor === floor)!;
        const piece = world.map.setPieces.find((p) => p.id === def.id)!;
        expect(piece, `seed ${seed}`).toBeDefined();
        const inside = (p: { x: number; y: number }) => p.x >= piece.x && p.x <= piece.x + piece.w && p.y >= piece.y && p.y <= piece.y + piece.h;
        if (def.relic) {
          const relic = world.relics.find((r) => r.loreId === def.relic!.loreId)!;
          expect(relic, `seed ${seed}`).toBeDefined();
          expect(inside(relic.position), `seed ${seed}`).toBe(true);
        }
        for (const chest of world.chests) expect(inside(chest.position), `seed ${seed} 寶箱`).toBe(false);
        if (def.kind === 'room') {
          for (const actor of world.actors) if (actor.faction === 'enemy') expect(inside(actor.position), `seed ${seed} ${actor.defId}`).toBe(false);
        }
        // 怪物、寶箱、出口都走得到
        for (let i = 0; i < 30; i++) world.update(1 / 60);
        expect(world.map.setPieces.length).toBe(1);
      }
    });
  }

  it('沒有場景的樓層完全不受影響', () => {
    const def = floorDefFor(data, 3);
    const map = generateMap('map.test', new Rng(5).fork('map-3'), def.layout!);
    expect(placeSetPieces(map, [], new Rng(5))).toBe(map);
    expect(map.setPieces).toEqual([]);
  });

  it('放不下時跳過，不會讓地圖失敗', () => {
    const def = floorDefFor(data, 2);
    const map = generateMap('map.test', new Rng(5).fork('map-2'), def.layout!);
    const out = placeSetPieces(map, [{ id: 'piece.too_big', floor: 2, kind: 'room', width: 150, depth: 100 }], new Rng(1));
    expect(out.setPieces).toEqual([]);
    expect(out.rows).toEqual(map.rows);
  });
});
