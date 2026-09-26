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
  /** 最近一次被誰打；閒置時會對其反擊 */
  provokedBy: ActorId | null;
}

export function createBrain(home: Vec2, detectRange: number, leashRange: number): AiBrain {
  return { state: 'idle', home, detectRange, leashRange, targetId: null, provokedBy: null };
}
