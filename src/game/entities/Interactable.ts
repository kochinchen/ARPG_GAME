import type { Vec2 } from '../../core/math/Vec2';
import type { ItemInstance } from '../items/ItemInstance';

export type GroundContent =
  | { kind: 'item'; item: ItemInstance }
  | { kind: 'potion'; potionId: string; count: number }
  | { kind: 'gold'; amount: number };

/** 地上的物品、藥水、金幣 */
export interface GroundItem {
  kind: 'ground';
  id: number;
  position: Vec2;
  content: GroundContent;
  /** 玩家自己丟下的：不會自動撿回（藥水、金幣），要點擊才撿 */
  droppedByPlayer?: boolean;
}

export interface Chest {
  kind: 'chest';
  id: number;
  position: Vec2;
  lootTable: string;
  opened: boolean;
}

/** 本層出口：擊敗足夠怪物後開啟，點擊進入下一層 */
export interface ExitPortal {
  kind: 'exit';
  id: number;
  position: Vec2;
  open: boolean;
}

/** 玩家可以點擊互動的物件 */
export type Interactable = GroundItem | Chest | ExitPortal;
