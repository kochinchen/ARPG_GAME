import type { Vec2 } from '../../core/math/Vec2';
import type { EnemyDef } from '../../data/schema/enemy';
import { Actor, type ActorId } from '../entities/Actor';
import { StatBlock } from '../stats/StatBlock';

/**
 * 由 EnemyDef 組出一隻怪物。M7 起會再套用 DifficultyScaler 的樓層倍率與 Elite 詞綴。
 */
export class EnemyFactory {
  create(def: EnemyDef, id: ActorId, position: Vec2): Actor {
    const stats = new StatBlock({
      maxHp: def.hp,
      moveSpeed: def.moveSpeed,
      damageMin: def.damage[0],
      damageMax: def.damage[1],
      attackSpeed: def.attackSpeed,
      attackRange: def.attackRange,
      defense: def.defense,
    });
    return new Actor({
      id,
      faction: 'enemy',
      name: def.name,
      defId: def.id,
      position,
      radius: def.radius,
      stats,
    });
  }
}
