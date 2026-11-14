import type { DataRegistry } from '../../../data/DataRegistry';
import type { Rarity } from '../../../data/schema/item';
import type { EquipmentSlot, ItemInstance } from '../../../game/items/ItemInstance';
import type { Joint } from '../FigureModel';
import { stretchMeshes, type Mesh } from '../Poly3D';
import { AI_BOOT_FACES, AI_BOOT_FOOT, AI_BOOT_FOOT_R, AI_LIMB, AI_TORSO, aiBootShape, type BootFace } from '../HeroineAI';
import { aiArmorParts } from './ArmorAI';
import { styledArmor, type StyledArmor } from './StyledArmors';
import { styledGlove, type StyledGlove } from './StyledGloves';
import { styledHelmet, type StyledHelmet } from './StyledHelmets';
import { FOREARM_LENGTH, heroineHand, scaleHead } from '../heroine/HeroineBody';
import type { UniqueArmor } from './uniques/types';
import { helmetUniques } from './uniques/helmet';
import { armorUniques } from './uniques/armor';
import { glovesUniques } from './uniques/gloves';
import { bootsUniques } from './uniques/boots';
import { shieldUniques } from './uniques/shield';
import {
  ABYSS,
  ANCIENT,
  BLACK_STEEL,
  BLOOD_STEEL,
  BONE,
  BRONZE,
  EMBER,
  DARK_STEEL,
  GOLD,
  ICE,
  IRON,
  JADE,
  RED_LEATHER,
  SHADOW,
  SILVER,
  STAR,
  STEEL,
  STORM,
  VOID,
  WOOD,
  type Tones,
} from '../weapons/WeaponParts';
import {
  bootExtras,
  chestPiece,
  gauntletPiece,
  gloveHandDetails,
  CLOTH,
  helmetMeshes,
  HIDE,
  HIDE_DARK,
  placeHelmet,
  placeShield,
  shieldMeshes,
  shoulderPiece,
  tassetPiece,
  waistPiece,
  type ArmorSpec,
  type BootSpec,
  type GloveSpec,
  type HelmetSpec,
  type ShieldSpec,
} from './ArmorPieces';
import { hasRunes, itemThemes, RARITY_TINT, themeColors, THEMES, tintTones, type GearTheme } from './GearTheme';

/**
 * 穿在主角身上的頭盔、盔甲、手套、靴子、盾牌：8 階基底造型 + 詞綴主題（染色、符文、翅膀、尖刺、厚重）+ 橘 / 紅專屬點綴。
 * 只在渲染層使用；外觀完全由裝備資料推導，不需要存檔。手套的小零件只在放大時畫（遊戲地圖上太小）。
 */

export type ArmorSlot = 'helmet' | 'armor' | 'gloves' | 'boots' | 'shield';
type Spec = { helmet: HelmetSpec; armor: ArmorSpec; gloves: GloveSpec; boots: BootSpec; shield: ShieldSpec };

// 一般裝備的鋼：比武器的鋼暗（STEEL 在光照下會洗成全白，看不出面的明暗）
const PLAIN_STEEL: Tones = [0xa2a8b0, 0x6c7279, 0x4a4f56, 0x8e949b];
const PLAIN_STEEL_DARK: Tones = [0x6a7078, 0x565b62, 0x3a3e44, 0x60666e];
const PLAIN_SILVER: Tones = [0xaeb4be, 0x7c828c, 0x565b64, 0x9aa0aa];
const PLAIN_BLOOD: Tones = [0x8e2f34, 0x6e2228, 0x44141a, 0x7e2a30];
const PLAIN_ANCIENT: Tones = [0xb4a272, 0x8e7c52, 0x645636, 0xa29060];
const PLAIN_SILVER_TRIM: Tones = [0xd8dce4, 0xaeb4be, 0x82888f, 0xc6cad2];
const PLAIN_IRON: Tones = [0x7c8088, 0x5c6068, 0x3e4148, 0x6e7278];

const HELMETS: HelmetSpec[] = [
  { mat: HIDE, trim: HIDE_DARK, style: 'cap', look: 'plainCap' },
  { mat: PLAIN_IRON, trim: HIDE, style: 'open', look: 'plainNasal' },
  { mat: PLAIN_STEEL, trim: GOLD, style: 'open', look: 'plainOpen' },
  { mat: PLAIN_SILVER, trim: PLAIN_SILVER_TRIM, style: 'open', look: 'plainSilver', gem: 0x4aa8ff },
  { mat: BLACK_STEEL, trim: DARK_STEEL, style: 'closed', look: 'plainClosed' },
  { mat: PLAIN_BLOOD, trim: BONE, style: 'open', look: 'plainHalf' },
  { mat: PLAIN_ANCIENT, trim: GOLD, style: 'open', look: 'plainCrest' },
  { mat: ABYSS, trim: VOID, style: 'closed', look: 'plainClosed' },
];

