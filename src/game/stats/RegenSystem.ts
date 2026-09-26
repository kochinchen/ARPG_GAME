import type { Actor } from '../entities/Actor';

/** 每秒回復魔力（stat: manaRegen） */
export class RegenSystem {
  update(actors: readonly Actor[], dt: number): void {
    for (const actor of actors) {
      if (!actor.alive) continue;
      const max = actor.maxMana;
      if (actor.mana < max) actor.mana = Math.min(max, actor.mana + actor.stats.get('manaRegen') * dt);
    }
  }
}
