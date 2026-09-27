import type { DataRegistry } from '../../../data/DataRegistry';
import type { Rarity, WeaponType } from '../../../data/schema/item';
import type { ItemInstance } from '../../../game/items/ItemInstance';
import { apply, jointRotation, placeMesh, type Mesh, type V3 } from '../Poly3D';
import { SWORD_CANT } from '../heroine/HeroineWeapon';
import type { WeaponMount } from '../PolyFigure';
import {
  ABYSS,
  ANCIENT,
  axe,
  BLACK_STEEL,
  blade,
  BLOOD_STEEL,
  BONE,
  bow,
  BRONZE,
  CRIMSON,
  DARK_STEEL,
  DARK_WOOD,
  GOLD,
  guard,
  hilt,
  ICE,
  IRON,
  JADE,
  LEATHER,
  PALE_WOOD,
  RED_LEATHER,
  SHADOW,
  SILVER,
  staff,
  STAR,
  STEEL,
  STORM,
  VOID,
  WOOD,
  type AxeOptions,
  type BladeOptions,
  type BowOptions,
  type GuardShape,
  type PommelShape,
  type StaffOptions,
  type Tones,
} from './WeaponParts';

/**
 * 手上的武器外觀：每種武器（劍 / 斧 / 弓 / 法杖）的 8 階基底各有自己的造型，
 * 傳奇（橘）與神話（紅）每一件都有獨一無二的造型與武器光芒（元素粒子、環繞的符文）。
 * 模型只在渲染層使用；新增基底或傳奇沒有對應造型時，用同種類同階級的基底造型。
 */

/** 武器光芒的粒子種類（橘 / 紅專屬） */
export type GlowParticle = 'ember' | 'frost' | 'spark' | 'blood' | 'shadow' | 'holy' | 'void' | 'wind' | 'star' | 'rock' | 'prism';

export interface WeaponGlowStyle {
  /** 光芒主色 */
  color: number;
  /** 內核（靠近武器的亮色） */
  core?: number;
  particle: GlowParticle;
  /** 神話：環繞武器的符文 / 碎片 / 星星 */
  orbit?: 'runes' | 'shards' | 'stars';
}

export interface WeaponLook {
  kind: WeaponType;
  /** 右手（劍、斧、杖）或左手（弓） */
  hand: 'right' | 'left';
  meshes: Mesh[];
  /** 武器尖端（拖尾） */
  tip: V3;
  /** 光芒沿著這一段（劍身、斧刃、弓臂、杖頭） */
  axis: [V3, V3];
  /** 光芒的聚焦點（寶珠、斧頭）；沒有時用 axis 的中點 */
  focus?: V3;
  /** 橘 / 紅專屬的光芒；其他稀有度依顏色產生 */
  glow?: WeaponGlowStyle;
}

// ─────────────────────────── 各種類的造型 ───────────────────────────

interface SwordSpec extends Omit<BladeOptions, 'start'> {
  guard: GuardShape;
  guardWidth?: number;
  guardColors: Tones;
  pommel: PommelShape;
  grip?: Tones;
  gem?: number;
}

function swordLook(s: SwordSpec): Omit<WeaponLook, 'hand' | 'kind'> {
  const b = blade(s);
  return {
    meshes: [...hilt(s.pommel, s.grip ?? LEATHER, s.guardColors, s.gem), ...guard(s.guard, s.guardWidth ?? 3.1, s.guardColors), ...b.meshes],
    tip: b.tip,
    axis: [[0, -3, 0], b.tip],
  };
}

function axeLook(s: AxeOptions): Omit<WeaponLook, 'hand' | 'kind'> {
  const a = axe(s);
  return { meshes: a.meshes, tip: a.edgeBottom, axis: [a.edgeTop, a.edgeBottom], focus: a.head };
}

function bowLook(s: BowOptions): Omit<WeaponLook, 'hand' | 'kind'> {
  const b = bow(s);
  return { meshes: b.meshes, tip: b.top, axis: [b.top, b.bottom], focus: [0, 0, s.bend * 0.3] };
}

function staffLook(s: StaffOptions): Omit<WeaponLook, 'hand' | 'kind'> {
  const st = staff(s);
  return { meshes: st.meshes, tip: st.focus, axis: [[0, -s.length * 0.55, 0], st.focus], focus: st.focus };
}