const ARMORS: ArmorSpec[] = [
  { mat: CLOTH, trim: HIDE_DARK, style: 'cloth', pauldron: 0.2, pauldronMat: HIDE, look: 'plain', tier: 1 },
  { mat: PLAIN_IRON, trim: HIDE_DARK, style: 'chain', pauldron: 0.5, pauldronMat: HIDE, look: 'plain', tier: 2 },
  { mat: PLAIN_STEEL, trim: GOLD, style: 'plate', pauldron: 1, look: 'plain', tier: 3 },
  { mat: PLAIN_SILVER, trim: PLAIN_SILVER_TRIM, style: 'plate', pauldron: 1.1, emblem: 0x4aa8ff, look: 'plain', tier: 4 },
  { mat: BLACK_STEEL, trim: DARK_STEEL, style: 'plate', pauldron: 1.45, look: 'plain', tier: 5 },
  { mat: PLAIN_BLOOD, trim: BONE, style: 'plate', pauldron: 1.1, look: 'plain', tier: 6 },
  { mat: PLAIN_ANCIENT, trim: GOLD, style: 'plate', pauldron: 1.3, look: 'plain', tier: 7 },
  { mat: ABYSS, trim: VOID, style: 'plate', pauldron: 1.5, look: 'plain', tier: 8 },
];

const BOOTS: BootSpec[] = [
  { mat: HIDE, straps: true },
  { mat: HIDE, toe: IRON, shin: IRON, straps: true },
  { mat: PLAIN_STEEL, toe: PLAIN_STEEL, shin: PLAIN_STEEL, knee: PLAIN_STEEL, cuff: GOLD },
  { mat: PLAIN_SILVER, toe: PLAIN_SILVER, shin: PLAIN_SILVER, knee: PLAIN_SILVER, cuff: PLAIN_SILVER_TRIM, gem: 0x4aa8ff, runes: 0x6fc8ff },
  { mat: BLACK_STEEL, toe: DARK_STEEL, shin: BLACK_STEEL, knee: BLACK_STEEL, spikes: 3 },
  { mat: PLAIN_BLOOD, toe: PLAIN_BLOOD, straps: true, spikes: 2, spikeColors: BONE, gem: 0xd02030 },
  { mat: PLAIN_ANCIENT, toe: GOLD, shin: PLAIN_ANCIENT, knee: GOLD, cuff: GOLD, gem: 0xffb040 },
  { mat: ABYSS, toe: VOID, shin: ABYSS, knee: VOID, spikes: 3, spikeColors: VOID, gem: 0xc070ff },
];

const SHIELDS: ShieldSpec[] = [
  { shape: 'round', size: 0.85, mat: WOOD, rim: IRON, boss: IRON },
  { shape: 'round', size: 0.95, mat: IRON, rim: DARK_STEEL, boss: STEEL },
  { shape: 'kite', size: 0.9, mat: STEEL, rim: GOLD, cross: GOLD },
  { shape: 'tower', size: 0.9, mat: SILVER, rim: SILVER, gem: 0x4aa8ff, runes: 0x6fc8ff },
  { shape: 'heater', size: 1, mat: BLACK_STEEL, rim: DARK_STEEL, spikes: 5 },
  { shape: 'round', size: 1, mat: BLOOD_STEEL, rim: BONE, boss: BONE, rays: BONE, gem: 0xd02030 },
  { shape: 'round', size: 1.05, mat: ANCIENT, rim: GOLD, boss: GOLD, rays: GOLD, gem: 0xffb040 },
  { shape: 'kite', size: 1.05, mat: ABYSS, rim: VOID, rays: VOID, gem: 0xc070ff, spikes: 3, spikeColors: VOID },
];

