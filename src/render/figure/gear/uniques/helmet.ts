import type { UniqueArmor } from './types';
import { BLACK_STEEL, BONE, CRIMSON, DARK_STEEL, EMBER, GOLD, ICE, IRON, SHADOW, SILVER, STORM, VOID, type Tones } from '../../weapons/WeaponParts';

/** 擴充的傳奇 / 神話（helmet）專屬外觀：ID 對應 src/data/uniqueItems/helmet.ts */

// 怪物 / 魔王配色
const MIND: Tones = [0xe8b8c8, 0xd098ac, 0xa06a80, 0xdca8ba];
const SPORE: Tones = [0xa8d8f0, 0x7cb8dc, 0x4c88b0, 0x92c8e6];
const CRYPT_IRON: Tones = [0x6c665c, 0x57524a, 0x2e2b27, 0x4c4842];
const PRIEST_RED: Tones = [0x86202a, 0x7a1620, 0x420a12, 0x80202a];
const KNIGHT_BLACK: Tones = [0x4a4658, 0x34313f, 0x17161e, 0x2c2a36];
const DEMON_RED: Tones = [0xa51e16, 0x951610, 0x5a0c0a, 0x8a1410];
const DEMON_HORN: Tones = [0x3c2c2a, 0x2c2020, 0x1a1212, 0x342624];

export const helmetUniques: Record<string, UniqueArmor> = {
  // ── 橘 ──
  'legendary.helmet_bone_mage': { tier: 3, themes: ['fire', 'cold'], extra: { mat: BONE, trim: DARK_STEEL, style: 'open', nasal: false, cheeks: true, crown: BONE, plume: null, crest: null } },
  'legendary.helmet_cyclops': { tier: 4, themes: ['lightning'], extra: { mat: STORM, trim: SILVER, style: 'closed', crest: null, eyes: 0xd8e8ff, gem: 0xbfd8ff } },
  'legendary.helmet_mind': { tier: 3, themes: ['arcane'], extra: { mat: MIND, trim: GOLD, style: 'cap', height: 1.1, plume: null, crown: GOLD, gem: 0xff80c0 } },
  'legendary.helmet_shadow_panther': { tier: 5, themes: ['speed', 'crit'], extra: { mat: SHADOW, trim: BLACK_STEEL, style: 'open', nasal: true, horns: { kind: 'ram', size: 0.7, colors: SHADOW }, spikes: null } },
  'legendary.helmet_bone_archer': { tier: 1, themes: ['speed'], extra: { mat: BONE, trim: [0x6a5a3a, 0x5a4a2e, 0x463a24, 0x625232], height: 0.8, gem: 0xe0d0a0 } },
  'legendary.helmet_iron_skull': { tier: 5, themes: ['guard'], extra: { mat: IRON, trim: BONE, horns: null, spikes: 2, spikeColors: BONE, eyes: 0x6fc8ff } },
  'legendary.helmet_frost_spore': { tier: 2, themes: ['cold'], extra: { mat: SPORE, trim: ICE, style: 'cap', height: 1.15, nasal: false, spikes: 5, spikeColors: ICE } },
  'legendary.helmet_vanguard': { tier: 3, themes: ['guard', 'crit'], extra: { mat: SILVER, trim: GOLD, crest: GOLD, plume: [0x2a5ad0, 0x1e46a8, 0x163680, 0x2450bc] } },
  'legendary.helmet_ember': { tier: 2, themes: ['fire'], extra: { mat: [0x5a4038, 0x48322c, 0x2e201c, 0x523a32], trim: EMBER, cheeks: true, spikes: 3, spikeColors: EMBER } },

  // ── 紅（魔王）──
  'mythic.helmet_crypt_guardian': { tier: 7, themes: ['guard', 'thorns'], extra: { mat: CRYPT_IRON, trim: [0x8a5a34, 0x7a4a2a, 0x5a3420, 0x704426], crown: null, crest: BONE, eyes: 0xff8a3a, spikes: 4, spikeColors: BONE } },
  'mythic.helmet_fallen_priest': { tier: 7, themes: ['blood', 'fire'], extra: { mat: PRIEST_RED, trim: GOLD, style: 'open', nasal: false, crown: GOLD, gem: 0xff3a3a, height: 1.2 } },
  'mythic.helmet_fallen_knight': { tier: 8, themes: ['guard'], extra: { mat: KNIGHT_BLACK, trim: VOID, crest: VOID, horns: { kind: 'up', size: 0.9, colors: KNIGHT_BLACK }, eyes: 0xa066ff, gem: 0xa066ff, spikes: null } },
  'mythic.helmet_abyss_lord': { tier: 8, themes: ['fire', 'blood'], extra: { mat: DEMON_RED, trim: DEMON_HORN, horns: { kind: 'up', size: 1.4, colors: DEMON_HORN }, eyes: 0xffb040, spikes: 5, spikeColors: [0xcbb487, 0xb89f70, 0x8a7450, 0xc0a878], crown: CRIMSON } },
};
