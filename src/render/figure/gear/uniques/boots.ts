import type { UniqueArmor } from './types';
import { BONE, BRONZE, DARK_STEEL, GOLD, SHADOW, SILVER, STEEL, STORM, VOID, type Tones } from '../../weapons/WeaponParts';
import { HIDE, HIDE_DARK } from '../ArmorPieces';

/** 擴充的傳奇 / 神話（靴子）專屬外觀：ID 對應 src/data/uniqueItems/boots.ts */

// 怪物配色
const PANTHER: Tones = [0x3a3448, 0x2a2436, 0x18141f, 0x322c40];
const WORM: Tones = [0xb89a7a, 0x9c7e60, 0x6e5640, 0xaa8c6c];
const HORN_SHELL: Tones = [0x8a7a60, 0x6e604a, 0x4c4232, 0x7c6e56];
const QUAKE_ROCK: Tones = [0x8a8278, 0x6e675e, 0x4a4540, 0x7c756c];
const BLOOD_SCALE: Tones = [0xc03a3a, 0x9a2a2c, 0x641a1c, 0xae3234];
const TOAD: Tones = [0x7a9a48, 0x5e7c36, 0x3e5422, 0x6c8c40];
const VOID_SPORE: Tones = [0x6a4a8a, 0x503670, 0x30204a, 0x5e4080];
// 魔王配色
const PRIEST_ROBE: Tones = [0x86202a, 0x7a1620, 0x420a12, 0x801b25];
const PRIEST_GOLD: Tones = [0xd4a84a, 0xc49a40, 0x8c6c2a, 0xcca045];
const LAVA_ROCK: Tones = [0x6a5446, 0x564439, 0x2e2320, 0x4a3a33];
const LAVA: Tones = [0xffb838, 0xff7a1a, 0xc04a10, 0xff9a2a];
const CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const VENOM: Tones = [0xc0ff90, 0x7aff4a, 0x4ab82a, 0x9cf06a];
const SOV_FLESH: Tones = [0x82140f, 0x6e0e0c, 0x3e0707, 0x781210];
const SOV_SHELL: Tones = [0x2a1e24, 0x1c1418, 0x100a0c, 0x241a1e];
const SOV_BONE: Tones = [0xcdb07a, 0xb2955f, 0x86703f, 0xc0a26c];

export const bootsUniques: Record<string, UniqueArmor> = {
  'legendary.boots_shadow_panther': { tier: 4, themes: ['speed', 'crit'], extra: { mat: PANTHER, toe: SHADOW, shin: PANTHER, knee: null, cuff: SHADOW, straps: false, gem: 0xffd060 } },
  'legendary.boots_burrower': { tier: 2, themes: ['brutal', 'speed'], extra: { mat: WORM, toe: BONE, shin: WORM, straps: true, spikes: 2, spikeColors: BONE } },
  'legendary.boots_horned_beast': { tier: 5, themes: ['guard', 'vital'], extra: { mat: HORN_SHELL, toe: BONE, shin: HORN_SHELL, knee: BONE, spikes: 2, spikeColors: BONE } },
  'legendary.boots_quake_beast': { tier: 5, themes: ['guard'], extra: { mat: QUAKE_ROCK, toe: DARK_STEEL, shin: QUAKE_ROCK, knee: QUAKE_ROCK, cuff: BRONZE, spikes: 0 } },
  'legendary.boots_blood_lizard': { tier: 3, themes: ['speed', 'crit'], extra: { mat: BLOOD_SCALE, toe: BLOOD_SCALE, shin: BLOOD_SCALE, knee: null, cuff: HIDE_DARK, spikes: 2, spikeColors: BONE } },
  'legendary.boots_venom_spitter': { tier: 2, themes: ['poison', 'speed'], extra: { mat: TOAD, toe: TOAD, shin: null, straps: true, cuff: HIDE_DARK, gem: 0x8fe060 } },
  'legendary.boots_void_spore': { tier: 4, themes: ['arcane', 'speed'], extra: { mat: VOID_SPORE, toe: VOID, shin: VOID_SPORE, knee: VOID, cuff: SILVER } },
  'legendary.boots_skyleap': { tier: 3, themes: ['speed', 'crit'], extra: { mat: SILVER, toe: GOLD, shin: SILVER, knee: GOLD, cuff: GOLD } },
  'legendary.boots_skirmisher': { tier: 2, themes: ['speed', 'lightning'], extra: { mat: HIDE, toe: STORM, shin: null, straps: true, cuff: STEEL } },
  'mythic.boots_fallen_priest': {
    tier: 7,
    themes: ['blood', 'arcane'],
    extra: { mat: PRIEST_ROBE, toe: PRIEST_GOLD, shin: PRIEST_ROBE, knee: PRIEST_GOLD, cuff: PRIEST_GOLD, straps: false, gem: 0xff3a3a },
  },
  'mythic.boots_lava_behemoth': {
    tier: 8,
    themes: ['fire', 'guard'],
    extra: { mat: LAVA_ROCK, toe: LAVA, shin: LAVA_ROCK, knee: LAVA, cuff: LAVA, spikes: 3, spikeColors: LAVA_ROCK, gem: 0xffb838 },
  },
  'mythic.boots_spider_queen': {
    tier: 7,
    themes: ['poison', 'speed'],
    extra: { mat: CHITIN, toe: CHITIN, shin: CHITIN, knee: VENOM, cuff: VENOM, spikes: 3, spikeColors: CHITIN, gem: 0x7aff4a },
  },
  'mythic.boots_abyss_sovereign': {
    tier: 8,
    themes: ['fire', 'guard'],
    extra: { mat: SOV_SHELL, toe: SOV_BONE, shin: SOV_FLESH, knee: SOV_BONE, cuff: SOV_FLESH, spikes: 3, spikeColors: SOV_BONE, gem: 0xff5a14 },
  },
};

