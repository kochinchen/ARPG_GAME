import type { Balance } from '../../data/schema/balance';
import type { EliteConfig } from '../../data/schema/elite';

export interface FloorScaling {
  hp: number;
  /** 樓層魔王（含挑戰樓層的魔王與中途小王）的 HP 倍率 */
  bossHp: number;
  damage: number;
  /** 怪物特殊技能的範圍倍率（普通攻擊與直線招式不受影響） */
  skillArea: number;
  /** 魔王的範圍倍率 */
  bossSkillArea: number;
  /** 魔王放大後的半徑上限（格） */
  bossSkillAreaCap: number;
  defense: number;
  xp: number;
  density: number;
}

/**
 * 樓層 → 怪物倍率（純函式）。第 N 層 = (1 + 每層成長 × (N - 1)) × 怪物強化；密度有上限。
 * 生命與傷害從 geometric.fromFloor 層起改成等比：以那一層的倍率為起點，每往下一層乘固定比例。
 */
export function scaleForFloor(floor: number, difficulty: Balance['difficulty']): FloorScaling {
  const n = Math.max(0, floor - 1);
  const boost = difficulty.monsterBoost;
  const lerpAt = (steps: number) => {
    const t = Math.min(1, steps / Math.max(1, boost.toFloor - 1));
    return ([from, to]: readonly [number, number]) => from + (to - from) * t;
  };
  const lerp = lerpAt(n);
  // 生命與傷害：線性公式只算到等比的起始樓層，超過的層數用乘的
  const geo = difficulty.geometric;
  const linear = Math.min(n, geo.fromFloor - 1);
  const linearLerp = lerpAt(linear);
  const hp = (1 + difficulty.hpPerFloor * linear) * geo.hp ** (n - linear);
  return {
    hp: hp * linearLerp(boost.hp),
    bossHp: hp * linearLerp(boost.bossHp),
    damage: (1 + difficulty.damagePerFloor * linear) * linearLerp(boost.damage) * geo.damage ** (n - linear),
    skillArea: lerp(boost.skillArea),
    bossSkillArea: lerp(boost.bossSkillArea),
    bossSkillAreaCap: boost.bossSkillAreaCap,
    defense: 1 + difficulty.defensePerFloor * n,
    xp: (1 + difficulty.xpPerFloor * n) * boost.xp,
    density: Math.min(difficulty.maxDensityMultiplier, 1 + difficulty.densityPerFloor * n) * (1 + earlyBoost(floor, difficulty.earlyDensityBoost)),
  };
}

/** 前期怪物數量加成：第 1～fullUntil 層為 bonus，之後線性遞減，第 fadeTo 層起為 0 */
function earlyBoost(floor: number, b: Balance['difficulty']['earlyDensityBoost']): number {
  if (floor <= b.fullUntil) return b.bonus;
  if (floor >= b.fadeTo) return 0;
  return b.bonus * ((b.fadeTo - floor) / (b.fadeTo - b.fullUntil));
}

/** 精英 / Boss 的樓層減傷比例（未達起始樓層為 0） */
export function floorResistFor(floor: number, isBoss: boolean, config: EliteConfig['floorResist']): number {
  return grownResist(floor, isBoss ? config.perFloor.boss : config.perFloor.elite, config) * config.normalScale;
}

/** 隱藏魔王的樓層減傷比例：比一般魔王高，不打折 */
export function hiddenBossResistFor(floor: number, config: EliteConfig['floorResist']): number {
  return grownResist(floor, config.perFloor.boss, config);
}

function grownResist(floor: number, perFloor: number, config: EliteConfig['floorResist']): number {
  const floors = floor - config.minFloor + 1;
  return floors <= 0 ? 0 : Math.min(config.max, perFloor * floors);
}

/** 隨機元素抗性的數值（一般怪、精英、首領共用；未達起始樓層為 0） */
export function elementResistFor(floor: number, config: Balance['difficulty']['elementResist']): number {
  const floors = floor - config.minFloor + 1;
  return floors <= 0 ? 0 : Math.min(config.max, config.perFloor * floors);
}
