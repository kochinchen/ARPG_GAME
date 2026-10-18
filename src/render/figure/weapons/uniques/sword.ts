import { ABYSS, BLACK_STEEL, BONE, CRIMSON, DARK_STEEL, GOLD, ICE, IRON, RED_LEATHER, SHADOW, SILVER, STEEL, STORM, VOID, type Tones } from '../WeaponParts';
import { sword, type UniqueWeapon } from '../WeaponSpec';

/**
 * 擴充的傳奇 / 神話（sword）專屬造型與光芒：ID 對應 src/data/uniqueItems/sword.ts。
 * 怪物主題的劍取怪物的顏色（鏽骨、骨刺、冰藍菌絲、單眼浮體的電光），神話取魔王的配色並帶環繞的符文 / 碎片。
 */

// 怪物與魔王的色階（亮 / 中 / 暗 / 中）
const RUST: Tones = [0xa07a5a, 0x7a5a40, 0x523a28, 0x8c6a4c];
const GHOUL: Tones = [0x9aa08a, 0x767c68, 0x4e5446, 0x868c78];
const CHITIN: Tones = [0x8a6a50, 0x6a4e3a, 0x45311f, 0x7a5c44];
const FROST_SPORE: Tones = [0xd0f4ff, 0x8ad4f0, 0x4e9ec8, 0xaee4f8];
const GUARDIAN_IRON: Tones = [0x6c665c, 0x57524a, 0x2e2b27, 0x4c4842];
const PRIEST_RED: Tones = [0xa0303a, 0x86202a, 0x420a12, 0x7a1620];
const KNIGHT_BLACK: Tones = [0x4a4658, 0x34313f, 0x17161e, 0x2c2a36];
const ABYSS_RED: Tones = [0xb02018, 0x951610, 0x5a0c0a, 0xa51e16];
const HORN: Tones = [0x3c2c2a, 0x2c2020, 0x1a1212, 0x342624];

export const swordUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.sword_rusted_bone': {
    look: sword({ shape: 'serrated', length: 19, width: 1.25, colors: RUST, guard: 'bar', guardWidth: 2.8, guardColors: BONE, pommel: 'skull' }),
    glow: { color: 0xd8a070, core: 0xfff0d8, particle: 'rock' },
  },
  'legendary.sword_ghoul_hunger': {
    look: sword({ shape: 'curved', length: 18, width: 1.3, curve: 4, colors: GHOUL, fuller: 0x3a2a24, guard: 'claws', guardWidth: 2.6, guardColors: DARK_STEEL, pommel: 'spike' }),
    glow: { color: 0xb0d080, core: 0xf0ffd8, particle: 'blood' },
  },
  'legendary.sword_shadow_panther': {
    look: sword({ shape: 'leaf', length: 21, width: 1.1, colors: SHADOW, runes: 0x9a7aff, guard: 'crescent', guardWidth: 2.6, guardColors: BLACK_STEEL, pommel: 'gem', gem: 0xffd040 }),
    glow: { color: 0x9a7aff, core: 0xe0d0ff, particle: 'shadow' },
  },
  'legendary.sword_bone_spike': {
    look: sword({ shape: 'serrated', length: 22, width: 1.45, colors: BONE, fuller: 0xa89878, guard: 'thorns', guardWidth: 3.2, guardColors: BONE, pommel: 'spike' }),
    glow: { color: 0xf0e0c0, core: 0xffffff, particle: 'rock' },
  },
  'legendary.sword_hookclaw': {
    look: sword({ shape: 'curved', length: 20, width: 1.35, curve: -3, colors: CHITIN, guard: 'claws', guardWidth: 3, guardColors: CHITIN, pommel: 'ring' }),
    glow: { color: 0xc8905a, core: 0xffe0c0, particle: 'blood' },
  },
  'legendary.sword_frost_spore': {
    look: sword({ shape: 'crystal', length: 21, width: 1.3, colors: FROST_SPORE, runes: 0xe8faff, guard: 'disc', guardWidth: 3, guardColors: ICE, pommel: 'gem', gem: 0x8ad4f0 }),
    glow: { color: 0x8ad4f0, core: 0xf0fcff, particle: 'frost' },
  },
  'legendary.sword_lightning_eye': {
    look: sword({ shape: 'straight', length: 21, width: 1.3, colors: STORM, runes: 0xe8f2ff, guard: 'disc', guardWidth: 3.4, guardColors: SILVER, pommel: 'gem', gem: 0xfff0a0 }),
    glow: { color: 0xbfd8ff, core: 0xffffff, particle: 'spark' },
  },
  'legendary.sword_verdict': {
    look: sword({ shape: 'broad', length: 23, width: 1.75, colors: STEEL, fuller: 0x5a1a20, guard: 'bar', guardWidth: 3.6, guardColors: BLACK_STEEL, pommel: 'ball', grip: RED_LEATHER }),
    glow: { color: 0xe8e0d0, core: 0xffffff, particle: 'holy' },
  },
  'legendary.sword_spellweave': {
    look: sword({ shape: 'leaf', length: 22, width: 1.2, colors: SILVER, runes: 0x7a8cff, guard: 'upturned', guardWidth: 3, guardColors: GOLD, pommel: 'gem', gem: 0x7a8cff }),
    glow: { color: 0x7a8cff, core: 0xe0e8ff, particle: 'prism' },
  },

  // ── 紅（魔王） ──
  'mythic.sword_crypt_warden': {
    look: sword({ shape: 'broad', length: 26, width: 2.1, colors: GUARDIAN_IRON, fuller: 0x7a4a2a, runes: 0xff8a3a, guard: 'bar', guardWidth: 4.2, guardColors: IRON, pommel: 'skull' }),
    glow: { color: 0xff8a3a, core: 0xffd8b0, particle: 'ember', orbit: 'runes' },
  },
  'mythic.sword_fallen_rite': {
    look: sword({ shape: 'flame', length: 24, width: 1.5, colors: PRIEST_RED, runes: 0xff3a3a, guard: 'wings', guardWidth: 3.6, guardColors: GOLD, pommel: 'gem', gem: 0xff3a3a, grip: RED_LEATHER }),
    glow: { color: 0xff3a3a, core: 0xffd0c0, particle: 'holy', orbit: 'runes' },
  },
  'mythic.sword_fallen_knight': {
    look: sword({ shape: 'broad', length: 26, width: 1.8, colors: KNIGHT_BLACK, runes: 0xa066ff, guard: 'wings', guardWidth: 3.8, guardColors: ABYSS, pommel: 'gem', gem: 0xa066ff }),
    glow: { color: 0xa066ff, core: 0xf0e0ff, particle: 'void', orbit: 'shards' },
  },
  'mythic.sword_abyss_lord': {
    look: sword({ shape: 'serrated', length: 27, width: 1.9, colors: ABYSS_RED, runes: 0xff6a1a, guard: 'thorns', guardWidth: 4, guardColors: HORN, pommel: 'skull', grip: VOID }),
    glow: { color: 0xff5a1a, core: 0xffb040, particle: 'ember', orbit: 'stars' },
  },
};