const GLOVES: GloveSpec[] = [
  { cuff: HIDE, hand: HIDE, fingers: HIDE, knuckle: HIDE_DARK, trim: HIDE_DARK, accent: HIDE_DARK, look: 'plainGauntlet', variant: 'soft' },
  { cuff: PLAIN_IRON, hand: HIDE, fingers: HIDE, knuckle: PLAIN_IRON, plate: PLAIN_IRON, trim: HIDE_DARK, accent: HIDE, look: 'plainGauntlet' },
  { cuff: PLAIN_STEEL, hand: PLAIN_STEEL, fingers: PLAIN_STEEL, knuckle: PLAIN_STEEL_DARK, plate: PLAIN_STEEL, flare: 0.8, trim: GOLD, accent: HIDE, look: 'plainGauntlet' },
  { cuff: PLAIN_SILVER, hand: PLAIN_SILVER, fingers: PLAIN_SILVER, knuckle: PLAIN_STEEL_DARK, plate: PLAIN_SILVER, flare: 0.6, trim: PLAIN_SILVER_TRIM, accent: HIDE_DARK, gem: 0x4aa8ff, look: 'plainGauntlet' },
  { cuff: BLACK_STEEL, hand: BLACK_STEEL, fingers: BLACK_STEEL, knuckle: DARK_STEEL, plate: BLACK_STEEL, trim: DARK_STEEL, accent: HIDE_DARK, look: 'plainGauntlet', variant: 'heavy' },
  { cuff: PLAIN_BLOOD, hand: PLAIN_BLOOD, fingers: PLAIN_BLOOD, knuckle: BONE, plate: PLAIN_BLOOD, trim: BONE, accent: HIDE_DARK, look: 'plainGauntlet' },
  { cuff: PLAIN_ANCIENT, hand: PLAIN_ANCIENT, fingers: PLAIN_ANCIENT, knuckle: GOLD, plate: PLAIN_ANCIENT, flare: 1.1, trim: GOLD, accent: HIDE, look: 'plainGauntlet', variant: 'heavy' },
  { cuff: ABYSS, hand: ABYSS, fingers: ABYSS, knuckle: VOID, plate: ABYSS, flare: 0.6, trim: VOID, accent: HIDE_DARK, look: 'plainGauntlet', variant: 'heavy' },
];

// 碎擊者之握、元素之觸的底色
const SMASHER_ROCK: Tones = [0x443c38, 0x362f2c, 0x201c1a, 0x3e3632];
const ELEMENT_DARK: Tones = [0x3a3048, 0x2c2438, 0x1a1524, 0x342a42];
// 獵神之手、泰坦之握的配色
const GOD_HUNTER: Tones = [0x3e3858, 0x2e2a46, 0x1a182c, 0x36314e];
const GOD_BLADE: Tones = [0x6a55b0, 0x54429a, 0x2e2460, 0x5e4ca6];
const GOD_TRIM: Tones = [0x4a4266, 0x3a3454, 0x241f38, 0x423b5c];
const TITAN_BRONZE: Tones = [0x7a6a50, 0x5e5040, 0x3c3226, 0x6e5e48];

const BASES: { [K in ArmorSlot]: Spec[K][] } = { helmet: HELMETS, armor: ARMORS, gloves: GLOVES, boots: BOOTS, shield: SHIELDS };

/** 靴子專屬裝飾的配色 */
const WIND: Tones = [0xeafff2, 0xc4f0d6, 0x8ccfa8, 0xdaf8e6];
const SHADE_FLAME: Tones = [0xb0a4ff, 0x7c6ce0, 0x4a3c9a, 0x948aee];

/** 黑曜晶甲：光滑的黑曜石、亮灰的切面邊 */
const OBSIDIAN: Tones = [0x2e2f39, 0x202129, 0x111217, 0x282931];
const OBSIDIAN_EDGE: Tones = [0x8e909c, 0x6a6c78, 0x464852, 0x7c7e8a];

