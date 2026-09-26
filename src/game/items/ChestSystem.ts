import type { Chest } from '../entities/Interactable';
import type { GameEventBus } from '../GameEvents';

/** 寶箱只能開一次；開啟後由 LootSystem（監聽 ChestOpened）產生掉落 */
export class ChestSystem {
  constructor(private readonly events: GameEventBus) {}

  open(chest: Chest): boolean {
    if (chest.opened) return false;
    chest.opened = true;
    this.events.emit('ChestOpened', { chestId: chest.id, position: chest.position, lootTable: chest.lootTable });
    return true;
  }
}
