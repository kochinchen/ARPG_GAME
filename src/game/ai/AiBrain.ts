import type { Vec2 } from '../../core/math/Vec2';
import type { ActorId } from '../entities/ActorTypes';

export type AiStateName = 'idle' | 'chase' | 'return';

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
  alertTargetId: ActorId | null;
  alertTimer: number;
  /** 這次追擊是被同伴叫來的（不再往外叫，警戒只傳一層） */
  rallied: boolean;
  /** 集體戰術分配的站位（SquadTactics）；null = 直接追目標 */
  slot: Vec2 | null;
  /** 貼身的近戰已達上限：在外圈等候補位，不出手 */
  waiting: boolean;
  /** 閒置時在出生點附近走動：距離下次走動的秒數 */
  wanderTimer: number;
}

export interface BrainOptions {
  detectRange: number;
  leashRange: number;
  skills: readonly string[];
  keepDistance?: number;
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
    alertTargetId: null,
    alertTimer: 0,
    rallied: false,
    slot: null,
    waiting: false,
  };
}
