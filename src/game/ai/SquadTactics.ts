import { add, distance, normalize, scale, sub, vec2, type Vec2 } from '../../core/math/Vec2';
import type { Rng } from '../../core/Rng';
import type { DataTable } from '../../data/DataRegistry';
import type { Balance } from '../../data/schema/balance';
import type { SkillDef } from '../../data/schema/skill';
import type { Actor } from '../entities/Actor';
import type { ActorId } from '../entities/ActorTypes';
import type { NavGrid } from '../movement/NavGrid';
import { skillReach } from '../skills/SkillSystem';

/** 圍獵的進度：繞圈（不出手）→ 一起撲上去 → 再繞圈 */
interface Hunt {
  phase: 'circle' | 'strike';
  timer: number;
  /** 繞圈站位目前的角度（弧度） */
  spin: number;
}

/**
 * 怪物的集體戰術（參考孫子兵法）。只決定「站哪裡、要不要出手」，追擊與攻擊仍由 ChaseState / SkillSystem 執行。
 * - 呼朋引伴：發現敵人時叫醒附近看得到的閒置同伴（只傳一層）
 * - 包圍：近戰怪在目標四周分配站位，從怪物來的那一側往兩邊排開；快的怪（遊擊）拿背後，從側面繞過去
 * - 背後的缺口由 gapDegrees 決定（目前 0 = 整圈包圍，設計者 2026-11-07）
 * - 同時貼身的近戰有上限，其餘在外圈等候補位
 * - 後排（遠程、法師）站在前排後方
 * - 求援：一群被打掉超過 casualtyRatio，派一隻（離目標最遠的）去叫附近閒置的其他群（CallState）
 * - 躲掩護：遠程怪（cover）站到正在追擊的巨獸（shield）背後射擊；站在那裡打不到目標就自己追出來
 * - 圍獵：野獸（hunt）先在目標外圍繞圈，時間到或被打就一起撲上去
 * - 蜂擁：孵化蜘蛛（swarm）不排站位直接衝；同一隻母體生的剩不到 min 隻就逃回母體身邊守著
 * - 護衛：召喚物（guard）守在召喚者與目標之間，目標靠近召喚者或自己被打才出手
 * 魔王不參與（有自己的階段與技能）。
 */
export class SquadTactics {
  private timer = 0;
  /** 每個被包圍目標的正面角度：包圍開始時決定，之後固定（怪物繞到側面時缺口不會跟著轉） */
  private fronts = new Map<ActorId, number>();
  /** 每個被圍獵的目標的進度 */
  private hunts = new Map<ActorId, Hunt>();

  constructor(
    private readonly config: Balance['enemyTactics'],
    private readonly nav: NavGrid,
    private readonly rng: Rng,
    private readonly skills: DataTable<SkillDef>,
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
    this.covers.clear();
    const byId = new Map<ActorId, Actor>();
    const groups = new Map<ActorId, Actor[]>();
    for (const actor of actors) {
      byId.set(actor.id, actor);
      const brain = actor.ai;
      if (!brain) continue;
      brain.slot = null;
      brain.waiting = false;
      brain.flanking = false;
      brain.covered = false;
      if (!actor.alive || actor.isBoss || actor.faction !== 'enemy' || brain.state !== 'chase' || brain.targetId === null) continue;
      const group = groups.get(brain.targetId);
      if (group) group.push(actor);
      else groups.set(brain.targetId, [actor]);
    }
    this.reinforce(actors, byId);
    const fronts = new Map<ActorId, number>();
    const hunts = new Map<ActorId, Hunt>();
    for (const [targetId, members] of groups) {
      const target = byId.get(targetId);
      if (!target?.alive || target.device) continue;
      // 守著召喚者的召喚物不參加包圍
      const free = this.escort(target, members, byId);
      const front = this.formUp(target, free, this.fronts.get(targetId), hunts);
      if (front !== null) fronts.set(targetId, front);
    }
    this.fronts = fronts;
    this.hunts = hunts;
  }

