import { vec2, type Vec2 } from '../../core/math/Vec2';

export type ActorId = number;
export type Faction = 'player' | 'enemy' | 'summon';

export interface ActorInit {
  id: ActorId;
  faction: Faction;
  position: Vec2;
  radius: number;
  moveSpeed: number;
}

/**
 * 玩家、怪物、召喚物共用的資料結構。只存狀態，行為由各 System 負責。
 */
export class Actor {
  readonly id: ActorId;
  readonly faction: Faction;
  position: Vec2;
  /** 上一個 Tick 的位置，Render 用來插值 */
  prevPosition: Vec2;
  radius: number;
  /** Tile / 秒 */
  moveSpeed: number;
  /** 待走的 Waypoint，第一個是目前的目標 */
  path: Vec2[] = [];
  /** 面向（單位向量） */
  facing: Vec2 = vec2(1, 0);

  constructor(init: ActorInit) {
    this.id = init.id;
    this.faction = init.faction;
    this.position = init.position;
    this.prevPosition = init.position;
    this.radius = init.radius;
    this.moveSpeed = init.moveSpeed;
  }

  get isMoving(): boolean {
    return this.path.length > 0;
  }
}
