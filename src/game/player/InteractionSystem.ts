import { distance } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { Chest, GroundItem, Interactable } from '../entities/Interactable';
import type { GameEventBus } from '../GameEvents';
import type { ChestSystem } from '../items/ChestSystem';
import type { Inventory } from '../items/Inventory';
import type { Pathfinder } from '../movement/Pathfinder';
import type { Wallet } from './Wallet';

/** 走到這個距離內即可撿取 / 開啟（從角色中心算） */
const INTERACT_RANGE = 0.8;
/** 藥水與金幣走過去自動撿 */
const AUTO_PICKUP_RANGE = 0.6;

export interface InteractionWorld {
  groundItems: GroundItem[];
  chests: Chest[];
}

/**
 * 玩家與地上物品、寶箱的互動：點擊後走過去撿 / 開；藥水與金幣走過去自動撿。
 */
export class InteractionSystem {
  private targetId: number | null = null;

  constructor(
    private readonly player: Actor,
    private readonly world: InteractionWorld,
    private readonly inventory: Inventory,
    private readonly wallet: Wallet,
    private readonly chests: ChestSystem,
    private readonly pathfinder: Pathfinder,
    private readonly events: GameEventBus,
  ) {}

  get target(): number | null {
    return this.targetId;
  }

  find(id: number): Interactable | undefined {
    return this.world.groundItems.find((g) => g.id === id) ?? this.world.chests.find((c) => c.id === id && !c.opened);
  }

  /** 開始走向互動目標；目標不存在時回傳 false */
  setTarget(id: number): boolean {
    const target = this.find(id);
    if (!target) return false;
    this.targetId = id;
    this.player.path = this.pathfinder.findPath(this.player.position, target.position, this.player.radius);
    return true;
  }

  clear(): void {
    this.targetId = null;
  }

  update(): void {
    if (!this.player.alive) {
      this.targetId = null;
      return;
    }
    this.autoPickup();
    if (this.targetId === null) return;

    const target = this.find(this.targetId);
    if (!target) {
      this.targetId = null;
      return;
    }
    if (distance(this.player.position, target.position) > INTERACT_RANGE) {
      if (!this.player.isMoving) {
        this.player.path = this.pathfinder.findPath(this.player.position, target.position, this.player.radius);
        // 無法到達：放棄
        if (this.player.path.length === 0) this.targetId = null;
      }
      return;
    }
    this.player.path = [];
    this.targetId = null;
    if (target.kind === 'chest') this.chests.open(target);
    else this.pickUp(target, true);
  }

  private autoPickup(): void {
    for (const item of [...this.world.groundItems]) {
      if (item.content.kind === 'item' || item.droppedByPlayer) continue;
      if (distance(this.player.position, item.position) <= AUTO_PICKUP_RANGE) this.pickUp(item, false);
    }
  }

  /** explicit：玩家主動點擊（失敗時才顯示提示） */
  private pickUp(ground: GroundItem, explicit: boolean): void {
    const content = ground.content;
    switch (content.kind) {
      case 'item':
        if (!this.inventory.addItem(content.item)) {
          this.events.emit('PickupFailed', { reason: 'inventoryFull' });
          return;
        }
        this.events.emit('ItemPickedUp', { uid: content.item.uid, position: ground.position });
        break;
      case 'potion': {
        const added = this.inventory.addPotions(content.potionId, content.count);
        if (added > 0) {
          this.events.emit('PotionPickedUp', { count: added, position: ground.position });
        }
        if (added < content.count) {
          // 背包放不下的留在地上
          content.count -= added;
          if (explicit) this.events.emit('PickupFailed', { reason: 'inventoryFull' });
          return;
        }
        break;
      }
      case 'gold':
        this.wallet.add(content.amount);
        this.events.emit('GoldPickedUp', { amount: content.amount, position: ground.position });
        break;
    }
    this.world.groundItems.splice(this.world.groundItems.indexOf(ground), 1);
  }
}
