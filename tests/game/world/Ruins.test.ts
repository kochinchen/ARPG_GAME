import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { RUINS, ruinEraFor } from '../../../src/data/ruins';
import { MAP_TILES, type MapDef } from '../../../src/data/schema/map';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { floorDefFor } from '../../../src/game/world/FloorManager';
import { generateMap } from '../../../src/game/world/MapGenerator';
import { placeRuins } from '../../../src/game/world/Ruins';

/** 地底古城的遺跡（只有畫面）：建築在牆外、骷髏與石板在地板上，同一個種子每次一樣 */
const data = DataRegistry.load(gameData);

function generate(floor: number, seed: number): MapDef {
  return generateMap('map.test', new Rng(seed).fork(`map-${floor}`), floorDefFor(data, floor).layout!);
}

const isWall = (map: MapDef, x: number, y: number) => map.rows[Math.floor(y / map.cellSize)]?.[Math.floor(x / map.cellSize)] !== MAP_TILES.floor;

describe('Ruins', () => {
  it('年代依樓層：蜘蛛女王那層（25）以後是宮殿', () => {
    expect(ruinEraFor(1)).toBe('hamlet');
    expect(ruinEraFor(9)).toBe('necropolis');
    expect(ruinEraFor(14)).toBe('cathedral');
    expect(ruinEraFor(19)).toBe('foundry');
    expect(ruinEraFor(24)).toBe('citadel');
    // 第 25 層的魔王是蜘蛛女王
    const def = floorDefFor(data, 25);
    expect(def.boss?.enemyId).toBe('enemy.spider_queen');
    for (let f = 25; f <= 35; f++) expect(['palace', 'sanctum_palace']).toContain(ruinEraFor(f));
  });

  for (const floor of [3, 12, 27]) {
    it(`第 ${floor} 層：建築在牆裡、離地板有距離；骷髏、石板在地板上；同一個種子結果相同`, () => {
      const map = generate(floor, 41);
      const a = placeRuins(map, floor, new Rng(7).fork('ruins'));
      const b = placeRuins(map, floor, new Rng(7).fork('ruins'));
      expect(b).toEqual(a);
      expect(a.buildings.length).toBeGreaterThanOrEqual(3);
      expect(a.skeletons.length).toBeGreaterThanOrEqual(RUINS.skeletons[0] * 0.8);
      expect(a.patches.length).toBeGreaterThanOrEqual(RUINS.patches[0] * 0.8);
      const walls = a.buildings.filter((b) => b.kind === 'wall');
      expect(walls.length).toBeGreaterThanOrEqual(2);
      for (const bd of walls) {
        // 頂替邊牆：占地全是牆格（碰撞不變），正面外側緊貼地板
        for (let y = bd.y - bd.d / 2 + 0.25; y < bd.y + bd.d / 2; y += 0.5) for (let x = bd.x - bd.w / 2 + 0.25; x < bd.x + bd.w / 2; x += 0.5) expect(isWall(map, x, y)).toBe(true);
        const touching = Array.from({ length: 9 }, (_, k) => (k + 0.5) / 9).filter((t) =>
          bd.facing === 0 ? !isWall(map, bd.x - bd.w / 2 + t * bd.w, bd.y + bd.d / 2 + 0.75) : !isWall(map, bd.x + bd.w / 2 + 0.75, bd.y - bd.d / 2 + t * bd.d),
        );
        expect(touching.length).toBeGreaterThanOrEqual(4);
      }
      for (const bd of a.buildings.filter((b) => b.kind === 'void')) {
        for (let y = bd.y - bd.d / 2; y <= bd.y + bd.d / 2; y += 0.5) {
          for (let x = bd.x - bd.w / 2; x <= bd.x + bd.w / 2; x += 0.5) {
            // 占地四周 gapMin 以內都是牆（不會蓋到走得到的地方）
            for (const [dx, dy] of [[0, 0], [RUINS.floorGap[0] - 0.5, 0], [-(RUINS.floorGap[0] - 0.5), 0], [0, RUINS.floorGap[0] - 0.5], [0, -(RUINS.floorGap[0] - 0.5)]] as const) {
              expect(isWall(map, x + dx, y + dy)).toBe(true);
            }
          }
        }
      }
      for (const s of a.skeletons) expect(isWall(map, s.x, s.y)).toBe(false);
      for (const p of a.patches) expect(isWall(map, p.x, p.y)).toBe(false);
    });
  }

  it('遊戲裡：每次進入同一層的遺跡都一樣，骷髏離樓梯口、出口有距離', () => {
    const make = () => new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: 1234 });
    const w1 = make();
    w1.enterFloor(7);
    const w2 = make();
    w2.enterFloor(7);
    expect(w1.ruins).toEqual(w2.ruins);
    expect(w1.ruins.era).toBe('necropolis');
    for (const s of w1.ruins.skeletons) {
      expect(Math.hypot(s.x - w1.spawnPoint.x, s.y - w1.spawnPoint.y)).toBeGreaterThanOrEqual(RUINS.clearOfMarkers);
      if (w1.exit) expect(Math.hypot(s.x - w1.exit.position.x, s.y - w1.exit.position.y)).toBeGreaterThanOrEqual(RUINS.clearOfMarkers);
    }
  });
});
