import type { Vec2 } from '../core/math/Vec2';
import type { ActorId } from './entities/Actor';

/**
 * Input / UI 能對遊戲送出的所有指令。
 * 送出者只描述「玩家想做什麼」，由 game 內的系統決定實際結果。
 *
 * targetId：畫面層判斷游標下的角色（角色有高度，點到頭或身體都算），
 * 由 game 再驗證是否為合法目標。
 */
export type GameCommand =
  /** 左鍵按下（held=false）或按住期間的重複送出（held=true） */
  | { type: 'PrimaryAction'; worldPos: Vec2; targetId: ActorId | null; held: boolean }
  /** 左鍵放開 */
  | { type: 'PrimaryRelease' }
  /** 右鍵：施放目前啟用的右鍵技能 */
  | { type: 'CastRight'; worldPos: Vec2; targetId: ActorId | null }
  /** Q / W / E */
  | { type: 'SelectRightSlot'; slot: 0 | 1 | 2 }
  /** Space：同時回復 HP 與 MP */
  | { type: 'UsePotion' };

export type GameCommandType = GameCommand['type'];
