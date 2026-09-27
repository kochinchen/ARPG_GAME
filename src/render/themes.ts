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
