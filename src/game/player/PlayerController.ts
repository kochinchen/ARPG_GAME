import type { Vec2 } from '../../core/math/Vec2';
import type { GameCommand } from '../Commands';
import type { Actor } from '../entities/Actor';
import type { Pathfinder } from '../movement/Pathfinder';

/**
 * 把 Command 轉成玩家意圖。只協調其他系統，不自己計算移動或傷害。
 */
export class PlayerController {
  constructor(
    private readonly player: Actor,
    private readonly pathfinder: Pathfinder,
  ) {}

  handle(command: GameCommand): void {
    switch (command.type) {
      case 'PrimaryAction':
        // M2 起：先問 TargetingService 游標下是否有敵人，有就攻擊
        this.moveTo(command.worldPos);
        break;
      case 'CastRight':
      case 'SelectRightSlot':
      case 'UsePotion':
        // M4 實作
        break;
    }
  }

  private moveTo(target: Vec2): void {
    this.player.path = this.pathfinder.findPath(this.player.position, target, this.player.radius);
  }
}