type Spec = { kind: 'sword'; spec: SwordSpec } | { kind: 'axe'; spec: AxeOptions } | { kind: 'bow'; spec: BowOptions } | { kind: 'staff'; spec: StaffOptions };

const sword = (spec: SwordSpec): Spec => ({ kind: 'sword', spec });
const axeSpec = (spec: AxeOptions): Spec => ({ kind: 'axe', spec });
const bowSpec = (spec: BowOptions): Spec => ({ kind: 'bow', spec });
const staffSpec = (spec: StaffOptions): Spec => ({ kind: 'staff', spec });

/** 基底造型（依階級 1～8） */
const TIERS: Record<WeaponType, Spec[]> = {
  sword: [
    sword({ shape: 'straight', length: 13, width: 1.05, colors: IRON, guard: 'bar', guardWidth: 2.5, guardColors: DARK_STEEL, pommel: 'ball' }),
    sword({ shape: 'straight', length: 18, width: 1.2, colors: IRON, fuller: 0x70767c, guard: 'bar', guardColors: IRON, pommel: 'ball' }),
    sword({ shape: 'straight', length: 20, width: 1.3, colors: STEEL, fuller: 0x9aa2ac, guard: 'upturned', guardColors: GOLD, pommel: 'ball' }),
    sword({ shape: 'broad', length: 21, width: 1.5, colors: STEEL, runes: 0x6fc8ff, guard: 'upturned', guardWidth: 3.4, guardColors: SILVER, pommel: 'gem', gem: 0x4aa8ff }),
    sword({ shape: 'broad', length: 23, width: 1.8, colors: BLACK_STEEL, fuller: 0x24272c, guard: 'thorns', guardWidth: 3.4, guardColors: BLACK_STEEL, pommel: 'spike' }),
    sword({ shape: 'serrated', length: 22, width: 1.5, colors: BLOOD_STEEL, runes: 0xff3a3a, guard: 'claws', guardColors: DARK_STEEL, pommel: 'gem', gem: 0xd02030, grip: RED_LEATHER }),
    sword({ shape: 'straight', length: 24, width: 1.55, colors: ANCIENT, fuller: 0xc8a048, guard: 'wings', guardWidth: 3.4, guardColors: GOLD, pommel: 'gem', gem: 0xffb040 }),
    sword({ shape: 'rift', length: 25, width: 1.7, colors: ABYSS, runes: 0xb070ff, guard: 'thorns', guardWidth: 3.6, guardColors: VOID, pommel: 'skull' }),
  ],
  axe: [
    axeSpec({ head: 'single', haft: 11, size: 2.6, haftColors: WOOD, headColors: IRON }),
    axeSpec({ head: 'single', haft: 14, size: 3.2, haftColors: WOOD, headColors: IRON, spike: true, edgeColor: 0xd8dde2 }),
    axeSpec({ head: 'crescent', haft: 15, size: 3.6, haftColors: DARK_WOOD, headColors: STEEL }),
    axeSpec({ head: 'bearded', haft: 16, size: 4, haftColors: DARK_WOOD, headColors: DARK_STEEL, spike: true }),
    axeSpec({ head: 'double', haft: 17, size: 4.4, haftColors: DARK_WOOD, headColors: BLACK_STEEL, edgeColor: 0x8a9098 }),
    axeSpec({ head: 'cleaver', haft: 16, size: 4.6, haftColors: RED_LEATHER, headColors: BLOOD_STEEL, spike: true }),
    axeSpec({ head: 'fang', haft: 17, size: 5, haftColors: PALE_WOOD, headColors: BONE }),
    axeSpec({ head: 'crescent', haft: 18, size: 5.2, haftColors: VOID, headColors: ABYSS }),
  ],
  bow: [
    bowSpec({ length: 12, bend: 2.2, thickness: 0.7, colors: WOOD, grip: LEATHER }),
    bowSpec({ length: 14, bend: 2.6, thickness: 0.75, colors: WOOD, grip: LEATHER }),
    bowSpec({ length: 17, bend: 2.8, thickness: 0.75, colors: PALE_WOOD, grip: LEATHER }),
    bowSpec({ length: 16, bend: 3, recurve: 1.2, thickness: 0.8, colors: DARK_WOOD, grip: LEATHER, tips: 'orb', tipColors: [0x6fc8ff] }),
    bowSpec({ length: 16, bend: 3.2, recurve: 1.6, thickness: 0.85, colors: BONE, grip: LEATHER, tips: 'hook', tipColors: BONE }),
    bowSpec({ length: 16, bend: 3.2, recurve: 1.4, thickness: 0.85, colors: BLOOD_STEEL, grip: RED_LEATHER, tips: 'blade', tipColors: DARK_STEEL }),
    bowSpec({ length: 18, bend: 3.4, recurve: 1.8, thickness: 0.9, colors: ANCIENT, grip: LEATHER, tips: 'wing', tipColors: GOLD }),
    bowSpec({ length: 18, bend: 3.6, recurve: 2, thickness: 0.9, colors: ABYSS, grip: LEATHER, tips: 'blade', tipColors: VOID, string: 0xc8a0ff }),
  ],
  staff: [
    staffSpec({ head: 'knob', length: 31, butt: 3, shaft: WOOD, metal: IRON, focus: 0 }),
    staffSpec({ head: 'knob', length: 35, butt: 3, shaft: WOOD, metal: BRONZE, focus: 0, bands: true }),
    staffSpec({ head: 'crystal', length: 35, butt: 4, shaft: PALE_WOOD, metal: SILVER, focus: 0x8fe0ff }),
    staffSpec({ head: 'rune', length: 36, butt: 4, shaft: DARK_WOOD, metal: SILVER, focus: 0x6fc8ff, bands: true }),
    staffSpec({ head: 'skull', length: 36, butt: 4, shaft: DARK_WOOD, metal: BLACK_STEEL, focus: 0x9fff7a }),
    staffSpec({ head: 'prongs', length: 37, butt: 4, shaft: DARK_WOOD, metal: BLOOD_STEEL, focus: 0xff5050, bands: true }),
    staffSpec({ head: 'ring', length: 37, butt: 5, shaft: PALE_WOOD, metal: GOLD, focus: 0xffe08a }),
    staffSpec({ head: 'cluster', length: 38, butt: 5, shaft: VOID, metal: ABYSS, focus: 0xb070ff }),
  ],
};

