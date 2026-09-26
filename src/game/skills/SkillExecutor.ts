import type { Vec2 } from '../../core/math/Vec2';
import type { EffectDef } from '../../data/schema/effects';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';
import type { EffectRegistry } from './EffectRegistry';
import type { EffectContext, EffectServices } from './effects/IEffect';

/**
 * 依 SkillDef 的 Effect 清單依序執行。投射物擊中時也透過這裡執行 onHit。
 */
export class SkillExecutor {
  constructor(
    private readonly registry: EffectRegistry,
    private readonly services: EffectServices,
  ) {}

  execute(caster: Actor, skill: SkillDef, rank: number, target: Actor | null, origin: Vec2, direction: Vec2): void {
    this.run(skill.effects, { caster, skill, rank, target, origin, direction, services: this.services, run: this.run });
  }

  /** 以既有的 Context 執行一組效果（投射物 onHit 使用） */
  readonly run = (effects: readonly EffectDef[], ctx: EffectContext): void => {
    for (const effect of effects) this.registry.apply(effect, ctx);
  };

  createContext(caster: Actor, skill: SkillDef, rank: number, target: Actor | null, origin: Vec2, direction: Vec2): EffectContext {
    return { caster, skill, rank, target, origin, direction, services: this.services, run: this.run };
  }
}
