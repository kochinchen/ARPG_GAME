import { staffSpec, type UniqueWeapon } from '../WeaponSpec';
import { BLACK_STEEL, BONE, BRONZE, DARK_STEEL, DARK_WOOD, EMBER, GOLD, ICE, PALE_WOOD, SILVER, STORM, type Tones } from '../WeaponParts';

/**
 * 擴充的傳奇 / 神話（staff）專屬造型與光芒：ID 對應 src/data/uniqueItems/staff.ts。
 * 造型用三種基本款（StaffOptions.style）：怪物素材的橘 = 獸材法杖，冰棘、疾雷、共鳴 = 精工元素法杖，魔王的紅 = 魔王法杖；
 * 每一件依特殊能力鑲一個代表物件（emblem，見 Emblems.ts）。
 */

// 怪物 / 魔王的色階（亮 / 中 / 暗 / 中）
const OLD_BONE: Tones = [0xd8ccb0, 0xbcae90, 0x8e8068, 0xcabd9e];
const FLESH_PINK: Tones = [0xd8a0b0, 0xb87a8e, 0x8a5266, 0xc88c9e];
const VOID_SPORE: Tones = [0x5a3a7a, 0x42285e, 0x281840, 0x4e306c];
const MAGMA_ROCK: Tones = [0x6a5446, 0x4a3a33, 0x2e2320, 0x564439];
const VINE: Tones = [0x6a9a4a, 0x4e7a36, 0x2e5220, 0x5e8a40];
const PRIEST_WOOD: Tones = [0x3a2219, 0x2a1a14, 0x1a0e0c, 0x352219];
const LAVA_GOLD: Tones = [0xf2c230, 0xdcaa22, 0xa8801a, 0xe6b82a];
const SPIDER_CHITIN: Tones = [0x5a3a6e, 0x3a2446, 0x2c1a34, 0x4a2e5a];
const SOVEREIGN_FLESH: Tones = [0x82140f, 0x6e0e0c, 0x3e0707, 0x7a120e];
const SOVEREIGN_SHELL: Tones = [0x2a1e24, 0x1c1418, 0x100a0c, 0x241a1e];
// 基本款的骨刺、尖刃配色
const SPORE_TIP: Tones = [0xd8b0ff, 0xb08ae0, 0x7a5aa8, 0xc8a0f0];
const THORN: Tones = [0x5a7a30, 0x44602a, 0x2a3c18, 0x506e2c];
const QUAKE_STONE: Tones = [0x8a8478, 0x6c675d, 0x48443c, 0x7a756a];
const PRIEST_DARK: Tones = [0x5a1018, 0x420a12, 0x24060a, 0x4e0e16];
const SOV_BONE: Tones = [0xcdb07a, 0xb2955f, 0x86703f, 0xc0a26c];

