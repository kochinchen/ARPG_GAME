import type { EventBus } from '../core/EventBus';
import type { Vec2 } from '../core/math/Vec2';
import type { Element } from '../data/schema/common';
import type { ActorId, Faction } from './entities/Actor';
import type { SkillCategory } from '../data/schema/skill';
import type { StatusKind } from '../data/schema/effects';
import type { EquipmentSlot } from './items/ItemInstance';

/**
 * 遊戲事件清單。一件事發生、多個系統要反應時使用（見 ARCHITECTURE.md 第 G 節）。
 */
export interface GameEvents {
  /** 開始施放技能（Render 播放動作） */
  SkillCast: {
    actorId: ActorId;
    skillId: string;
    targetId: ActorId | null;
    point: Vec2;
    direction: Vec2;
    /** 距離效果觸發還有幾秒（前搖提示的顯示時間） */
    impactIn: number;
  };
  /** 技能無法施放 */
  SkillFailed: { actorId: ActorId; skillId: string; reason: 'mana' };
  /** 範圍效果觸發（Render 播放擴散圈） */
  AreaTriggered: {
    skillId: string;
    position: Vec2;
    radius: number;
    element: Element | null;
    direction: Vec2;
    angleDeg: number;
  };
  /** 連鎖效果依序經過的位置（Render 畫閃電） */
  ChainTriggered: { points: Vec2[]; element: Element };
  StatusApplied: { actorId: ActorId; kind: StatusKind };
  /** 防禦姿態 / 反擊觸發 */
  StatusTriggered: { actorId: ActorId; kind: StatusKind };
  /** 有 Combo 的連段第三招實際施放（Codex 記錄一次使用） */
  ComboCompleted: { comboId: string; ruleId: string; name: string; skills: [string, string, string]; description: string[] };
  /** 第一次發現某個 Combo */
  ComboDiscovered: { comboId: string; name: string; description: string[] };
  /** 連段中斷（沒有目標、魔力不足…） */
  ComboInterrupted: { step: number };
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
    /** 擊殺可得的經驗（已套用樓層與精英倍率） */
    xp: number;
    /** 精英怪：另外掉落精英掉落表 */
    elite: boolean;
  };
  /** 進入某一層（含第一次進入遊戲） */
  FloorEntered: { floor: number; mapId: string };
  CheckpointActivated: { kind: 'stairs' | 'midway'; position: Vec2 };
  ExitOpened: { floor: number };
  /** 點了尚未開啟的出口 */
  ExitLocked: { remaining: number };
  /** 要離開樓層，但地上還有稀有以上的物品：等待玩家確認（ConfirmLeaveFloor） */
  LeaveFloorConfirm: { direction: 'down' | 'up'; toFloor: number; valuableItems: number };
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
  /** 手上的物品不能穿在這個欄位，或等級不足 */
  EquipFailed: { slot: EquipmentSlot; reason: 'wrongSlot' | 'level' };
  XpGained: { amount: number };
  PlayerLeveledUp: { level: number };
  SkillLearned: { skillId: string; rank: number };
  /** 第一次學會 T4：其他類別的 T1～T3 開放 */
  MasteryAchieved: { category: SkillCategory };
  T4CategoryUnlocked: { category: SkillCategory };
  /** 分配屬性點；points 為分配後該屬性的總點數 */
  AttributeAllocated: { attribute: string; points: number };
  /** 玩家把手上的物品丟在地上 */
  ItemDropped: { position: Vec2 };
}

export type GameEventBus = EventBus<GameEvents>;
