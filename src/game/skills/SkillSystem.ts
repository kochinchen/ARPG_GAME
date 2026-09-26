import { add, distance, normalize, scale, sub, type Vec2 } from '../../core/math/Vec2';
import type { DataTable } from '../../data/DataRegistry';
import { rankValue } from '../../data/schema/common';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor, SkillIntent } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';
import type { Pathfinder } from '../movement/Pathfinder';
import type { TargetingService } from '../targeting/TargetingService';
import type { SkillExecutor } from './SkillExecutor';
import { NO_MODS, type StepMods } from '../combo/StepMods';

/** 追擊時重新尋路的間隔（秒） */
const REPATH_INTERVAL = 0.25;
/** 施放到這個比例時觸發效果（出手瞬間） */
const HIT_FRACTION = 0.5;

/**
 * 執行 Actor 的技能意圖：
 *   目標在距離外 → 走過去；距離內 → 檢查冷卻與魔力 → 施放（施放時間中不能移動）→ 效果觸發
 * 玩家（左右鍵）與怪物（AI）共用。
 */
export class SkillSystem {
  constructor(
    private readonly skills: DataTable<SkillDef>,
    private readonly targeting: TargetingService,
    private readonly pathfinder: Pathfinder,
    private readonly executor: SkillExecutor,
    private readonly events: GameEventBus,
  ) {}

  update(actors: readonly Actor[], dt: number): void {
    for (const actor of actors) {
      if (!actor.alive) continue;
      tickCooldowns(actor, dt);
      // 冰凍 / 暈眩：不能施放（施放中的技能已被打斷）
      if (actor.isDisabled) continue;
      actor.repathCooldown = Math.max(0, actor.repathCooldown - dt);
      if (actor.cast) {
        this.advanceCast(actor, dt);
        if (actor.cast) continue;
      }
      if (actor.intent) this.tryStart(actor, actor.intent);
    }
  }

  /** 此等級的魔力消耗（套用施放者的魔力消耗降低與 Combo 的 MP 加成） */
  manaCost(skill: SkillDef, rank: number, caster?: Actor, mods: Readonly<StepMods> = NO_MODS): number {
    const reduction = Math.min(0.9, Math.max(0, caster?.stats.get('manaCostReduction') ?? 0));
    return Math.max(0, rankValue(skill.cost.mana, rank) * (1 - reduction) * (1 + mods.mp));
  }

  /** 施放時間：近戰 / 弓箭依攻速，法術依施法速度；Combo 的動作速度加成對兩者都有效 */
  castDuration(skill: SkillDef, caster: Actor, mods: Readonly<StepMods> = NO_MODS): number {
    const speedup = 1 + Math.max(0, mods.animationSpeed);
    if (skill.useAttackSpeed) return 1 / (caster.stats.get('attackSpeed') * (1 + mods.attackSpeed) * speedup);
    return skill.castTime / ((1 + Math.max(0, caster.stats.get('castSpeed') + mods.castSpeed)) * speedup);
  }

  private tryStart(actor: Actor, intent: SkillIntent): void {
    const rank = intent.rank ?? actor.skillRanks.get(intent.skillId) ?? 0;
    if (rank <= 0 || !this.skills.has(intent.skillId) || this.skills.get(intent.skillId).kind !== 'active') {
      actor.intent = null;
      return;
    }
    const skill = this.skills.get(intent.skillId);

    let targetId: number | null = null;
    let point: Vec2;
    switch (skill.targeting) {
      case 'enemy': {
        const target = intent.targetId === null ? null : this.targeting.getValidTarget(actor, intent.targetId);
        if (!target) {
          actor.intent = null;
          actor.path = [];
          return;
        }
        if (distance(actor.position, target.position) > skillReach(actor, skill) + target.radius) {
          this.approach(actor, target.position);
          return;
        }
        targetId = target.id;
        point = target.position;
        break;
      }
      case 'ground': {
        const range = skill.range ?? actor.stats.get('attackRange');
        const offset = sub(intent.point, actor.position);
        const d = Math.hypot(offset.x, offset.y);
        point = d <= range ? intent.point : add(actor.position, scale(offset, range / d));
        break;
      }
      case 'direction':
        point = intent.point;
        break;
      case 'self':
        point = actor.position;
        break;
    }

    if ((actor.cooldowns.get(skill.id) ?? 0) > 0) return; // 保留意圖，冷卻結束後施放

    const mods = intent.mods ?? NO_MODS;
    const cost = this.manaCost(skill, rank, actor, mods);
    if (actor.mana < cost) {
      this.events.emit('SkillFailed', { actorId: actor.id, skillId: skill.id, reason: 'mana' });
      actor.intent = null;
      return;
    }

    actor.mana -= cost;
    if (skill.cooldown > 0) actor.cooldowns.set(skill.id, skill.cooldown);
    const toPoint = sub(point, actor.position);
    const direction = toPoint.x === 0 && toPoint.y === 0 ? actor.facing : normalize(toPoint);
    actor.facing = direction;
    actor.path = [];
    actor.castCount++;
    actor.cast = {
      skill,
      rank,
      targetId,
      point,
      direction,
      elapsed: 0,
      duration: this.castDuration(skill, actor, mods),
      fired: false,
      mods,
    };
    if (!intent.hold) actor.intent = null;
    this.events.emit('SkillCast', { actorId: actor.id, skillId: skill.id, targetId, point });
    // 瞬發技能當下就觸發
    this.advanceCast(actor, 0);
  }

  private advanceCast(actor: Actor, dt: number): void {
    const cast = actor.cast!;
    cast.elapsed += dt;
    if (!cast.fired && cast.elapsed >= cast.duration * HIT_FRACTION) {
      cast.fired = true;
      this.fire(actor);
    }
    if (cast.elapsed >= cast.duration) actor.cast = null;
  }

  private fire(actor: Actor): void {
    const cast = actor.cast!;
    let target: Actor | null = null;
    if (cast.skill.targeting === 'enemy') {
      // 出手瞬間目標已死亡就揮空
      target = cast.targetId === null ? null : this.targeting.getValidTarget(actor, cast.targetId);
      if (!target) return;
    }
    const origin = cast.skill.targeting === 'ground' ? cast.point : actor.position;
    this.executor.execute(actor, cast.skill, cast.rank, target, origin, cast.direction, cast.mods);
  }

  private approach(actor: Actor, destination: Vec2): void {
    if (actor.repathCooldown > 0 && actor.path.length > 0) return;
    actor.path = this.pathfinder.findPath(actor.position, destination, actor.radius);
    actor.repathCooldown = REPATH_INTERVAL;
  }
}

/** 對單一敵人施放的有效距離（從雙方邊緣算起，不含目標半徑） */
export function skillReach(actor: Actor, skill: SkillDef): number {
  return (skill.range ?? actor.stats.get('attackRange')) + actor.radius;
}

function tickCooldowns(actor: Actor, dt: number): void {
  for (const [id, remaining] of actor.cooldowns) {
    if (remaining - dt <= 0) actor.cooldowns.delete(id);
    else actor.cooldowns.set(id, remaining - dt);
  }
}
