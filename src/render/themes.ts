import type { DungeonTheme } from '../data/schema/floor';

/**
 * 地牢風格的配色與裝飾（由淺入深逐步變化）。
 * glow：火把 / 蠟燭 / 熔岩 / 水晶的光色；decor：地上的裝飾種類。
 */
export interface ThemeColors {
  floorA: number;
  floorB: number;
  wallTop: number;
  wallLeft: number;
  wallRight: number;
  glow: number;
  /** 光源密度（每 100 格牆邊約幾個） */
  lights: number;
  decor: 'rubble' | 'bones' | 'carpet' | 'cracks' | 'crystals';
  /** 地板偶爾出現的特殊色（苔蘚、熔岩縫、紫色光斑） */
  accent: number;
}

export const THEMES: Record<DungeonTheme, ThemeColors> = {
  // 遺棄地窖：土黃石材、橘色火把、碎石
  crypt: { floorA: 0x3a332b, floorB: 0x2f2922, wallTop: 0x6a5e50, wallLeft: 0x423a30, wallRight: 0x332c24, glow: 0xff9a3a, lights: 1.1, decor: 'rubble', accent: 0x4a3f33 },
  // 古老墓穴：灰綠石材、青綠鬼火、骨頭與苔蘚
  tomb: { floorA: 0x2f3530, floorB: 0x282e29, wallTop: 0x56625a, wallLeft: 0x39423b, wallRight: 0x2c332d, glow: 0x7affb0, lights: 0.9, decor: 'bones', accent: 0x3a4a34 },
  // 地下聖堂：暖色石磚、金色燭光、紅地毯
  sanctum: { floorA: 0x4a3c30, floorB: 0x40342a, wallTop: 0x7a6a58, wallLeft: 0x544638, wallRight: 0x43372c, glow: 0xffc860, lights: 1.4, decor: 'carpet', accent: 0x7a2420 },
  // 熔岩礦坑：黑色玄武岩、橘紅熔岩縫
  lava: { floorA: 0x2a1e1a, floorB: 0x231915, wallTop: 0x4a3028, wallLeft: 0x33211b, wallRight: 0x281a15, glow: 0xff5a1e, lights: 1.2, decor: 'cracks', accent: 0xff6a24 },
  // 破碎要塞：冷藍灰石磚、藍色火把、碎石
  fortress: { floorA: 0x2e3440, floorB: 0x282e38, wallTop: 0x566072, wallLeft: 0x3a4250, wallRight: 0x2e3440, glow: 0x7ab4ff, lights: 1, decor: 'rubble', accent: 0x3a4454 },
  // 深淵通道：紫黑岩地、紫色水晶
  abyss: { floorA: 0x241c30, floorB: 0x1e1628, wallTop: 0x44345c, wallLeft: 0x302440, wallRight: 0x261c34, glow: 0xb45aff, lights: 1.3, decor: 'crystals', accent: 0x5a2a8a },
  // 深淵神殿：暗洋紅石材、粉紫光、紅地毯
  temple: { floorA: 0x2c1a28, floorB: 0x241420, wallTop: 0x543450, wallLeft: 0x3a2438, wallRight: 0x2e1c2c, glow: 0xff5ac8, lights: 1.4, decor: 'carpet', accent: 0x6a1a3a },
};

/**
 * 魔王競技場的風格（依魔王的屬性）：地板與牆的配色、地上的大型紋路、周圍的擺設與光源。
 * - pattern：ring 墓穴法陣 / pentagram 血色五芒星 / lava 熔岩裂縫與岩漿池 / checker 騎士棋盤地磚與三元素符文環
 *   / web 巨大蛛網 / void 深淵符文法陣
 * - props：sarcophagi 石棺與骨堆 / candles 燭台群 / spires 熔岩石柱 / banners 破旗與插地的劍 / eggs 卵囊 / crystals 虛空水晶
 */
export interface ArenaStyle {
  floorA: number;
  floorB: number;
  wallTop: number;
  wallLeft: number;
  wallRight: number;
  /** 紋路與光源的主色 */
  glow: number;
  /** 第二色（紋路的細節、岩漿的亮芯、三元素的其中一色） */
  accent: number;
  pattern: 'ring' | 'pentagram' | 'lava' | 'checker' | 'web' | 'void';
  props: 'sarcophagi' | 'candles' | 'spires' | 'banners' | 'eggs' | 'crystals';
}

export const BOSS_ARENAS: Record<string, ArenaStyle> = {
  // 5F 墓穴守衛：灰綠墓石、青綠鬼火、刻在地上的守墓法陣、石棺與骨堆
  'enemy.crypt_guardian': { floorA: 0x2c3530, floorB: 0x252d28, wallTop: 0x5a6a60, wallLeft: 0x3a463f, wallRight: 0x2c3530, glow: 0x6affa8, accent: 0xcfc6b0, pattern: 'ring', props: 'sarcophagi' },
  // 10F 墮落神官（血焰、狂信）：暗紅石材、血色五芒星、燭台群
  'enemy.fallen_priest': { floorA: 0x2e1a1a, floorB: 0x261515, wallTop: 0x5a2e2a, wallLeft: 0x3e201e, wallRight: 0x2e1817, glow: 0xff3a3a, accent: 0xffc860, pattern: 'pentagram', props: 'candles' },
  // 15F 熔岩巨獸（火）：黑色玄武岩、發光的熔岩裂縫與岩漿池、熔岩石柱
  'enemy.lava_behemoth': { floorA: 0x1e1512, floorB: 0x18110e, wallTop: 0x3e2620, wallLeft: 0x2a1a16, wallRight: 0x201411, glow: 0xff5a1e, accent: 0xffd060, pattern: 'lava', props: 'spires' },
  // 20F 墮落騎士（火 / 冰 / 雷 附魔）：冷色棋盤地磚、三元素符文環、破旗與插在地上的劍
  'enemy.fallen_knight': { floorA: 0x3a404c, floorB: 0x262b34, wallTop: 0x5e6878, wallLeft: 0x3e4552, wallRight: 0x30363f, glow: 0x9ab8ff, accent: 0xff7a2a, pattern: 'checker', props: 'banners' },
  // 25F 蜘蛛女王（毒）：紫綠色的巢穴地面、巨大蛛網、毒液池、卵囊
  'enemy.spider_queen': { floorA: 0x221c26, floorB: 0x1b161f, wallTop: 0x3e3446, wallLeft: 0x2c2432, wallRight: 0x221c28, glow: 0x9aff5a, accent: 0xd8e0c8, pattern: 'web', props: 'eggs' },
  // 30F 深淵魔王（深淵、火）：黑紫岩地、紫色深淵法陣與符文、虛空水晶
  // 35F 深淵統御者：黑紅岩地、熔岩橘紅的深淵法陣
  'enemy.abyss_sovereign': { floorA: 0x221012, floorB: 0x1a0c0e, wallTop: 0x4a2020, wallLeft: 0x351616, wallRight: 0x281010, glow: 0xff4a2a, accent: 0xffb040, pattern: 'void', props: 'crystals' },
  'enemy.abyss_lord': { floorA: 0x1a1224, floorB: 0x140e1c, wallTop: 0x3a2850, wallLeft: 0x281c38, wallRight: 0x1e152a, glow: 0xb45aff, accent: 0xff4a8a, pattern: 'void', props: 'crystals' },
};