/** 橘 / 紅防具：基底階級、主題與專屬點綴（染色較淡，保留專屬配色） */
/** extra：覆寫該部位造型參數的欄位（頭盔 / 盔甲 / 靴子各自的欄位；null = 拿掉基底的零件） */
const UNIQUES: Record<string, UniqueArmor> = {
  'legendary.seer_crown': { tier: 4, themes: ['arcane'], extra: { look: 'circlet', mat: [0x4a2e6c, 0x3a245c, 0x221640, 0x442a64], trim: GOLD, glow: 0x7aa0ff } },
  'legendary.berserker_helm': { tier: 5, themes: ['blood', 'vital'], extra: { look: 'skull', mat: [0xc04a3a, 0x9a3428, 0x62201a, 0xb04030], trim: BONE, glow: 0xff5a40, cloth: [0x6e4a3a, 0x5a3a2c, 0x3a2418, 0x664232] } },
  'legendary.hawkeye': { tier: 3, themes: ['crit', 'speed'], extra: { look: 'plumed', mat: HIDE, trim: JADE, glow: 0x6cffb0, cloth: [0x5aa47a, 0x468a62, 0x2c5e40, 0x50986e] } },
  'mythic.crown_of_ages': { tier: 7, themes: ['vital'], extra: { look: 'agesCrown', mat: [0xecc464, 0xd4a444, 0xa47a2a, 0xe0b454], trim: BRONZE, glow: 0xfff0b0, cloth: [0xa83a32, 0x8c2c26, 0x5e1a18, 0x9a322c] } },
  'mythic.storm_crown': { tier: 7, themes: ['lightning', 'arcane'], extra: { look: 'stormCrown', mat: [0x7c8698, 0x626b7e, 0x3c4352, 0x707a8c], trim: [0xe6eaf2, 0xc6ccd8, 0x8e96a6, 0xd8dce6], glow: 0x5aa8ff, cloth: [0x4a4c56, 0x3a3c44, 0x26282e, 0x42444c] } },
  'legendary.obsidian_bulwark': { tier: 5, themes: ['guard', 'fire'], extra: { look: 'obsidian', mat: OBSIDIAN, trim: OBSIDIAN_EDGE, glow: 0x3ac4ff } },
  'legendary.thorn_mail': { tier: 2, themes: ['thorns', 'guard'], extra: { look: 'barbed', mat: [0x8a8e98, 0x6e727c, 0x4a4e58, 0x7c808a], trim: GOLD, cloth: [0xf0e8d8, 0xddd2bc, 0xb8aa90, 0xe8dcc8], glow: 0xffe08a } },
  'legendary.starlight_robe': { tier: 1, themes: ['arcane'], extra: { look: 'robe', mat: [0x4a2e6c, 0x3a245c, 0x221640, 0x442a64], trim: GOLD, glow: 0x7aa0ff } },
  'mythic.abyss_carapace': { tier: 8, themes: ['thorns', 'guard'], extra: { look: 'abyss', mat: [0x3a2a44, 0x2c2036, 0x1a1222, 0x34263e], trim: BONE, glow: 0xb050ff } },
  'mythic.undying': { tier: 7, themes: ['vital'], extra: { look: 'undying', mat: [0xecc464, 0xd4a444, 0xa47a2a, 0xe0b454], trim: BRONZE, cloth: [0xa83a32, 0x8c2c26, 0x5e1a18, 0x9a322c], glow: 0xffb040 } },
  // 風痕：草會晚一秒才倒下 → 小腿兩側往後掠的風鰭
  'legendary.wind_trace': { tier: 3, themes: ['speed'], extra: { mat: JADE, toe: SILVER, shin: null, knee: null, cuff: SILVER, fins: WIND, wings: null } },
  // 衝鋒：只朝一個方向 → 鋼製撞角鞋頭、磨亮的厚鞋底
  'legendary.charger_boots': { tier: 5, themes: ['guard', 'speed'], extra: { toe: STEEL, toeRam: STEEL, stomp: DARK_STEEL, spikes: 0, wings: null } },
  // 冰行者：冰做的腳印 → 靴口與腳踝長出冰晶
  'legendary.ice_walker': { tier: 4, themes: ['cold', 'speed'], extra: { mat: ICE, cuff: SILVER, crystals: ICE, wings: null } },
  // 踏界者：一步近處、下一步遠方 → 腳踝浮著兩道傳送環
  'mythic.realm_walker': { tier: 8, themes: ['speed', 'arcane'], extra: { cuff: STAR, portal: 0xc890ff, wings: null } },
  // 幽影步：攻擊只打中影子 → 腳跟往後竄的影焰
  'mythic.phantom_step': { tier: 6, themes: ['speed', 'crit'], extra: { mat: SHADOW, toe: SHADOW, flames: SHADE_FLAME, spikes: 0, wings: null } },
  'legendary.smasher_grip': { tier: 5, themes: ['guard', 'crit'], extra: { look: 'obsidian', cuff: SMASHER_ROCK, hand: SMASHER_ROCK, fingers: SMASHER_ROCK, plate: SMASHER_ROCK, trim: BRONZE, knuckle: GOLD, flare: 1, claws: null, spikes: 4, glow: 0xff6a10 } },
  'legendary.repeater_gloves': { tier: 3, themes: ['speed', 'crit'], extra: { look: 'barbed', variant: 'repeater', hand: HIDE, cuff: HIDE, fingers: HIDE, trim: BRONZE, accent: BONE, knuckle: BRONZE, plate: null, flare: 0 } },
  'legendary.elemental_touch': { tier: 4, themes: ['fire', 'cold'], extra: { look: 'element', variant: 'tri', cuff: ELEMENT_DARK, hand: ELEMENT_DARK, fingers: ELEMENT_DARK, plate: ELEMENT_DARK, trim: GOLD, knuckle: GOLD, glow: 0xff6a20 } },
  'mythic.god_hunter_hands': { tier: 8, themes: ['crit'], extra: { look: 'godHand', cuff: GOD_HUNTER, hand: GOD_HUNTER, fingers: GOD_HUNTER, plate: GOD_HUNTER, accent: GOD_BLADE, trim: GOD_TRIM, knuckle: GOD_TRIM, claws: { len: 1.2, colors: GOD_TRIM }, flare: 0.5, glow: 0x8a6aff } },
  'mythic.titan_grip': { tier: 7, themes: ['guard', 'speed'], extra: { look: 'titanGrip', cuff: TITAN_BRONZE, hand: TITAN_BRONZE, fingers: TITAN_BRONZE, plate: GOLD, accent: TITAN_BRONZE, trim: GOLD, knuckle: GOLD, flare: 1.6, claws: null, glow: 0xff8a18 } },
  'legendary.bastion': { tier: 5, themes: ['guard', 'vital'], extra: { style: 'bulwark', runes: 0xffd060, shape: 'tower', mat: STEEL, rim: GOLD, cross: GOLD, spikes: null } },
  'legendary.flame_ward': { tier: 4, themes: ['fire'], extra: { style: 'emblem', runes: 0xff7a1a, shape: 'heater', mat: BRONZE, rim: DARK_STEEL, rays: EMBER } },
  'legendary.frost_aegis': { tier: 4, themes: ['cold'], extra: { style: 'emblem', runes: 0x9fe8ff, shape: 'round', mat: ICE, rim: SILVER, rays: ICE } },
  'mythic.world_wall': { tier: 7, themes: ['guard'], extra: { style: 'wall', runes: 0xffc040, shape: 'tower', size: 1.15, mat: STAR, rim: GOLD, cross: GOLD, rays: null, boss: null } },
  'mythic.thunder_bulwark': { tier: 7, themes: ['lightning', 'crit'], extra: { style: 'storm', runes: 0xffe060, shape: 'heater', mat: STORM, rim: SILVER, rays: STORM, boss: null } },
  'mythic.mirror_of_ruin': { tier: 8, themes: ['thorns'], extra: { style: 'mirror', shape: 'round', mat: BLACK_STEEL, rim: VOID, face: SILVER, rays: null, gem: 0xff4060 } },
  // 擴充的橘 / 紅（uniques/ 各部位檔案）
  ...helmetUniques,
  ...armorUniques,
  ...glovesUniques,
  ...bootsUniques,
  ...shieldUniques,
};

