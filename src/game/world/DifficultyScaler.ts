import type { Balance } from '../../data/schema/balance';
import type { EliteConfig } from '../../data/schema/elite';

export interface FloorScaling {
  hp: number;
  /** 樓層魔王（含挑戰樓層的魔王與中途小王）的 HP 倍率 */
  bossHp: number;
  damage: number;
  /** 怪物特殊技能的範圍倍率（普通攻擊與直線招式不受影響） */
  skillArea: number;
  defense: number;
  xp: number;
  density: number;
}

/**
 * 樓層 → 怪物倍率（純函式）。第 N 層 = (1 + 每層成長 × (N - 1)) × 怪物強化；密度有上限。
 */
export function scaleForFloor(floor: number, difficulty: Balance['difficulty']): FloorScaling {
  const n = Math.max(0, floor - 1);
  const boost = difficulty.monsterBoost;
  const t = Math.min(1, n / Math.max(1, boost.toFloor - 1));
  const lerp = ([from, to]: readonly [number, number]) => from + (to - from) * t;
  const hp = 1 + difficulty.hpPerFloor * n;
  return {
    hp: hp * lerp(boost.hp),
    bossHp: hp * lerp(boost.bossHp),
    damage: (1 + difficulty.damagePerFloor * n) * lerp(boost.damage),
    skillArea: lerp(boost.skillArea),
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
  const floors = floor - config.minFloor + 1;
  if (floors <= 0) return 0;
  return Math.min(config.max, (isBoss ? config.perFloor.boss : config.perFloor.elite) * floors);
}
