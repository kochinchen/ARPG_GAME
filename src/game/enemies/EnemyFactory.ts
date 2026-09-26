import type { Vec2 } from '../../core/math/Vec2';
import type { EnemyDef } from '../../data/schema/enemy';
import type { EliteAffixDef } from '../../data/schema/elite';
import type { Balance } from '../../data/schema/balance';
import { createBrain } from '../ai/AiBrain';
import { Actor, type ActorId } from '../entities/Actor';
import { StatBlock } from '../stats/StatBlock';
import type { FloorScaling } from '../world/DifficultyScaler';

const NO_SCALING: FloorScaling = { hp: 1, damage: 1, defense: 1, xp: 1, density: 1 };

/** 精英怪：共通強化 + 詞綴 */
export interface EliteSpec {
  config: Balance['elite'];
  affixes: readonly EliteAffixDef[];
}

/**
 * 由 EnemyDef 組出一隻怪物，並套用樓層倍率；精英怪再套用共通強化與詞綴（Modifier 來源 'elite'）。
 */
export class EnemyFactory {
  create(def: EnemyDef, id: ActorId, position: Vec2, scaling: FloorScaling = NO_SCALING, elite?: EliteSpec): Actor {
    const e = elite?.config;
    const stats = new StatBlock({
      maxHp: def.hp * scaling.hp * (e?.hpMultiplier ?? 1),
      moveSpeed: def.moveSpeed,
      damageMin: def.damage[0] * scaling.damage * (e?.damageMultiplier ?? 1),
      damageMax: def.damage[1] * scaling.damage * (e?.damageMultiplier ?? 1),
      attackSpeed: def.attackSpeed,
      attackRange: def.attackRange,
      defense: def.defense * scaling.defense,
    });
    for (const affix of elite?.affixes ?? []) {
      for (const m of affix.modifiers) stats.addModifier({ stat: m.stat, kind: m.kind, value: m.value, source: 'elite' });
    }
    const actor = new Actor({
      id,
      faction: 'enemy',
      name: elite ? `${elite.affixes.map((a) => a.name).join(' ')} ${def.name}` : def.name,
      defId: def.id,
      position,
      radius: Math.min(0.5, def.radius * (e?.radiusMultiplier ?? 1)),
      stats,
      elite: elite !== undefined,
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
      xpReward: Math.round(def.xp * scaling.xp * (e?.xpMultiplier ?? 1)),
    });
    return actor;
  }
}
