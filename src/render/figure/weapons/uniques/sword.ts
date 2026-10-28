import { BLACK_STEEL, BONE, DARK_STEEL, GOLD, ICE, IRON, LEATHER, RED_LEATHER, SHADOW, SILVER, STEEL, VOID, type Tones } from '../WeaponParts';
import { sword, type UniqueWeapon } from '../WeaponSpec';

/**
 * 擴充的傳奇 / 神話（sword）專屬造型與光芒：ID 對應 src/data/uniqueItems/sword.ts。
 * 造型（SwordSpec.style，見 StyledSwords）：橘分四種基本款（月弧曲刀、騎士聖劍、骨節獸刃、異變寄生刃），紅的魔王劍每把各一種；
 * 每一件依特殊能力鑲一個代表物件（emblem，見 Emblems.ts）。
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
// 基本款（A 獸材 / C 魔王）的骨刺、尖刃配色
const GHOUL_TOOTH: Tones = [0xd8d4b8, 0xb8b498, 0x86826a, 0xc8c4a8];
const PANTHER_CLAW: Tones = [0xe8e4f0, 0xc8c2d6, 0x8e88a0, 0xdcd6e6];
const FLOATER: Tones = [0xc8b8d8, 0xa898bc, 0x786a8e, 0xb8a8ca];
const SAINT_WHITE: Tones = [0xf4f2ee, 0xdcd8d0, 0xa8a49c, 0xe8e4dc];
const TOMB_STONE: Tones = [0x9a9890, 0x7c7a72, 0x55534d, 0x8a8880];

export const swordUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.sword_rusted_bone': {
    look: sword({ style: 'bone', shape: 'straight', length: 19, width: 1.25, colors: RUST, grip: LEATHER, trim: DARK_STEEL, spikes: BONE, guard: 'bar', guardColors: BONE, pommel: 'ball' }),
    glow: { color: 0xd8a070, core: 0xfff0d8, particle: 'rock' },
    emblem: { kind: 'skull', color: 0xff9a4a, accent: 0xe8dcc0 },
  },
  'legendary.sword_ghoul_hunger': {
    look: sword({ style: 'bone', shape: 'straight', length: 18, width: 1.3, colors: GHOUL, grip: LEATHER, trim: DARK_STEEL, spikes: GHOUL_TOOTH, guard: 'bar', guardColors: DARK_STEEL, pommel: 'ball' }),
    glow: { color: 0xb0d080, core: 0xf0ffd8, particle: 'blood' },
    emblem: { kind: 'fang', color: 0xb0e070, accent: 0xd8d4b8 },
  },
  'legendary.sword_shadow_panther': {
    look: sword({ style: 'crescent', shape: 'straight', length: 21, width: 1.15, curve: 3.8, colors: SHADOW, grip: LEATHER, trim: BLACK_STEEL, spikes: PANTHER_CLAW, glow: 0xb89aff, guard: 'bar', guardColors: BLACK_STEEL, pommel: 'ball' }),
    glow: { color: 0x9a7aff, core: 0xe0d0ff, particle: 'shadow' },
    emblem: { kind: 'claw', color: 0xffd040, accent: 0xe8e4f0 },
  },
  'legendary.sword_bone_spike': {
    look: sword({ style: 'bone', shape: 'straight', length: 22, width: 1.45, colors: BONE, grip: RED_LEATHER, trim: DARK_STEEL, spikes: BONE, guard: 'bar', guardColors: BONE, pommel: 'ball' }),
    glow: { color: 0xf0e0c0, core: 0xffffff, particle: 'rock' },
    emblem: { kind: 'swirl', color: 0xfff0d0, accent: 0xa89878 },
  },
  'legendary.sword_hookclaw': {
    look: sword({ style: 'parasite', shape: 'straight', length: 20, width: 1.35, colors: DARK_STEEL, grip: LEATHER, trim: DARK_STEEL, spikes: CHITIN, glow: 0xffb070, guard: 'bar', guardColors: CHITIN, pommel: 'ball' }),
    glow: { color: 0xc8905a, core: 0xffe0c0, particle: 'blood' },
    emblem: { kind: 'hook', color: 0xffb070, accent: 0xc89a70 },
  },
  'legendary.sword_frost_spore': {
    look: sword({ style: 'parasite', shape: 'straight', length: 21, width: 1.3, colors: STEEL, grip: LEATHER, trim: SILVER, spikes: FROST_SPORE, glow: 0x9fe8ff, guard: 'bar', guardColors: ICE, pommel: 'ball' }),
    glow: { color: 0x8ad4f0, core: 0xf0fcff, particle: 'frost' },
    emblem: { kind: 'spore', color: 0x9fe8ff, accent: 0xe6e8ec },
  },
  'legendary.sword_lightning_eye': {
    look: sword({ style: 'parasite', shape: 'straight', length: 21, width: 1.3, colors: IRON, grip: LEATHER, trim: SILVER, spikes: FLOATER, glow: 0xfff0a0, guard: 'bar', guardColors: SILVER, pommel: 'ball' }),
    glow: { color: 0xbfd8ff, core: 0xffffff, particle: 'spark' },
    emblem: { kind: 'eye', color: 0xfff0a0, accent: 0xe6e8ec },
  },
  'legendary.sword_verdict': {
    look: sword({ style: 'knight', shape: 'straight', length: 23, width: 1.6, colors: STEEL, grip: RED_LEATHER, trim: BLACK_STEEL, glow: 0xff5a4a, guard: 'bar', guardColors: BLACK_STEEL, pommel: 'ball' }),
    glow: { color: 0xe8e0d0, core: 0xffffff, particle: 'holy' },
    emblem: { kind: 'cross', color: 0xff4a4a, accent: 0x4a4e56 },
  },
  'legendary.sword_spellweave': {
    look: sword({ style: 'knight', shape: 'straight', length: 22, width: 1.25, colors: SILVER, trim: GOLD, glow: 0x8a9cff, guard: 'bar', guardColors: GOLD, pommel: 'ball' }),
    glow: { color: 0x7a8cff, core: 0xe0e8ff, particle: 'prism' },
    emblem: { kind: 'rune', color: 0xb8c4ff, accent: 0xd4ae54 },
  },

  // ── 紅（魔王） ──
  'mythic.sword_crypt_warden': {
    look: sword({ style: 'tomb', shape: 'straight', length: 25, width: 1.7, colors: TOMB_STONE, trim: GUARDIAN_IRON, spikes: DARK_STEEL, glow: 0x3affa0, guard: 'bar', guardColors: IRON, pommel: 'ball' }),
    glow: { color: 0x3affa0, core: 0xd0ffe8, particle: 'void', orbit: 'runes' },
    emblem: { kind: 'tomb', color: 0x5affb0, accent: 0x8b9197 },
  },
  'mythic.sword_fallen_rite': {
    look: sword({ style: 'saint', shape: 'straight', length: 24, width: 1.4, colors: SAINT_WHITE, grip: RED_LEATHER, trim: GOLD, spikes: PRIEST_RED, glow: 0xff3a3a, guard: 'bar', guardColors: GOLD, pommel: 'ball' }),
    glow: { color: 0xff3a3a, core: 0xffd0c0, particle: 'holy', orbit: 'runes' },
    emblem: { kind: 'flame', color: 0xff4a3a, accent: 0xd4ae54 },
  },
  'mythic.sword_fallen_knight': {
    look: sword({ style: 'fallen', shape: 'straight', length: 26, width: 1.5, colors: KNIGHT_BLACK, trim: BLACK_STEEL, spikes: BLACK_STEEL, glow: 0xff3a2a, guard: 'bar', guardColors: BLACK_STEEL, pommel: 'ball' }),
    glow: { color: 0xff7a4a, core: 0xfff0d0, particle: 'spark', orbit: 'shards' },
    emblem: { kind: 'tri', color: 0xff4a3a, accent: 0x4a4e56 },
  },
  'mythic.sword_abyss_lord': {
    look: sword({ style: 'abyss', shape: 'straight', length: 27, width: 1.55, colors: HORN, grip: VOID, trim: HORN, spikes: ABYSS_RED, glow: 0xff5a1a, guard: 'bar', guardColors: HORN, pommel: 'ball' }),
    glow: { color: 0xff5a1a, core: 0xffb040, particle: 'ember', orbit: 'stars' },
    emblem: { kind: 'wing', color: 0xff6a1a, accent: 0xa51e16 },
  },
};