export const staffUniques: Record<string, UniqueWeapon> = {
  // ── 橘 ──
  'legendary.staff_skeleton_mage': {
    look: staffSpec({ style: 'skull', head: 'orb', length: 35, butt: 4, shaft: OLD_BONE, metal: DARK_STEEL, focus: 0x8fdcff, spikes: BONE }),
    glow: { color: 0x8fdcff, core: 0xffd0a0, particle: 'frost' },
    emblem: { kind: 'skull', color: 0x8fdcff, accent: 0xd8ccb0 },
  },
  'legendary.staff_brain_floater': {
    look: staffSpec({ style: 'skull', head: 'orb', length: 36, butt: 4, shaft: DARK_WOOD, metal: FLESH_PINK, focus: 0xe8a8c8, spikes: FLESH_PINK }),
    glow: { color: 0xc8a0ff, core: 0xffffff, particle: 'spark' },
    emblem: { kind: 'brain', color: 0xffb0d0, accent: 0xb87a8e },
  },
  'legendary.staff_void_spore': {
    look: staffSpec({ style: 'nature', head: 'orb', length: 35, butt: 4, shaft: VOID_SPORE, metal: BLACK_STEEL, focus: 0x9a5aff, spikes: SPORE_TIP }),
    glow: { color: 0x9a5aff, core: 0xe0c8ff, particle: 'void' },
    emblem: { kind: 'spore', color: 0xc89aff, accent: 0x8a6aa8 },
  },
  'legendary.staff_magma_jaw': {
    look: staffSpec({ style: 'skull', head: 'orb', length: 36, butt: 4, shaft: MAGMA_ROCK, metal: BLACK_STEEL, focus: 0xff7a1a, spikes: EMBER }),
    glow: { color: 0xff7a1a, core: 0xffd080, particle: 'ember' },
    emblem: { kind: 'jaw', color: 0xff7a1a, accent: 0x8a6a56 },
  },
  'legendary.staff_soul_flower': {
    look: staffSpec({ style: 'nature', head: 'orb', length: 35, butt: 3, shaft: VINE, metal: DARK_WOOD, focus: 0xf0a0e0, spikes: THORN, trim: THORN }),
    glow: { color: 0xe0a0ff, core: 0xfff0ff, particle: 'holy' },
    emblem: { kind: 'flower', color: 0xf0a0e0, accent: 0x6a9a4a },
  },
  'legendary.staff_quake_beast': {
    look: staffSpec({ style: 'nature', head: 'orb', length: 36, butt: 5, shaft: DARK_WOOD, metal: BRONZE, focus: 0xffc070, spikes: QUAKE_STONE }),
    glow: { color: 0xe8b070, core: 0xfff0d0, particle: 'rock' },
    emblem: { kind: 'quake', color: 0xffc070, accent: 0xa8a294 },
  },
  'legendary.staff_ice_thorn': {
    look: staffSpec({ style: 'tuning', head: 'orb', length: 38, butt: 3, shaft: SILVER, metal: ICE, focus: 0xc8f4ff }),
    glow: { color: 0xb0ecff, core: 0xffffff, particle: 'frost' },
    emblem: { kind: 'arrow', color: 0xc8f4ff, accent: 0xe6e8ec },
  },
  'legendary.staff_swift_thunder': {
    look: staffSpec({ style: 'tuning', head: 'orb', length: 37, butt: 4, shaft: DARK_STEEL, metal: STORM, focus: 0xe8f2ff }),
    glow: { color: 0xb8d8ff, core: 0xf4f8ff, particle: 'spark' },
    emblem: { kind: 'chain', color: 0xe8f2ff, accent: 0xc8ccd2 },
  },
  'legendary.staff_resonance': {
    look: staffSpec({ style: 'tuning', head: 'orb', length: 36, butt: 4, shaft: PALE_WOOD, metal: SILVER, focus: 0x7a8cff }),
    glow: { color: 0x7a8cff, core: 0xe8ecff, particle: 'prism' },
    emblem: { kind: 'tuning', color: 0x9aa8ff, accent: 0xe6e8ec },
  },
  // ── 紅 ──
  'mythic.staff_fallen_priest': {
    look: staffSpec({ style: 'priest', head: 'orb', length: 38, butt: 5, shaft: SILVER, metal: GOLD, focus: 0xff3a3a, spikes: PRIEST_DARK }),
    glow: { color: 0xff3a3a, core: 0xffc0b0, particle: 'blood', orbit: 'runes' },
    emblem: { kind: 'drop', color: 0xff3a3a, accent: 0xd4ae54 },
  },
  'mythic.staff_lava_behemoth': {
    look: staffSpec({ style: 'lava', head: 'orb', length: 38, butt: 5, shaft: MAGMA_ROCK, metal: LAVA_GOLD, focus: 0xff7a1a, spikes: MAGMA_ROCK }),
    glow: { color: 0xff7a1a, core: 0xffb838, particle: 'ember', orbit: 'shards' },
    emblem: { kind: 'flame', color: 0xff9a2a, accent: 0x8a6a56 },
  },
  'mythic.staff_spider_queen': {
    look: staffSpec({ style: 'queen', head: 'orb', length: 38, butt: 5, shaft: SPIDER_CHITIN, metal: SPIDER_CHITIN, focus: 0x7aff4a, spikes: SPIDER_CHITIN }),
    glow: { color: 0x7aff4a, core: 0xe0ffc8, particle: 'void', orbit: 'shards' },
    emblem: { kind: 'web', color: 0x9aff6a, accent: 0xb8a8c8 },
  },
  'mythic.staff_abyss_sovereign': {
    look: staffSpec({ style: 'sovereign', head: 'orb', length: 39, butt: 6, shaft: SOVEREIGN_SHELL, metal: SOV_BONE, focus: 0xff5a14, spikes: SOVEREIGN_FLESH }),
    glow: { color: 0xff5a14, core: 0xffa53a, particle: 'ember', orbit: 'runes' },
    emblem: { kind: 'rift', color: 0xff5a14, accent: 0xcdb07a },
  },
};
