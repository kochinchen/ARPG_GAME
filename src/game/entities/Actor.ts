import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { SkillDef } from '../../data/schema/skill';
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
  /** 會的技能與等級 */
  skillRanks?: ReadonlyMap<string, number>;
}

/** 想要施放的技能（由 PlayerController / AI 設定，SkillSystem 執行） */
export interface SkillIntent {
  skillId: string;
  /** targeting = 'enemy' 時的目標 */
  targetId: ActorId | null;
  /** 游標的 World 座標（direction / ground 使用） */
  point: Vec2;
  /** true：施放後保留意圖，持續施放（按住左鍵、怪物追擊）；false：施放一次 */
  hold: boolean;
}

/** 施放中的技能：施放時間結束前不能移動或施放其他技能 */
export interface CastState {
  skill: SkillDef;
  rank: number;
  targetId: ActorId | null;
  point: Vec2;
  direction: Vec2;
  elapsed: number;
  duration: number;
  fired: boolean;
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
  mana: number;
  alive = true;
  /** 最後一個造成傷害的來源，用於判定擊殺者 */
  lastDamagedBy: ActorId | null = null;

  // ---- 技能狀態（由 SkillSystem 使用） ----
  /** 技能 ID → 等級（1～5） */
  readonly skillRanks: Map<string, number>;
  intent: SkillIntent | null = null;
  cast: CastState | null = null;
  /** 技能 ID → 剩餘冷卻秒數 */
  readonly cooldowns = new Map<string, number>();
  /** 累計施放次數 */
  castCount = 0;
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
    this.skillRanks = new Map(init.skillRanks ?? []);
    this.hp = init.stats.get('maxHp');
    this.mana = init.stats.get('maxMana');
  }

  /** Tile / 秒 */
  get moveSpeed(): number {
    return this.stats.get('moveSpeed');
  }

  get maxHp(): number {
    return this.stats.get('maxHp');
  }

  get maxMana(): number {
    return this.stats.get('maxMana');
  }

  get isMoving(): boolean {
    return this.path.length > 0;
  }

  get isCasting(): boolean {
    return this.cast !== null;
  }

  /** 目前意圖的目標（沒有則 null） */
  get intentTargetId(): ActorId | null {
    return this.intent?.targetId ?? null;
  }
}
