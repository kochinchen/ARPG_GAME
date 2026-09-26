import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

/**
 * 偵測 HP 歸零的角色，標記死亡並發出 ActorDied。
 * 移除 Entity 由 GameWorld 在 Tick 結尾統一處理。
 */
export class DeathSystem {
  constructor(private readonly events: GameEventBus) {}

  update(actors: readonly Actor[]): void {
    for (const actor of actors) {
      if (!actor.alive || actor.hp > 0) continue;
      actor.alive = false;
      actor.intent = null;
      actor.cast = null;
      actor.path = [];
      this.events.emit('ActorDied', {
        actorId: actor.id,
        faction: actor.faction,
        defId: actor.defId,
        killerId: actor.lastDamagedBy,
        position: actor.position,
        xp: actor.xpReward,
        elite: actor.elite,
      });
    }
  }
}