/** 有專屬外觀的橘 / 紅防具 ID（測試用） */
export const UNIQUE_ARMOR_IDS = Object.keys(UNIQUES);

/** 穿在身上時染色減弱：保留金屬本色，元素感交給符文、寶石與光芒 */
const BODY_TINT = 0.75;
/** 一般裝備的詞條只染一點點，主要靠小裝飾區分 */
const PLAIN_TINT = 0.25;
const UNIQUE_TINT = 0.35;

/** 依階級、稀有度、主題算出造型參數 */
export function armorSpec<K extends ArmorSlot>(slot: K, tier: number, rarity: Rarity, themes: readonly GearTheme[], extra: Partial<Spec[K]> = {}, tintScale = 1): Spec[K] {
  const list = BASES[slot] as Spec[K][];
  const base = list[Math.min(list.length, Math.max(1, tier)) - 1]!;
  const spec = { ...base, ...extra } as Spec[K] & Record<string, unknown>;
  // extra 裡的 null = 拿掉基底的這個零件
  for (const [key, value] of Object.entries(extra)) if (value === null) delete spec[key];
  // 樸實的一般頭盔、盔甲、手套、靴子（橘 / 紅的 tintScale 另外指定）：詞條不改輪廓，只有小裝飾
  const plainGear = tintScale === 1 && slot !== 'shield';
  const { main, accent } = themeColors(themes);
  if (main) {
    const color = THEMES[main].color;
    const k = RARITY_TINT[rarity] * BODY_TINT * tintScale * (plainGear ? PLAIN_TINT : 1);
    const keys = slot === 'armor' ? ['mat', 'pauldronMat'] : slot === 'boots' ? ['mat', 'shin'] : slot === 'gloves' ? ['cuff', 'hand', 'fingers', 'plate'] : ['mat'];
    for (const key of keys) if (spec[key]) spec[key] = tintTones(spec[key] as Tones, color, k);
    spec.gem = accent ?? color;
    if (slot === 'armor') spec.emblem = color;
    if (slot === 'shield') spec.gem = color;
    if (hasRunes(rarity) && !plainGear) spec.runes = color;
    else if (!plainGear || slot !== 'boots') delete spec.runes;
  }
  const wing = main ? tintTones(SILVER, THEMES[main].color, 0.3) : SILVER;
  for (const th of themes) {
    if (th === 'guard') {
      if (slot === 'helmet') {
        spec.style = 'closed';
        spec.crest ??= spec.trim as Tones;
      }
      if (slot === 'armor') {
        spec.pauldron = Math.max(1, (spec.pauldron as number) + 0.4);
        spec.tassets = true;
      }
      if (slot === 'gloves') {
        spec.knuckle ??= spec.fingers as Tones;
        spec.plate ??= spec.hand as Tones;
        spec.flare = ((spec.flare as number | undefined) ?? 0) + 0.5;
      }
      if (slot === 'shield') {
        spec.size = (spec.size as number) * 1.12;
        spec.boss ??= spec.rim as Tones;
      }
      if (slot === 'boots') {
        spec.shin ??= spec.mat as Tones;
        spec.knee ??= spec.mat as Tones;
        spec.toe ??= spec.mat as Tones;
      }
    }
    if (th === 'speed') {
      // 專屬外觀自己指定了翅膀（或 null = 不要翅膀）時不覆蓋
      if ((slot === 'helmet' || slot === 'boots') && !('wings' in extra)) {
        spec.wings = wing;
        if (plainGear && slot === 'boots') spec.wingScale = 0.4;
      }
      if (slot === 'shield') spec.size = (spec.size as number) * 0.9;
      if (slot === 'gloves') spec.flare = 0;
      if (slot === 'armor') {
        spec.pauldron = Math.max(0, (spec.pauldron as number) - 0.4);
        spec.tassets = false;
      }
    }
    if (th === 'thorns') {
      if (slot === 'armor') spec.spikes = true;
      else spec.spikes = plainGear ? Math.min((spec.spikes as number | undefined) ?? 2, 3) : Math.max((spec.spikes as number | undefined) ?? 0, slot === 'shield' ? 5 : 4);
      spec.spikeColors ??= DARK_STEEL;
    }
  }
  return spec;
}

