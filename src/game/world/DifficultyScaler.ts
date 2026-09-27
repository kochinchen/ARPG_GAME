import type { Balance } from '../../data/schema/balance';
import type { EliteConfig } from '../../data/schema/elite';

export interface FloorScaling {
  hp: number;
  damage: number;
  defense: number;
  xp: number;
  density: number;
}

/**
 * 樓層 → 怪物倍率（純函式）。第 N 層 = 1 + 每層成長 × (N - 1)；密度有上限。
 */
export function scaleForFloor(floor: number, difficulty: Balance['difficulty']): FloorScaling {
  const n = Math.max(0, floor - 1);
  return {
    hp: 1 + difficulty.hpPerFloor * n,
    damage: 1 + difficulty.damagePerFloor * n,
    defense: 1 + difficulty.defensePerFloor * n,
    xp: 1 + difficulty.xpPerFloor * n,
    density: Math.min(difficulty.maxDensityMultiplier, 1 + difficulty.densityPerFloor * n),
  };
}

/** 精英 / Boss 的樓層減傷比例（未達起始樓層為 0） */
export function floorResistFor(floor: number, isBoss: boolean, config: EliteConfig['floorResist']): number {
  const floors = floor - config.minFloor + 1;
  if (floors <= 0) return 0;
  return Math.min(config.max, (isBoss ? config.perFloor.boss : config.perFloor.elite) * floors);
}
