import type { DataRegistry } from '../../../data/DataRegistry';
import type { Rarity } from '../../../data/schema/item';
import type { EquipmentSlot, ItemInstance } from '../../../game/items/ItemInstance';
import type { Joint } from '../FigureModel';
import type { Mesh } from '../Poly3D';
import { pelvisArmor } from '../heroine/HeroineArmor';
import { heroineHead, heroineThigh, heroineUpperArm } from '../heroine/HeroineBody';
import { scarfWrap } from '../heroine/HeroineHair';
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
  bootCuffPiece,
  bootFootPiece,
  bootShinPiece,
  chestPiece,
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
  type HelmetSpec,
  type ShieldSpec,
} from './ArmorPieces';
import { hasRunes, itemThemes, RARITY_TINT, themeColors, THEMES, tintTones, type GearTheme } from './GearTheme';

/**
 * 穿在主角身上的頭盔、盔甲、靴子、盾牌：8 階基底造型 + 詞綴主題（染色、符文、翅膀、尖刺、厚重）+ 橘 / 紅專屬點綴。
 * 只在渲染層使用；外觀完全由裝備資料推導，不需要存檔。手套太小，不換外觀。
 */

export type ArmorSlot = 'helmet' | 'armor' | 'boots' | 'shield';
type Spec = { helmet: HelmetSpec; armor: ArmorSpec; boots: BootSpec; shield: ShieldSpec };

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

const BASES: { [K in ArmorSlot]: Spec[K][] } = { helmet: HELMETS, armor: ARMORS, boots: BOOTS, shield: SHIELDS };

/** 橘 / 紅防具：基底階級、主題與專屬點綴（染色較淡，保留專屬配色） */
/** extra：覆寫該部位造型參數的欄位（頭盔 / 盔甲 / 靴子各自的欄位；null = 拿掉基底的零件） */
const UNIQUES: Record<string, { tier: number; themes: GearTheme[]; extra: Record<string, unknown> }> = {
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
  'legendary.bastion': { tier: 5, themes: ['guard', 'vital'], extra: { shape: 'tower', mat: STEEL, rim: GOLD, cross: GOLD, spikes: null } },
  'legendary.flame_ward': { tier: 4, themes: ['fire'], extra: { shape: 'heater', mat: BRONZE, rim: DARK_STEEL, rays: EMBER } },
  'legendary.frost_aegis': { tier: 4, themes: ['cold'], extra: { shape: 'round', mat: ICE, rim: SILVER, rays: ICE } },
  'mythic.world_wall': { tier: 7, themes: ['guard'], extra: { shape: 'tower', size: 1.15, mat: STAR, rim: GOLD, cross: GOLD, rays: null, boss: null } },
  'mythic.thunder_bulwark': { tier: 7, themes: ['lightning', 'crit'], extra: { shape: 'heater', mat: STORM, rim: SILVER, rays: STORM, boss: null } },
  'mythic.mirror_of_ruin': { tier: 8, themes: ['thorns'], extra: { shape: 'round', mat: BLACK_STEEL, rim: VOID, face: SILVER, rays: null, gem: 0xff4060 } },
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
    const keys = slot === 'armor' ? ['mat', 'pauldronMat'] : slot === 'boots' ? ['mat', 'shin'] : ['mat'];
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

/** 一件裝備 → 造型參數（橘 / 紅有專屬設定；其他依基底階級與詞綴） */
export function specForItem<K extends ArmorSlot>(slot: K, item: ItemInstance, data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>): Spec[K] {
  const unique = item.legendaryId ? UNIQUES[item.legendaryId] : undefined;
  if (unique) return armorSpec(slot, unique.tier, item.rarity, unique.themes, unique.extra as Partial<Spec[K]>, UNIQUE_TINT);
  const tier = data.items.has(item.baseId) ? (data.items.get(item.baseId).tier ?? 1) : 1;
  return armorSpec(slot, tier, item.rarity, item.rarity === 'normal' ? [] : itemThemes(item, data));
}

/** 主角身上被換掉的關節網格（沒穿的部位保留原本的皮甲、長靴與頭髮） */
export type OutfitParts = ReadonlyMap<Joint, Mesh[]>;

export function heroineOutfit(specs: { helmet?: HelmetSpec; armor?: ArmorSpec; boots?: BootSpec; shield?: ShieldSpec }): OutfitParts {
  const parts = new Map<Joint, Mesh[]>();
  const { helmet, armor, boots, shield } = specs;
  // 盾牌拿在左手（只會和劍、斧一起裝備；弓也在左手，但兩者不會同時出現）
  if (shield) parts.set('weaponL', placeShield(shieldMeshes(shield)));
  if (helmet) {
    // 全罩頭盔蓋住臉與頭髮；帽子與開放式露出臉（頭髮收進頭盔，馬尾從後方垂下）
    const hat = placeHelmet(helmetMeshes(helmet));
    parts.set('head', helmet.style === 'closed' ? hat : [...heroineHead(), ...hat]);
  }
  if (armor) {
    parts.set('chest', [...chestPiece(armor), ...scarfWrap()]);
    parts.set('torso', waistPiece(armor));
    parts.set('upperArmL', [...heroineUpperArm(1), ...shoulderPiece(armor, 1)]);
    parts.set('upperArmR', [...heroineUpperArm(2), ...shoulderPiece(armor, -1)]);
    if (armor.tassets) parts.set('root', [...pelvisArmor(), ...tassetPiece(armor)]);
  }
  if (boots) {
    parts.set('thighL', [...heroineThigh(1), ...bootCuffPiece(boots)]);
    parts.set('thighR', [...heroineThigh(2), ...bootCuffPiece(boots)]);
    parts.set('shinL', bootShinPiece(boots));
    parts.set('shinR', bootShinPiece(boots));
    parts.set('footL', bootFootPiece(boots));
    parts.set('footR', bootFootPiece(boots));
  }
  return parts;
}

const cache = new Map<string, OutfitParts>();

/** 身上的頭盔、盔甲、靴子、盾牌 → 換掉的網格（同一組裝備重複使用；換裝時才重建） */
export function outfitFor(
  equipped: (slot: EquipmentSlot) => ItemInstance | undefined,
  data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>,
  /** 關掉時不畫頭盔（屬性照常生效） */
  showHelmet = true,
): OutfitParts {
  const items = { helmet: showHelmet ? equipped('helmet') : undefined, armor: equipped('armor'), boots: equipped('boots'), shield: equipped('shield') };
  const key = `${items.helmet?.uid ?? '-'}|${items.armor?.uid ?? '-'}|${items.boots?.uid ?? '-'}|${items.shield?.uid ?? '-'}`;
  let parts = cache.get(key);
  if (!parts) {
    parts = heroineOutfit({
      ...(items.helmet ? { helmet: specForItem('helmet', items.helmet, data) } : {}),
      ...(items.armor ? { armor: specForItem('armor', items.armor, data) } : {}),
      ...(items.boots ? { boots: specForItem('boots', items.boots, data) } : {}),
      ...(items.shield ? { shield: specForItem('shield', items.shield, data) } : {}),
    });
    if (cache.size > 32) cache.clear();
    cache.set(key, parts);
  }
  return parts;
}