/** 橘 / 紅防具的造型參數（預覽工具用；遊戲裡經由 specForItem） */
export function uniqueArmorSpec<K extends ArmorSlot>(slot: K, id: string): Spec[K] | undefined {
  const unique = UNIQUES[id];
  return unique && armorSpec(slot, unique.tier, id.startsWith('mythic') ? 'mythic' : 'legendary', unique.themes, unique.extra as Partial<Spec[K]>, UNIQUE_TINT);
}

/** 一件裝備 → 造型參數（橘 / 紅有專屬設定；其他依基底階級與詞綴） */
export function specForItem<K extends ArmorSlot>(slot: K, item: ItemInstance, data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>): Spec[K] {
  const unique = item.legendaryId ? UNIQUES[item.legendaryId] : undefined;
  if (unique) return armorSpec(slot, unique.tier, item.rarity, unique.themes, unique.extra as Partial<Spec[K]>, UNIQUE_TINT);
  const tier = data.items.has(item.baseId) ? (data.items.get(item.baseId).tier ?? 1) : 1;
  return armorSpec(slot, tier, item.rarity, item.rarity === 'normal' ? [] : itemThemes(item, data));
}

/**
 * 主角身上的裝備網格（關節 → 疊上去的網格）；hideSkin：AI 版身體（蒙皮網格）中被裝備蓋住、不畫的部位。
 * 裝備零件原本依舊版女主角的骨架長度設計，這裡沿骨頭方向拉伸到 AI 版的長度。
 */
export type OutfitParts = ReadonlyMap<Joint, Mesh[]> & { readonly hideSkin?: ReadonlySet<string>; readonly skinColors?: ReadonlyMap<number, number> };

/** 沿骨頭（Y 軸）拉伸 */
const along = (meshes: Mesh[], k: number): Mesh[] => stretchMeshes(meshes, [1, k, 1]);
/** 舊版女主角的長度（裝備零件依這些長度設計） */
const OLD = { forearm: FOREARM_LENGTH, chest: 10.4, waist: 6.2 };

