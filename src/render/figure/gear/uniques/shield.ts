import { BLACK_STEEL, BLOOD_STEEL, BONE, BRONZE, CRIMSON, DARK_STEEL, EMBER, IRON, SILVER, STEEL, STORM, VOID, ABYSS, type Tones } from '../../weapons/WeaponParts';
import type { UniqueArmor } from './types';

/**
 * 擴充的傳奇 / 神話（shield）專屬外觀：ID 對應 src/data/uniqueItems/shield.ts。
 * 橘取材自怪物（甲殼、骨刺、角甲、岩塊、孢子、眼球、鱗片），紅取材自魔王（墓穴守衛的鏽鐵塔盾、熔岩巨獸的岩殼、墮落騎士的黑鋼）。
 */

// 怪物配色
const ACID_SHELL: Tones = [0x9fd860, 0x6fae3c, 0x3e7a22, 0x88c44e];
const HORN_SHELL: Tones = [0x8a7660, 0x6e5c48, 0x4a3c2e, 0x7c6a54];
const QUAKE_ROCK: Tones = [0x8a7a68, 0x6e604f, 0x4e4338, 0x7c6d5c];
const SPORE: Tones = [0x8a5ab8, 0x6a3e94, 0x42245e, 0x7a4ca8];
const EYE_WHITE: Tones = [0xf4f0e8, 0xdcd6ca, 0xb0a898, 0xe8e2d6];
// 魔王配色
const CRYPT_IRON: Tones = [0x6c665c, 0x57524a, 0x2e2b27, 0x4c4842];
const CRYPT_RUST: Tones = [0x9a6038, 0x7a4a2a, 0x52301a, 0x8a5632];
const LAVA_ROCK: Tones = [0x6a5446, 0x564439, 0x2e2320, 0x4a3a33];
const MOLTEN_GOLD: Tones = [0xf2c230, 0xdcaa22, 0xa8801a, 0xe6b62a];
const KNIGHT_BLACK: Tones = [0x4a4658, 0x34313f, 0x17161e, 0x2c2a36];

export const shieldUniques: Record<string, UniqueArmor> = {
  // ── 橘 ──
  'legendary.shield_acid_carapace': { tier: 4, themes: ['poison', 'guard'], extra: { style: 'carapace', shape: 'kite', mat: ACID_SHELL, rim: DARK_STEEL, boss: ACID_SHELL, cross: null, gem: 0x9fe060, runes: 0x8fe060 } },
  'legendary.shield_bone_spike': { tier: 5, themes: ['thorns', 'vital'], extra: { style: 'bone', runes: 0xffb070, shape: 'round', mat: BONE, rim: IRON, boss: BONE, rays: BONE, spikes: 7, spikeColors: BONE, gem: null } },
  'legendary.shield_horn_ram': { tier: 5, themes: ['guard'], extra: { style: 'bone', runes: 0xffc870, shape: 'heater', size: 1.05, mat: HORN_SHELL, rim: BRONZE, boss: BONE, spikes: 2, spikeColors: BONE, gem: null } },
  'legendary.shield_quake': { tier: 5, themes: ['vital', 'guard'], extra: { style: 'carapace', runes: 0xe0a050, shape: 'tower', size: 1, mat: QUAKE_ROCK, rim: DARK_STEEL, boss: QUAKE_ROCK, spikes: 0, gem: 0xc8a060 } },
  'legendary.shield_void_spore': { tier: 5, themes: ['arcane', 'guard'], extra: { style: 'carapace', shape: 'round', mat: SPORE, rim: ABYSS, boss: VOID, rays: null, spikes: 0, gem: 0xc070ff, runes: 0xa060ff } },
  'legendary.shield_eye_storm': { tier: 4, themes: ['lightning', 'speed'], extra: { style: 'emblem', shape: 'round', mat: STORM, rim: SILVER, boss: EYE_WHITE, gem: 0x9fc4ff, runes: 0x9fc4ff } },
  'legendary.shield_riposte': { tier: 4, themes: ['brutal', 'guard'], extra: { style: 'bulwark', shape: 'heater', mat: STEEL, rim: SILVER, cross: SILVER, gem: 0xe0e8ff } },
  'legendary.shield_bone_bulwark': { tier: 6, themes: ['guard', 'vital'], extra: { style: 'bulwark', shape: 'tower', size: 1.05, mat: IRON, rim: BONE, cross: BONE, boss: null, rays: null, spikes: 3, spikeColors: BONE, gem: 0x6fc8ff } },
  'legendary.shield_blood_scale': { tier: 4, themes: ['blood', 'vital'], extra: { style: 'bone', spikeColors: BONE, shape: 'kite', mat: CRIMSON, rim: BLOOD_STEEL, spikes: 3, gem: 0xe0303c } },
  // ── 紅（魔王） ──
  'mythic.shield_crypt_warden': {
    tier: 7,
    themes: ['guard', 'vital'],
    extra: { style: 'tomb', shape: 'tower', size: 1.15, mat: CRYPT_IRON, rim: CRYPT_RUST, cross: BONE, boss: null, rays: null, spikes: 4, spikeColors: CRYPT_IRON, gem: 0x3affa0, runes: 0x3affa0 },
  },
  'mythic.shield_lava_core': {
    tier: 8,
    themes: ['fire', 'guard'],
    extra: { style: 'magma', shape: 'round', size: 1.15, mat: LAVA_ROCK, rim: MOLTEN_GOLD, boss: EMBER, rays: EMBER, spikes: 0, gem: 0xffb838, runes: 0xff7a1a },
  },
  'mythic.shield_fallen_knight': {
    tier: 8,
    themes: ['brutal', 'guard'],
    extra: { style: 'knight', shape: 'heater', size: 1.1, mat: KNIGHT_BLACK, rim: VOID, cross: BLACK_STEEL, rays: null, spikes: 3, spikeColors: VOID, gem: 0xa066ff, runes: 0xa066ff },
  },
};
