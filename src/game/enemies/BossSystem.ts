import type { DataRegistry } from '../../data/DataRegistry';
import type { Actor, ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

/**
 * Boss 的階段變化（EnemyDef.phases）：HP 降到門檻以下時進入下一階段，
 * 一次性套用屬性加成，並可改用另一組技能（例如墮落騎士的火 / 冰 / 雷附魔）。
 */
export class BossSystem {
  /** Boss → 目前階段（0 = 初始，1 = phases[0]…） */
  private readonly phases = new Map<ActorId, number>();

  constructor(
    private readonly data: Pick<DataRegistry, 'enemies'>,
    private readonly events: GameEventBus,
  ) {}

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

  update(actors: readonly Actor[]): void {
    for (const boss of actors) {
      // 中途小王沒有階段變化
      if (!boss.isBoss || boss.miniBoss || !boss.alive || boss.defId === null) continue;
      const phases = this.data.enemies.get(boss.defId).phases;
      let current = this.phaseOf(boss);
      // 一次掉很多血時可能連跳好幾個階段，依序套用
      while (current < phases.length && boss.hp <= boss.maxHp * phases[current]!.hpBelow) {
        const phase = phases[current]!;
        current++;
        this.phases.set(boss.id, current);
        for (const m of phase.modifiers) boss.stats.addModifier({ stat: m.stat, kind: m.kind, value: m.value, source: `phase-${current}` });
        if (phase.skills) this.useSkills(boss, phase.skills);
        this.events.emit('BossPhaseChanged', { actorId: boss.id, name: boss.name, phase: current, label: phase.label });
      }
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
  }
}