/** shieldBuild：預覽頁換成底稿版的盾牌（BlenderShield） */
export function heroineOutfit(specs: { helmet?: HelmetSpec; armor?: ArmorSpec; gloves?: GloveSpec; boots?: BootSpec; shield?: ShieldSpec }, shieldBuild: (s: ShieldSpec) => Mesh[] = shieldMeshes): OutfitParts {
  const parts = new Map<Joint, Mesh[]>();
  const hide = new Set<string>();
  const skinColors = new Map<number, number>();
  const { helmet, armor, gloves, boots, shield } = specs;
  if (gloves?.look) {
    // 橘 / 紅的專屬造型：依手臂的形狀貼上去，藏起被蓋住的手與護腕
    const styled = styledGloveFor(gloves)!;
    for (const [j, meshes] of styled.parts) parts.set(j, meshes);
    for (const region of styled.hide) hide.add(region);
  } else if (gloves) {
    // 護手套在前臂外面；手換成手套（藏起 AI 版的手）；指節甲、爪、尖刺只在放大時畫（角色預覽）
    const k = AI_LIMB.forearm / OLD.forearm;
    parts.set('forearmL', along(gauntletPiece(gloves), k));
    parts.set('forearmR', along(gauntletPiece(gloves), k));
    parts.set('handL', [...heroineHand(false, gloves.hand), ...gloveHandDetails(gloves)]);
    parts.set('handR', [...heroineHand(true, gloves.hand), ...gloveHandDetails(gloves)]);
    hide.add('handL').add('handR');
  }
  // 盾牌拿在左手（只會和劍、斧一起裝備；弓也在左手，但兩者不會同時出現）
  if (shield) parts.set('weaponL', placeShield(shieldBuild(shield)));
  if (helmet?.look) {
    // 橘 / 紅的專屬造型：連同頭與脖子一起換掉（直接依 AI 版女主角的關節座標設計，不用縮放）
    const styled = styledHelmetFor(helmet)!;
    for (const [j, meshes] of styled.parts) parts.set(j, meshes);
    for (const region of styled.hide) hide.add(region);
  } else if (helmet) {
    // 全罩頭盔蓋住臉與頭髮；帽子與開放式露出臉（頭髮收進頭盔，馬尾從後方垂下）
    parts.set('head', scaleHead(placeHelmet(helmetMeshes(helmet))));
    hide.add('hair');
    if (helmet.style === 'closed') hide.add('head').add('face');
  }
  if (armor?.model) {
    // AI 生成的盔甲：已在 Blender 對齊 AI 版女主角，直接掛在胸口與上臂
    for (const [j, meshes] of aiArmorParts(armor.model)) parts.set(j, meshes);
    hide.add('chest').add('torso');
  } else if (armor?.look) {
    // 橘 / 紅的專屬造型：直接依 AI 版女主角的關節座標設計，不用拉伸
    const styled = styledArmorFor(armor)!;
    for (const [j, meshes] of styled.parts) parts.set(j, meshes);
    for (const region of styled.hide) hide.add(region);
  } else if (armor) {
    parts.set('chest', along(chestPiece(armor), AI_TORSO.chest / OLD.chest));
    parts.set('torso', along(waistPiece(armor), AI_TORSO.waist / OLD.waist));
    parts.set('upperArmL', shoulderPiece(armor, 1));
    parts.set('upperArmR', shoulderPiece(armor, -1));
    if (armor.tassets) parts.set('root', tassetPiece(armor));
    hide.add('chest').add('torso');
  }
  if (boots) {
    // 靴子是 AI 版身體的一部分（設計圖的皮靴）：換成裝備的顏色，皮革用 mat、護膝與扣環等金屬用 shin / knee / toe；
    // 尖刺、翅膀、寶石、符文與橘 / 紅的專屬裝飾貼在靴子表面（小腿與腳掌）
    const extras = bootExtras(boots, AI_LIMB.shin, aiBootShape, AI_BOOT_FOOT);
    const footR = bootExtras(boots, AI_LIMB.shin, aiBootShape, AI_BOOT_FOOT_R).foot;
    for (const s of ['L', 'R'] as const) {
      parts.set(`shin${s}`, extras.shin);
      const foot = s === 'L' ? extras.foot : footR;
      if (foot.length) parts.set(`foot${s}`, foot);
    }
    const color = bootColor(boots);
    for (const f of AI_BOOT_FACES) skinColors.set(f.index, color(f));
  }
  return Object.assign(parts, { hideSkin: hide, skinColors });
}

