import { distance, type Vec2 } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

/** stairs = 樓梯口、midway = 中途、boss = 魔王門前（魔王層才有） */
export type CheckpointKind = 'stairs' | 'midway' | 'boss';

export interface Checkpoint {
  kind: CheckpointKind;
  position: Vec2;
  active: boolean;
}

/** 魔王門前的存檔點：走到這個距離內就啟動（在通往競技場的路上，範圍比一般存檔點大，不會繞過去） */
const BOSS_GATE_RADIUS = 3;

/**
 * 每層的存檔點：樓梯口（進入即啟動）、中途（走過去啟動）、魔王門前（魔王層，走過去啟動）。
 * 死亡與讀檔回到最後啟動的存檔點（魔王門前 → 中途 → 樓梯口）。
 */
export class CheckpointSystem {
  readonly checkpoints: Checkpoint[] = [];

  constructor(
    private readonly events: GameEventBus,
    private readonly activateRadius: number,
  ) {}

  /** 進入新樓層：樓梯口立即啟動，其他存檔點重設 */
  reset(stairs: Vec2, midway: Vec2 | null): void {
    this.checkpoints.length = 0;
    this.checkpoints.push({ kind: 'stairs', position: stairs, active: true });
    if (midway) this.checkpoints.push({ kind: 'midway', position: midway, active: false });
  }

  /** 魔王層：加上魔王門前的存檔點（未啟動） */
  addBossGate(position: Vec2): void {
    this.checkpoints.push({ kind: 'boss', position, active: false });
  }

  get(kind: CheckpointKind): Checkpoint | undefined {
    return this.checkpoints.find((c) => c.kind === kind);
  }

  /** 讀檔 / 重新進入已到過中途的樓層：直接設為已啟動（不發事件） */
  restore(kind: CheckpointKind): void {
    const cp = this.get(kind);
    if (cp) cp.active = true;
  }

  update(player: Actor): void {
    if (!player.alive) return;
    for (const cp of this.checkpoints) {
      const radius = cp.kind === 'boss' ? BOSS_GATE_RADIUS : this.activateRadius;
      if (cp.active || distance(player.position, cp.position) > radius) continue;
      cp.active = true;
      this.events.emit('CheckpointActivated', { kind: cp.kind, position: cp.position });
    }
  }

  /** 最後啟動的存檔點（魔王門前 → 中途 → 樓梯口） */
  get respawn(): Checkpoint {
    for (const kind of ['boss', 'midway'] as const) {
      const cp = this.get(kind);
      if (cp?.active) return cp;
    }
    return this.get('stairs')!;
  }
}
