import { distance, normalize, sub } from '../../core/math/Vec2';
import type { Actor } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import type { DamagePipeline } from './DamagePipeline';

/** 追擊時重新尋路的間隔（秒） */
const REPATH_INTERVAL = 0.25;

/**
 * 普通攻擊：目標在距離外就追過去，進入距離後依攻速出手。
 * 玩家與怪物共用。M4 會改為透過 SkillSystem 施放 'basic_attack' 技能。
 */
export class AttackSystem {
  constructor(
    private readonly targeting: TargetingService,
    private readonly pathfinder: Pathfinder,
    private readonly pipeline: DamagePipeline,
    private readonly events: GameEventBus,
  ) {}

  update(actors: readonly Actor[], dt: number): void {
    for (const actor of actors) {
      if (!actor.alive) continue;
      actor.attackCooldown = Math.max(0, actor.attackCooldown - dt);
      actor.repathCooldown = Math.max(0, actor.repathCooldown - dt);
      if (actor.attackTarget === null) continue;

      const target = this.targeting.getValidTarget(actor, actor.attackTarget);
      if (!target) {
        actor.attackTarget = null;
        actor.path = [];
        continue;
      }

      if (distance(actor.position, target.position) > attackReach(actor, target)) {
        if (actor.repathCooldown === 0) {
          actor.path = this.pathfinder.findPath(actor.position, target.position, actor.radius);
          actor.repathCooldown = REPATH_INTERVAL;
        }
        continue;
      }

      actor.path = [];
      actor.facing = normalize(sub(target.position, actor.position));
      if (actor.attackCooldown > 0) continue;
      this.attack(actor, target);
    }
  }

  private attack(actor: Actor, target: Actor): void {
    actor.attackCooldown = 1 / actor.stats.get('attackSpeed');
    actor.attackCount++;
    this.events.emit('ActorAttacked', { actorId: actor.id, targetId: target.id });
    this.pipeline.apply({
      source: actor,
      target,
      min: actor.stats.get('damageMin'),
      max: actor.stats.get('damageMax'),
      element: 'physical',
    });
    if (!actor.attackHold) actor.attackTarget = null;
  }
}

/** 攻擊距離從雙方邊緣算起 */
export function attackReach(actor: Actor, target: Actor): number {
  return actor.stats.get('attackRange') + actor.radius + target.radius;
}
