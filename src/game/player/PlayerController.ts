import type { Vec2 } from '../../core/math/Vec2';
import type { GameCommand } from '../Commands';
import type { Actor } from '../entities/Actor';

import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import type { InteractionSystem } from './InteractionSystem';
import type { ItemActions } from './ItemActions';
import type { PlayerLoadout } from './PlayerLoadout';
import type { PotionBelt } from './PotionBelt';

/**
 * 把 Command 轉成玩家意圖。只協調其他系統，不自己計算移動或傷害。
 *
 * 左鍵行為（Diablo 式）：
 * - 點地面：移動；按住並拖曳：持續朝游標移動，途中掃過敵人也不會停下攻擊
 * - 點敵人：走過去用左鍵技能打一下；按住：持續攻擊同一目標，直到放開或目標死亡
 * - 點地上物品 / 寶箱：走過去撿起 / 開啟
 * - 手上拿著物品時點地面：丟在腳下
 * 右鍵：施放目前 Q / W / E 選中的技能；按住可連續施放
 */
export class PlayerController {
  /** 這次左鍵按下時決定的模式，按住期間維持不變 */
  private holdMode: 'move' | 'attack' | 'interact' | null = null;
  /** 按下左鍵時的施放次數，用來判斷放開前是否已經打出至少一下 */
  private castCountAtPress = 0;

  constructor(
    private readonly player: Actor,
    private readonly pathfinder: Pathfinder,
    private readonly targeting: TargetingService,
    private readonly loadout: PlayerLoadout,
    private readonly potions: PotionBelt,
    private readonly interaction: InteractionSystem,
    private readonly items: ItemActions,
  ) {}

  handle(command: GameCommand): void {
    // 倒地期間不接受任何操作
    if (!this.player.alive) return;
    switch (command.type) {
      case 'PrimaryAction':
        if (command.held) this.onPrimaryHeld(command.worldPos, command.targetId);
        else this.onPrimaryPressed(command.worldPos, command.targetId, command.interactId ?? null);
        break;
      case 'PrimaryRelease':
        this.onPrimaryReleased();
        break;
      case 'CastRight':
        this.castRight(command.worldPos, command.targetId);
        break;
      case 'SelectRightSlot':
        this.loadout.select(command.slot);
        break;
      case 'UsePotion':
        this.potions.use();
        break;
      case 'InventoryClick':
        this.items.clickInventory(command.cell);
        break;
      case 'EquipmentClick':
        this.items.clickEquipment(command.slot);
        break;
    }
  }

  private onPrimaryPressed(worldPos: Vec2, targetId: number | null, interactId: number | null): void {
    this.castCountAtPress = this.player.castCount;
    // 手上拿著物品：這次點擊是「丟下」，不移動也不攻擊
    if (this.items.dropHeld()) {
      this.holdMode = 'interact';
      return;
    }
    if (interactId !== null && this.interaction.find(interactId)) {
      this.holdMode = 'interact';
      this.player.intent = null;
      this.interaction.setTarget(interactId);
      return;
    }
    const target = this.resolveTarget(worldPos, targetId);
    if (target) {
      this.holdMode = 'attack';
      this.attack(target, false);
    } else {
      this.holdMode = 'move';
      this.moveTo(worldPos);
    }
  }

  private onPrimaryHeld(worldPos: Vec2, targetId: number | null): void {
    // 點物品後按住不放：維持撿取，不改成移動
    if (this.holdMode === 'interact') return;
    if (this.holdMode === 'attack') {
      const intent = this.player.intent;
      if (intent?.skillId === this.loadout.left && intent.targetId !== null && this.targeting.getValidTarget(this.player, intent.targetId)) {
        intent.hold = true;
        return;
      }
      // 目標已死亡：改打游標下的下一個敵人，沒有就原地待命
      const next = this.resolveTarget(worldPos, targetId);
      if (next) this.attack(next, true);
      return;
    }
    this.moveTo(worldPos);
  }

  private onPrimaryReleased(): void {
    this.holdMode = null;
    const intent = this.player.intent;
    if (!intent || intent.skillId !== this.loadout.left) return;
    // 已經打出至少一下就停手；還沒打到（仍在走過去）則維持「打一下」
    if (this.player.castCount > this.castCountAtPress) this.player.intent = null;
    else intent.hold = false;
  }

  private castRight(worldPos: Vec2, targetId: number | null): void {
    const skillId = this.loadout.activeRightSkill;
    if (!skillId) return;
    const target = this.resolveTarget(worldPos, targetId);
    // 游標在敵人身上時瞄準敵人腳下：角色有高度，游標下的地面點其實在敵人後方
    const point = target?.position ?? worldPos;
    this.interaction.clear();
    this.player.intent = { skillId, targetId: target?.id ?? null, point, hold: false };
    this.player.repathCooldown = 0;
  }

  private resolveTarget(worldPos: Vec2, targetId: number | null): Actor | null {
    if (targetId !== null) {
      const target = this.targeting.getValidTarget(this.player, targetId);
      if (target) return target;
    }
    return this.targeting.pickAt(this.player, worldPos);
  }

  private attack(target: Actor, hold: boolean): void {
    this.interaction.clear();
    this.player.intent = { skillId: this.loadout.left, targetId: target.id, point: target.position, hold };
    this.player.repathCooldown = 0;
  }

  private moveTo(target: Vec2): void {
    this.interaction.clear();
    this.player.intent = null;
    this.player.path = this.pathfinder.findPath(this.player.position, target, this.player.radius);
  }
}
