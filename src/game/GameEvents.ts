import type { EventBus } from '../core/EventBus';
import type { Vec2 } from '../core/math/Vec2';
import type { Element } from '../data/schema/common';
import type { ActorId, Faction } from './entities/Actor';

/**
 * 遊戲事件清單。一件事發生、多個系統要反應時使用（見 ARCHITECTURE.md 第 G 節）。
 */
export interface GameEvents {
  /** 攻擊動作出手（Render 播放揮擊動畫） */
  ActorAttacked: { actorId: ActorId; targetId: ActorId };
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
}

export type GameEventBus = EventBus<GameEvents>;
