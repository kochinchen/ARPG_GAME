import type { Vec2 } from '../../core/math/Vec2';
import type { EnemyDef } from '../../data/schema/enemy';
import { createBrain } from '../ai/AiBrain';
import { Actor, type ActorId } from '../entities/Actor';
import { StatBlock } from '../stats/StatBlock';
import type { FloorScaling } from '../world/DifficultyScaler';

const NO_SCALING: FloorScaling = { hp: 1, damage: 1, defense: 1, xp: 1, density: 1 };

/**
 * 由 EnemyDef 組出一隻怪物，並套用樓層倍率。Elite 詞綴之後也在這裡套用。
 */
export class EnemyFactory {
  create(def: EnemyDef, id: ActorId, position: Vec2, scaling: FloorScaling = NO_SCALING): Actor {
    const stats = new StatBlock({
      maxHp: def.hp * scaling.hp,
      moveSpeed: def.moveSpeed,
      damageMin: def.damage[0] * scaling.damage,
      damageMax: def.damage[1] * scaling.damage,
      attackSpeed: def.attackSpeed,
      attackRange: def.attackRange,
      defense: def.defense * scaling.defense,
    });
    return new Actor({
      id,
      faction: 'enemy',
      name: def.name,
      defId: def.id,
      position,
      radius: def.radius,
      stats,
      ai:
        def.ai === 'none'
          ? null
          : createBrain(position, {
              detectRange: def.detectRange,
              leashRange: def.leashRange,
              skills: def.skills,
              keepDistance: def.ai === 'ranged' ? def.keepDistance : 0,
            }),
      skillRanks: new Map(def.skills.map((skillId) => [skillId, 1])),
      isBoss: def.boss,
      xpReward: Math.round(def.xp * scaling.xp),
    });
  }
}
