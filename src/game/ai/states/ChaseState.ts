import { add, distance, normalize, scale, sub, type Vec2 } from '../../../core/math/Vec2';
import type { Actor } from '../../entities/Actor';
import { skillReach } from '../../skills/SkillSystem';
import { pickErrand, pickLure } from '../Errands';
import { findPathFor, type AiContext, type IAiState } from '../IAiState';

/** 後退時一次拉開的距離（Tile） */
const RETREAT_STEP = 3;
/** 後排離自己的站位超過這個距離，出手之間會走回站位（Tile） */
const BACKLINE_SLACK = 2;
/** 等候補位時離站位這麼近就停下（Tile） */
const STATION_SLACK = 0.4;

/**
 * 追擊並攻擊目標（交給 SkillSystem 執行）；目標消失或離家太遠就放棄。
 * - 特殊技能冷卻結束、目標在範圍內時優先使用
 * - 遠程怪（keepDistance > 0）被貼近時先後退，再繼續攻擊；每次後退之間至少出手一次
 * - 集體戰術（SquadTactics）分配了站位時：近戰走向站位包圍、後排在出手之間走回前排後方、等候補位的不出手
 * - 正在閃避投射物 / 走出地上的範圍傷害（AiSystem）時不追擊、不出手；被指定為傳令兵時改去求援（CallState）
 * - 血少時去撿藥水、吃屍體，或施法復活屍體（ErrandState）；或往另一群閒置的怪逃（FleeState，誘敵）
 * - 投射物預判目標的走位（SkillIntent.lead，隨樓層）
 * - 躲在巨獸背後的遠程怪（covered）出手之間走回掩護的位置；圍獵還沒輪到撲上去的野獸（huntHold）先不出手
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
    if (brain.callPacks.length > 0) return 'call' as const;
    if (!self.cast) {
      // 血少時撿藥水、吃屍體、復活屍體；沒有可做的事才考慮誘敵
      const errand = pickErrand(ctx);
      if (errand) {
        brain.errand = errand;
        return 'errand' as const;
      }
      const lure = pickLure(ctx);
      if (lure) {
        brain.fleeTo = lure;
        return 'flee' as const;
      }
    }
    if (brain.angerTimer <= 0 && distance(self.position, brain.home) > brain.leashRange) return 'return' as const;
    this.act(ctx, target);
    return null;
  }

  private act(ctx: AiContext, target: Actor | null): void {
    const { self, brain } = ctx;
    if (brain.targetId === null || self.cast || brain.dodgeTimer > 0) return;
    if (brain.gatherAt) {
      this.gather(ctx, brain.gatherAt);
      return;
    }
    if (target && this.retreat(ctx, target)) return;
    // 等候補位、守著召喚者、圍獵繞圈或還沒輪到撲上去：不出手
    if (brain.waiting || brain.huntHold > 0) {
      this.holdStation(ctx);
      return;
    }
    if (brain.flanking && brain.slot) {
      this.flank(ctx, brain.slot);
      return;
    }
    if (target && this.toBackline(ctx)) return;
    if (target) {
      const special = this.readySpecial(ctx, target);
      if (special) {
        // 地面技能瞄準目標目前的位置（前搖期間玩家可以走出範圍）
        self.intent = { skillId: special, targetId: target.id, point: target.position, hold: false, lead: ctx.lead };
        return;
      }
    }
    // SkillSystem 在目標暫時無效時會清掉意圖，這裡持續維持主要攻擊（站位每次重新分配都會變）
    const approach = brain.slot ?? undefined;
    if (self.intent?.targetId === brain.targetId && self.intent.skillId === brain.skillId) {
      self.intent.approach = approach;
      self.intent.lead = ctx.lead;
      return;
    }
    self.intent = { skillId: brain.skillId, targetId: brain.targetId, point: self.position, hold: true, approach, lead: ctx.lead };
  }

  /** 一起出招前趕往站位：不出手 */
  private gather(ctx: AiContext, spot: Vec2): void {
    const { self } = ctx;
    self.intent = null;
    if (!self.isMoving && distance(self.position, spot) > STATION_SLACK) self.path = findPathFor(ctx, spot);
  }

  /** 等候補位：不出手，走到外圈的站位停下 */
  private holdStation(ctx: AiContext): void {
    const { self, brain } = ctx;
    self.intent = null;
    if (!brain.slot || self.isMoving || distance(self.position, brain.slot) <= STATION_SLACK) return;
    self.path = findPathFor(ctx, brain.slot);
  }

  /** 遊擊繞到背後：不出手，走向站位（站位每次重新分配都會往前繞，路徑跟著更新） */
  private flank(ctx: AiContext, slot: Vec2): void {
    const { self } = ctx;
    self.intent = null;
    const end = self.path[self.path.length - 1];
    if (distance(self.position, slot) <= STATION_SLACK || (end && distance(end, slot) <= STATION_SLACK)) return;
    self.path = findPathFor(ctx, slot);
  }

  /** 後排離站位太遠：出手之間走回前排後方（與後退共用「至少出手一次才再移動」）。回傳是否正在移動 */
  private toBackline(ctx: AiContext): boolean {
    const { self, brain } = ctx;
    if (brain.keepDistance <= 0 || !brain.slot || brain.retreating) return false;
    const slack = brain.covered ? ctx.tactics.cover.slack : BACKLINE_SLACK;
    if (distance(self.position, brain.slot) <= slack || self.castCount === brain.castsAtRetreat) return false;
    const path = findPathFor(ctx, brain.slot);
    if (path.length === 0) return false;
    self.intent = null;
    self.path = path;
    brain.retreating = true;
    brain.castsAtRetreat = self.castCount;
    return true;
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
      const gap = distance(self.position, target.position);
      if (gap <= reach && gap >= (skill.minRange ?? 0)) return id;
    }
    return null;
  }

  /** 遠程怪被貼近：往遠離目標的方向走一段。回傳是否正在後退 */
  private retreat(ctx: AiContext, target: Actor): boolean {
    const { self, brain, nav } = ctx;
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
    const path = findPathFor(ctx, destination);
    if (path.length === 0) return false;
    self.intent = null;
    self.path = path;
    brain.retreating = true;
    brain.castsAtRetreat = self.castCount;
    return true;
  }
}
