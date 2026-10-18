import { bowSpec, type UniqueWeapon } from '../WeaponSpec';
import { BLACK_STEEL, BONE, DARK_STEEL, DARK_WOOD, EMBER, GOLD, ICE, LEATHER, PALE_WOOD, RED_LEATHER, SHADOW, SILVER, STORM, type Tones } from '../WeaponParts';

/** 擴充的傳奇 / 神話（bow）專屬造型與光芒：ID 對應 src/data/uniqueItems/bow.ts */

// 怪物 / 魔王的色階（亮 / 中 / 暗 / 中）
const OLD_BONE: Tones = [0xd8ccb0, 0xbcae90, 0x8e8068, 0xcabd9e];
const SPINE: Tones = [0xe8dcc0, 0xc8b894, 0x8a7a5c, 0xd8caa8];
const ACID_SHELL: Tones = [0x7a9a3a, 0x5c7a2a, 0x3a521a, 0x6a8a32];
const PANTHER: Tones = [0x3a3448, 0x2a2536, 0x18151f, 0x332d40];
const FLOATER: Tones = [0xc8b8d8, 0xa898bc, 0x786a8e, 0xb8a8ca];
const SPORE: Tones = [0xb8e4f4, 0x8ccbe4, 0x5a9cbc, 0xa2d8ec];
const FIRE_SAC: Tones = [0xc86a3a, 0xa04e28, 0x6a3018, 0xb45c30];
const VINE: Tones = [0x6a9a4a, 0x4e7a36, 0x2e5220, 0x5e8a40];
const PRIEST_RED: Tones = [0xa82a34, 0x7a1620, 0x420a12, 0x86202a];
const KNIGHT_BLACK: Tones = [0x4a4658, 0x34313f, 0x17161e, 0x2c2a36];
const SPIDER_CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const ABYSS_WING: Tones = [0xa51e16, 0x8a1410, 0x5a0c0a, 0x951610];
const ABYSS_HORN: Tones = [0x3c2c2a, 0x2c2020, 0x1a1212, 0x342624];

export const bowUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.bow_bone_archer': {
    look: bowSpec({ length: 16, bend: 3, recurve: 1.4, thickness: 0.8, colors: OLD_BONE, grip: LEATHER, tips: 'hook', tipColors: BONE, string: 0xb8b0a0 }),
    glow: { color: 0xd8e4ff, core: 0xffffff, particle: 'wind' },
  },
  'legendary.bow_spine_hound': {
    look: bowSpec({ length: 17, bend: 3.3, recurve: 1.8, thickness: 0.9, colors: SPINE, grip: RED_LEATHER, tips: 'blade', tipColors: BONE, string: 0xc8b090 }),
    glow: { color: 0xf0d8a8, core: 0xfff4e0, particle: 'rock' },
  },
  'legendary.bow_acid_beetle': {
    look: bowSpec({ length: 16, bend: 3.4, recurve: 1.2, thickness: 0.95, colors: ACID_SHELL, grip: LEATHER, tips: 'orb', tipColors: [0xb8ff5a], string: 0xc8ff8a }),
    glow: { color: 0x9fe060, core: 0xe8ffc8, particle: 'void' },
  },
  'legendary.bow_shadow_panther': {
    look: bowSpec({ length: 17, bend: 3.2, recurve: 2.2, thickness: 0.75, colors: PANTHER, grip: LEATHER, tips: 'hook', tipColors: BLACK_STEEL, string: 0x6a5a8a }),
    glow: { color: 0x8a6aff, core: 0xd8c8ff, particle: 'shadow' },
  },
  'legendary.bow_eye_floater': {
    look: bowSpec({ length: 17, bend: 3, recurve: 1, thickness: 0.85, colors: FLOATER, grip: LEATHER, tips: 'orb', tipColors: [0xfff0a0], string: 0xbfd8ff }),
    glow: { color: 0xa8c8ff, core: 0xffffff, particle: 'spark' },
  },
  'legendary.bow_frost_spore': {
    look: bowSpec({ length: 17, bend: 3.4, recurve: 1.4, thickness: 0.9, colors: SPORE, grip: LEATHER, tips: 'orb', tipColors: ICE, string: 0xe4f6ff }),
    glow: { color: 0x9fe0ff, core: 0xf0fcff, particle: 'frost' },
  },
  'legendary.bow_fire_sac': {
    look: bowSpec({ length: 16, bend: 3.6, recurve: 1.6, thickness: 1, colors: FIRE_SAC, grip: RED_LEATHER, tips: 'orb', tipColors: EMBER, string: 0xffb070 }),
    glow: { color: 0xff8a3a, core: 0xffe0a0, particle: 'ember' },
  },
  'legendary.bow_first_strike': {
    look: bowSpec({ length: 18, bend: 2.8, recurve: 2, thickness: 0.75, colors: PALE_WOOD, grip: LEATHER, tips: 'wing', tipColors: SILVER, string: 0xfff0c0 }),
    glow: { color: 0xffe08a, core: 0xffffff, particle: 'star' },
  },
  'legendary.bow_binding': {
    look: bowSpec({ length: 16, bend: 3.2, recurve: 1.2, thickness: 0.85, colors: VINE, grip: DARK_WOOD, tips: 'hook', tipColors: DARK_WOOD, string: 0x8ac060 }),
    glow: { color: 0x8ae070, core: 0xe0ffd0, particle: 'holy' },
  },
  // ── 紅 ──
  'mythic.bow_fallen_priest': {
    look: bowSpec({ length: 19, bend: 3.6, recurve: 2, thickness: 0.95, colors: PRIEST_RED, grip: RED_LEATHER, tips: 'wing', tipColors: GOLD, string: 0xff3a3a }),
    glow: { color: 0xff3a3a, core: 0xffc0b0, particle: 'blood', orbit: 'runes' },
  },
  'mythic.bow_fallen_knight': {
    look: bowSpec({ length: 19, bend: 3.8, recurve: 2.2, thickness: 1, colors: KNIGHT_BLACK, grip: LEATHER, tips: 'blade', tipColors: STORM, string: 0xa066ff }),
    glow: { color: 0xa066ff, core: 0xffffff, particle: 'void', orbit: 'shards' },
  },
  'mythic.bow_spider_queen': {
    look: bowSpec({ length: 19, bend: 3.8, recurve: 2.4, thickness: 0.95, colors: SPIDER_CHITIN, grip: DARK_STEEL, tips: 'hook', tipColors: [0x7aff4a, 0x5ae03a, 0x3a9a28, 0x6af042], string: 0xc0ff90 }),
    glow: { color: 0x7aff4a, core: 0xe0ffc8, particle: 'void', orbit: 'shards' },
  },
  'mythic.bow_abyss_lord': {
    look: bowSpec({ length: 20, bend: 4, recurve: 2.4, thickness: 1.05, colors: ABYSS_WING, grip: SHADOW, tips: 'wing', tipColors: ABYSS_HORN, string: 0xffb040 }),
    glow: { color: 0xff6a1a, core: 0xffd080, particle: 'ember', orbit: 'runes' },
  },
};
