import type { UniqueArmor } from './types';
import { BLACK_STEEL, BONE, BRONZE, GOLD, JADE, STORM, VOID, type Tones } from '../../weapons/WeaponParts';
import { HIDE, HIDE_DARK } from '../ArmorPieces';

/** 擴充的傳奇 / 神話（armor）專屬外觀：ID 對應 src/data/uniqueItems/armor.ts */

// 怪物 / 魔王配色
const ACID_SHELL: Tones = [0x7a9a3a, 0x5c7a2a, 0x3a5018, 0x6c8a32];
const SCALE_RED: Tones = [0xc04a3a, 0x9a3428, 0x62201a, 0xb04030];
const HORN_SHELL: Tones = [0x8a7a62, 0x6e604c, 0x4a3e30, 0x7c6e58];
const MAGMA_ROCK: Tones = [0x564439, 0x4a3a33, 0x2e2320, 0x6a5446];
const QUAKE_STONE: Tones = [0x8a8478, 0x6e6a60, 0x4a463e, 0x7c776c];
const VOID_ROBE: Tones = [0x5a3a6e, 0x45305a, 0x2a1d3c, 0x503568];
const THUNDER_ROBE: Tones = [0x2c3a6e, 0x223060, 0x16204c, 0x28366a];
const LAVA_ROCK: Tones = [0x4a3a33, 0x3c2e28, 0x2e2320, 0x564439];
const LAVA: Tones = [0xffb838, 0xff7a1a, 0xc04a10, 0xff9a2a];
const KNIGHT_BLACK: Tones = [0x4a4658, 0x34313f, 0x17161e, 0x2c2a36];
const CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const SOVEREIGN_SHELL: Tones = [0x2a1e24, 0x1c1418, 0x100a0c, 0x241a1e];
const SOVEREIGN_FLESH: Tones = [0x82140f, 0x6e0e0c, 0x3e0707, 0x7a120e];

export const armorUniques: Record<string, UniqueArmor> = {
  // ── 橘 ──
  'legendary.armor_acid_beetle': { tier: 5, themes: ['poison', 'guard'], extra: { mat: ACID_SHELL, carapace: true, spikes: false, pauldronMat: ACID_SHELL } },
  'legendary.armor_bone_spike': { tier: 2, themes: ['thorns'], extra: { mat: HIDE_DARK, trim: BONE, ribs: BONE, spikeColors: BONE, emblem: 0xe8dcc0 } },
  'legendary.armor_blood_scale': { tier: 3, themes: ['blood', 'speed'], extra: { mat: SCALE_RED, trim: BONE, style: 'chain', pauldronMat: SCALE_RED } },
  'legendary.armor_horned_beast': { tier: 6, themes: ['guard'], extra: { mat: HORN_SHELL, trim: BRONZE, carapace: true, pauldronMat: BONE, ribs: null, emblem: 0xd8c8a0 } },
  'legendary.armor_magma_jaw': { tier: 5, themes: ['fire'], extra: { mat: MAGMA_ROCK, trim: [0xffc070, 0xf08a3a, 0xb8541e, 0xf8a456], spikes: false, ribs: [0xff9a3a, 0xf07a2a, 0xb8541e, 0xf08a3a] } },
  'legendary.armor_quake': { tier: 7, themes: ['guard', 'brutal'], extra: { mat: QUAKE_STONE, trim: BRONZE, trimPauldron: BRONZE, emblem: 0xc8a060 } },
  'legendary.armor_void_spore': { tier: 1, themes: ['arcane', 'cold'], extra: { mat: VOID_ROBE, trim: VOID, runes: 0xc070ff, emblem: 0xc070ff } },
  'legendary.armor_gale': { tier: 2, themes: ['speed'], extra: { mat: HIDE, trim: JADE, pauldronMat: JADE, emblem: 0xb8f0d8 } },
  'legendary.armor_thunder_robe': { tier: 1, themes: ['lightning'], extra: { mat: THUNDER_ROBE, trim: STORM, emblem: 0xbfd8ff, runes: 0xbfd8ff } },

  // ── 紅（魔王）──
  'mythic.armor_lava_behemoth': { tier: 8, themes: ['fire', 'guard'], extra: { mat: LAVA_ROCK, trim: LAVA, pauldronMat: LAVA_ROCK, spikeColors: LAVA, ribs: LAVA, carapace: true } },
  'mythic.armor_fallen_knight': { tier: 7, themes: ['guard', 'thorns'], extra: { mat: KNIGHT_BLACK, trim: VOID, trimPauldron: VOID, spikeColors: BLACK_STEEL, emblem: 0xa066ff } },
  'mythic.armor_spider_queen': { tier: 8, themes: ['poison'], extra: { mat: CHITIN, trim: [0x7aff4a, 0x5ae03a, 0x3a9a24, 0x6af040], pauldronMat: CHITIN, spikeColors: CHITIN, ribs: CHITIN, carapace: true } },
  'mythic.armor_abyss_sovereign': { tier: 8, themes: ['blood', 'fire'], extra: { mat: SOVEREIGN_SHELL, trim: GOLD, pauldron: 1.8, pauldronMat: SOVEREIGN_FLESH, spikeColors: [0xcdb07a, 0xb2955f, 0x8a7448, 0xc0a46c], ribs: [0xcdb07a, 0xb2955f, 0x8a7448, 0xc0a46c] } },
};
