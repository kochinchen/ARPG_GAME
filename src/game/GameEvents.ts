import type { EventBus } from '../core/EventBus';
import type { Vec2 } from '../core/math/Vec2';
import type { Element } from '../data/schema/common';
import type { ActorId, Faction } from './entities/Actor';
import type { EquipmentSlot } from './items/ItemInstance';

/**
 * 遊戲事件清單。一件事發生、多個系統要反應時使用（見 ARCHITECTURE.md 第 G 節）。
 */
export interface GameEvents {
  /** 開始施放技能（Render 播放動作） */
  SkillCast: { actorId: ActorId; skillId: string; targetId: ActorId | null; point: Vec2 };
  /** 技能無法施放 */
  SkillFailed: { actorId: ActorId; skillId: string; reason: 'mana' };
  /** 範圍效果觸發（Render 播放擴散圈） */
  AreaTriggered: { skillId: string; position: Vec2; radius: number; element: Element | null };
  ActorDamaged: {
    targetId: ActorId;
    sourceId: ActorId | null;
    amount: number;
    isCrit: boolean;
    element: Element;
    position: Vec2;
  };
  ActorDied: {
    actorId: ActorId;
    faction: Faction;
    defId: string | null;
    killerId: ActorId | null;
    position: Vec2;
  };
  /** 玩家倒地後回到存檔點（玩家死亡本身為 ActorDied，faction = 'player'） */
  PlayerRespawned: { position: Vec2 };
  PotionUsed: { hpRestored: number; mpRestored: number; remaining: number };
  ChestOpened: { chestId: number; position: Vec2; lootTable: string };
  ItemPickedUp: { uid: string; position: Vec2 };
  /** count：這次撿到幾瓶 */
  PotionPickedUp: { count: number; position: Vec2 };
  GoldPickedUp: { amount: number; position: Vec2 };
  PickupFailed: { reason: 'inventoryFull' };
  ItemEquipped: { uid: string; slot: EquipmentSlot };
  ItemUnequipped: { uid: string; slot: EquipmentSlot };
  /** 手上的物品不能穿在這個欄位 */
  EquipFailed: { slot: EquipmentSlot };
  /** 玩家把手上的物品丟在地上 */
  ItemDropped: { position: Vec2 };
}

export type GameEventBus = EventBus<GameEvents>;
