import { CommandQueue } from '../../src/core/CommandQueue';
import { EventBus } from '../../src/core/EventBus';
import { vec2, type Vec2 } from '../../src/core/math/Vec2';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { GameCommand } from '../../src/game/Commands';
import type { GameEvents } from '../../src/game/GameEvents';
import { GameWorld } from '../../src/game/GameWorld';
import { Actor, type Faction } from '../../src/game/entities/Actor';
import { NavGrid } from '../../src/game/movement/NavGrid';
import { StatBlock, type StatId } from '../../src/game/stats/StatBlock';

export const DT = 1 / 60;

export const navFrom = (...rows: string[]) => NavGrid.fromMap({ rows });

let nextId = 1000;
export function makeActor(
  options: { faction?: Faction; position?: Vec2; radius?: number; stats?: Partial<Record<StatId, number>> } = {},
): Actor {
  return new Actor({
    id: nextId++,
    faction: options.faction ?? 'player',
    name: 'test',
    defId: null,
    position: options.position ?? vec2(0, 0),
    radius: options.radius ?? 0.3,
    stats: new StatBlock({ maxHp: 100, moveSpeed: 4, ...options.stats }),
  });
}

export function createWorld(seed = 1) {
  const data = DataRegistry.load(gameData);
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, mapId: 'map.test_1', commands, events, seed });
  return { world, commands, events, data };
}

/** 用自訂地圖建立 GameWorld（地圖會加入資料一起驗證） */
export interface CustomWorldOptions {
  seed?: number;
  chests?: { at: [number, number]; lootTable: string }[];
  /** 附加到遊戲資料的測試用資料（只加資料、不改程式） */
  extra?: { skills?: unknown[]; enemies?: unknown[]; lootTables?: unknown[] };
}

export function createWorldWithMap(
  rows: string[],
  spawns: { enemyId: string; at: [number, number] }[] = [],
  options: CustomWorldOptions = {},
) {
  const { seed = 1, chests = [], extra = {} } = options;
  const data = DataRegistry.load({
    ...gameData,
    skills: [...gameData.skills, ...(extra.skills ?? [])],
    enemies: [...gameData.enemies, ...(extra.enemies ?? [])],
    lootTables: [...gameData.lootTables, ...(extra.lootTables ?? [])],
    maps: [...gameData.maps, { id: 'map.custom', rows, spawns, chests }],
  });
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, mapId: 'map.custom', commands, events, seed });
  return { world, commands, events, data };
}

/** 讓玩家（幾乎）不會死，方便觀察怪物行為 */
export function makeInvulnerable(actor: Actor): void {
  actor.stats.setBase('maxHp', 1e9);
  actor.hp = 1e9;
  noBaseRegen(actor);
}

/** 關掉基礎生命 / 魔力回復（測試需要精確的回復量時使用） */
export function noBaseRegen(actor: Actor): void {
  actor.stats.setBase('hpRegenPct', 0);
  actor.stats.setBase('manaRegenPct', 0);
}

export const enemiesOf = (world: GameWorld) => world.actors.filter((a) => a.faction === 'enemy');

/** 執行 seconds 秒的邏輯 Tick；每個 Tick 前呼叫 beforeTick（可用來模擬按住按鍵） */
export function run(world: GameWorld, seconds: number, beforeTick?: (tick: number) => void): void {
  const ticks = Math.round(seconds / DT);
  for (let t = 0; t < ticks; t++) {
    beforeTick?.(t);
    world.update(DT);
  }
}
