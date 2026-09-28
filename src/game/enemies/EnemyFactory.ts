import type { Rng } from '../../core/Rng';
import type { Vec2 } from '../../core/math/Vec2';
import type { EnemyDef } from '../../data/schema/enemy';
import type { EliteAffixDef } from '../../data/schema/elite';
import type { Balance } from '../../data/schema/balance';
import { createBrain } from '../ai/AiBrain';
import { Actor, type ActorId } from '../entities/Actor';
import { StatBlock } from '../stats/StatBlock';
import type { FloorScaling } from '../world/DifficultyScaler';

const NO_SCALING: FloorScaling = { hp: 1, damage: 1, defense: 1, xp: 1, density: 1 };
/** 碰撞半徑上限（外觀可以更大）：一般怪物不超過 0.5，Boss 0.8 */
const MAX_RADIUS = 0.5;
const MAX_BOSS_RADIUS = 0.8;

/** 隨機體型：scale = 外觀倍率，stat = HP 與傷害倍率 */
export interface SizeRoll {
  scale: number;
  stat: number;
}

export const NORMAL_SIZE: SizeRoll = { scale: 1, stat: 1 };

/**
 * 擲一次隨機體型（常態分佈）：近戰怪（物理）差異大且 HP / 傷害跟著提高；遠程 / 法術怪差異小、數值不變。
 * Boss 與不會行動的怪（訓練木樁）固定 100%。
 */
export function rollSize(def: EnemyDef, config: Balance['enemySize'], rng: Rng): SizeRoll {
  const roll = rng.normal(0, 1);
  if (def.boss || def.ai === 'none') return NORMAL_SIZE;
  const c = def.ai === 'melee' ? config.melee : config.ranged;
  const scale = Math.min(c.max, Math.max(c.min, c.mean + roll * c.sd));
  return { scale, stat: 1 + (scale - 1) * c.statPerSize };
}

/** 屬性減傷作用的抗性 */
const ELEMENTAL_RESISTS = ['fireResist', 'coldResist', 'lightningResist', 'poisonResist'] as const;

/** 樓層減傷：物理 / 屬性各自的比例（0 = 沒有） */
export interface FloorResist {
  physical: number;
  elemental: number;
}

/** 套用樓層減傷（在加入世界前呼叫，頭上的名稱會一併顯示） */
export function applyFloorResist(actor: Actor, resist: FloorResist): void {
  if (resist.physical > 0) actor.stats.addModifier({ stat: 'physicalResist', kind: 'flat', value: resist.physical, source: 'floorResist' });
  if (resist.elemental > 0) {
    for (const stat of ELEMENTAL_RESISTS) actor.stats.addModifier({ stat, kind: 'flat', value: resist.elemental, source: 'floorResist' });
  }
}

/** 精英怪：共通強化 + 詞綴 */
export interface EliteSpec {
  config: Balance['elite'];
  affixes: readonly EliteAffixDef[];
}

/**
 * 由 EnemyDef 組出一隻怪物，並套用樓層倍率；精英怪再套用共通強化與詞綴（Modifier 來源 'elite'）。
 */
export class EnemyFactory {
  create(
    def: EnemyDef,
    id: ActorId,
    position: Vec2,
    scaling: FloorScaling = NO_SCALING,
    elite?: EliteSpec,
    /** 召喚者（Boss 召喚物）：不給經驗、不掉寶 */
    summonedBy: ActorId | null = null,
    size: SizeRoll = NORMAL_SIZE,
    /** 中途小王：魔王數值再乘這些倍率（balance.endgame.miniBoss） */
    miniBoss?: { hpMultiplier: number; damageMultiplier: number; xpMultiplier: number },
  ): Actor {
    const e = elite?.config;
    const hpMult = scaling.hp * (e?.hpMultiplier ?? 1) * size.stat * (miniBoss?.hpMultiplier ?? 1);
    const damageMult = scaling.damage * (e?.damageMultiplier ?? 1) * size.stat * (miniBoss?.damageMultiplier ?? 1);
    const stats = new StatBlock({
      maxHp: def.hp * hpMult,
      moveSpeed: def.moveSpeed,
      damageMin: def.damage[0] * damageMult,
      damageMax: def.damage[1] * damageMult,
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
      radius: Math.min(def.boss ? MAX_BOSS_RADIUS : MAX_RADIUS, def.radius * def.size * size.scale * (e?.radiusMultiplier ?? 1)),
      visualRadius: def.radius * def.size * size.scale * (e?.radiusMultiplier ?? 1),
      stats,
      elite: elite !== undefined,
      summonedBy,
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
      miniBoss: miniBoss !== undefined,
      xpReward: Math.round(def.xp * scaling.xp * (e?.xpMultiplier ?? 1) * (miniBoss?.xpMultiplier ?? 1)),
    });
    return actor;
  }
}
