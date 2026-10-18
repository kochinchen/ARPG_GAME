import { BLACK_STEEL, DARK_STEEL, DARK_WOOD, IRON, LEATHER, PALE_WOOD, RED_LEATHER, STEEL, VOID, WOOD, type Tones } from '../WeaponParts';
import { axeSpec, type UniqueWeapon } from '../WeaponSpec';

/**
 * 擴充的傳奇 / 神話（axe）專屬造型與光芒：ID 對應 src/data/uniqueItems/axe.ts。
 * 怪物主題的斧取怪物的顏色（酸綠甲殼、角甲、熔岩、血鱗、岩塊、虛空孢子），神話取魔王的配色並帶環繞的碎片 / 符文。
 */

// 怪物與魔王的色階（亮 / 中 / 暗 / 中）
const ACID_SHELL: Tones = [0x8aa850, 0x6a8a3a, 0x405a22, 0x7a9a46];
const HORN_PLATE: Tones = [0x9a8a70, 0x7a6a54, 0x4e4434, 0x8a7a62];
const MAGMA_ROCK: Tones = [0x5a4438, 0x463429, 0x2a1e18, 0x503c30];
const BLOOD_SCALE: Tones = [0xc04a40, 0x9a2e2a, 0x601a18, 0xb03c36];
const QUAKE_STONE: Tones = [0x8a8478, 0x6c675d, 0x48443c, 0x7a756a];
const VOID_SPORE: Tones = [0x6a4a8a, 0x4e3468, 0x2e1e40, 0x5c3e7a];
const GUARDIAN_IRON: Tones = [0x6c665c, 0x57524a, 0x2e2b27, 0x4c4842];
const RUST: Tones = [0x7a4a2a, 0x6a3e22, 0x45281a, 0x724426];
const LAVA_ROCK: Tones = [0x6a5446, 0x4a3a33, 0x2e2320, 0x564439];
const QUEEN_CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const QUEEN_HAFT: Tones = [0x2a1830, 0x1e1024, 0x140a18, 0x24142a];
const SOVEREIGN_SHELL: Tones = [0x2a1e24, 0x1c1418, 0x0e0a0c, 0x241a20];
const SOVEREIGN_FLESH: Tones = [0x82140f, 0x6e0e0c, 0x3e0707, 0x7a110e];

export const axeUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.axe_acid_beetle': {
    look: axeSpec({ head: 'bearded', haft: 15, size: 4.2, haftColors: DARK_WOOD, headColors: ACID_SHELL, edgeColor: 0xc8ff70 }),
    glow: { color: 0x9fe060, core: 0xe8ffc0, particle: 'void' },
  },
  'legendary.axe_horned_charge': {
    look: axeSpec({ head: 'single', haft: 16, size: 4.6, haftColors: WOOD, headColors: HORN_PLATE, spike: true, edgeColor: 0xe8dcc0 }),
    glow: { color: 0xe0c890, core: 0xfff4e0, particle: 'rock' },
  },
  'legendary.axe_magma_jaw': {
    look: axeSpec({ head: 'cleaver', haft: 16, size: 4.8, haftColors: BLACK_STEEL, headColors: MAGMA_ROCK, edgeColor: 0xff7a1a }),
    glow: { color: 0xff7a1a, core: 0xffd080, particle: 'ember' },
  },
  'legendary.axe_blood_lizard': {
    look: axeSpec({ head: 'fang', haft: 14, size: 4.2, haftColors: RED_LEATHER, headColors: BLOOD_SCALE }),
    glow: { color: 0xe0303c, core: 0xffb0b0, particle: 'blood' },
  },
  'legendary.axe_quake_beast': {
    look: axeSpec({ head: 'double', haft: 17, size: 4.8, haftColors: DARK_WOOD, headColors: QUAKE_STONE, edgeColor: 0xd8d0c0 }),
    glow: { color: 0xc8b890, core: 0xf8f0e0, particle: 'rock' },
  },
  'legendary.axe_woodsman': {
    look: axeSpec({ head: 'single', haft: 18, size: 4.4, haftColors: PALE_WOOD, headColors: STEEL, edgeColor: 0xffffff }),
    glow: { color: 0xd8f0c8, core: 0xffffff, particle: 'wind' },
  },
  'legendary.axe_skull_crusher': {
    look: axeSpec({ head: 'cleaver', haft: 17, size: 5.2, haftColors: LEATHER, headColors: DARK_STEEL, spike: true, edgeColor: 0xe8dcc0 }),
    glow: { color: 0xe8dcc0, core: 0xffffff, particle: 'star' },
  },
  'legendary.axe_void_spore': {
    look: axeSpec({ head: 'crescent', haft: 16, size: 4.4, haftColors: VOID, headColors: VOID_SPORE, edgeColor: 0xc89aff }),
    glow: { color: 0xb070ff, core: 0xf0e0ff, particle: 'void' },
  },
  'legendary.axe_returning': {
    look: axeSpec({ head: 'double', haft: 13, size: 3.8, haftColors: LEATHER, headColors: IRON, edgeColor: 0xb8f0d8 }),
    glow: { color: 0xb8f0d8, core: 0xffffff, particle: 'wind' },
  },

  // ── 紅（魔王） ──
  'mythic.axe_crypt_guardian': {
    look: axeSpec({ head: 'bearded', haft: 19, size: 5.6, haftColors: RUST, headColors: GUARDIAN_IRON, spike: true, edgeColor: 0xff8a3a }),
    glow: { color: 0xff8a3a, core: 0xffd8b0, particle: 'shadow', orbit: 'runes' },
  },
  'mythic.axe_lava_behemoth': {
    look: axeSpec({ head: 'double', haft: 19, size: 6, haftColors: MAGMA_ROCK, headColors: LAVA_ROCK, spike: true, edgeColor: 0xff7a1a }),
    glow: { color: 0xff7a1a, core: 0xffb838, particle: 'rock', orbit: 'shards' },
  },
  'mythic.axe_spider_queen': {
    look: axeSpec({ head: 'fang', haft: 18, size: 5.6, haftColors: QUEEN_HAFT, headColors: QUEEN_CHITIN }),
    glow: { color: 0x7aff4a, core: 0xc0ff90, particle: 'void', orbit: 'shards' },
  },
  'mythic.axe_abyss_sovereign': {
    look: axeSpec({ head: 'crescent', haft: 20, size: 6.4, haftColors: SOVEREIGN_FLESH, headColors: SOVEREIGN_SHELL, edgeColor: 0xff5a14 }),
    glow: { color: 0xff5a14, core: 0xffa53a, particle: 'void', orbit: 'stars' },
  },
};
