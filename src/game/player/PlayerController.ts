import type { Vec2 } from '../../core/math/Vec2';
import type { GameCommand } from '../Commands';
import type { Actor } from '../entities/Actor';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';

/**
 * 把 Command 轉成玩家意圖。只協調其他系統，不自己計算移動或傷害。
 *
 * 左鍵行為（Diablo 式）：
 * - 點地面：移動；按住並拖曳：持續朝游標移動，途中掃過敵人也不會停下攻擊
 * - 點敵人：走過去打一下；按住：持續攻擊同一目標，直到放開或目標死亡
 */
export class PlayerController {
  /** 這次左鍵按下時決定的模式，按住期間維持不變 */
  private holdMode: 'move' | 'attack' | null = null;
  /** 按下左鍵時的攻擊次數，用來判斷放開前是否已經打出至少一下 */
  private attackCountAtPress = 0;

  constructor(
    private readonly player: Actor,
    private readonly pathfinder: Pathfinder,
    private readonly targeting: TargetingService,
  ) {}

  handle(command: GameCommand): void {
    switch (command.type) {
      case 'PrimaryAction':
        if (command.held) this.onPrimaryHeld(command.worldPos, command.targetId);
        else this.onPrimaryPressed(command.worldPos, command.targetId);
        break;
      case 'PrimaryRelease':
        this.onPrimaryReleased();
        break;
      case 'CastRight':
      case 'SelectRightSlot':
      case 'UsePotion':
        // M4 實作
        break;
    }
  }

  private onPrimaryPressed(worldPos: Vec2, targetId: number | null): void {
    this.attackCountAtPress = this.player.attackCount;
    const target = this.resolveTarget(worldPos, targetId);
    if (target) {
      this.holdMode = 'attack';
      this.startAttack(target, false);
    } else {
      this.holdMode = 'move';
      this.moveTo(worldPos);
    }
  }

  private onPrimaryHeld(worldPos: Vec2, targetId: number | null): void {
    if (this.holdMode === 'attack') {
      const current = this.player.attackTarget;
      if (current !== null && this.targeting.getValidTarget(this.player, current)) {
        this.player.attackHold = true;
        return;
      }
      // 目標已死亡：改打游標下的下一個敵人，沒有就原地待命
      const next = this.resolveTarget(worldPos, targetId);
      if (next) this.startAttack(next, true);
      return;
    }
    this.moveTo(worldPos);
  }

  private onPrimaryReleased(): void {
    this.holdMode = null;
    this.player.attackHold = false;
    // 已經打出至少一下就停手；還沒打到（仍在走過去）則維持「打一下」
    if (this.player.attackCount > this.attackCountAtPress) this.player.attackTarget = null;
  }

  private resolveTarget(worldPos: Vec2, targetId: number | null): Actor | null {
    if (targetId !== null) {
      const target = this.targeting.getValidTarget(this.player, targetId);
      if (target) return target;
    }
    return this.targeting.pickAt(this.player, worldPos);
  }

  private startAttack(target: Actor, hold: boolean): void {
    this.player.attackTarget = target.id;
    this.player.attackHold = hold;
    this.player.repathCooldown = 0;
  }

  private moveTo(target: Vec2): void {
    this.player.attackTarget = null;
    this.player.path = this.pathfinder.findPath(this.player.position, target, this.player.radius);
  }
}
