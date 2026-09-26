import type { Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

/**
 * 玩家死亡後倒地 respawnDelay 秒，再回到本層最後啟動的存檔點並補滿狀態。
 * 沒有其他死亡懲罰（經驗、物品、金幣都保留）；已擊殺的怪物不會重生。
 */
export class DeathHandler {
  private respawnTimer: number | null = null;

  constructor(
    private readonly player: Actor,
    private readonly events: GameEventBus,
    /** M7 起由 CheckpointSystem 提供（樓梯口 / 中途） */
    private readonly respawnPoint: () => Vec2,
    private readonly respawnDelay: number,
  ) {}

  /** 倒地中，距離回到存檔點的剩餘秒數；存活時為 null */
  get secondsUntilRespawn(): number | null {
    return this.respawnTimer;
  }

  update(dt: number): void {
    if (this.player.alive) return;
    if (this.respawnTimer === null) {
      this.respawnTimer = this.respawnDelay;
      return;
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) this.respawn();
  }

  private respawn(): void {
    const player = this.player;
    const position = this.respawnPoint();
    player.position = position;
    player.prevPosition = position;
    player.path = [];
    player.intent = null;
    player.cast = null;
    player.lastDamagedBy = null;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    player.alive = true;
    this.respawnTimer = null;
    this.events.emit('PlayerRespawned', { position });
  }
}
