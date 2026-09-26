import type { Vec2 } from '../../core/math/Vec2';
import type { StatusEffectSystem } from '../combat/StatusEffectSystem';
import type { Actor, ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { TargetingService } from '../targeting/TargetingService';
import type { ComboResolution, ComboResolver } from './ComboResolver';
import { NO_MODS } from './StepMods';

/** 整組連段期間免疫擊退的狀態上限時間（連段結束時移除） */
const UNSTOPPABLE_MAX = 30;

interface ComboRun {
  resolution: ComboResolution;
  /** 下一個要施放的步驟 */
  next: number;
  targetId: ActorId | null;
  point: Vec2;
  /** 已送出意圖、等待施放開始時記錄的施放次數；null = 可以送出下一步 */
  awaiting: number | null;
}

/**
 * Q / W / E 連段：右鍵一次，依序施放三個技能。
 * 開始時交給 ComboResolver 判定；有 Combo 時把各步加成附在該步的施放意圖上。
 * 某一步無法施放（沒有目標、魔力不足）時整組中斷；第三招實際施放時發出 ComboCompleted。
 */
export class ComboSystem {
  private readonly runs = new Map<ActorId, ComboRun>();

  constructor(
    private readonly resolver: ComboResolver,
    private readonly targeting: TargetingService,
    private readonly statuses: StatusEffectSystem,
    private readonly events: GameEventBus,
  ) {}

  isRunning(actor: Actor): boolean {
    return this.runs.has(actor.id);
  }

  /** 目前施放到第幾步（1 起算；沒有在施放時為 0），UI 顯示用 */
  currentStep(actor: Actor): number {
    const run = this.runs.get(actor.id);
    return run ? Math.max(1, run.next) : 0;
  }

  start(actor: Actor, sequence: readonly string[], targetId: ActorId | null, point: Vec2): ComboResolution | null {
    if (sequence.length === 0 || this.runs.has(actor.id)) return null;
    const resolution = this.resolver.resolve(sequence, (id) => actor.skillRanks.get(id) ?? 1);
    this.runs.set(actor.id, { resolution, next: 0, targetId, point, awaiting: null });
    if (resolution.status === 'combo' && resolution.modifiers.knockbackResist) {
      this.statuses.apply(actor, 'unstoppable', UNSTOPPABLE_MAX, 0, actor);
    }
    return resolution;
  }

  cancel(actor: Actor): void {
    if (!this.runs.has(actor.id)) return;
    this.finish(actor);
    if (actor.intent && !actor.intent.hold) actor.intent = null;
  }

  update(actors: readonly Actor[]): void {
    for (const actor of actors) {
      const run = this.runs.get(actor.id);
      if (!run) continue;
      if (!actor.alive) {
        this.finish(actor);
        continue;
      }

      if (run.awaiting !== null) {
        if (actor.castCount > run.awaiting) {
          if (run.next === 3) this.completed(run);
          run.awaiting = null;
          // 這一步已開始施放；等施放結束
          if (actor.isCasting) continue;
        } else if (actor.intent === null) {
          // 意圖被清掉但沒有施放：這一步失敗，整組中斷
          this.finish(actor);
          this.events.emit('ComboInterrupted', { step: run.next });
          continue;
        } else {
          continue; // 還在走向目標或等待冷卻
        }
      }

      if (actor.isCasting) continue;
      const steps = run.resolution.steps;
      if (run.next >= steps.length) {
        this.finish(actor);
        continue;
      }

      const skillId = steps[run.next]!;
      const target = run.targetId === null ? null : this.targeting.getValidTarget(actor, run.targetId);
      if (target) run.point = target.position;
      actor.intent = {
        skillId,
        targetId: target?.id ?? null,
        point: run.point,
        hold: false,
        mods: run.resolution.status === 'combo' ? run.resolution.modifiers.steps[run.next]! : NO_MODS,
      };
      actor.repathCooldown = 0;
      run.awaiting = actor.castCount;
      run.next++;
    }
  }

  private completed(run: ComboRun): void {
    const r = run.resolution;
    if (r.status !== 'combo') return;
    this.events.emit('ComboCompleted', {
      comboId: r.comboId,
      ruleId: r.rule.id,
      name: r.displayName,
      skills: [r.steps[0]!, r.steps[1]!, r.steps[2]!],
      description: r.description,
    });
  }

  private finish(actor: Actor): void {
    const run = this.runs.get(actor.id);
    this.runs.delete(actor.id);
    if (run?.resolution.status === 'combo' && run.resolution.modifiers.knockbackResist) {
      this.statuses.remove(actor, 'unstoppable');
    }
  }
}
