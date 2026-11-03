import type { Element } from '../../data/schema/common';
import type { DataRegistry } from '../../data/DataRegistry';
import type { GameWorld } from '../../game/GameWorld';
import type { Actor } from '../../game/entities/Actor';

export interface SimHit {
  time: number;
  source: string;
  skill: string;
  phase: string;
  element: Element;
  amount: number;
  pct: number;
  crit: boolean;
}

/** 一個來源的一招在一個階段的統計 */
export interface SimRow {
  source: string;
  skill: string;
  phase: string;
  casts: number;
  hits: number;
  total: number;
  max: number;
  maxPct: number;
  crits: number;
  elements: Set<Element>;
}

export interface SimSummary {
  /** 從開始紀錄到現在的秒數 */
  elapsed: number;
  /** 從第一次受傷到現在的秒數 */
  fighting: number;
  total: number;
  /** 每秒傷害（從第一次受傷起算） */
  dps: number;
  maxHit: number;
  maxHitPct: number;
  /** 任一段 N 秒內受到的最多傷害 */
  burst1s: number;
  burst5s: number;
  hits: number;
  dodges: number;
  blocks: number;
}

const OPENING_PHASE = '初始';

function sum(hits: readonly SimHit[], windowSeconds: number): number {
  let best = 0;
  let total = 0;
  let from = 0;
  for (const hit of hits) {
    total += hit.amount;
    while (hit.time - hits[from]!.time >= windowSeconds) total -= hits[from++]!.amount;
    best = Math.max(best, total);
  }
  return best;
}

/**
 * 記錄敵方對主角的所有傷害。一次傷害先由 ActorDamaged 記下，同一 Tick 內有 SkillHit 才知道是哪一招；
 * 沒有對應 SkillHit 的是持續傷害（燃燒、中毒、流血）。
 */
export class SimRecorder {
  hits: SimHit[] = [];
  private rows = new Map<string, SimRow>();
  /** 這個 Tick 的傷害；matched = 已經知道是哪一招 */
  private pending: (SimHit & { matched: boolean })[] = [];
  private startTime: number;
  private dodges = 0;
  private blocks = 0;

  constructor(
    private readonly world: GameWorld,
    private readonly data: Pick<DataRegistry, 'skills'>,
    private readonly boss: Actor,
  ) {
    this.startTime = world.playTime;
    const { events, player } = world;
    events.on('ActorDamaged', (e) => {
      if (e.targetId !== player.id) return;
      const source = e.sourceId === null ? null : world.targeting.getActor(e.sourceId);
      this.pending.push({
        time: world.playTime,
        source: source?.name ?? '（已消失）',
        skill: '持續傷害',
        phase: this.phase,
        element: e.element,
        amount: e.amount,
        pct: e.amount / player.maxHp,
        crit: e.isCrit,
        matched: false,
      });
    });
    events.on('SkillHit', (e) => {
      if (e.targetId !== player.id) return;
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const hit = this.pending[i]!;
        if (hit.matched || hit.amount !== e.amount) continue;
        hit.matched = true;
        hit.skill = this.skillName(e.skillId);
        return;
      }
    });
    events.on('SkillCast', (e) => {
      const caster = world.targeting.getActor(e.actorId);
      if (caster?.faction === 'enemy') this.row(caster.name, this.skillName(e.skillId), this.phase).casts++;
    });
    events.on('AttackDodged', (e) => {
      if (e.targetId === player.id) this.dodges++;
    });
    events.on('AttackBlocked', (e) => {
      if (e.targetId === player.id) this.blocks++;
    });
  }

  private get phase(): string {
    return this.world.bosses.phaseLabel(this.boss) ?? OPENING_PHASE;
  }

  /** 隱藏魔王的屬性版本（<技能 ID>.<屬性>）名稱和本體相同 */
  private skillName(id: string): string {
    return this.data.skills.has(id) ? this.data.skills.get(id).name : id;
  }

  private row(source: string, skill: string, phase: string): SimRow {
    const key = `${source}|${skill}|${phase}`;
    let row = this.rows.get(key);
    if (!row) {
      row = { source, skill, phase, casts: 0, hits: 0, total: 0, max: 0, maxPct: 0, crits: 0, elements: new Set() };
      this.rows.set(key, row);
    }
    return row;
  }

  /** 每個 Tick 結束時呼叫：把這個 Tick 的傷害寫進統計 */
  flush(): void {
    for (const hit of this.pending) {
      this.hits.push(hit);
      const row = this.row(hit.source, hit.skill, hit.phase);
      row.hits++;
      row.total += hit.amount;
      row.max = Math.max(row.max, hit.amount);
      row.maxPct = Math.max(row.maxPct, hit.pct);
      if (hit.crit) row.crits++;
      row.elements.add(hit.element);
    }
    this.pending.length = 0;
  }

  reset(): void {
    this.hits = [];
    this.rows.clear();
    this.pending.length = 0;
    this.dodges = 0;
    this.blocks = 0;
    this.startTime = this.world.playTime;
  }

  /** 傷害高的排前面 */
  get table(): SimRow[] {
    return [...this.rows.values()].sort((a, b) => b.total - a.total || b.casts - a.casts);
  }

  get summary(): SimSummary {
    const now = this.world.playTime;
    const first = this.hits[0];
    const fighting = first ? now - first.time : 0;
    const total = this.hits.reduce((s, h) => s + h.amount, 0);
    let maxHit = 0;
    let maxHitPct = 0;
    for (const h of this.hits) {
      maxHit = Math.max(maxHit, h.amount);
      maxHitPct = Math.max(maxHitPct, h.pct);
    }
    return {
      elapsed: now - this.startTime,
      fighting,
      total,
      dps: fighting > 0 ? total / fighting : 0,
      maxHit,
      maxHitPct,
      burst1s: sum(this.hits, 1),
      burst5s: sum(this.hits, 5),
      hits: this.hits.length,
      dodges: this.dodges,
      blocks: this.blocks,
    };
  }
}
