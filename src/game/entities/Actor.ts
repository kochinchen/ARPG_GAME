import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { AiBrain } from '../ai/AiBrain';
import type { StatBlock } from '../stats/StatBlock';

import type { ActorId, Faction } from './ActorTypes';

export type { ActorId, Faction } from './ActorTypes';

export interface ActorInit {
  id: ActorId;
  faction: Faction;
  name: string;
  /** 資料來源 ID（例如 'enemy.training_dummy'）；玩家為 null */
  defId: string | null;
  position: Vec2;
  radius: number;
  stats: StatBlock;
  ai?: AiBrain | null;
}

/**
 * 玩家、怪物、召喚物共用的資料結構。只存狀態，行為由各 System 負責。
 */
export class Actor {
  readonly id: ActorId;
  readonly faction: Faction;
  readonly name: string;
  readonly defId: string | null;
  readonly stats: StatBlock;
  /** 有 AI 的角色（怪物、召喚物）；玩家與訓練木樁為 null */
  readonly ai: AiBrain | null;
  radius: number;

  position: Vec2;
  /** 上一個 Tick 的位置，Render 用來插值 */
  prevPosition: Vec2;
  /** 待走的 Waypoint，第一個是目前的目標 */
  path: Vec2[] = [];
  /** 面向（單位向量） */
  facing: Vec2 = vec2(1, 0);

  hp: number;
  alive = true;
  /** 最後一個造成傷害的來源，用於判定擊殺者 */
  lastDamagedBy: ActorId | null = null;

  // ---- 攻擊狀態（由 AttackSystem 使用） ----
  attackTarget: ActorId | null = null;
  /** true：持續攻擊；false：打完一下就停 */
  attackHold = false;
  attackCooldown = 0;
  /** 累計攻擊次數 */
  attackCount = 0;
  /** 追擊目標時重新尋路的冷卻 */
  repathCooldown = 0;

  constructor(init: ActorInit) {
    this.id = init.id;
    this.faction = init.faction;
    this.name = init.name;
    this.defId = init.defId;
    this.position = init.position;
    this.prevPosition = init.position;
    this.radius = init.radius;
    this.stats = init.stats;
    this.ai = init.ai ?? null;
    this.hp = init.stats.get('maxHp');
  }

  /** Tile / 秒 */
  get moveSpeed(): number {
    return this.stats.get('moveSpeed');
  }

  get maxHp(): number {
    return this.stats.get('maxHp');
  }

  get isMoving(): boolean {
    return this.path.length > 0;
  }
}
