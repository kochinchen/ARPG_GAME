import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { DeviceEffectDef, StatusKind } from '../../data/schema/effects';
import type { SkillDef } from '../../data/schema/skill';
import type { AiBrain } from '../ai/AiBrain';
import type { StepMods } from '../combo/StepMods';
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
  /** 外觀大小（碰撞半徑有上限，外觀可以更大：隨機體型、Boss）；省略 = radius */
  visualRadius?: number;
  stats: StatBlock;
  ai?: AiBrain | null;
  /** 會的技能與等級 */
  skillRanks?: ReadonlyMap<string, number>;
  isBoss?: boolean;
  /** 挑戰樓層的中途小王：魔王數值打折、沒有階段變化與魔王血條（docs/ENDGAME.md） */
  miniBoss?: boolean;
  /** 精英怪（每群的隊長）：名稱加上詞綴、較大、較強、掉落較好 */
  elite?: boolean;
  /** 召喚者（Boss 召喚的骷髏）：不給經驗、不掉寶、不計入樓層擊殺 */
  summonedBy?: ActorId | null;
  /** 被擊殺時給予的經驗 */
  xpReward?: number;
  /** 特殊技能（普通攻擊以外）的範圍倍率：怪物隨樓層提高；直線招式不受影響 */
  skillArea?: number;
  /** 機關（戰術技能佈置的物件）；一般角色為 null */
  device?: DeviceState | null;
}

/** 機關的執行狀態（由 DeviceSystem 管理；不存檔，換樓層時隨實體一起清除） */
export interface DeviceState {
  def: DeviceEffectDef;
  /** 佈置者（玩家）；子效果以它為施放者 */
  ownerId: ActorId;
  skillId: string;
  rank: number;
  /** 佈置時的面向（絆索網橫放的方向） */
  direction: Vec2;
  /** 第幾個佈置的（越小越舊；超過上限時最舊的先消失） */
  order: number;
  /** 剩餘時間（秒） */
  remaining: number;
  /** 地雷的待命時間 */
  armTimer: number;
  /** 圖騰距離下一發的時間與剩餘發數 */
  shotTimer: number;
  shotsLeft: number;
  /** 絆索網剩餘觸發次數，與已經絆倒過的敵人 */
  triggersLeft: number;
  readonly tripped: Set<ActorId>;
}

/** 身上的狀態（由 StatusEffectSystem 管理） */
export interface StatusInstance {
  kind: StatusKind;
  remaining: number;
  magnitude: number;
  source: Actor | null;
  /** 持續傷害（燃燒 / 中毒 / 流血）：每秒傷害，施加時依施放者的屬性計算 */
  dps: number;
  tickTimer: number;
  /** 弱化：物理抗性降低（magnitude 為元素抗性降低） */
  physicalMagnitude?: number;
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
  /** 指定施放等級；省略 = 角色的技能等級 */
  rank?: number;
  /** Combo 加成（連段中的這一步） */
  mods?: Readonly<StepMods>;
  /** 原地施放（按住 Shift）：不走向目標；目標不在範圍內時朝 point 施放 */
  stationary?: boolean;
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
  mods: Readonly<StepMods>;
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
  readonly isBoss: boolean;
  readonly miniBoss: boolean;
  readonly elite: boolean;
  readonly summonedBy: ActorId | null;
  readonly xpReward: number;
  readonly skillArea: number;
  readonly device: DeviceState | null;
  radius: number;
  /** 外觀大小（Render 依此縮放模型） */
  readonly visualRadius: number;

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

  // ---- 狀態（由 StatusEffectSystem 使用） ----
  statuses: StatusInstance[] = [];

  constructor(init: ActorInit) {
    this.id = init.id;
    this.faction = init.faction;
    this.name = init.name;
    this.defId = init.defId;
    this.position = init.position;
    this.prevPosition = init.position;
    this.radius = init.radius;
    this.visualRadius = init.visualRadius ?? init.radius;
    this.stats = init.stats;
    this.ai = init.ai ?? null;
    this.isBoss = init.isBoss ?? false;
    this.miniBoss = init.miniBoss ?? false;
    this.elite = init.elite ?? false;
    this.summonedBy = init.summonedBy ?? null;
    this.xpReward = init.xpReward ?? 0;
    this.skillArea = init.skillArea ?? 1;
    this.device = init.device ?? null;
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

  hasStatus(kind: StatusKind): boolean {
    return this.statuses.some((s) => s.kind === kind);
  }

  /** 冰凍、暈眩或浮空：不能移動、施放、思考 */
  get isDisabled(): boolean {
    return this.hasStatus('freeze') || this.hasStatus('stun') || this.hasStatus('airborne');
  }

  /** 目前意圖的目標（沒有則 null） */
  get intentTargetId(): ActorId | null {
    return this.intent?.targetId ?? null;
  }
}
