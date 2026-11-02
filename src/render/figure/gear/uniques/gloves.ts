import type { UniqueArmor } from './types';
import { BLACK_STEEL, BONE, BRONZE, DARK_STEEL, EMBER, GOLD, SILVER, STORM, type Tones } from '../../weapons/WeaponParts';
import { HIDE, HIDE_DARK } from '../ArmorPieces';

/** 擴充的傳奇 / 神話（手套）專屬外觀：ID 對應 src/data/uniqueItems/gloves.ts */

// 怪物配色
// 設計稿是深色的底、亮的只有發光與飾邊，所以手套的底色比怪物本身暗
const HOOK_GREEN: Tones = [0x566e30, 0x445a24, 0x2a3a14, 0x4e642a];
const ACID_SHELL: Tones = [0x6a7a3a, 0x52602c, 0x38421c, 0x5e6c32];
const ACID: Tones = [0xc8ff5a, 0x9ee03a, 0x6aa822, 0xb4f048];
const SPORE: Tones = [0x3e6a8e, 0x305674, 0x1c364c, 0x386280];
const EYE_FLESH: Tones = [0x5c4a74, 0x4a3a60, 0x2c223c, 0x54426a];
const FIRE_SAC: Tones = [0x6e3218, 0x582612, 0x36160a, 0x642c14];
const SKY_JADE: Tones = [0x2c6a58, 0x225648, 0x12342c, 0x286250];
const BRAIN: Tones = [0x8a4c62, 0x703c50, 0x482434, 0x7e4458];
// 魔王配色
const CRYPT_IRON: Tones = [0x5a362a, 0x462a20, 0x261611, 0x3e2820];
// 與熔岩巨甲相同的岩石
const LAVA_ROCK: Tones = [0x4a3a33, 0x3c2e28, 0x2e2320, 0x564439];
const LAVA: Tones = [0xffb838, 0xff7a1a, 0xc04a10, 0xff9a2a];
const CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const VENOM: Tones = [0xc0ff90, 0x7aff4a, 0x4ab82a, 0x9cf06a];
// 與統御者魔鎧（F35）相同的紅
const DEMON: Tones = [0xa51e16, 0x8a1410, 0x5a0c0a, 0x951610];
const CRYPT_DARK: Tones = [0x3a2c26, 0x2c221e, 0x1a1412, 0x342824];
const CHITIN_LIT: Tones = [0x6e4a86, 0x5a3a6e, 0x3a2446, 0x644078];
const CHITIN_DARK: Tones = [0x2c1a34, 0x221428, 0x140c18, 0x28182e];
const HORN: Tones = [0x3c2c2a, 0x2c2020, 0x1a1212, 0x342624];

export const glovesUniques: Record<string, UniqueArmor> = {
  'legendary.gloves_hook_claw': { tier: 5, themes: ['speed', 'brutal'], extra: { look: 'carapace', variant: 'hook', cuff: HOOK_GREEN, hand: HOOK_GREEN, fingers: HOOK_GREEN, trim: DARK_STEEL, knuckle: HOOK_GREEN, claws: { len: 1.5, colors: BONE }, spikes: 2, spikeColors: BONE, glow: 0xc8ff5a } },
  'legendary.gloves_acid_beetle': { tier: 5, themes: ['poison', 'guard'], extra: { look: 'carapace', variant: 'acid', cuff: ACID_SHELL, hand: ACID_SHELL, fingers: ACID_SHELL, knuckle: ACID_SHELL, plate: ACID_SHELL, trim: BRONZE, claws: null, spikes: 0, glow: 0x9ee03a } },
  'legendary.gloves_frost_spore': { tier: 4, themes: ['cold', 'arcane'], extra: { look: 'element', variant: 'frost', cuff: SPORE, hand: SPORE, fingers: SPORE, knuckle: SILVER, plate: null, flare: 1.2, trim: SILVER, glow: 0x7fd8ff } },
  'legendary.gloves_eye_floater': { tier: 4, themes: ['lightning', 'crit'], extra: { look: 'element', variant: 'eye', cuff: EYE_FLESH, hand: EYE_FLESH, fingers: EYE_FLESH, knuckle: STORM, plate: STORM, trim: STORM, glow: 0x4a90ff } },
  'legendary.gloves_fire_sac': { tier: 3, themes: ['fire', 'arcane'], extra: { look: 'element', variant: 'fire', cuff: FIRE_SAC, hand: FIRE_SAC, fingers: FIRE_SAC, knuckle: HIDE_DARK, plate: EMBER, trim: BRONZE, flare: 1, glow: 0xff7a1a } },
  'legendary.gloves_brain_floater': { tier: 4, themes: ['arcane'], extra: { look: 'element', variant: 'mind', cuff: BRAIN, hand: BRAIN, fingers: BRAIN, knuckle: GOLD, plate: null, flare: 0.3, trim: GOLD, glow: 0xff5a90 } },
  'legendary.gloves_bone_archer': { tier: 2, themes: ['speed', 'crit'], extra: { look: 'barbed', variant: 'bone', cuff: HIDE, hand: HIDE, fingers: HIDE, knuckle: BONE, trim: BONE, accent: BONE } },
  'legendary.gloves_skyhook': { tier: 3, themes: ['crit', 'speed'], extra: { look: 'carapace', variant: 'sky', cuff: SKY_JADE, hand: SKY_JADE, fingers: SKY_JADE, knuckle: SILVER, claws: { len: 0.9, colors: SILVER }, trim: SILVER, glow: 0x7affd0 } },
  'legendary.gloves_blast': { tier: 3, themes: ['fire', 'speed'], extra: { look: 'barbed', variant: 'blast', cuff: HIDE, hand: HIDE, fingers: HIDE, knuckle: BLACK_STEEL, plate: BRONZE, trim: BRONZE, flare: 0.4, glow: 0xff7a1a } },
  'mythic.gloves_crypt_guardian': {
    tier: 7,
    themes: ['guard', 'vital'],
    extra: { look: 'cryptFist', cuff: CRYPT_IRON, hand: CRYPT_IRON, fingers: CRYPT_IRON, knuckle: CRYPT_DARK, plate: CRYPT_IRON, trim: BONE, flare: 1.4, claws: null, spikes: 3, spikeColors: BONE, glow: 0xff8a3a },
  },
  'mythic.gloves_lava_behemoth': {
    tier: 8,
    themes: ['fire', 'guard'],
    extra: { look: 'lavaFist', cuff: LAVA_ROCK, hand: LAVA_ROCK, fingers: LAVA_ROCK, knuckle: LAVA_ROCK, plate: LAVA_ROCK, trim: LAVA, flare: 1.8, claws: null, spikes: 3, spikeColors: LAVA_ROCK, glow: 0xff6a10 },
  },
  'mythic.gloves_spider_queen': {
    tier: 8,
    themes: ['poison', 'crit'],
    extra: { look: 'spiderClaw', cuff: CHITIN, hand: CHITIN, fingers: CHITIN, knuckle: CHITIN_DARK, plate: CHITIN, trim: CHITIN_LIT, flare: 0.8, claws: { len: 1.2, colors: CHITIN_DARK }, spikes: 2, spikeColors: VENOM, glow: 0x5cf02a },
  },
  'mythic.gloves_abyss_lord': {
    tier: 8,
    themes: ['blood', 'fire'],
    extra: { look: 'demonClaw', cuff: DEMON, hand: DEMON, fingers: DEMON, knuckle: HORN, plate: DEMON, trim: BONE, flare: 1, claws: { len: 1.4, colors: HORN }, spikes: 3, spikeColors: BONE, glow: 0xff6a1a },
  },
};