/** 傳奇（橘）與神話（紅）：每一件獨一無二的造型與光芒 */
const UNIQUES: Record<string, { look: Spec; glow: WeaponGlowStyle }> = {
  // ── 劍 ──
  'legendary.cold_moon': {
    look: sword({ shape: 'curved', length: 22, width: 1.25, curve: 3.2, colors: ICE, guard: 'crescent', guardWidth: 2.8, guardColors: SILVER, pommel: 'gem', gem: 0x9fe8ff }),
    glow: { color: 0x8fdcff, core: 0xe8faff, particle: 'frost' },
  },
  'legendary.oathkeeper': {
    look: sword({ shape: 'broad', length: 22, width: 1.7, colors: STEEL, fuller: 0xc8a048, guard: 'wings', guardWidth: 3.6, guardColors: GOLD, pommel: 'gem', gem: 0x4a78ff }),
    glow: { color: 0xffe08a, core: 0xfffbe8, particle: 'holy' },
  },
  'legendary.crimson_moon': {
    look: sword({ shape: 'curved', length: 21, width: 1.2, curve: 3.6, colors: CRIMSON, guard: 'crescent', guardWidth: 2.8, guardColors: BLACK_STEEL, pommel: 'gem', gem: 0xff2030, grip: RED_LEATHER }),
    glow: { color: 0xff3048, core: 0xffb0b8, particle: 'blood' },
  },
  'mythic.world_rift': {
    look: sword({ shape: 'rift', length: 26, width: 1.9, colors: VOID, runes: 0xc070ff, guard: 'thorns', guardWidth: 3.8, guardColors: ABYSS, pommel: 'gem', gem: 0xc070ff }),
    glow: { color: 0xb060ff, core: 0xffffff, particle: 'void', orbit: 'shards' },
  },
  'mythic.eternity': {
    look: sword({ shape: 'crystal', length: 25, width: 1.45, colors: STAR, guard: 'wings', guardWidth: 3.6, guardColors: GOLD, pommel: 'gem', gem: 0xfff4d0 }),
    glow: { color: 0xffe9a0, core: 0xffffff, particle: 'star', orbit: 'runes' },
  },
  // ── 斧 ──
  'legendary.mountain_splitter': {
    look: axeSpec({ head: 'double', haft: 17, size: 5, haftColors: DARK_WOOD, headColors: DARK_STEEL, edgeColor: 0xffb070 }),
    glow: { color: 0xffa040, core: 0xffe0b0, particle: 'rock' },
  },
  'legendary.butcher': {
    look: axeSpec({ head: 'cleaver', haft: 15, size: 5, haftColors: RED_LEATHER, headColors: BLOOD_STEEL, spike: true }),
    glow: { color: 0xff4030, core: 0xffb0a0, particle: 'blood' },
  },
  'legendary.thunder_axe': {
    look: axeSpec({ head: 'bearded', haft: 17, size: 4.6, haftColors: DARK_WOOD, headColors: STORM, spike: true, edgeColor: 0xffffff }),
    glow: { color: 0x9fc4ff, core: 0xffffff, particle: 'spark' },
  },
  'mythic.beast_god_fang': {
    look: axeSpec({ head: 'fang', haft: 18, size: 5.6, haftColors: RED_LEATHER, headColors: BONE }),
    glow: { color: 0xff6a30, core: 0xffd0a0, particle: 'ember', orbit: 'shards' },
  },
  'mythic.doomsday': {
    look: axeSpec({ head: 'crescent', haft: 19, size: 5.8, haftColors: BLACK_STEEL, headColors: BLACK_STEEL, edgeColor: 0xff5a3a }),
    glow: { color: 0xff3a20, core: 0xffd080, particle: 'ember', orbit: 'runes' },
  },
  // ── 弓 ──
  'legendary.wind_chaser': {
    look: bowSpec({ length: 17, bend: 3, recurve: 1.4, thickness: 0.8, colors: JADE, grip: LEATHER, tips: 'wing', tipColors: SILVER }),
    glow: { color: 0x9fffc8, core: 0xf0fff8, particle: 'wind' },
  },
  'legendary.storm_eye': {
    look: bowSpec({ length: 17, bend: 3.2, recurve: 1.2, thickness: 0.85, colors: STORM, grip: LEATHER, tips: 'orb', tipColors: [0xe8f2ff], string: 0xcfe0ff }),
    glow: { color: 0x9fc4ff, core: 0xffffff, particle: 'spark' },
  },
  'legendary.shadow_hunter': {
    look: bowSpec({ length: 17, bend: 3.4, recurve: 2, thickness: 0.85, colors: SHADOW, grip: LEATHER, tips: 'blade', tipColors: BLACK_STEEL, string: 0x8a7aa0 }),
    glow: { color: 0x9a7aff, core: 0xd8c8ff, particle: 'shadow' },
  },
  'mythic.sky_rending_string': {
    look: bowSpec({ length: 19, bend: 3.8, recurve: 2.2, thickness: 0.95, colors: SILVER, grip: LEATHER, tips: 'wing', tipColors: GOLD, string: 0xffe08a }),
    glow: { color: 0x9ad8ff, core: 0xffffff, particle: 'wind', orbit: 'runes' },
  },
  'mythic.starfall_volley': {
    look: bowSpec({ length: 19, bend: 3.6, recurve: 1.8, thickness: 0.95, colors: VOID, grip: LEATHER, tips: 'orb', tipColors: [0xfff0c0], string: 0xfff0c0 }),
    glow: { color: 0xfff0b0, core: 0xffffff, particle: 'star', orbit: 'stars' },
  },
  // ── 法杖 ──
  'legendary.star_burner': {
    look: staffSpec({ head: 'orb', length: 37, butt: 4, shaft: DARK_WOOD, metal: BRONZE, focus: 0xff7a2a, bands: true }),
    glow: { color: 0xff8a3a, core: 0xffe0a0, particle: 'ember' },
  },
  'legendary.permafrost': {
    look: staffSpec({ head: 'crystal', length: 37, butt: 4, shaft: PALE_WOOD, metal: SILVER, focus: 0x9fe8ff }),
    glow: { color: 0x9fe8ff, core: 0xffffff, particle: 'frost' },
  },
  'legendary.thunder_scepter': {
    look: staffSpec({ head: 'prongs', length: 36, butt: 3, shaft: DARK_WOOD, metal: STORM, focus: 0xbfd8ff, bands: true }),
    glow: { color: 0x9fc4ff, core: 0xffffff, particle: 'spark' },
  },
  'mythic.void_scepter': {
    look: staffSpec({ head: 'ring', length: 38, butt: 5, shaft: BLACK_STEEL, metal: VOID, focus: 0xc070ff }),
    glow: { color: 0xb060ff, core: 0xffffff, particle: 'prism', orbit: 'shards' },
  },
  'mythic.frozen_throne': {
    look: staffSpec({ head: 'cluster', length: 38, butt: 5, shaft: SILVER, metal: ICE, focus: 0xbff0ff, bands: true }),
    glow: { color: 0xbfeeff, core: 0xffffff, particle: 'frost', orbit: 'shards' },
  },
};

