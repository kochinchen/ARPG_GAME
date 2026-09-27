import type { Actor, ActorId } from '../entities/Actor';
import type { GameEventBus } from '../GameEvents';

export interface OutOfCombatRegen {
  /** 多少秒沒有受到傷害算脫戰 */
  delay: number;
  /** 脫戰時生命回復的倍率 */
  multiplier: number;
}

/**
 * 每秒回復魔力（manaRegen + manaRegenPct × 最大魔力）與生命（hpRegenPct × 最大生命）。
 * 脫戰（delay 秒沒有受到傷害）後生命回復 × multiplier。
 */
export class RegenSystem {
  /** 最後一次受到傷害的時間（秒）；沒有紀錄 = 脫戰 */
  private readonly lastHurt = new Map<ActorId, number>();
  private time = 0;

  constructor(
    events: GameEventBus,
    private readonly outOfCombat: OutOfCombatRegen,
  ) {
    events.on('ActorDamaged', (e) => {
      if (e.amount > 0) this.lastHurt.set(e.targetId, this.time);
    });
    events.on('ActorDied', (e) => this.lastHurt.delete(e.actorId));
  }

  /** 是否已脫戰（UI 顯示用） */
  outOfCombatFor(actor: Actor): boolean {
    const hurt = this.lastHurt.get(actor.id);
    return hurt === undefined || this.time - hurt >= this.outOfCombat.delay;
  }

  update(actors: readonly Actor[], dt: number): void {
    this.time += dt;
    for (const actor of actors) {
      // hp 歸零但死亡尚未處理的也不回復（不能靠回復復活）
      if (!actor.alive || actor.hp <= 0) continue;
      const maxMana = actor.maxMana;
      const manaRegen = actor.stats.get('manaRegen') + maxMana * actor.stats.get('manaRegenPct');
      if (actor.mana < maxMana) actor.mana = Math.min(maxMana, actor.mana + manaRegen * dt);
      const hpRegen = actor.stats.get('hpRegenPct') * (this.outOfCombatFor(actor) ? this.outOfCombat.multiplier : 1);
      if (hpRegen > 0 && actor.hp < actor.maxHp) actor.hp = Math.min(actor.maxHp, actor.hp + actor.maxHp * hpRegen * dt);
    }
  }
}
