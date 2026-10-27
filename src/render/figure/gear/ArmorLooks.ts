import type { DataRegistry } from '../../../data/DataRegistry';
import type { Rarity } from '../../../data/schema/item';
import type { EquipmentSlot, ItemInstance } from '../../../game/items/ItemInstance';
import type { Joint } from '../FigureModel';
import { stretchMeshes, type Mesh } from '../Poly3D';
import { AI_BOOT_FACES, AI_LIMB, AI_TORSO, aiBootShape, type BootFace } from '../HeroineAI';
import { aiArmorParts } from './ArmorAI';
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
  bootShinExtras,
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

const HELMETS: HelmetSpec[] = [
  { mat: HIDE, trim: HIDE_DARK, style: 'cap', height: 0.85 },
  { mat: IRON, trim: DARK_STEEL, style: 'open', nasal: true },
  { mat: STEEL, trim: GOLD, style: 'closed', plume: RED_LEATHER },
  { mat: SILVER, trim: SILVER, style: 'closed', crest: SILVER, gem: 0x4aa8ff, runes: 0x6fc8ff },
  { mat: BLACK_STEEL, trim: DARK_STEEL, style: 'closed', horns: { kind: 'up', size: 0.8, colors: BLACK_STEEL }, spikes: 3 },
  { mat: BLOOD_STEEL, trim: DARK_STEEL, style: 'open', nasal: true, cheeks: true, horns: { kind: 'ram', size: 1, colors: BONE }, gem: 0xd02030 },
  { mat: ANCIENT, trim: GOLD, style: 'closed', crown: GOLD, gem: 0xffb040 },
  { mat: ABYSS, trim: VOID, style: 'closed', horns: { kind: 'up', size: 1.15, colors: VOID }, eyes: 0xc070ff, spikes: 3, spikeColors: VOID },
];

const ARMORS: ArmorSpec[] = [
  { mat: CLOTH, trim: HIDE, style: 'cloth', pauldron: 0 },
  { mat: IRON, trim: HIDE, style: 'chain', pauldron: 0.75, pauldronMat: HIDE },
  { mat: STEEL, trim: GOLD, style: 'plate', pauldron: 1, trimPauldron: GOLD },
  { mat: SILVER, trim: SILVER, style: 'plate', pauldron: 1.1, emblem: 0x4aa8ff, runes: 0x6fc8ff },
  { mat: BLACK_STEEL, trim: DARK_STEEL, style: 'plate', pauldron: 1.4, spikes: true, tassets: true },
  { mat: RED_LEATHER, trim: BONE, style: 'plate', ribs: BONE, pauldron: 1.1, pauldronMat: BONE, emblem: 0xd02030 },
  { mat: ANCIENT, trim: GOLD, style: 'plate', pauldron: 1.4, trimPauldron: GOLD, emblem: 0xffb040, tassets: true },
  { mat: ABYSS, trim: VOID, style: 'plate', carapace: true, pauldron: 1.5, pauldronMat: VOID, spikes: true, spikeColors: VOID, emblem: 0xc070ff },
];

const BOOTS: BootSpec[] = [
  { mat: HIDE, straps: true },
  { mat: HIDE, toe: IRON, shin: IRON, straps: true },
  { mat: STEEL, toe: STEEL, shin: STEEL, knee: STEEL, cuff: GOLD },
  { mat: SILVER, toe: SILVER, shin: SILVER, knee: SILVER, cuff: SILVER, gem: 0x4aa8ff, runes: 0x6fc8ff },
  { mat: BLACK_STEEL, toe: DARK_STEEL, shin: BLACK_STEEL, knee: BLACK_STEEL, spikes: 3 },
  { mat: RED_LEATHER, toe: BLOOD_STEEL, straps: true, spikes: 2, spikeColors: BONE, gem: 0xd02030 },
  { mat: ANCIENT, toe: GOLD, shin: ANCIENT, knee: GOLD, cuff: GOLD, gem: 0xffb040 },
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
  { cuff: HIDE, hand: HIDE, fingers: HIDE },
  { cuff: IRON, hand: HIDE, fingers: IRON, knuckle: IRON },
  { cuff: STEEL, hand: STEEL, fingers: STEEL, knuckle: STEEL, plate: STEEL, flare: 0.8, trim: GOLD },
  { cuff: SILVER, hand: SILVER, fingers: SILVER, knuckle: SILVER, plate: SILVER, flare: 0.6, trim: SILVER, gem: 0x4aa8ff, runes: 0x6fc8ff },
  { cuff: BLACK_STEEL, hand: BLACK_STEEL, fingers: BLACK_STEEL, knuckle: DARK_STEEL, plate: BLACK_STEEL, claws: { len: 1.4, colors: DARK_STEEL }, spikes: 3 },
  { cuff: RED_LEATHER, hand: BLOOD_STEEL, fingers: BLOOD_STEEL, knuckle: BONE, claws: { len: 2.6, colors: BONE }, gem: 0xd02030 },
  { cuff: ANCIENT, hand: ANCIENT, fingers: ANCIENT, knuckle: GOLD, plate: ANCIENT, flare: 1.1, trim: GOLD, gem: 0xffb040 },
  { cuff: ABYSS, hand: ABYSS, fingers: ABYSS, knuckle: VOID, plate: ABYSS, flare: 0.6, trim: VOID, claws: { len: 3.2, colors: VOID }, gem: 0xc070ff, spikes: 2, spikeColors: VOID },
];