  /**
   * 護衛（guard）與蜂擁（swarm）的召喚物：召喚者活著時，守在召喚者與目標之間（不出手）。
   * guard：目標走進召喚者 guard.range 格內、或自己剛被打，就照常出手；
   * swarm：同一隻母體生的少於 swarm.min 隻才回去守，目標走進母體 swarm.guardRange 格內就出手。
   * 回傳沒有在守的成員（照常排站位）。
   */
  private escort(target: Actor, members: Actor[], byId: Map<ActorId, Actor>): Actor[] {
    const free: Actor[] = [];
    const guards = new Map<ActorId, Actor[]>();
    for (const m of members) {
      const brain = m.ai!;
      const summoner = m.summonedBy === null ? undefined : byId.get(m.summonedBy);
      const guard = brain.tactics.includes('guard');
      const swarm = brain.tactics.includes('swarm');
      if (!summoner?.alive || (!guard && !swarm) || brain.angerTimer > 0) {
        free.push(m);
        continue;
      }
      const range = guard ? this.config.guard.range : this.config.swarm.guardRange;
      const brood = swarm ? members.filter((o) => o.summonedBy === summoner.id && o.ai!.tactics.includes('swarm')).length : 0;
      if (distance(target.position, summoner.position) <= range + target.radius || (swarm && brood >= this.config.swarm.min)) {
        free.push(m);
        continue;
      }
      const list = guards.get(summoner.id);
      if (list) list.push(m);
      else guards.set(summoner.id, [m]);
    }
    for (const [summonerId, list] of guards) {
      const summoner = byId.get(summonerId)!;
      const toward = sub(target.position, summoner.position);
      const base = toward.x === 0 && toward.y === 0 ? 0 : Math.atan2(toward.y, toward.x);
      list.forEach((m, i) => {
        const ring = m.ai!.tactics.includes('guard') ? this.config.guard.ring : this.config.swarm.ring;
        const angle = base + (i - (list.length - 1) / 2) * ESCORT_SPREAD;
        this.assign(m, add(summoner.position, vec2(Math.cos(angle) * ring, Math.sin(angle) * ring)));
        m.ai!.waiting = true;
      });
    }
    return free;
  }

