import { bowSpec, type UniqueWeapon } from '../WeaponSpec';
import { BLACK_STEEL, BONE, DARK_STEEL, DARK_WOOD, EMBER, GOLD, ICE, LEATHER, PALE_WOOD, RED_LEATHER, SHADOW, SILVER, STORM, type Tones } from '../WeaponParts';

/**
 * 擴充的傳奇 / 神話（bow）專屬造型與光芒：ID 對應 src/data/uniqueItems/bow.ts。
 * 造型用三種基本款（BowOptions.style）：怪物素材的橘 = 獸材弓，先機 = 精工元素弓，魔王的紅 = 魔王神弓。
 */

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
// 基本款（A 獸材 / C 魔王）的骨刺、尖刃配色
const ACID_TIP: Tones = [0xc8ff7a, 0x9ae04a, 0x5a9a28, 0xb4f060];
const CLAW: Tones = [0xe8e4f0, 0xc8c2d6, 0x8e88a0, 0xdcd6e6];
const FLOATER_SPIKE: Tones = [0xe8dcf4, 0xcabcde, 0x9a8cb0, 0xdcd0ea];
const THORN: Tones = [0x5a7a30, 0x44602a, 0x2a3c18, 0x506e2c];
const PRIEST_DARK: Tones = [0x5a1018, 0x420a12, 0x24060a, 0x4e0e16];

