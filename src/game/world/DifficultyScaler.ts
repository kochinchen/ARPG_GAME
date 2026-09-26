import type { Balance } from '../../data/schema/balance';

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
