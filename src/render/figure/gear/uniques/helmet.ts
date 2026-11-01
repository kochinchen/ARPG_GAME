import type { UniqueArmor } from './types';
import { BONE, BRONZE, GOLD, SILVER, STORM, type Tones } from '../../weapons/WeaponParts';

/**
 * 擴充的傳奇 / 神話（helmet）專屬外觀：ID 對應 src/data/uniqueItems/helmet.ts。
 * 配色取自搭配的盔甲（uniques/armor.ts、ArmorLooks.ts），整套穿起來顏色一致。
 */

// 搭配的盔甲配色
const VOID_ROBE: Tones = [0x5a3a6e, 0x45305a, 0x2a1d3c, 0x503568]; // 虛孢法袍
const OBSIDIAN: Tones = [0x2e2f39, 0x202129, 0x111217, 0x282931]; // 黑曜壁壘
const OBSIDIAN_EDGE: Tones = [0x8e909c, 0x6a6c78, 0x464852, 0x7c7e8a];
const SPORE: Tones = [0xa8d8f0, 0x7cb8dc, 0x4c88b0, 0x92c8e6];
const SCALE_RED: Tones = [0xc04a3a, 0x9a3428, 0x62201a, 0xb04030]; // 血鱗胸甲
const ACID_SHELL: Tones = [0x4e4a2c, 0x403c24, 0x2a2818, 0x48442a]; // 酸殼胸甲
const ACID_EDGE: Tones = [0xb0a04c, 0x8e8038, 0x645a26, 0xa09244];
const HORN_SHELL: Tones = [0x8a7a62, 0x6e604c, 0x4a3e30, 0x7c6e58]; // 巨角胸甲
const THUNDER_ROBE: Tones = [0x2c3a6e, 0x223060, 0x16204c, 0x28366a]; // 雷紋法袍
const QUAKE_STONE: Tones = [0x8a8478, 0x6e6a60, 0x4a463e, 0x7c776c]; // 震岩胸甲
const MAGMA_ROCK: Tones = [0x564439, 0x4a3a33, 0x2e2320, 0x6a5446]; // 熔顎胸甲
const MAGMA_EDGE: Tones = [0x9a8a80, 0x7a6c62, 0x54483f, 0x8a7c72];
const RED_CLOTH: Tones = [0xa83a32, 0x8c2c26, 0x5e1a18, 0x9a322c];
const STEEL_GREY: Tones = [0x8a8e98, 0x6e727c, 0x4a4e58, 0x7c808a]; // 荊棘聖甲
const IVORY: Tones = [0xf0e8d8, 0xddd2bc, 0xb8aa90, 0xe8dcc8];
const CRYPT_IRON: Tones = [0x3a302c, 0x2c2420, 0x181210, 0x342a26]; // 熔岩巨甲的黑岩
const LAVA_BRONZE: Tones = [0xb07a4a, 0x8e5e36, 0x5e3c22, 0xa06c40];
const SOVEREIGN_SHELL: Tones = [0x2a1e24, 0x1c1418, 0x100a0c, 0x241a1e]; // 統御者魔鎧
const KNIGHT_BLACK: Tones = [0x34323c, 0x26242c, 0x121116, 0x2c2a32]; // 墮騎黑鎧
const ABYSS_RED: Tones = [0xa51e16, 0x8a1410, 0x5a0c0a, 0x951610]; // 魔王炎弓的紅（F35 全套的參照）

export const helmetUniques: Record<string, UniqueArmor> = {
  // ── 橘 ──
  'legendary.helmet_bone_mage': { tier: 3, themes: ['fire', 'cold'], extra: { look: 'skull', mat: HORN_SHELL, trim: BONE, glow: 0xffd890 } },
  'legendary.helmet_cyclops': { tier: 4, themes: ['lightning'], extra: { look: 'visor', mat: THUNDER_ROBE, trim: STORM, glow: 0xbfe0ff } },
  'legendary.helmet_mind': { tier: 3, themes: ['arcane'], extra: { look: 'circlet', mat: VOID_ROBE, trim: SILVER, glow: 0xc070ff } },
  'legendary.helmet_shadow_panther': { tier: 5, themes: ['speed', 'crit'], extra: { look: 'skull', mat: ACID_SHELL, trim: ACID_EDGE, glow: 0x8aff3a } },
  'legendary.helmet_bone_archer': { tier: 1, themes: ['speed'], extra: { look: 'plumed', mat: BONE, trim: [0x8a7448, 0x6e5c38, 0x4a3e26, 0x7c6840], glow: 0xffe0a0, cloth: RED_CLOTH } },
  'legendary.helmet_iron_skull': { tier: 5, themes: ['guard'], extra: { look: 'visor', mat: QUAKE_STONE, trim: BRONZE, glow: 0xffc860 } },
  'legendary.helmet_frost_spore': { tier: 2, themes: ['cold'], extra: { look: 'circlet', mat: OBSIDIAN, trim: OBSIDIAN_EDGE, glow: 0x3ac4ff, cloth: SPORE } },
  'legendary.helmet_vanguard': { tier: 3, themes: ['guard', 'crit'], extra: { look: 'plumed', mat: STEEL_GREY, trim: GOLD, glow: 0xffe08a, cloth: IVORY } },
  'legendary.helmet_ember': { tier: 2, themes: ['fire'], extra: { look: 'visor', mat: MAGMA_ROCK, trim: MAGMA_EDGE, glow: 0xff8a2a } },

  // ── 紅（魔王）──
  'mythic.helmet_crypt_guardian': { tier: 7, themes: ['guard', 'thorns'], extra: { look: 'crypt', mat: CRYPT_IRON, trim: LAVA_BRONZE, glow: 0xff8a3a, cloth: BONE } },
  'mythic.helmet_fallen_priest': { tier: 7, themes: ['blood', 'fire'], extra: { look: 'priestCrown', mat: SOVEREIGN_SHELL, trim: GOLD, glow: 0xff5020 } },
  'mythic.helmet_fallen_knight': { tier: 8, themes: ['guard'], extra: { look: 'fallenKnight', mat: KNIGHT_BLACK, trim: [0xb08a5a, 0x8e6c42, 0x664a2c, 0xa07c4e], glow: 0xb066ff, cloth: [0x5a2a8a, 0x461e70, 0x2a1044, 0x50267e] } },
  'mythic.helmet_abyss_lord': { tier: 8, themes: ['fire', 'blood'], extra: { look: 'demonCrown', mat: ABYSS_RED, trim: BONE, glow: 0xff6a1a, cloth: BONE } },
};
