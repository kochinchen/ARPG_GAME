import { add, distance, normalize, scale, sub, vec2, type Vec2 } from '../../core/math/Vec2';
import type { Rng } from '../../core/Rng';
import type { Balance } from '../../data/schema/balance';
import type { Actor } from '../entities/Actor';
import type { ActorId } from '../entities/ActorTypes';
import type { NavGrid } from '../movement/NavGrid';

/**
 * 怪物的集體戰術（參考孫子兵法）。只決定「站哪裡、要不要出手」，追擊與攻擊仍由 ChaseState / SkillSystem 執行。
 * - 呼朋引伴：發現敵人時叫醒附近看得到的閒置同伴（只傳一層）
 * - 包圍：近戰怪在目標四周分配站位，從怪物來的那一側往兩邊排開；快的怪（遊擊）拿兩側與背後
 * - 圍師必闕：目標背後留一個缺口，主角永遠有退路
 * - 同時貼身的近戰有上限，其餘在外圈等候補位
 * - 後排（遠程、法師）站在前排後方
 * 魔王不參與（有自己的階段與技能）。
 */
export class SquadTactics {
  private timer = 0;
  /** 每個被包圍目標的正面角度：包圍開始時決定，之後固定（怪物繞到側面時缺口不會跟著轉） */
  private fronts = new Map<ActorId, number>();

  constructor(
    private readonly config: Balance['enemyTactics'],
    private readonly nav: NavGrid,
    private readonly rng: Rng,
  ) {}

  /** 叫醒 alertRadius 內、看得到 caller 的閒置同伴；回傳叫醒了幾隻 */
  rally(caller: Actor, targetId: ActorId, actors: readonly Actor[]): number {
    const [minDelay, maxDelay] = this.config.alertDelay;
    let count = 0;
    for (const ally of actors) {
      const brain = ally.ai;
      if (ally === caller || !brain || !ally.alive || ally.isBoss || ally.faction !== caller.faction) continue;
      if (brain.state !== 'idle' || brain.alertTargetId !== null) continue;
      if (distance(ally.position, caller.position) > this.config.alertRadius) continue;
      if (!this.nav.hasLineOfSight(caller.position, ally.position, 0)) continue;
      brain.alertTargetId = targetId;
      brain.alertTimer = this.rng.range(minDelay, maxDelay);
      count++;
    }
    return count;
  }

  /** 每 reassignInterval 秒依目標分組，重新分配站位 */
  update(actors: readonly Actor[], dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.config.reassignInterval;
    const byId = new Map<ActorId, Actor>();
    const groups = new Map<ActorId, Actor[]>();
    for (const actor of actors) {
      byId.set(actor.id, actor);
      const brain = actor.ai;
      if (!brain) continue;
      brain.slot = null;
      brain.waiting = false;
      if (!actor.alive || actor.isBoss || actor.faction !== 'enemy' || brain.state !== 'chase' || brain.targetId === null) continue;
      const group = groups.get(brain.targetId);
      if (group) group.push(actor);
      else groups.set(brain.targetId, [actor]);
    }
    const fronts = new Map<ActorId, number>();
    for (const [targetId, members] of groups) {
      const target = byId.get(targetId);
      if (!target?.alive || target.device) continue;
      const front = this.formUp(target, members, this.fronts.get(targetId));
      if (front !== null) fronts.set(targetId, front);
    }
    this.fronts = fronts;
  }

  /** 回傳這次用的正面角度（沒有怪在包圍範圍內則為 null） */
  private formUp(target: Actor, members: Actor[], previousFront: number | undefined): number | null {
    const near = members.filter((m) => distance(m.position, target.position) <= this.config.surroundRange);
    if (near.length === 0) return null;
    // 正面：包圍開始時目標往怪物群中心的方向；缺口留在正背後
    const center = scale(near.reduce((sum, m) => add(sum, m.position), vec2(0, 0)), 1 / near.length);
    const toward = sub(center, target.position);
    const frontAngle = previousFront ?? (toward.x === 0 && toward.y === 0 ? 0 : Math.atan2(toward.y, toward.x));

    const melee = near.filter((m) => m.ai!.keepDistance <= 0);
    melee.sort((a, b) => distance(a.position, target.position) - distance(b.position, target.position));
    const engaged = melee.slice(0, this.config.maxEngaged);
    for (const m of melee.slice(this.config.maxEngaged)) this.wait(m, target);
    if (engaged.length >= 2) this.surround(target, engaged, frontAngle);

    const back = near.filter((m) => m.ai!.keepDistance > 0);
    back.forEach((m, i) => {
      // 後排在正面方向的延長線上，左右錯開
      const spread = (i - (back.length - 1) / 2) * 0.45;
      const angle = frontAngle + spread;
      const r = target.radius + m.ai!.keepDistance + this.config.backlineOffset;
      this.assign(m, add(target.position, vec2(Math.cos(angle) * r, Math.sin(angle) * r)));
    });
    return frontAngle;
  }

  /** 從正面往兩邊排開站位；先讓前排挑最近的，遊擊（快的怪）拿剩下的兩側與背後 */
  private surround(target: Actor, engaged: Actor[], frontAngle: number): void {
    const { gapDegrees, minSlots, flankSpeed } = this.config;
    const arc = Math.PI * 2 - (gapDegrees * Math.PI) / 180;
    const spacing = arc / Math.max(engaged.length - 1, minSlots - 1);
    const free = engaged.map((_, i) => frontAngle + (i - (engaged.length - 1) / 2) * spacing);
    const ordered = [...engaged.filter((m) => m.moveSpeed < flankSpeed), ...engaged.filter((m) => m.moveSpeed >= flankSpeed)];
    for (const m of ordered) {
      const offset = sub(m.position, target.position);
      const current = Math.atan2(offset.y, offset.x);
      let best = 0;
      for (let i = 1; i < free.length; i++) if (angleGap(free[i]!, current) < angleGap(free[best]!, current)) best = i;
      const angle = free.splice(best, 1)[0]!;
      const r = target.radius + m.radius + m.stats.get('attackRange') * 0.6;
      this.assign(m, add(target.position, vec2(Math.cos(angle) * r, Math.sin(angle) * r)));
    }
  }

  /** 外圈等候：停在目前方向、攻擊站位外 waitDistance 的地方 */
  private wait(m: Actor, target: Actor): void {
    const away = sub(m.position, target.position);
    const direction = away.x === 0 && away.y === 0 ? vec2(1, 0) : normalize(away);
    const r = target.radius + m.radius + m.stats.get('attackRange') + this.config.waitDistance;
    this.assign(m, add(target.position, scale(direction, r)));
    m.ai!.waiting = true;
  }

  /** 走不到（牆裡）的站位不用，直接追目標 */
  private assign(m: Actor, point: Vec2): void {
    if (this.nav.isClearAt(point, m.radius)) m.ai!.slot = point;
  }
}

/** 兩個角度相差多少（0～π） */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
