import { distance, type Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

export type CheckpointKind = 'stairs' | 'midway';

export interface Checkpoint {
  kind: CheckpointKind;
  position: Vec2;
  active: boolean;
}

/**
 * 每層兩個存檔點：樓梯口（進入即啟動）與中途（走過去啟動）。
 * 死亡時回到最後啟動的存檔點。
 */
export class CheckpointSystem {
  readonly checkpoints: Checkpoint[] = [];

  constructor(
    private readonly events: GameEventBus,
    private readonly activateRadius: number,
  ) {}

  /** 進入新樓層：樓梯口立即啟動，中途點重設 */
  reset(stairs: Vec2, midway: Vec2 | null): void {
    this.checkpoints.length = 0;
    this.checkpoints.push({ kind: 'stairs', position: stairs, active: true });
    if (midway) this.checkpoints.push({ kind: 'midway', position: midway, active: false });
  }

  update(player: Actor): void {
    if (!player.alive) return;
    for (const cp of this.checkpoints) {
      if (cp.active || distance(player.position, cp.position) > this.activateRadius) continue;
      cp.active = true;
      this.events.emit('CheckpointActivated', { kind: cp.kind, position: cp.position });
    }
  }

  /** 最後啟動的存檔點（中途優先） */
  get respawn(): Checkpoint {
    const midway = this.checkpoints.find((c) => c.kind === 'midway' && c.active);
    return midway ?? this.checkpoints.find((c) => c.kind === 'stairs')!;
  }
}
