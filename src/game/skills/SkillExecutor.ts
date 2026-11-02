import type { Vec2 } from '../../core/math/Vec2';
import type { EffectDef } from '../../data/schema/effects';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';
import type { EffectRegistry } from './EffectRegistry';
import type { EffectContext, EffectServices } from './effects/IEffect';
import { NO_MODS, type StepMods } from '../combo/StepMods';

/**
 * 依 SkillDef 的 Effect 清單依序執行。投射物擊中時也透過這裡執行 onHit。
 */
export class SkillExecutor {
  constructor(
    private readonly registry: EffectRegistry,
    private readonly services: EffectServices,
    /** 有屬性變體的技能（<技能 ID>.<屬性>） */
    private readonly skills: { has(id: string): boolean; get(id: string): SkillDef },
  ) {}

  execute(
    caster: Actor,
    skill: SkillDef,
    rank: number,
    target: Actor | null,
    origin: Vec2,
    direction: Vec2,
    mods: Readonly<StepMods> = NO_MODS,
  ): void {
    // 隱藏魔王：每次出招只有一種屬性（整招的傷害、狀態、特效都用這個屬性的版本）
    const actual = this.elementVariant(caster, skill);
    // 同一次施放的效果共用同一個 ctx：位移後的效果從新位置發出
    const ctx = this.createContext(caster, actual, rank, target, origin, direction, mods);
    this.run(actual.effects, ctx);
  }

  private elementVariant(caster: Actor, skill: SkillDef): SkillDef {
    const elements = caster.innateElements;
    if (!elements) return skill;
    const id = `${skill.id}.${elements[this.services.rng.int(0, elements.length - 1)]}`;
    return this.skills.has(id) ? this.skills.get(id) : skill;
  }

  /** 以既有的 Context 執行一組效果（投射物 onHit 使用） */
  readonly run = (effects: readonly EffectDef[], ctx: EffectContext): void => {
    for (const effect of effects) this.registry.apply(effect, ctx);
  };

  createContext(
    caster: Actor,
    skill: SkillDef,
    rank: number,
    target: Actor | null,
    origin: Vec2,
    direction: Vec2,
    mods: Readonly<StepMods> = NO_MODS,
  ): EffectContext {
    return { caster, skill, rank, target, origin, direction, mods, services: this.services, run: this.run };
  }
}