const BASES: { [K in ArmorSlot]: Spec[K][] } = { helmet: HELMETS, armor: ARMORS, gloves: GLOVES, boots: BOOTS, shield: SHIELDS };

/** 橘 / 紅防具：基底階級、主題與專屬點綴（染色較淡，保留專屬配色） */
/** extra：覆寫該部位造型參數的欄位（頭盔 / 盔甲 / 靴子各自的欄位；null = 拿掉基底的零件） */
const UNIQUES: Record<string, UniqueArmor> = {
  'legendary.seer_crown': { tier: 4, themes: ['arcane'], extra: { style: 'cap', height: 0.6, crown: SILVER, gem: 0x7a8cff, crest: null } },
  'legendary.berserker_helm': { tier: 5, themes: ['blood', 'vital'], extra: { horns: { kind: 'up', size: 1, colors: BONE } } },
  'legendary.hawkeye': { tier: 3, themes: ['crit', 'speed'], extra: { style: 'cap', height: 0.9, plume: [0xe8dcc0, 0xcfc0a0], wings: [0xe8dcc0, 0xcfc0a0] } },
  'mythic.crown_of_ages': { tier: 7, themes: ['vital'], extra: { crown: STAR, gem: 0xfff0b0, style: 'open', nasal: false } },
  'mythic.storm_crown': { tier: 7, themes: ['lightning', 'arcane'], extra: { mat: STORM, crown: STORM, gem: 0xe8f2ff, eyes: 0xbfd8ff, style: 'closed' } },
  'legendary.obsidian_bulwark': { tier: 5, themes: ['guard', 'fire'], extra: { mat: SHADOW, emblem: 0xff7a2a } },
  'legendary.thorn_mail': { tier: 2, themes: ['thorns', 'guard'], extra: { mat: SILVER, emblem: 0xffe08a, trim: GOLD } },
  'legendary.starlight_robe': { tier: 1, themes: ['arcane'], extra: { mat: [0x3a3c6e, 0x2e3060, 0x22244c, 0x35386a], trim: GOLD, emblem: 0xfff0b0, runes: 0xfff0b0 } },
  'mythic.abyss_carapace': { tier: 8, themes: ['thorns', 'guard'], extra: { emblem: 0xff4060 } },
  'mythic.undying': { tier: 7, themes: ['vital'], extra: { mat: STAR, emblem: 0x7ee08a } },
  'legendary.wind_trace': { tier: 3, themes: ['speed'], extra: { mat: JADE, toe: SILVER, shin: null, knee: null } },
  'legendary.charger_boots': { tier: 5, themes: ['guard', 'speed'], extra: { toe: STEEL } },
  'legendary.ice_walker': { tier: 4, themes: ['cold', 'speed'], extra: { mat: ICE } },
  'mythic.realm_walker': { tier: 8, themes: ['speed', 'arcane'], extra: {} },
  'mythic.phantom_step': { tier: 6, themes: ['speed', 'crit'], extra: { mat: SHADOW, toe: SHADOW } },
  'legendary.smasher_grip': { tier: 5, themes: ['guard', 'crit'], extra: { knuckle: GOLD, flare: 1, claws: null, spikes: 4 } },
  'legendary.repeater_gloves': { tier: 3, themes: ['speed', 'crit'], extra: { hand: HIDE, cuff: HIDE, knuckle: BRONZE, plate: null, flare: 0 } },
  'legendary.elemental_touch': { tier: 4, themes: ['fire', 'cold'], extra: {} },
  'mythic.god_hunter_hands': { tier: 8, themes: ['crit'], extra: { claws: { len: 3.6, colors: STAR } } },
  'mythic.titan_grip': { tier: 7, themes: ['guard', 'speed'], extra: { flare: 1.6, knuckle: GOLD } },
  'legendary.bastion': { tier: 5, themes: ['guard', 'vital'], extra: { shape: 'tower', mat: STEEL, rim: GOLD, cross: GOLD, spikes: null } },
  'legendary.flame_ward': { tier: 4, themes: ['fire'], extra: { shape: 'heater', mat: BRONZE, rim: DARK_STEEL, rays: EMBER } },
  'legendary.frost_aegis': { tier: 4, themes: ['cold'], extra: { shape: 'round', mat: ICE, rim: SILVER, rays: ICE } },
  'mythic.world_wall': { tier: 7, themes: ['guard'], extra: { shape: 'tower', size: 1.15, mat: STAR, rim: GOLD, cross: GOLD, rays: null, boss: null } },
  'mythic.thunder_bulwark': { tier: 7, themes: ['lightning', 'crit'], extra: { shape: 'heater', mat: STORM, rim: SILVER, rays: STORM, boss: null } },
  'mythic.mirror_of_ruin': { tier: 8, themes: ['thorns'], extra: { shape: 'round', mat: BLACK_STEEL, rim: VOID, face: SILVER, rays: null, gem: 0xff4060 } },
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
const UNIQUE_TINT = 0.35;

/** 依階級、稀有度、主題算出造型參數 */
export function armorSpec<K extends ArmorSlot>(slot: K, tier: number, rarity: Rarity, themes: readonly GearTheme[], extra: Partial<Spec[K]> = {}, tintScale = 1): Spec[K] {
  const list = BASES[slot] as Spec[K][];
  const base = list[Math.min(list.length, Math.max(1, tier)) - 1]!;
  const spec = { ...base, ...extra } as Spec[K] & Record<string, unknown>;
  // extra 裡的 null = 拿掉基底的這個零件
  for (const [key, value] of Object.entries(extra)) if (value === null) delete spec[key];
  const { main, accent } = themeColors(themes);
  if (main) {
    const color = THEMES[main].color;
    const k = RARITY_TINT[rarity] * BODY_TINT * tintScale;
    const keys = slot === 'armor' ? ['mat', 'pauldronMat'] : slot === 'boots' ? ['mat', 'shin'] : slot === 'gloves' ? ['cuff', 'hand', 'fingers', 'plate'] : ['mat'];
    for (const key of keys) if (spec[key]) spec[key] = tintTones(spec[key] as Tones, color, k);
    spec.gem = accent ?? color;
    if (slot === 'armor') spec.emblem = color;
    if (slot === 'shield') spec.gem = color;
    if (hasRunes(rarity)) spec.runes = color;
    else delete spec.runes;
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
      if (slot === 'helmet' || slot === 'boots') spec.wings = wing;
      if (slot === 'shield') spec.size = (spec.size as number) * 0.9;
      if (slot === 'gloves') spec.flare = 0;
      if (slot === 'armor') {
        spec.pauldron = Math.max(0, (spec.pauldron as number) - 0.4);
        spec.tassets = false;
      }
    }
    if (th === 'thorns') {
      if (slot === 'armor') spec.spikes = true;
      else spec.spikes = Math.max((spec.spikes as number | undefined) ?? 0, slot === 'shield' ? 5 : 4);
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

export function heroineOutfit(specs: { helmet?: HelmetSpec; armor?: ArmorSpec; gloves?: GloveSpec; boots?: BootSpec; shield?: ShieldSpec }): OutfitParts {
  const parts = new Map<Joint, Mesh[]>();
  const hide = new Set<string>();
  const skinColors = new Map<number, number>();
  const { helmet, armor, gloves, boots, shield } = specs;
  if (gloves) {
    // 護手套在前臂外面；手換成手套（藏起 AI 版的手）；指節甲、爪、尖刺只在放大時畫（角色預覽）
    const k = AI_LIMB.forearm / OLD.forearm;
    parts.set('forearmL', along(gauntletPiece(gloves), k));
    parts.set('forearmR', along(gauntletPiece(gloves), k));
    parts.set('handL', [...heroineHand(false, gloves.hand), ...gloveHandDetails(gloves)]);
    parts.set('handR', [...heroineHand(true, gloves.hand), ...gloveHandDetails(gloves)]);
    hide.add('handL').add('handR');
  }
  // 盾牌拿在左手（只會和劍、斧一起裝備；弓也在左手，但兩者不會同時出現）
  if (shield) parts.set('weaponL', placeShield(shieldMeshes(shield)));
  if (helmet) {
    // 全罩頭盔蓋住臉與頭髮；帽子與開放式露出臉（頭髮收進頭盔，馬尾從後方垂下）
    parts.set('head', scaleHead(placeHelmet(helmetMeshes(helmet))));
    hide.add('hair');
    if (helmet.style === 'closed') hide.add('head');
  }
  if (armor?.model) {
    // AI 生成的盔甲：已在 Blender 對齊 AI 版女主角，直接掛在胸口與上臂
    for (const [j, meshes] of aiArmorParts(armor.model)) parts.set(j, meshes);
    hide.add('chest').add('torso');
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
    // 尖刺、翅膀、寶石、符文貼在靴子表面
    for (const s of ['L', 'R'] as const) parts.set(`shin${s}`, bootShinExtras(boots, AI_LIMB.shin, aiBootShape));
    const color = bootColor(boots);
    for (const f of AI_BOOT_FACES) skinColors.set(f.index, color(f));
  }
  return Object.assign(parts, { hideSkin: hide, skinColors });
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
