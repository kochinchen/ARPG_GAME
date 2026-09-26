import type { Balance } from '../../data/schema/balance';
import type { Actor, ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

const SOURCE = 'enrage';

/**
 * Boss 的階段：HP 降到 enrageThreshold 以下時進入狂暴（一次性套用加成）。
 */
export class BossSystem {
  private readonly enraged = new Set<ActorId>();

  constructor(
    private readonly config: Balance['boss'],
    private readonly events: GameEventBus,
  ) {}

  isEnraged(actor: Actor): boolean {
    return this.enraged.has(actor.id);
  }

  update(actors: readonly Actor[]): void {
    for (const boss of actors) {
      if (!boss.isBoss || !boss.alive || this.enraged.has(boss.id)) continue;
      if (boss.hp > boss.maxHp * this.config.enrageThreshold) continue;
      this.enraged.add(boss.id);
      for (const m of this.config.enrage) boss.stats.addModifier({ stat: m.stat, kind: m.kind, value: m.value, source: SOURCE });
      this.events.emit('BossEnraged', { actorId: boss.id, name: boss.name });
    }
  }

  /** 換樓層時清空（Boss 重新生成） */
  clear(): void {
    this.enraged.clear();
  }
}