export const bowUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.bow_bone_archer': {
    look: bowSpec({ style: 'spine', length: 16, bend: 3.4, recurve: 1.2, thickness: 0.9, colors: OLD_BONE, grip: LEATHER, trim: DARK_STEEL, spikes: BONE, string: 0x8a7a68 }),
    glow: { color: 0xd8e4ff, core: 0xffffff, particle: 'wind' },
    emblem: { kind: 'skull', color: 0x9ad0ff, accent: 0xd8ccb0 },
  },
  'legendary.bow_spine_hound': {
    look: bowSpec({ style: 'spine', length: 17, bend: 3.6, recurve: 1.6, thickness: 0.95, colors: SPINE, grip: RED_LEATHER, trim: DARK_STEEL, spikes: BONE, string: 0xc8b090 }),
    glow: { color: 0xf0d8a8, core: 0xfff4e0, particle: 'rock' },
    emblem: { kind: 'fang', color: 0xffc070, accent: 0xe8dcc0 },
  },
  'legendary.bow_acid_beetle': {
    look: bowSpec({ style: 'chitin', length: 16, bend: 3.6, recurve: 1.2, thickness: 1, colors: ACID_SHELL, grip: LEATHER, trim: DARK_STEEL, spikes: ACID_TIP, string: 0xc8ff8a }),
    glow: { color: 0x9fe060, core: 0xe8ffc8, particle: 'void' },
    emblem: { kind: 'drip', color: 0xc8ff70, accent: 0x6a8a3a },
  },
  'legendary.bow_shadow_panther': {
    look: bowSpec({ style: 'chitin', length: 17, bend: 3.4, recurve: 2, thickness: 0.85, colors: PANTHER, grip: LEATHER, trim: BLACK_STEEL, spikes: CLAW, string: 0x6a5a8a }),
    glow: { color: 0x8a6aff, core: 0xd8c8ff, particle: 'shadow' },
    emblem: { kind: 'claw', color: 0x9a7aff, accent: 0xe8e4f0 },
  },
  'legendary.bow_eye_floater': {
    look: bowSpec({ style: 'vine', length: 17, bend: 3.2, recurve: 1, thickness: 0.9, colors: FLOATER, grip: LEATHER, trim: SILVER, spikes: FLOATER_SPIKE, string: 0xbfd8ff }),
    glow: { color: 0xa8c8ff, core: 0xffffff, particle: 'spark' },
    emblem: { kind: 'eye', color: 0xfff0a0, accent: 0xc8b8d8 },
  },
  'legendary.bow_frost_spore': {
    look: bowSpec({ style: 'vine', length: 17, bend: 3.6, recurve: 1.4, thickness: 0.95, colors: SPORE, grip: LEATHER, trim: SILVER, spikes: ICE, string: 0xe4f6ff }),
    glow: { color: 0x9fe0ff, core: 0xf0fcff, particle: 'frost' },
    emblem: { kind: 'snowflake', color: 0xb8ecff, accent: 0xe6e8ec },
  },
  'legendary.bow_fire_sac': {
    look: bowSpec({ style: 'spine', length: 16, bend: 3.8, recurve: 1.6, thickness: 1, colors: FIRE_SAC, grip: RED_LEATHER, trim: DARK_STEEL, spikes: EMBER, string: 0xffb070 }),
    glow: { color: 0xff8a3a, core: 0xffe0a0, particle: 'ember' },
    emblem: { kind: 'sun', color: 0xff8a3a, accent: 0xc86a3a },
  },
  'legendary.bow_first_strike': {
    look: bowSpec({ style: 'recurve', length: 18, bend: 3, recurve: 2.2, thickness: 0.8, colors: PALE_WOOD, grip: LEATHER, trim: SILVER, glow: 0xffe08a }),
    glow: { color: 0xffe08a, core: 0xffffff, particle: 'star' },
    emblem: { kind: 'arrow', color: 0xffe08a, accent: 0xe6e8ec },
  },
  'legendary.bow_binding': {
    look: bowSpec({ style: 'vine', length: 16, bend: 3.4, recurve: 1.2, thickness: 0.9, colors: VINE, grip: DARK_WOOD, trim: DARK_WOOD, spikes: THORN, string: 0x8ac060 }),
    glow: { color: 0x8ae070, core: 0xe0ffd0, particle: 'holy' },
    emblem: { kind: 'chain', color: 0x9ae070, accent: 0x6a4a2e },
  },
  // ── 紅 ──
  'mythic.bow_fallen_priest': {
    look: bowSpec({ style: 'blood', length: 20, bend: 3.8, recurve: 2, thickness: 0.95, colors: PRIEST_RED, grip: RED_LEATHER, trim: GOLD, spikes: PRIEST_DARK, glow: 0xff3a3a }),
    glow: { color: 0xff3a3a, core: 0xffc0b0, particle: 'blood', orbit: 'runes' },
    emblem: { kind: 'drop', color: 0xff3a3a, accent: 0xd4ae54 },
  },
  'mythic.bow_fallen_knight': {
    look: bowSpec({ style: 'fallen', length: 20, bend: 3.8, recurve: 2.2, thickness: 1, colors: KNIGHT_BLACK, grip: LEATHER, trim: STORM, spikes: BLACK_STEEL, glow: 0xa066ff }),
    glow: { color: 0xa066ff, core: 0xffffff, particle: 'void', orbit: 'shards' },
    emblem: { kind: 'tri', color: 0xd8c0ff, accent: 0x43315e },
  },
  'mythic.bow_spider_queen': {
    look: bowSpec({ style: 'queen', length: 20, bend: 4, recurve: 2.4, thickness: 0.95, colors: SPIDER_CHITIN, grip: DARK_STEEL, trim: DARK_STEEL, spikes: SPIDER_CHITIN, glow: 0x7aff4a }),
    glow: { color: 0x7aff4a, core: 0xe0ffc8, particle: 'void', orbit: 'shards' },
    emblem: { kind: 'web', color: 0x9aff6a, accent: 0xb8a8c8 },
  },
  'mythic.bow_abyss_lord': {
    look: bowSpec({ style: 'wing', length: 21, bend: 4, recurve: 2.4, thickness: 1.05, colors: ABYSS_HORN, grip: SHADOW, trim: ABYSS_WING, spikes: ABYSS_WING, glow: 0xff6a1a }),
    glow: { color: 0xff6a1a, core: 0xffd080, particle: 'ember', orbit: 'runes' },
    emblem: { kind: 'wing', color: 0xff6a1a, accent: 0xa51e16 },
  },
};
