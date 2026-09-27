import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { findMarker, reachableTiles } from '../../../src/data/mapAnalysis';
import { MAP_TILES } from '../../../src/data/schema/map';
import { generateMap } from '../../../src/game/world/MapGenerator';

/** 隨機產生的地牢：同一個種子相同、S / M / X 都在、走得到、通道夠寬 */
const LAYOUT = { width: 120, height: 90, cellSize: 0.5, rooms: [20, 26] as [number, number], loops: 4 };
const gen = (seed: number, floor = 1) => generateMap('m', new Rng(seed).fork(`map-${floor}`), LAYOUT);

describe('MapGenerator', () => {
  it('同一個種子 + 樓層一定相同；不同樓層不同', () => {
    expect(gen(5).rows).toEqual(gen(5).rows);
    expect(gen(5, 2).rows).not.toEqual(gen(5, 1).rows);
  });

  it('大小符合設定（120 × 90 World、每格 0.5 → 240 × 180 格）', () => {
    const m = gen(3);
    expect(m.rows).toHaveLength(180);
    expect(m.rows.every((r) => r.length === 240)).toBe(true);
    expect(m.cellSize).toBe(0.5);
  });

  it('30 個種子：S / M / X 各一個、都走得到，出口離樓梯口夠遠', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const m = gen(seed);
      const s = findMarker(m, MAP_TILES.spawn)!;
      const reach = reachableTiles(m, s);
      for (const marker of [MAP_TILES.midway, MAP_TILES.exit]) {
        const p = findMarker(m, marker)!;
        expect(p, `seed ${seed} ${marker}`).not.toBeNull();
        expect(reach.has(`${p.x},${p.y}`)).toBe(true);
      }
      const x = findMarker(m, MAP_TILES.exit)!;
      expect(Math.hypot(x.x - s.x, x.y - s.y) * LAYOUT.cellSize).toBeGreaterThan(20);
    }
  });

  it('每一格地板都屬於某個 3×3 的空地：通道至少 3 格寬（1.5 Tile，Boss 也過得去）', () => {
    for (const seed of [2, 7, 11]) {
      const m = gen(seed);
      const floor = (x: number, y: number) => m.rows[y]?.[x] !== undefined && m.rows[y]![x] !== '#';
      const open = (x: number, y: number) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!floor(x + dx, y + dy)) return false;
        return true;
      };
      for (let y = 0; y < m.rows.length; y++) {
        for (let x = 0; x < m.rows[0]!.length; x++) {
          if (!floor(x, y)) continue;
          let inOpen = false;
          for (let dy = -1; dy <= 1 && !inOpen; dy++) for (let dx = -1; dx <= 1 && !inOpen; dx++) if (open(x + dx, y + dy)) inOpen = true;
          expect(inOpen, `seed ${seed} (${x}, ${y})`).toBe(true);
        }
      }
    }
  });

  it('產生速度：一張地圖在 100 ms 內', () => {
    const t0 = performance.now();
    for (let seed = 1; seed <= 10; seed++) gen(seed);
    expect((performance.now() - t0) / 10).toBeLessThan(100);
  });

  it('所有樓層區間都用隨機地圖，並依深度設定風格', () => {
    const data = DataRegistry.load(gameData);
    const themes = data.floors.all.map((f) => [f.floors[0], f.theme]);
    expect(themes).toEqual([[1, 'crypt'], [5, 'tomb'], [10, 'sanctum'], [15, 'lava'], [20, 'fortress'], [25, 'abyss'], [30, 'temple']]);
    expect(data.floors.all.every((f) => f.layout !== undefined)).toBe(true);
  });
});
