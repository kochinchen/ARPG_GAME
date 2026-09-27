import type { Rarity } from '../data/schema/item';

/** 畫面配色（暫用色塊，確定好玩後再換美術資源） */
export const PALETTE = {
  background: 0x0b0a09,
  floorA: 0x2a2420,
  floorB: 0x252019,
  floorLine: 0x3a3029,
  wallTop: 0x5c5045,
  wallLeft: 0x3b3229,
  wallRight: 0x2d261f,
  wallEdge: 0x6e6154,
  player: 0xc8a25a,
  playerDark: 0x8a6d38,
  enemy: 0x8c5a3c,
  enemyDark: 0x5a3622,
  hpBack: 0x1a0f0c,
  hpFill: 0xb02a1e,
  playerHpFill: 0x3f9e4a,
  hoverName: 0xf0e2c0,
  /** 精英怪名稱、光圈、血條外框 */
  eliteName: 0xe8c47a,
  /** Boss 名稱與光圈 */
  bossName: 0xff7b5a,
  damageText: 0xf4efe4,
  critText: 0xffb347,
  healText: 0x6fd46f,
  manaText: 0x6fa8ff,
  shadow: 0x000000,
  marker: 0xe8c47a,
} as const;

/** 物品名稱顏色（依稀有度） */
export const RARITY_COLORS: Record<Rarity, number> = {
  normal: 0xe8e2d4,
  magic: 0x6f8dff,
  rare: 0xf2d24b,
  epic: 0xb07cff,
  legendary: 0xff9a3c,
  mythic: 0xff4040,
};

export const FLOOR_COLORS = {
  checkpointIdle: 0x5a5a6a,
  checkpointActive: 0x6fa8ff,
  stairs: 0xc8a25a,
  exitClosed: 0x4a4458,
  exitOpen: 0xb07cff,
} as const;

export const LOOT_COLORS = {
  potion: 0xd0453a,
  gold: 0xe8c47a,
  chest: 0x7a5230,
  chestDark: 0x4a3018,
  chestTrim: 0xc8a25a,
  labelBack: 0x000000,
} as const;

/** 元素顏色（投射物、範圍效果） */
export const ELEMENT_COLORS: Record<string, number> = {
  physical: 0xd8cbb4,
  fire: 0xff7a2a,
  cold: 0x7fd4ff,
  lightning: 0xf5e663,
  poison: 0x7ed957,
};

/** 身上狀態的顏色（依優先順序取第一個） */
export const STATUS_TINTS: [string, number][] = [
  ['freeze', 0x7fd4ff],
  ['stun', 0xf5e663],
  ['airborne', 0xf5e663],
  ['marked', 0xff8a8a],
  ['burn', 0xff9a5a],
  ['slow', 0xa8c8ff],
  ['ironWill', 0xc8c8c8],
];

/** 各怪物的暫用顏色 [主色, 外框]；未列出的用 PALETTE.enemy */
