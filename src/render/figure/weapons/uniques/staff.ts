import { staffSpec, type UniqueWeapon } from '../WeaponSpec';
import { BLACK_STEEL, BRONZE, DARK_STEEL, DARK_WOOD, GOLD, ICE, PALE_WOOD, SILVER, STORM, type Tones } from '../WeaponParts';

/** 擴充的傳奇 / 神話（staff）專屬造型與光芒：ID 對應 src/data/uniqueItems/staff.ts */

// 怪物 / 魔王的色階（亮 / 中 / 暗 / 中）
const OLD_BONE: Tones = [0xd8ccb0, 0xbcae90, 0x8e8068, 0xcabd9e];
const FLESH_PINK: Tones = [0xd8a0b0, 0xb87a8e, 0x8a5266, 0xc88c9e];
const VOID_SPORE: Tones = [0x5a3a7a, 0x42285e, 0x281840, 0x4e306c];
const MAGMA_ROCK: Tones = [0x6a5446, 0x4a3a33, 0x2e2320, 0x564439];
const VINE: Tones = [0x6a9a4a, 0x4e7a36, 0x2e5220, 0x5e8a40];
const PRIEST_WOOD: Tones = [0x3a2219, 0x2a1a14, 0x1a0e0c, 0x352219];
const LAVA_GOLD: Tones = [0xf2c230, 0xdcaa22, 0xa8801a, 0xe6b82a];
const SPIDER_CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const SOVEREIGN_FLESH: Tones = [0x82140f, 0x6e0e0c, 0x3e0707, 0x7a120e];
const SOVEREIGN_SHELL: Tones = [0x2a1e24, 0x1c1418, 0x100a0c, 0x241a1e];

export const staffUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.staff_skeleton_mage': {
    look: staffSpec({ head: 'skull', length: 35, butt: 4, shaft: OLD_BONE, metal: DARK_STEEL, focus: 0x8fdcff }),
    glow: { color: 0x8fdcff, core: 0xffd0a0, particle: 'frost' },
  },
  'legendary.staff_brain_floater': {
    look: staffSpec({ head: 'orb', length: 36, butt: 4, shaft: DARK_WOOD, metal: FLESH_PINK, focus: 0xe8a8c8, bands: true }),
    glow: { color: 0xc8a0ff, core: 0xffffff, particle: 'spark' },
  },
  'legendary.staff_void_spore': {
    look: staffSpec({ head: 'cluster', length: 35, butt: 4, shaft: VOID_SPORE, metal: BLACK_STEEL, focus: 0x9a5aff }),
    glow: { color: 0x9a5aff, core: 0xe0c8ff, particle: 'void' },
  },
  'legendary.staff_magma_jaw': {
    look: staffSpec({ head: 'prongs', length: 36, butt: 4, shaft: MAGMA_ROCK, metal: MAGMA_ROCK, focus: 0xff7a1a, bands: true }),
    glow: { color: 0xff7a1a, core: 0xffd080, particle: 'ember' },
  },
  'legendary.staff_soul_flower': {
    look: staffSpec({ head: 'crescent', length: 35, butt: 3, shaft: VINE, metal: VINE, focus: 0xf0a0e0 }),
    glow: { color: 0xe0a0ff, core: 0xfff0ff, particle: 'holy' },
  },
  'legendary.staff_quake_beast': {
    look: staffSpec({ head: 'rune', length: 36, butt: 5, shaft: DARK_WOOD, metal: BRONZE, focus: 0xffc070, bands: true }),
    glow: { color: 0xe8b070, core: 0xfff0d0, particle: 'rock' },
  },
  'legendary.staff_ice_thorn': {
    look: staffSpec({ head: 'crystal', length: 38, butt: 3, shaft: SILVER, metal: ICE, focus: 0xc8f4ff, bands: true }),
    glow: { color: 0xb0ecff, core: 0xffffff, particle: 'frost' },
  },
  'legendary.staff_swift_thunder': {
    look: staffSpec({ head: 'crescent', length: 37, butt: 4, shaft: DARK_WOOD, metal: STORM, focus: 0xe8f2ff }),
    glow: { color: 0xb8d8ff, core: 0xf4f8ff, particle: 'spark' },
  },
  'legendary.staff_resonance': {
    look: staffSpec({ head: 'ring', length: 36, butt: 4, shaft: PALE_WOOD, metal: SILVER, focus: 0x7a8cff, bands: true }),
    glow: { color: 0x7a8cff, core: 0xe8ecff, particle: 'prism' },
  },
  // ── 紅 ──
  'mythic.staff_fallen_priest': {
    look: staffSpec({ head: 'orb', length: 38, butt: 5, shaft: PRIEST_WOOD, metal: GOLD, focus: 0xff3a3a, bands: true }),
    glow: { color: 0xff3a3a, core: 0xffc0b0, particle: 'blood', orbit: 'runes' },
  },
  'mythic.staff_lava_behemoth': {
    look: staffSpec({ head: 'cluster', length: 38, butt: 5, shaft: MAGMA_ROCK, metal: LAVA_GOLD, focus: 0xff7a1a, bands: true }),
    glow: { color: 0xff7a1a, core: 0xffb838, particle: 'ember', orbit: 'shards' },
  },
  'mythic.staff_spider_queen': {
    look: staffSpec({ head: 'prongs', length: 38, butt: 5, shaft: SPIDER_CHITIN, metal: SPIDER_CHITIN, focus: 0x7aff4a, bands: true }),
    glow: { color: 0x7aff4a, core: 0xe0ffc8, particle: 'void', orbit: 'shards' },
  },
  'mythic.staff_abyss_sovereign': {
    look: staffSpec({ head: 'skull', length: 39, butt: 6, shaft: SOVEREIGN_SHELL, metal: SOVEREIGN_FLESH, focus: 0xff5a14, bands: true }),
    glow: { color: 0xff5a14, core: 0xffa53a, particle: 'ember', orbit: 'runes' },
  },
};
