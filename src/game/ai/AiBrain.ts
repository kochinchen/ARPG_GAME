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
  /** 上次後退時的施放次數：至少出手一次才會再後退（避免被追時一直逃、從不攻擊） */
  castsAtRetreat: number;
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
  };
}
