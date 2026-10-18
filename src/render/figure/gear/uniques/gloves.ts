import type { UniqueArmor } from './types';
import { BLACK_STEEL, BONE, BRONZE, DARK_STEEL, EMBER, GOLD, ICE, JADE, SILVER, STAR, STORM, type Tones } from '../../weapons/WeaponParts';
import { HIDE, HIDE_DARK } from '../ArmorPieces';

/** 擴充的傳奇 / 神話（手套）專屬外觀：ID 對應 src/data/uniqueItems/gloves.ts */

// 怪物配色
const HOOK_GREEN: Tones = [0x9ab860, 0x7a9844, 0x55702c, 0x8aa852];
const ACID_SHELL: Tones = [0x6a7a3a, 0x52602c, 0x38421c, 0x5e6c32];
const ACID: Tones = [0xc8ff5a, 0x9ee03a, 0x6aa822, 0xb4f048];
const SPORE: Tones = [0xa8d8f0, 0x7ab8dc, 0x4c88b0, 0x92c8e6];
const EYE_FLESH: Tones = [0xc8b0d8, 0xa890bc, 0x7c6494, 0xb8a0ca];
const FIRE_SAC: Tones = [0xc8602a, 0xa0461c, 0x6e2c10, 0xb45424];
const BRAIN: Tones = [0xe0a8b8, 0xc8889c, 0x9c6074, 0xd498aa];
// 魔王配色
const CRYPT_IRON: Tones = [0x6c665c, 0x57524a, 0x2e2b27, 0x4c4842];
const LAVA_ROCK: Tones = [0x6a5446, 0x564439, 0x2e2320, 0x4a3a33];
const LAVA: Tones = [0xffb838, 0xff7a1a, 0xc04a10, 0xff9a2a];
const CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const VENOM: Tones = [0xc0ff90, 0x7aff4a, 0x4ab82a, 0x9cf06a];
const DEMON: Tones = [0xa51e16, 0x951610, 0x5a0c0a, 0x8a1410];
const HORN: Tones = [0x3c2c2a, 0x2c2020, 0x1a1212, 0x342624];

export const glovesUniques: Record<string, UniqueArmor> = {
  'legendary.gloves_hook_claw': { tier: 5, themes: ['speed', 'brutal'], extra: { cuff: HOOK_GREEN, hand: HOOK_GREEN, fingers: DARK_STEEL, knuckle: HOOK_GREEN, claws: { len: 2.8, colors: BONE }, spikes: 2, spikeColors: HOOK_GREEN } },
  'legendary.gloves_acid_beetle': { tier: 5, themes: ['poison', 'guard'], extra: { cuff: ACID_SHELL, hand: ACID_SHELL, fingers: ACID_SHELL, knuckle: ACID, plate: ACID_SHELL, claws: null, spikes: 0, gem: 0xc8ff5a } },
  'legendary.gloves_frost_spore': { tier: 4, themes: ['cold', 'arcane'], extra: { cuff: SPORE, hand: ICE, fingers: SPORE, knuckle: ICE, plate: null, flare: 1.2, trim: SILVER } },
  'legendary.gloves_eye_floater': { tier: 4, themes: ['lightning', 'crit'], extra: { cuff: EYE_FLESH, hand: STORM, fingers: STORM, knuckle: EYE_FLESH, plate: STORM, trim: STORM, gem: 0xe8f2ff } },
  'legendary.gloves_fire_sac': { tier: 3, themes: ['fire', 'arcane'], extra: { cuff: FIRE_SAC, hand: HIDE_DARK, fingers: FIRE_SAC, knuckle: EMBER, plate: EMBER, trim: BRONZE, flare: 1 } },
  'legendary.gloves_brain_floater': { tier: 4, themes: ['arcane'], extra: { cuff: BRAIN, hand: BRAIN, fingers: SILVER, knuckle: BRAIN, plate: null, flare: 0.3, trim: GOLD } },
  'legendary.gloves_bone_archer': { tier: 2, themes: ['speed', 'crit'], extra: { cuff: BONE, hand: HIDE, fingers: BONE, knuckle: BONE, trim: HIDE_DARK } },
  'legendary.gloves_skyhook': { tier: 3, themes: ['crit', 'speed'], extra: { cuff: JADE, fingers: SILVER, knuckle: GOLD, claws: { len: 1.2, colors: SILVER }, trim: SILVER } },
  'legendary.gloves_blast': { tier: 3, themes: ['fire', 'speed'], extra: { cuff: HIDE, hand: BRONZE, fingers: HIDE_DARK, knuckle: BLACK_STEEL, plate: BRONZE, trim: EMBER, flare: 0.4 } },
  'mythic.gloves_crypt_guardian': {
    tier: 7,
    themes: ['guard', 'vital'],
    extra: { cuff: CRYPT_IRON, hand: CRYPT_IRON, fingers: BONE, knuckle: BONE, plate: CRYPT_IRON, trim: BONE, flare: 1.4, spikes: 3, spikeColors: BONE, gem: 0xff8a3a },
  },
  'mythic.gloves_lava_behemoth': {
    tier: 8,
    themes: ['fire', 'guard'],
    extra: { cuff: LAVA_ROCK, hand: LAVA_ROCK, fingers: LAVA_ROCK, knuckle: LAVA, plate: LAVA_ROCK, trim: LAVA, flare: 1.8, claws: null, spikes: 3, spikeColors: LAVA_ROCK, gem: 0xffb838 },
  },
  'mythic.gloves_spider_queen': {
    tier: 8,
    themes: ['poison', 'crit'],
    extra: { cuff: CHITIN, hand: CHITIN, fingers: CHITIN, knuckle: VENOM, plate: CHITIN, trim: VENOM, flare: 0.8, claws: { len: 3.8, colors: CHITIN }, spikes: 2, spikeColors: VENOM, gem: 0x7aff4a },
  },
  'mythic.gloves_abyss_lord': {
    tier: 8,
    themes: ['fire', 'blood'],
    extra: { cuff: DEMON, hand: DEMON, fingers: HORN, knuckle: HORN, plate: DEMON, trim: GOLD, flare: 1, claws: { len: 4, colors: HORN }, spikes: 3, spikeColors: STAR, gem: 0xff6a1a },
  },
};
