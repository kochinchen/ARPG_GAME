import type { Vec2 } from '../core/math/Vec2';

/**
 * Input / UI 能對遊戲送出的所有指令。
 * 送出者只描述「玩家想做什麼」，由 game 內的系統決定實際結果。
 */
export type GameCommand =
  /** 左鍵：由 PlayerController 判斷是移動、攻擊還是撿取 */
  | { type: 'PrimaryAction'; worldPos: Vec2; held: boolean }
  /** 右鍵：施放目前啟用的右鍵技能 */
  | { type: 'CastRight'; worldPos: Vec2 }
  /** Q / W / E */
  | { type: 'SelectRightSlot'; slot: 0 | 1 | 2 }
  /** Space：同時回復 HP 與 MP */
  | { type: 'UsePotion' };

export type GameCommandType = GameCommand['type'];
