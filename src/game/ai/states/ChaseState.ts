import { add, distance, normalize, scale, sub, type Vec2 } from '../../../core/math/Vec2';
import type { Actor } from '../../entities/Actor';
import { skillReach } from '../../skills/SkillSystem';
import type { AiContext, IAiState } from '../IAiState';

/** 後退時一次拉開的距離（Tile） */
const RETREAT_STEP = 3;

/**
 * 追擊並攻擊目標（交給 SkillSystem 執行）；目標消失或離家太遠就放棄。
 * - 特殊技能冷卻結束、目標在範圍內時優先使用
 * - 遠程怪（keepDistance > 0）被貼近時先後退，再繼續攻擊；每次後退之間至少出手一次
 */
export class ChaseState implements IAiState {
  readonly name = 'chase' as const;

  enter(ctx: AiContext): void {
    const { self, brain, targeting } = ctx;
    self.repathCooldown = 0;
    brain.retreating = false;
    this.act(ctx, brain.targetId === null ? null : targeting.getValidTarget(self, brain.targetId));
  }

  update(ctx: AiContext) {
    const { self, brain, targeting } = ctx;
    const target = brain.targetId === null ? null : targeting.getValidTarget(self, brain.targetId);
    if (!target) return 'return' as const;
    if (distance(self.position, brain.home) > brain.leashRange) return 'return' as const;
    this.act(ctx, target);
    return null;
  }

  private act(ctx: AiContext, target: Actor | null): void {
    const { self, brain } = ctx;
    if (brain.targetId === null || self.cast) return;
    if (target && this.retreat(ctx, target)) return;
    if (target) {
      const special = this.readySpecial(ctx, target);
      if (special) {
        // 地面技能瞄準目標目前的位置（前搖期間玩家可以走出範圍）
        self.intent = { skillId: special, targetId: target.id, point: target.position, hold: false };
        return;
      }
    }
    // SkillSystem 在目標暫時無效時會清掉意圖，這裡持續維持主要攻擊
    if (self.intent?.targetId === brain.targetId && self.intent.skillId === brain.skillId) return;
    self.intent = { skillId: brain.skillId, targetId: brain.targetId, point: self.position, hold: true };
  }

  /** 冷卻已結束、且目標在施放範圍內的第一個特殊技能 */
  private readySpecial({ self, brain, skills }: AiContext, target: Actor): string | null {
    for (const id of brain.specialSkills) {
      if ((self.cooldowns.get(id) ?? 0) > 0 || !skills.has(id)) continue;
      const skill = skills.get(id);
      // 地面技能：施放距離；對自己施放（旋風、召喚）：range 是「目標在多近時使用」
      const reach =
        skill.targeting === 'ground'
          ? (skill.range ?? 0)
          : skill.targeting === 'self'
            ? (skill.range ?? 0) + self.radius + target.radius
            : skillReach(self, skill) + target.radius;
      if (distance(self.position, target.position) <= reach) return id;
    }
    return null;
  }

  /** 遠程怪被貼近：往遠離目標的方向走一段。回傳是否正在後退 */
  private retreat({ self, brain, pathfinder, nav }: AiContext, target: Actor): boolean {
    if (brain.keepDistance <= 0) return false;
    if (brain.retreating) {
      if (self.isMoving) return true;
      brain.retreating = false;
      return false;
    }
    if (distance(self.position, target.position) >= brain.keepDistance) return false;
    if (self.castCount === brain.castsAtRetreat) return false;
    const away = sub(self.position, target.position);
    const direction: Vec2 = away.x === 0 && away.y === 0 ? self.facing : normalize(away);
    const destination = add(self.position, scale(direction, RETREAT_STEP));
    if (!nav.isClearAt(destination, self.radius)) return false; // 退無可退：留在原地攻擊
    const path = pathfinder.findPath(self.position, destination, self.radius);
    if (path.length === 0) return false;
    self.intent = null;
    self.path = path;
    brain.retreating = true;
    brain.castsAtRetreat = self.castCount;
    return true;
  }
}
