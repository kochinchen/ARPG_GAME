import { add, distance, normalize, scale, sub, vec2, type Vec2 } from '../../core/math/Vec2';
import type { Rng } from '../../core/Rng';
import type { Balance } from '../../data/schema/balance';
import type { Actor } from '../entities/Actor';
import type { ActorId } from '../entities/ActorTypes';
import type { NavGrid } from '../movement/NavGrid';

/**
 * 怪物的集體戰術（參考孫子兵法）。只決定「站哪裡、要不要出手」，追擊與攻擊仍由 ChaseState / SkillSystem 執行。
 * - 呼朋引伴：發現敵人時叫醒附近看得到的閒置同伴（只傳一層）
 * - 包圍：近戰怪在目標四周分配站位，從怪物來的那一側往兩邊排開；快的怪（遊擊）拿背後，從側面繞過去
 * - 背後的缺口由 gapDegrees 決定（目前 0 = 整圈包圍，設計者 2026-11-07）
 * - 同時貼身的近戰有上限，其餘在外圈等候補位
 * - 後排（遠程、法師）站在前排後方
 * - 求援：一群被打掉超過 casualtyRatio，派一隻（離目標最遠的）去叫附近閒置的其他群（CallState）
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
    if (caller.ai?.solitary) return 0;
    const [minDelay, maxDelay] = this.config.alertDelay;
    let count = 0;
    for (const ally of actors) {
      const brain = ally.ai;
      if (ally === caller || !brain || brain.solitary || !ally.alive || ally.isBoss || ally.faction !== caller.faction) continue;
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
      brain.flanking = false;
      if (!actor.alive || actor.isBoss || actor.faction !== 'enemy' || brain.state !== 'chase' || brain.targetId === null) continue;
      const group = groups.get(brain.targetId);
      if (group) group.push(actor);
      else groups.set(brain.targetId, [actor]);
    }
    this.reinforce(actors, byId);
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

  /**
   * 從正面往兩邊排開站位：前排（慢的）挑靠正面的站位、各取最近的；遊擊（快的）拿剩下靠背後的。
   * 站位在另一邊（差超過 FLANK_TURN）的遊擊先走到側面的中繼點，每次重新分配再往前繞，不會從目標身上穿過去。
   */
  private surround(target: Actor, engaged: Actor[], frontAngle: number): void {
    const { gapDegrees, minSlots, flankSpeed } = this.config;
    const gap = (gapDegrees * Math.PI) / 180;
    // 整圈包圍時頭尾不能重疊：平分成 n 份；留缺口時頭尾是缺口的兩邊
    const spacing = gap === 0 ? (Math.PI * 2) / Math.max(engaged.length, minSlots) : (Math.PI * 2 - gap) / Math.max(engaged.length - 1, minSlots - 1);
    const slots = engaged.map((_, i) => frontAngle + (i - (engaged.length - 1) / 2) * spacing);
    slots.sort((a, b) => angleGap(a, frontAngle) - angleGap(b, frontAngle));
    const front = engaged.filter((m) => m.moveSpeed < flankSpeed);
    const flank = engaged.filter((m) => m.moveSpeed >= flankSpeed);
    const pools = [slots.slice(0, front.length), slots.slice(front.length)];
    [front, flank].forEach((group, g) => {
      const free = pools[g]!;
      for (const m of group) {
        const offset = sub(m.position, target.position);
        const current = Math.atan2(offset.y, offset.x);
        let best = 0;
        for (let i = 1; i < free.length; i++) if (angleGap(free[i]!, current) < angleGap(free[best]!, current)) best = i;
        const angle = free.splice(best, 1)[0]!;
        const r = target.radius + m.radius + m.stats.get('attackRange') * 0.6;
        const turn = signedAngle(angle, current);
        // 繞過去：先到目前方向往站位那一側轉 FLANK_TURN 的地方，半徑稍大（不貼著目標）
        const via = Math.abs(turn) > FLANK_TURN ? current + Math.sign(turn) * FLANK_TURN : angle;
        const radius = via === angle ? r : r + FLANK_WIDEN;
        this.assign(m, add(target.position, vec2(Math.cos(via) * radius, Math.sin(via) * radius)));
        // 遊擊離自己的站位還差一段角度：先繞過去，不在正面就出手
        if (g === 1 && m.ai!.slot && angleGap(angle, current) > FLANK_ARRIVED) m.ai!.flanking = true;
      }
    });
  }

  /**
   * 求援：有成員在追擊、生成時的隻數被打掉超過 casualtyRatio 的群，派一隻去叫 callRange 內最多 maxPacks 群閒置的怪。
   * 已經派過、或是被叫來的群不再派（不會一路叫到整張地圖）。
   */
  private reinforce(actors: readonly Actor[], byId: Map<ActorId, Actor>): void {
    const { casualtyRatio, callRange, maxPacks } = this.config.reinforce;
    const packs = new Map<number, Actor[]>();
    for (const a of actors) {
      const pack = a.ai?.pack;
      if (!pack || !a.alive || a.isBoss) continue;
      const list = packs.get(pack.id);
      if (list) list.push(a);
      else packs.set(pack.id, [a]);
    }
    for (const [id, members] of packs) {
      const lead = members[0]!.ai!;
      if (lead.packCalled || members.length >= lead.pack!.size * (1 - casualtyRatio)) continue;
      const fighting = members.filter((m) => m.ai!.state === 'chase' && m.ai!.targetId !== null && m.moveSpeed > 0);
      if (fighting.length === 0) continue;
      // 離目標最遠的去求援（最不會被攔下）
      const away = (m: Actor) => {
        const target = byId.get(m.ai!.targetId!);
        return target ? distance(m.position, target.position) : 0;
      };
      const messenger = fighting.reduce((a, b) => (away(b) > away(a) ? b : a));
      const candidates: { id: number; d: number }[] = [];
      for (const [otherId, others] of packs) {
        if (otherId === id || others[0]!.ai!.packCalled) continue;
        if (!others.every((o) => o.ai!.state === 'idle' && o.ai!.alertTargetId === null)) continue;
        const d = Math.min(...others.map((o) => distance(o.position, messenger.position)));
        if (d <= callRange) candidates.push({ id: otherId, d });
      }
      for (const m of members) m.ai!.packCalled = true;
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => a.d - b.d);
      messenger.ai!.callPacks = candidates.slice(0, maxPacks).map((c) => c.id);
      messenger.ai!.callTargetId = messenger.ai!.targetId;
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

/** 遊擊的站位和目前方向差超過這個角度就先繞到側面（弧度） */
const FLANK_TURN = Math.PI / 2;
/** 遊擊和站位的角度差在這之內就算繞到了，開始出手（弧度） */
const FLANK_ARRIVED = Math.PI / 6;
/** 繞路時的中繼點比站位離目標再遠這麼多（Tile） */
const FLANK_WIDEN = 1;

/** 從 from 轉到 to 的角度（-π～π，正 = 逆時針） */
function signedAngle(to: number, from: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 兩個角度相差多少（0～π） */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}
