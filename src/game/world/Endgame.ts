import type { Balance } from '../../data/schema/balance';

/**
 * 終局規則（純函式；規格見 docs/ENDGAME.md）：
 * 30 層通關、31～35 極限挑戰（進入後回不到 1～30）、讀檔時可以選的樓層。
 */

export interface EndgameProgress {
  /** 已通關（擊敗第 lastNormalFloor 層的魔王） */
  cleared: boolean;
  /** 已完成隱藏難關（擊敗第 lastFloor 層的魔王） */
  completedHidden: boolean;
  highestFloor: number;
}

type EndgameConfig = Balance['endgame'];

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/** 已進入極限挑戰（到過第 lastNormalFloor + 1 層以上） */
export function inChallenge(p: EndgameProgress, cfg: EndgameConfig): boolean {
  return p.highestFloor > cfg.lastNormalFloor;
}

/** 讀檔時可以選擇前往的樓層（空陣列 = 不能選，照存檔位置繼續） */
export function selectableFloors(p: EndgameProgress, cfg: EndgameConfig): number[] {
  if (p.completedHidden) return range(1, cfg.lastFloor);
  if (inChallenge(p, cfg)) return range(cfg.lastNormalFloor + 1, cfg.lastFloor);
  if (p.cleared) return range(1, cfg.lastNormalFloor);
  return [];
}

/** 能否從這一層往上走：第 1 層沒有上一層；挑戰的第一層不能回到一般模式（完成隱藏難關後解除） */
export function canAscend(floor: number, p: EndgameProgress, cfg: EndgameConfig): boolean {
  if (floor <= 1) return false;
  return floor !== cfg.lastNormalFloor + 1 || p.completedHidden;
}

/**
 * 從這一層的出口往下：
 * - next：直接前往下一層
 * - confirmChallenge：一般模式的最後一層、還沒進入過挑戰 → 先詢問（進入後回不到 1～30）
 * - none：最後一層，沒有下一層
 */
export function descendKind(floor: number, p: EndgameProgress, cfg: EndgameConfig): 'next' | 'confirmChallenge' | 'none' {
  if (floor >= cfg.lastFloor) return 'none';
  if (floor === cfg.lastNormalFloor && !inChallenge(p, cfg) && !p.completedHidden) return 'confirmChallenge';
  return 'next';
}