// ─────────────────────────── 轉到手上的角度 ───────────────────────────

/**
 * 握點空間 → 武器關節：劍與斧跟原本的劍一樣往前下方斜（SWORD_CANT）；
 * 法杖立起來（杖頭朝上、略往前）；弓拿在左手、弓身直立。
 */
const HOLD: Record<WeaponType, V3> = {
  sword: [SWORD_CANT - Math.PI / 2, 0, 0],
  axe: [SWORD_CANT - Math.PI / 2 + 0.15, 0, 0],
  staff: [Math.PI + 0.35, 0, 0],
  bow: [0.25, 0, 0],
};

function build(spec: Spec): WeaponLook {
  const raw = spec.kind === 'sword' ? swordLook(spec.spec) : spec.kind === 'axe' ? axeLook(spec.spec) : spec.kind === 'bow' ? bowLook(spec.spec) : staffLook(spec.spec);
  const rot = HOLD[spec.kind];
  const m = jointRotation(rot);
  return {
    kind: spec.kind,
    hand: spec.kind === 'bow' ? 'left' : 'right',
    meshes: raw.meshes.map((mesh) => {
      const placed = placeMesh(mesh, rot, [0, 0, 0]);
      if (mesh.lod) placed.lod = mesh.lod;
      return placed;
    }),
    tip: apply(m, raw.tip),
    axis: [apply(m, raw.axis[0]), apply(m, raw.axis[1])],
    ...(raw.focus ? { focus: apply(m, raw.focus) } : {}),
  };
}