/** 橘 / 紅頭盔的專屬造型（沒有 look 時 = undefined） */
export function styledHelmetFor(helmet: HelmetSpec, forIcon = false): StyledHelmet | undefined {
  if (!helmet.look) return undefined;
  return styledHelmet({
    look: helmet.look,
    mat: helmet.mat,
    trim: helmet.trim,
    glow: helmet.glow ?? helmet.eyes ?? helmet.gem ?? 0xffffff,
    ...(helmet.cloth ? { cloth: helmet.cloth } : {}),
    ...(helmet.wings ? { feather: helmet.wings } : {}),
    ...(helmet.spikes ? { spikes: helmet.spikeColors ?? DARK_STEEL } : {}),
    ...(forIcon ? { solid: true } : {}),
  });
}

/** 橘 / 紅盔甲的專屬造型（沒有 look 時 = undefined） */
export function styledArmorFor(armor: ArmorSpec): StyledArmor | undefined {
  if (!armor.look) return undefined;
  return styledArmor({
    look: armor.look,
    mat: armor.mat,
    trim: armor.trim,
    glow: armor.glow ?? armor.emblem ?? 0xffffff,
    style: armor.style,
    pauldron: armor.pauldron,
    ...(armor.tier ? { tier: armor.tier } : {}),
    ...(armor.cloth ? { cloth: armor.cloth } : {}),
    ...(armor.pauldronMat ? { shoulder: armor.pauldronMat } : {}),
    ...(armor.spikes ? { spikes: armor.spikeColors ?? DARK_STEEL } : {}),
  });
}

/** 橘 / 紅手套的專屬造型（沒有 look 時 = undefined） */
export function styledGloveFor(gloves: GloveSpec): StyledGlove | undefined {
  if (!gloves.look) return undefined;
  return styledGlove({ look: gloves.look, mat: gloves.cuff, trim: gloves.trim ?? gloves.cuff, claw: gloves.claws?.colors ?? gloves.knuckle ?? gloves.cuff, glow: gloves.glow ?? gloves.gem ?? 0xffffff, ...(gloves.accent ? { accent: gloves.accent } : {}), ...(gloves.variant ? { variant: gloves.variant } : {}), ...(gloves.claws ? { clawLen: gloves.claws.len } : {}), ...(gloves.spikes ? { spikes: gloves.spikeColors ?? DARK_STEEL } : {}) });
}

/**
 * 靴子裝備的顏色：皮革用 mat、護膝與扣環等金屬用 shin / knee / toe，膝蓋以上的護膝用靴口色（cuff，例如金邊）；
 * 原本的明暗壓縮一點（貼圖的暗部很深），中位數對到中間色
 */
export function bootColor(boots: BootSpec): (f: BootFace) => number {
  const metal = boots.shin ?? boots.knee ?? boots.toe ?? boots.mat;
  const top = boots.cuff ?? boots.knee ?? metal;
  return (f) => shade((f.metal ? (f.upper ? top : metal) : boots.mat)[1]!, Math.min(1.35, Math.max(0.5, f.shade ** 0.55)));
}

/** 顏色 × 亮度倍數（靴子換色時保留原本的明暗） */
function shade(c: number, k: number): number {
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((c >> s) & 0xff) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const cache = new Map<string, OutfitParts>();

/** 身上的頭盔、盔甲、靴子、盾牌 → 換掉的網格（同一組裝備重複使用；換裝時才重建） */
export function outfitFor(
  equipped: (slot: EquipmentSlot) => ItemInstance | undefined,
  data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>,
  /** 關掉時不畫頭盔（屬性照常生效） */
  showHelmet = true,
): OutfitParts {
  const items = { helmet: showHelmet ? equipped('helmet') : undefined, armor: equipped('armor'), gloves: equipped('gloves'), boots: equipped('boots'), shield: equipped('shield') };
  const key = Object.values(items).map((i) => (i ? `${i.uid}:${i.baseId}:${i.rerolls ?? 0}` : '-')).join('|');
  let parts = cache.get(key);
  if (!parts) {
    parts = heroineOutfit({
      ...(items.helmet ? { helmet: specForItem('helmet', items.helmet, data) } : {}),
      ...(items.armor ? { armor: specForItem('armor', items.armor, data) } : {}),
      ...(items.gloves ? { gloves: specForItem('gloves', items.gloves, data) } : {}),
      ...(items.boots ? { boots: specForItem('boots', items.boots, data) } : {}),
      ...(items.shield ? { shield: specForItem('shield', items.shield, data) } : {}),
    });
    if (cache.size > 32) cache.clear();
    cache.set(key, parts);
  }
  return parts;
}
