import type { Actor } from '../entities/Actor';

/** 每秒回復魔力（manaRegen）與生命（hpRegenPct × 最大生命） */
export class RegenSystem {
  update(actors: readonly Actor[], dt: number): void {
    for (const actor of actors) {
      if (!actor.alive) continue;
      const maxMana = actor.maxMana;
      if (actor.mana < maxMana) actor.mana = Math.min(maxMana, actor.mana + actor.stats.get('manaRegen') * dt);
      const hpRegen = actor.stats.get('hpRegenPct');
      if (hpRegen > 0 && actor.hp < actor.maxHp) actor.hp = Math.min(actor.maxHp, actor.hp + actor.maxHp * hpRegen * dt);
    }
  }
}
