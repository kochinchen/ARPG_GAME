import type { UniqueArmor } from './types';
import { BONE, BRONZE, GOLD, JADE, SILVER, STORM, type Tones } from '../../weapons/WeaponParts';
import { HIDE, HIDE_DARK } from '../ArmorPieces';

/** 擴充的傳奇 / 神話（armor）專屬外觀：ID 對應 src/data/uniqueItems/armor.ts */

// 怪物 / 魔王配色
const ACID_SHELL: Tones = [0x4e4a2c, 0x403c24, 0x2a2818, 0x48442a];
const SCALE_RED: Tones = [0xc04a3a, 0x9a3428, 0x62201a, 0xb04030];
const HORN_SHELL: Tones = [0x8a7a62, 0x6e604c, 0x4a3e30, 0x7c6e58];
const MAGMA_ROCK: Tones = [0x564439, 0x4a3a33, 0x2e2320, 0x6a5446];
const QUAKE_STONE: Tones = [0x8a8478, 0x6e6a60, 0x4a463e, 0x7c776c];
const VOID_ROBE: Tones = [0x5a3a6e, 0x45305a, 0x2a1d3c, 0x503568];
const THUNDER_ROBE: Tones = [0x2c3a6e, 0x223060, 0x16204c, 0x28366a];
const LAVA_ROCK: Tones = [0x4a3a33, 0x3c2e28, 0x2e2320, 0x564439];
const LAVA: Tones = [0xffb838, 0xff7a1a, 0xc04a10, 0xff9a2a];
const KNIGHT_BLACK: Tones = [0x34323c, 0x26242c, 0x121116, 0x2c2a32];
const CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const SOVEREIGN_SHELL: Tones = [0x2a1e24, 0x1c1418, 0x100a0c, 0x241a1e];
const SOVEREIGN_FLESH: Tones = [0x82140f, 0x6e0e0c, 0x3e0707, 0x7a120e];

export const armorUniques: Record<string, UniqueArmor> = {
  // ── 橘 ──
  'legendary.armor_acid_beetle': { tier: 5, themes: ['poison', 'guard'], extra: { look: 'carapace', mat: ACID_SHELL, trim: [0xb0a04c, 0x8e8038, 0x645a26, 0xa09244], glow: 0x8aff3a } },
  'legendary.armor_bone_spike': { tier: 2, themes: ['thorns'], extra: { look: 'barbed', mat: HIDE_DARK, trim: BONE, glow: 0xe8dcc0 } },
  'legendary.armor_blood_scale': { tier: 3, themes: ['blood', 'speed'], extra: { look: 'carapace', mat: SCALE_RED, trim: BONE, glow: 0xff5a40 } },
  'legendary.armor_horned_beast': { tier: 6, themes: ['guard'], extra: { look: 'carapace', mat: HORN_SHELL, trim: BONE, glow: 0xffd890 } },
  'legendary.armor_magma_jaw': { tier: 5, themes: ['fire'], extra: { look: 'obsidian', mat: MAGMA_ROCK, trim: [0x9a8a80, 0x7a6c62, 0x54483f, 0x8a7c72], glow: 0xff8a2a } },
  'legendary.armor_quake': { tier: 7, themes: ['guard', 'brutal'], extra: { look: 'obsidian', mat: QUAKE_STONE, trim: BRONZE, glow: 0xffc860 } },
  'legendary.armor_void_spore': { tier: 1, themes: ['arcane', 'cold'], extra: { look: 'robe', mat: VOID_ROBE, trim: SILVER, glow: 0xc070ff } },
  'legendary.armor_gale': { tier: 2, themes: ['speed'], extra: { look: 'barbed', mat: HIDE, trim: JADE, cloth: [0x5aa47a, 0x468a62, 0x2c5e40, 0x50986e], glow: 0xb8f0d8 } },
  'legendary.armor_thunder_robe': { tier: 1, themes: ['lightning'], extra: { look: 'robe', mat: THUNDER_ROBE, trim: STORM, glow: 0xbfe0ff } },

  // ── 紅（魔王）──
  'mythic.armor_lava_behemoth': { tier: 8, themes: ['fire', 'guard'], extra: { mat: LAVA_ROCK, trim: LAVA, pauldronMat: LAVA_ROCK, spikeColors: LAVA, ribs: LAVA, carapace: true, model: 'lava_behemoth' } },
  'mythic.armor_fallen_knight': { tier: 7, themes: ['guard', 'thorns'], extra: { look: 'fallen', mat: KNIGHT_BLACK, trim: [0xb08a5a, 0x8e6c42, 0x664a2c, 0xa07c4e], cloth: [0x9a2a26, 0x7e201e, 0x501212, 0x8c2622], glow: 0xff4a2a } },
  'mythic.armor_spider_queen': { tier: 8, themes: ['poison'], extra: { look: 'spider', mat: CHITIN, trim: BONE, glow: 0x7aff4a } },
  'mythic.armor_abyss_sovereign': { tier: 8, themes: ['blood', 'fire'], extra: { look: 'sovereign', mat: SOVEREIGN_SHELL, trim: GOLD, cloth: SOVEREIGN_FLESH, glow: 0xff5020 } },
};
