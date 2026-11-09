import type { Vec2 } from '../../core/math/Vec2';
import type { ActorId } from '../entities/ActorTypes';

export type AiStateName = 'idle' | 'chase' | 'return' | 'call' | 'flee' | 'errand';

import type { EnemyTactic } from '../../data/schema/enemy';

export type { EnemyTactic };

/** AI 看得到的屍體（GameWorld.corpses） */
export interface CorpseView {
  readonly defId: string;
  readonly position: Vec2;
}

/** 離開戰鬥去做的事：撿藥水、吃屍體、復活屍體（ErrandState） */
export type Errand =
  | { kind: 'potion'; itemId: number; position: Vec2 }
  | { kind: 'devour' | 'raise'; corpse: CorpseView; position: Vec2; timer: number };

/**
 * 掛在 Actor 上的 AI 資料（只存狀態，行為在 states/）。
 */
export interface AiBrain {
  state: AiStateName;
  /** 出生點；放棄追擊時走回這裡 */
  home: Vec2;
  detectRange: number;
  leashRange: number;
  /** 目前追擊的目標 */
  targetId: ActorId | null;
  /** 最近一次被誰打；閒置或走回家途中會對其反擊 */
  provokedBy: ActorId | null;
  /** 被打中後的憤怒秒數：期間超過 Leash 也不放棄追擊（避免在範圍外被活活射死） */
  angerTimer: number;
  /** 主要攻擊（追擊時使用） */
  skillId: string;
  /** 特殊技能：冷卻結束且目標在範圍內時優先使用（依順序） */
  specialSkills: readonly string[];
  /** 目標比這個距離近時後退（0 = 不後退，近戰怪） */
  keepDistance: number;
  /** 正在後退拉開距離 */
  retreating: boolean;
  /** 上次後退 / 移動到後排站位時的施放次數：至少出手一次才會再移動（避免被追時一直逃、從不攻擊） */
  castsAtRetreat: number;
  /** 被同伴叫醒：要追的目標與剩下的反應時間（秒） */
  /** 單獨行動：不招呼同伴、也不被同伴叫醒（噴錢的結晶獸） */
  solitary: boolean;
  alertTargetId: ActorId | null;
  alertTimer: number;
  /** 這次追擊是被同伴叫來的（不再往外叫，警戒只傳一層） */
  rallied: boolean;
  /** 集體戰術分配的站位（SquadTactics）；null = 直接追目標 */
  slot: Vec2 | null;
  /** 成對的魔王一起出招前：趕到這個站位，到了也不出手，等 BossPairSystem 發動；null = 沒有 */
  gatherAt: Vec2 | null;
  /** 貼身的近戰已達上限：在外圈等候補位，不出手 */
  waiting: boolean;
  /** 遊擊正在繞到目標背後的站位：先走過去，到了才出手 */
  flanking: boolean;
  /** 閒置時在出生點附近走動：距離下次走動的秒數 */
  wanderTimer: number;
  /** 生成時屬於哪一群（size = 生成時的隻數，含讀檔前已擊殺的）；null = 不屬於任何一群 */
  pack: { id: number; size: number } | null;
  /** 這一群已經派過傳令兵、或是被叫來支援的（不再派傳令兵，避免一路叫到整張地圖） */
  packCalled: boolean;
  /** 傳令兵：依序要去叫的群（pack id），叫完回來打 callTargetId */
  callPacks: number[];
  callTargetId: ActorId | null;
  /** 正在閃避投射物的剩餘秒數（期間不追擊、不出手） */
  dodgeTimer: number;
  /** 距離下次能對投射物反應的秒數 */
  dodgeCooldown: number;
  /** 會的特殊行為（撿藥水、吃屍體、復活） */
  tactics: readonly EnemyTactic[];
  /** 正在做的事（ErrandState）；null = 沒有 */
  errand: Errand | null;
  /** 已經喝過地上的藥水（每隻一次） */
  drankPotion: boolean;
  /** 吃過幾具屍體 */
  eats: number;
  /** 復活過幾具屍體、距離下次能復活的秒數 */
  raises: number;
  raiseCooldown: number;
  /** 已經擲過誘敵（每隻一次） */
  lureRolled: boolean;
  /** 誘敵：逃往的位置與剩下的秒數 */
  fleeTo: Vec2 | null;
  fleeTimer: number;
  /** 躲地上的範圍傷害累積的秒數；超過 patience 就硬闖 braveTimer 秒 */
  hazardTime: number;
  braveTimer: number;
  /** 距離下次找藥水 / 屍體的秒數（不要每個 Tick 都掃一遍地上） */
  scanTimer: number;
  /** 目前套用的狀況速度加成（Pace；變了才改 Modifier） */
  pace: number;
  /** 靈活派：這一箭的隨機值（-1～1）與擲骰時的施放次數；目前套用的射程加成（Tile） */
  volleyRoll: number;
  volleyCast: number;
  volleyRange: number;
  /** 躲掩護：目前的站位在巨獸背後（出手之間走回去的距離比較短） */
  covered: boolean;
  /** 圍獵：一起撲上去時，還要等這麼多秒才出手（第一隻先撲，其他依序跟上） */
  huntHold: number;
  /** 自爆：已經改用自爆技能衝上去 */
  kamikaze: boolean;
  /** 下次逃跑（FleeState）的秒數；null = 照誘敵的 maxTime */
  fleeFor: number | null;
  /** 跑步（EnemyDef.run）：相對於走路速度的加成、目標多遠才跑、第一次發現時衝刺；null = 沒有 */
  run: { bonus: number; beyond: number; charge: boolean } | null;
  /** 第一次發現目標的衝刺已經用過 */
  charged: boolean;
  /** 正在衝刺：不論距離都跑，跑到特殊技能的距離就出招，不等圍獵繞圈 */
  charging: boolean;
}

export interface BrainOptions {
  detectRange: number;
  leashRange: number;
  skills: readonly string[];
  keepDistance?: number;
  solitary?: boolean;
  tactics?: readonly EnemyTactic[];
  run?: { bonus: number; beyond: number; charge: boolean };
}

export function createBrain(home: Vec2, options: BrainOptions): AiBrain {
  const [primary, ...special] = options.skills;
  return {
    state: 'idle',
    home,
    detectRange: options.detectRange,
    leashRange: options.leashRange,
    targetId: null,
    provokedBy: null,
    angerTimer: 0,
    skillId: primary!,
    specialSkills: special,
    keepDistance: options.keepDistance ?? 0,
    retreating: false,
    castsAtRetreat: -1,
    wanderTimer: 0,
    solitary: options.solitary ?? false,
    alertTargetId: null,
    alertTimer: 0,
    rallied: false,
    slot: null,
    gatherAt: null,
    waiting: false,
    flanking: false,
    pack: null,
    packCalled: false,
    callPacks: [],
    callTargetId: null,
    dodgeTimer: 0,
    dodgeCooldown: 0,
    tactics: options.tactics ?? [],
    run: options.run ?? null,
    charged: false,
    charging: false,
    errand: null,
    drankPotion: false,
    eats: 0,
    raises: 0,
    raiseCooldown: 0,
    lureRolled: false,
    fleeTo: null,
    fleeTimer: 0,
    hazardTime: 0,
    braveTimer: 0,
    scanTimer: 0,
    pace: 0,
    volleyRoll: 0,
    volleyCast: -1,
    volleyRange: 0,
    covered: false,
    huntHold: 0,
    kamikaze: false,
    fleeFor: null,
  };
}
