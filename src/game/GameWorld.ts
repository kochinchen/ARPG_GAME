import type { CommandQueue } from '../core/CommandQueue';
import type { DataRegistry } from '../data/DataRegistry';
import { MAP_TILES, type MapDef } from '../data/schema/map';
import type { GameCommand } from './Commands';
import { Actor, type ActorInit } from './entities/Actor';
import { MovementSystem } from './movement/MovementSystem';
import { NavGrid, tileCenter } from './movement/NavGrid';
import { Pathfinder } from './movement/Pathfinder';
import { PlayerController } from './player/PlayerController';
import { vec2, type Vec2 } from '../core/math/Vec2';

export interface GameWorldOptions {
  data: DataRegistry;
  mapId: string;
  commands: CommandQueue<GameCommand>;
}

/**
 * 持有所有 Entity 與 System，依固定順序執行每個 Tick。
 */
export class GameWorld {
  readonly map: MapDef;
  readonly nav: NavGrid;
  readonly actors: Actor[] = [];
  readonly player: Actor;

  private nextActorId = 1;
  private readonly commands: CommandQueue<GameCommand>;
  private readonly movement = new MovementSystem();
  private readonly playerController: PlayerController;

  constructor(options: GameWorldOptions) {
    const { data } = options;
    this.commands = options.commands;
    this.map = data.maps.get(options.mapId);
    this.nav = NavGrid.fromMap(this.map);

    this.player = this.spawnActor({
      faction: 'player',
      position: findSpawn(this.map),
      radius: data.balance.player.radius,
      moveSpeed: data.balance.player.moveSpeed,
    });
    this.playerController = new PlayerController(this.player, new Pathfinder(this.nav));
  }

  update(dt: number): void {
    for (const actor of this.actors) actor.prevPosition = actor.position;
    for (const command of this.commands.drain()) this.playerController.handle(command);
    this.movement.update(this.actors, dt);
  }

  private spawnActor(init: Omit<ActorInit, 'id'>): Actor {
    const actor = new Actor({ ...init, id: this.nextActorId++ });
    this.actors.push(actor);
    return actor;
  }
}

function findSpawn(map: MapDef): Vec2 {
  for (const [y, row] of map.rows.entries()) {
    const x = row.indexOf(MAP_TILES.spawn);
    if (x >= 0) return tileCenter(vec2(x, y));
  }
  throw new Error(`map '${map.id}' has no spawn`);
}