  /** 回傳這次用的正面角度（沒有怪在包圍範圍內則為 null） */
  private formUp(target: Actor, members: Actor[], previousFront: number | undefined, hunts: Map<ActorId, Hunt>): number | null {
    // 躲掩護的射手不必在包圍範圍內（在遠處也會走到巨獸背後），巨獸要在範圍內
    // 第一次發現主角正在衝刺的不排站位
    const near = members.filter((m) => !m.ai!.charging && !this.takeCover(m, target, members) && distance(m.position, target.position) <= this.config.surroundRange);
    const hunters = near.filter((m) => m.ai!.tactics.includes('hunt') && m.ai!.keepDistance <= 0);
    const hunting = hunters.length >= this.config.hunt.minHunters;
    if (hunting) hunts.set(target.id, this.hunt(target, hunters));
    if (near.length === 0) return null;
    // 正面：包圍開始時目標往怪物群中心的方向；缺口留在正背後
    const center = scale(near.reduce((sum, m) => add(sum, m.position), vec2(0, 0)), 1 / near.length);
    const toward = sub(center, target.position);
    const frontAngle = previousFront ?? (toward.x === 0 && toward.y === 0 ? 0 : Math.atan2(toward.y, toward.x));

    // 蜂擁的不排站位、不等候補位；圍獵的另外排
    const melee = near.filter((m) => m.ai!.keepDistance <= 0 && !m.ai!.tactics.includes('swarm') && !(hunting && m.ai!.tactics.includes('hunt')));
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
   * 躲掩護：找一隻離自己最近、還有空位的巨獸（shield），站到「目標 → 巨獸」的延長線上、巨獸背後；
   * 至少離目標 keepDistance（不然一到站位就要後退）。站在那裡打不到目標就不躲（目標跑遠了，射手自己追出來）。
   */
  private takeCover(m: Actor, target: Actor, members: Actor[]): boolean {
    const brain = m.ai!;
    if (!brain.tactics.includes('cover') || brain.keepDistance <= 0 || !this.skills.has(brain.skillId)) return false;
    const { perShield, gap, spread, reachMargin } = this.config.cover;
    const reach = skillReach(m, this.skills.get(brain.skillId)) + target.radius - reachMargin;
    const shields = members
      .filter((s) => s !== m && s.ai!.tactics.includes('shield') && distance(s.position, target.position) <= this.config.surroundRange)
      .sort((a, b) => distance(a.position, m.position) - distance(b.position, m.position));
    for (const shield of shields) {
      const taken = this.covers.get(shield.id) ?? 0;
      if (taken >= perShield) continue;
      const away = sub(shield.position, target.position);
      const d = Math.hypot(away.x, away.y);
      if (d < 1e-6) continue;
      const dir = scale(away, 1 / d);
      const r = Math.max(d + shield.radius + m.radius + gap, target.radius + brain.keepDistance + KEEP_SLACK);
      // 第二隻往旁邊錯開
      const side = taken === 0 ? 0 : (taken % 2 === 1 ? 1 : -1) * Math.ceil(taken / 2) * spread;
      const point = add(add(target.position, scale(dir, r)), vec2(-dir.y * side, dir.x * side));
      if (distance(point, target.position) > reach || !this.nav.isClearAt(point, m.radius)) continue;
      this.covers.set(shield.id, taken + 1);
      brain.slot = point;
      brain.covered = true;
      return true;
    }
    return false;
  }

  /** 每隻巨獸已經掩護了幾隻（每次重新分配時重算） */
  private covers = new Map<ActorId, number>();

  /**
   * 圍獵：繞圈時在 ring 格外平均排開、每次往前轉 spinDeg（不出手）；時間到或有一隻剛被打，就一起撲上去，
   * 第一隻先撲、其他每隔 follow 秒跟上（huntHold）；strike 秒後再回去繞圈。
   */
  private hunt(target: Actor, hunters: Actor[]): Hunt {
    const { ring, circle, strike, follow, spinDeg } = this.config.hunt;
    const previous = this.hunts.get(target.id);
    const state: Hunt = previous
      ? { ...previous, timer: previous.timer - this.config.reassignInterval }
      : { phase: 'circle', timer: this.rng.range(circle[0], circle[1]), spin: this.rng.range(0, Math.PI * 2) };
    const provoked = hunters.some((h) => h.ai!.angerTimer > 0);
    if (state.phase === 'circle' && (state.timer <= 0 || provoked)) {
      state.phase = 'strike';
      state.timer = strike;
      // 隨機決定誰先撲
      const order = [...hunters];
      for (let i = order.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i);
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      order.forEach((h, i) => (h.ai!.huntHold = i * follow));
    } else if (state.phase === 'strike' && state.timer <= 0) {
      state.phase = 'circle';
      state.timer = this.rng.range(circle[0], circle[1]);
    }
    if (state.phase === 'strike') return state;
    state.spin += (spinDeg * Math.PI) / 180;
    // 依目前的方向排站位（不會互相穿過）
    const angleOf = (h: Actor) => Math.atan2(h.position.y - target.position.y, h.position.x - target.position.x);
    const sorted = [...hunters].sort((a, b) => angleOf(a) - angleOf(b));
    const step = (Math.PI * 2) / sorted.length;
    // 轉到離目前方向最近的那一組排法
    const offset = Math.round((angleOf(sorted[0]!) - state.spin) / step) * step;
    sorted.forEach((h, i) => {
      const angle = state.spin + offset + i * step;
      const r = target.radius + h.radius + ring;
      this.assign(h, add(target.position, vec2(Math.cos(angle) * r, Math.sin(angle) * r)));
      h.ai!.waiting = true;
      h.ai!.huntHold = 0;
    });
    return state;
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
    // 看不含狀況加成的速度（追趕加速中的慢怪不算遊擊）
    const calm = (m: Actor) => m.moveSpeed / (1 + (m.ai?.pace ?? 0));
    const front = engaged.filter((m) => calm(m) < flankSpeed);
    const flank = engaged.filter((m) => calm(m) >= flankSpeed);
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

/** 守在召喚者身邊的召喚物左右錯開的角度（弧度） */
const ESCORT_SPREAD = 0.6;
/** 掩護站位至少比保持距離再遠這麼多（Tile），到了不會馬上後退 */
const KEEP_SLACK = 0.3;
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
