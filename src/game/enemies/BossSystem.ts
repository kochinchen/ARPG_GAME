import type { Rng } from '../../core/Rng';
import { distance, type Vec2 } from '../../core/math/Vec2';
import type { DataRegistry } from '../../data/DataRegistry';
import type { BossPhase } from '../../data/schema/enemy';
import type { Actor, ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

/** 爪子收合的減傷（Modifier 的來源） */
const CLAW_GUARD = 'claw-guard';

/** 魔王進行中的機制（階段的 clawCycle、pause、detach） */
interface BossRoutine {
  phase: BossPhase;
  /** 爪子目前收合 */
  closed: boolean;
  /** 距離下一次開合的秒數 */
  clawTimer: number;
  /** 還要停多久（停完才脫離） */
  pause: number;
  /** 脫離出來的怪物 */
  detached: ActorId | null;
  /** 僵直的秒數 */
  stagger: number;
}

/**
 * Boss 的階段變化（EnemyDef.phases）：HP 降到門檻以下時進入下一階段，
 * 一次性套用屬性加成，並可改用另一組技能（例如墮落騎士的火 / 冰 / 雷附魔）。
 * 也負責階段裡持續進行的機制：爪子交替開合、停頓後脫離出獨立的怪物。
 */
export class BossSystem {
  /** Boss → 目前階段（0 = 初始，1 = phases[0]…） */
  private readonly phases = new Map<ActorId, number>();
  private readonly routines = new Map<ActorId, BossRoutine>();
  /** 主角剛死的位置（下一次 update 讓附近的魔王回血） */
  private playerDiedAt: Vec2 | null = null;

  constructor(
    private readonly data: Pick<DataRegistry, 'enemies'>,
    private readonly events: GameEventBus,
    private readonly rng: Rng,
    private readonly getActor: (id: ActorId) => Actor | null,
    /** 在魔王身邊放出獨立的怪物（GameWorld 建立實體） */
    private readonly spawnDetached: (boss: Actor, enemyId: string) => Actor | null,
  ) {
    // 脫離的怪物死掉：本體僵直；本體死掉：牠一起消失
    events.on('ActorDied', (e) => {
      if (e.faction === 'player' && !e.summoned) this.playerDiedAt = e.position;
      for (const [bossId, routine] of this.routines) {
        if (routine.detached === null) continue;
        if (e.actorId === bossId) {
          const tail = this.getActor(routine.detached);
          if (tail?.alive) tail.hp = 0;
        } else if (e.actorId === routine.detached) {
          routine.detached = null;
          routine.stagger = routine.phase.detach!.stagger;
          const boss = this.getActor(bossId);
          if (boss?.alive) boss.stasis = true;
        }
      }
    });
  }

  /** 目前階段（0 = 初始） */
  phaseOf(actor: Actor): number {
    return this.phases.get(actor.id) ?? 0;
  }

  /** 目前階段的名稱（初始階段為 null） */
  phaseLabel(actor: Actor): string | null {
    const phase = this.phaseOf(actor);
    if (phase === 0 || actor.defId === null) return null;
    return this.data.enemies.get(actor.defId).phases[phase - 1]?.label ?? null;
  }

  update(actors: readonly Actor[], dt: number): void {
    for (const boss of actors) {
      // 中途小王沒有階段變化
      if (!boss.isBoss || boss.miniBoss || !boss.alive || boss.defId === null) continue;
      const def = this.data.enemies.get(boss.defId);
      if (this.playerDiedAt && def.healOnPlayerDeath && boss.hp < boss.maxHp && distance(boss.position, this.playerDiedAt) <= def.leashRange) {
        const before = boss.hp;
        boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * def.healOnPlayerDeath);
        this.events.emit('BossFedOnDeath', { actorId: boss.id, position: boss.position, amount: boss.hp - before });
      }
      const phases = def.phases;
      let current = this.phaseOf(boss);
      // 一次掉很多血時可能連跳好幾個階段，依序套用
      while (current < phases.length && boss.hp <= boss.maxHp * phases[current]!.hpBelow) {
        const phase = phases[current]!;
        current++;
        this.phases.set(boss.id, current);
        for (const m of phase.modifiers) boss.stats.addModifier({ stat: m.stat, kind: m.kind, value: m.value, source: `phase-${current}` });
        if (phase.skills) this.useSkills(boss, phase.skills);
        this.enterRoutine(boss, phase);
        this.events.emit('BossPhaseChanged', { actorId: boss.id, name: boss.name, phase: current, label: phase.label, look: phase.look ?? current });
      }
      const routine = this.routines.get(boss.id);
      if (routine) this.updateRoutine(boss, routine, dt);
    }
    this.playerDiedAt = null;
  }

  /** 進入新階段：結束上一個階段的開合，開始這個階段的機制 */
  private enterRoutine(boss: Actor, phase: BossPhase): void {
    boss.stats.removeBySource(CLAW_GUARD);
    boss.stasis = false;
    boss.barrage = null;
    if (!phase.clawCycle && phase.pause === undefined && !phase.detach) {
      this.routines.delete(boss.id);
      return;
    }
    const routine: BossRoutine = { phase, closed: false, clawTimer: 0, pause: phase.pause ?? 0, detached: null, stagger: 0 };
    this.routines.set(boss.id, routine);
    if (phase.clawCycle) this.setClaws(boss, routine, true);
    if (routine.pause > 0) {
      boss.stasis = true;
      boss.untouchable = true;
      boss.intent = null;
      boss.cast = null;
      boss.path = [];
    }
  }

  private updateRoutine(boss: Actor, routine: BossRoutine, dt: number): void {
    if (routine.pause > 0) {
      routine.pause -= dt;
      if (routine.pause > 0) return;
      boss.stasis = false;
      boss.untouchable = false;
      const detach = routine.phase.detach;
      if (detach) {
        routine.detached = this.spawnDetached(boss, detach.enemyId)?.id ?? null;
        this.events.emit('BossLookChanged', { actorId: boss.id, look: detach.look });
      }
    }
    if (routine.stagger > 0) {
      routine.stagger -= dt;
      if (routine.stagger <= 0) boss.stasis = false;
    }
    if (routine.phase.clawCycle) {
      routine.clawTimer -= dt;
      // 跳在空中時等落地才開合
      if (routine.clawTimer <= 0 && !boss.vanished) {
        this.setClaws(boss, routine, !routine.closed);
        this.events.emit('BossLookChanged', { actorId: boss.id, look: routine.closed ? routine.phase.clawCycle.closedLook : routine.phase.clawCycle.openLook });
      }
    }
  }

  /** 爪子開合：收合時受到的傷害降低、站著不動，只有尾巴連發 */
  private setClaws(boss: Actor, routine: BossRoutine, closed: boolean): void {
    const cycle = routine.phase.clawCycle!;
    routine.closed = closed;
    boss.stats.removeBySource(CLAW_GUARD);
    boss.stasis = closed;
    boss.barrage = closed ? cycle.closedBarrage : null;
    boss.path = [];
    if (closed) {
      boss.intent = null;
      boss.cast = null;
      boss.stats.addModifier({ stat: 'damageReduction', kind: 'flat', value: cycle.reduction, source: CLAW_GUARD });
      routine.clawTimer = cycle.closedFor;
    } else {
      if (routine.phase.skills) this.useSkills(boss, routine.phase.skills);
      routine.clawTimer = this.rng.range(cycle.openFor[0], cycle.openFor[1]);
    }
  }

  /** 換成新的一組技能：第一個為主要攻擊，其餘為特殊技能（新技能沒有冷卻，會很快用出來） */
  private useSkills(boss: Actor, skills: readonly string[]): void {
    boss.skillRanks.clear();
    for (const id of skills) boss.skillRanks.set(id, 1);
    if (boss.ai) {
      const [primary, ...special] = skills;
      boss.ai.skillId = primary!;
      boss.ai.specialSkills = special;
    }
  }

  /** 換樓層時清空（Boss 重新生成） */
  clear(): void {
    this.phases.clear();
    this.routines.clear();
    this.playerDiedAt = null;
  }
}