/** 造型 → 掛到角色手上的資料（PolyFigure.setWeapon） */
export function mountFor(look: WeaponLook): WeaponMount {
  return { joint: look.hand === 'left' ? 'weaponL' : 'weapon', meshes: look.meshes, tip: look.tip, axis: look.axis, ...(look.focus ? { focus: look.focus } : {}) };
}

/** 預覽用：'bow:5'（種類:階級）或傳奇 ID */
export function lookByKey(key: string): WeaponLook | null {
  const [kind, tier] = key.split(':');
  if (tier && (['sword', 'axe', 'bow', 'staff'] as const).includes(kind as WeaponType)) return tierLook(kind as WeaponType, Number(tier) || 1);
  return uniqueLook(key);
}

const cache = new Map<string, WeaponLook>();

/** 基底造型（種類、階級 1～8） */
export function tierLook(kind: WeaponType, tier: number): WeaponLook {
  const key = `${kind}:${tier}`;
  let look = cache.get(key);
  if (!look) {
    const list = TIERS[kind];
    look = build(list[Math.min(list.length, Math.max(1, tier)) - 1]!);
    cache.set(key, look);
  }
  return look;
}

/** 傳奇 / 神話的專屬造型（沒有設計時為 null） */
export function uniqueLook(legendaryId: string): WeaponLook | null {
  const def = UNIQUES[legendaryId];
  if (!def) return null;
  let look = cache.get(legendaryId);
  if (!look) {
    look = { ...build(def.look), glow: def.glow };
    cache.set(legendaryId, look);
  }
  return look;
}

/** 有專屬造型的傳奇 / 神話 ID（測試與預覽用） */
export const UNIQUE_WEAPON_IDS = Object.keys(UNIQUES);

/** 裝備中的武器 → 手上的造型與光芒的稀有度；沒有武器時為 null */
export function weaponLookFor(item: ItemInstance | undefined, data: Pick<DataRegistry, 'items'>): { look: WeaponLook; rarity: Rarity } | null {
  if (!item || !data.items.has(item.baseId)) return null;
  const base = data.items.get(item.baseId);
  if (!base.weaponType) return null;
  const look = (item.legendaryId && uniqueLook(item.legendaryId)) || tierLook(base.weaponType, base.tier ?? 1);
  return { look, rarity: item.rarity };
}
