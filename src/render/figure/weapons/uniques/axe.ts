import { BLACK_STEEL, BONE, BRONZE, DARK_STEEL, DARK_WOOD, EMBER, IRON, LEATHER, PALE_WOOD, RED_LEATHER, SILVER, STEEL, VOID, WOOD, type Tones } from '../WeaponParts';
import { axeSpec, type UniqueWeapon } from '../WeaponSpec';

/**
 * 擴充的傳奇 / 神話（axe）專屬造型與光芒：ID 對應 src/data/uniqueItems/axe.ts。
 * 造型用三種基本款（AxeOptions.style）：怪物素材的橘 = 獸材斧，伐木者、碎顱、迴旋 = 精工元素斧，魔王的紅 = 魔王巨斧；
 * 每一件依特殊能力鑲一個代表物件（emblem，見 Emblems.ts）。
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
// 基本款的骨刺、尖刃、箍的配色
const ACID_TIP: Tones = [0xc8ff7a, 0x9ae04a, 0x5a9a28, 0xb4f060];
const QUAKE_DARK: Tones = [0x5c564e, 0x4a453f, 0x302d29, 0x55504a];
const SPORE_TIP: Tones = [0xd8b0ff, 0xb08ae0, 0x7a5aa8, 0xc8a0f0];
const SOV_BONE: Tones = [0xcdb07a, 0xb2955f, 0x86703f, 0xc0a26c];

export const axeUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.axe_acid_beetle': {
    look: axeSpec({ style: 'beast', head: 'single', haft: 15, size: 4.2, haftColors: DARK_WOOD, headColors: ACID_SHELL, trim: DARK_STEEL, spikes: ACID_TIP }),
    glow: { color: 0x9fe060, core: 0xe8ffc0, particle: 'void' },
    emblem: { kind: 'drip', color: 0xc8ff70, accent: 0x6a8a3a },
  },
  'legendary.axe_horned_charge': {
    look: axeSpec({ style: 'beast', head: 'single', haft: 16, size: 4.6, haftColors: WOOD, headColors: HORN_PLATE, trim: DARK_STEEL, spikes: BONE }),
    glow: { color: 0xe0c890, core: 0xfff4e0, particle: 'rock' },
    emblem: { kind: 'horn', color: 0xffd080, accent: 0xe8dcc0 },
  },
  'legendary.axe_magma_jaw': {
    look: axeSpec({ style: 'beast', head: 'single', haft: 16, size: 4.8, haftColors: BLACK_STEEL, headColors: MAGMA_ROCK, trim: BLACK_STEEL, spikes: EMBER }),
    glow: { color: 0xff7a1a, core: 0xffd080, particle: 'ember' },
    emblem: { kind: 'jaw', color: 0xff7a1a, accent: 0x8a6a56 },
  },
  'legendary.axe_blood_lizard': {
    look: axeSpec({ style: 'beast', head: 'single', haft: 14, size: 4.2, haftColors: RED_LEATHER, headColors: BLOOD_SCALE, trim: DARK_STEEL, spikes: BONE }),
    glow: { color: 0xe0303c, core: 0xffb0b0, particle: 'blood' },
    emblem: { kind: 'claw', color: 0xff5a4a, accent: 0xe8dcc0 },
  },
  'legendary.axe_quake_beast': {
    look: axeSpec({ style: 'beast', head: 'single', haft: 17, size: 4.8, haftColors: DARK_WOOD, headColors: QUAKE_STONE, trim: BRONZE, spikes: QUAKE_DARK }),
    glow: { color: 0xc8b890, core: 0xf8f0e0, particle: 'rock' },
    emblem: { kind: 'quake', color: 0xe0a050, accent: 0xa8a294 },
  },
  'legendary.axe_woodsman': {
    look: axeSpec({ style: 'elemental', head: 'single', haft: 18, size: 4.4, haftColors: PALE_WOOD, headColors: STEEL, trim: BRONZE, glow: 0xfff0c0 }),
    glow: { color: 0xd8f0c8, core: 0xffffff, particle: 'wind' },
    emblem: { kind: 'hammer', color: 0xffe0a0, accent: 0xc28a48 },
  },
  'legendary.axe_skull_crusher': {
    look: axeSpec({ style: 'elemental', head: 'single', haft: 17, size: 5, haftColors: LEATHER, headColors: DARK_STEEL, trim: BRONZE, glow: 0xffc890 }),
    glow: { color: 0xe8dcc0, core: 0xffffff, particle: 'star' },
    emblem: { kind: 'skull', color: 0xff8a4a, accent: 0xe8dcc0 },
  },
  'legendary.axe_void_spore': {
    look: axeSpec({ style: 'beast', head: 'single', haft: 16, size: 4.4, haftColors: VOID, headColors: VOID_SPORE, trim: DARK_STEEL, spikes: SPORE_TIP }),
    glow: { color: 0xb070ff, core: 0xf0e0ff, particle: 'void' },
    emblem: { kind: 'spore', color: 0xd89aff, accent: 0x8a6aa8 },
  },
  'legendary.axe_returning': {
    look: axeSpec({ style: 'elemental', head: 'single', haft: 14, size: 3.9, haftColors: LEATHER, headColors: IRON, trim: SILVER, glow: 0xb8f0d8 }),
    glow: { color: 0xb8f0d8, core: 0xffffff, particle: 'wind' },
    emblem: { kind: 'swirl', color: 0xb8f0d8, accent: 0xe6e8ec },
  },

  // ── 紅（魔王） ──
  'mythic.axe_crypt_guardian': {
    look: axeSpec({ style: 'demon', head: 'single', haft: 19, size: 5.4, haftColors: RUST, headColors: GUARDIAN_IRON, trim: IRON, spikes: DARK_STEEL, glow: 0xff8a3a }),
    glow: { color: 0xff8a3a, core: 0xffd8b0, particle: 'shadow', orbit: 'runes' },
    emblem: { kind: 'hammer', color: 0xff8a3a, accent: 0x8b9197 },
  },
  'mythic.axe_lava_behemoth': {
    look: axeSpec({ style: 'demon', head: 'single', haft: 19, size: 5.8, haftColors: MAGMA_ROCK, headColors: LAVA_ROCK, trim: BLACK_STEEL, spikes: LAVA_ROCK, glow: 0xff7a1a }),
    glow: { color: 0xff7a1a, core: 0xffb838, particle: 'rock', orbit: 'shards' },
    emblem: { kind: 'flame', color: 0xff9a2a, accent: 0x8a6a56 },
  },
  'mythic.axe_spider_queen': {
    look: axeSpec({ style: 'demon', head: 'single', haft: 18, size: 5.4, haftColors: QUEEN_HAFT, headColors: QUEEN_CHITIN, trim: DARK_STEEL, spikes: QUEEN_CHITIN, glow: 0x7aff4a }),
    glow: { color: 0x7aff4a, core: 0xc0ff90, particle: 'void', orbit: 'shards' },
    emblem: { kind: 'web', color: 0x9aff6a, accent: 0xb8a8c8 },
  },
  'mythic.axe_abyss_sovereign': {
    look: axeSpec({ style: 'demon', head: 'single', haft: 20, size: 6, haftColors: SOVEREIGN_FLESH, headColors: SOVEREIGN_SHELL, trim: SOV_BONE, spikes: SOV_BONE, glow: 0xff5a14 }),
    glow: { color: 0xff5a14, core: 0xffa53a, particle: 'void', orbit: 'stars' },
    emblem: { kind: 'eclipse', color: 0xff5a14, accent: 0xcdb07a },
  },
};
