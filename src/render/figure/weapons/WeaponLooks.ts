import type { DataRegistry } from '../../../data/DataRegistry';
import { hasRunes, itemThemes, RARITY_TINT, themeColors, THEMES, tintTones, type GearTheme } from '../gear/GearTheme';
import type { Rarity, WeaponType } from '../../../data/schema/item';
import type { ItemInstance } from '../../../game/items/ItemInstance';
import { refine } from '../Facets';
import { apply, jointRotation, placeMesh, stretchMeshes, type Mesh, type V3 } from '../Poly3D';
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
  taper,
  type AxeOptions,
  type BladeOptions,
  type BowOptions,
  type GuardShape,
  type PommelShape,
  type StaffOptions,
  type Tones,
} from './WeaponParts';
import { axeSpec, bowSpec, staffSpec, sword, type GlowParticle, type Spec, type SwordSpec, type UniqueWeapon, type WeaponGlowStyle } from './WeaponSpec';
import { emblemMeshes, type Emblem } from './Emblems';
import { styledSword } from './StyledSwords';
import { styledAxe } from './StyledAxes';
import { styledBow } from './StyledBows';
import { styledStaff } from './StyledStaves';
import { depthFor, type Badge } from './StyledWeapons';
import { swordUniques } from './uniques/sword';
import { axeUniques } from './uniques/axe';
import { bowUniques } from './uniques/bow';
import { staffUniques } from './uniques/staff';

export type { GlowParticle, WeaponGlowStyle };

/**
 * 手上的武器外觀：每種武器（劍 / 斧 / 弓 / 法杖）的 8 階基底各有自己的造型，
 * 傳奇（橘）與神話（紅）每一件都有獨一無二的造型與武器光芒（元素粒子、環繞的符文）。
 * 模型只在渲染層使用；新增基底或傳奇沒有對應造型時，用同種類同階級的基底造型。
 */


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

/** 尺寸倍率（設計者 2026-10-22）：劍身長、斧頭的金屬頭、弓的長寬、杖頭 */
const SWORD_LENGTH_SCALE = 1.3;
const AXE_HEAD_SCALE = 2;
const BOW_SCALE = 1.2;
const STAFF_HEAD_SCALE = 2;
/** 加密成小三角面（與 AI 版女主角相同的構面感）：邊長、起伏；劍身與弓臂很薄，起伏有絕對上限 */
const WEAPON_FACETS = { size: 0.7, bump: 0.25, maxBump: 0.09, vary: 0.06 };

const scaleAround = (v: V3, o: V3, k: number): V3 => [o[0] + (v[0] - o[0]) * k, o[1] + (v[1] - o[1]) * k, o[2] + (v[2] - o[2]) * k];


type RawLook = Omit<WeaponLook, 'hand' | 'kind'> & { badge?: Badge };

function swordLook(s: SwordSpec): RawLook {
  if (s.style) {
    const st = styledSword({ ...s, style: s.style }, SWORD_LENGTH_SCALE);
    return { meshes: st.meshes, tip: st.tip, axis: [[0, -3, 0], st.tip], badge: st.badge };
  }
  const b = blade({ ...s, length: s.length * SWORD_LENGTH_SCALE });
  return {
    meshes: [...hilt(s.pommel, s.grip ?? LEATHER, s.guardColors, s.gem), ...guard(s.guard, s.guardWidth ?? 3.1, s.guardColors), ...b.meshes],
    tip: b.tip,
    axis: [[0, -3, 0], b.tip],
  };
}

function axeLook(s: AxeOptions): RawLook {
  if (s.style) {
    const a = styledAxe({ ...s, style: s.style, size: s.size * AXE_HEAD_SCALE });
    return { meshes: a.meshes, tip: a.edgeBottom, axis: [a.edgeTop, a.edgeBottom], focus: a.head, badge: a.badge };
  }
  const a = axe({ ...s, size: s.size * AXE_HEAD_SCALE });
  return { meshes: a.meshes, tip: a.edgeBottom, axis: [a.edgeTop, a.edgeBottom], focus: a.head };
}

function bowLook(s: BowOptions): RawLook {
  // 以握點為中心整把放大；代表物件鑲在握把正中央
  const b = s.style ? styledBow({ ...s, style: s.style }) : bow(s);
  const k = (v: V3): V3 => scaleAround(v, [0, 0, 0], BOW_SCALE);
  const grip: V3 = [0, 0, s.bend * 0.25];
  return {
    meshes: stretchMeshes(b.meshes, [BOW_SCALE, BOW_SCALE, BOW_SCALE]),
    tip: k(b.top),
    axis: [k(b.top), k(b.bottom)],
    focus: k([0, 0, s.bend * 0.3]),
    badge: { at: k(grip), size: 1.15, depth: depthFor(s.thickness * 1.4 * 1.35 * BOW_SCALE), rot: 0 },
  };
}

function staffLook(s: StaffOptions): RawLook {
  // 杖頭（杖身末端以外的零件：套環、寶珠、尖角）以杖身末端為中心放大
  const styled = s.style ? styledStaff({ ...s, style: s.style }) : null;
  const st = styled ?? staff(s);
  const end: V3 = [0, 1 - s.length, 0];
  const isHead = (m: Mesh) => m.verts.every((v) => v[1] <= end[1] + 0.01);
  // 橘 / 紅的基本款杖頭照設計稿再大一點
  const k = styled ? STAFF_HEAD_SCALE * 1.35 : STAFF_HEAD_SCALE;
  const meshes = st.meshes.map((m) => (isHead(m) ? { ...m, verts: m.verts.map((v) => scaleAround(v, end, k)) } : m));
  const focus = scaleAround(st.focus, end, k);
  return { meshes, tip: focus, axis: [[0, -s.length * 0.55, 0], focus], focus, ...(styled ? { badge: styled.badge } : {}) };
}


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

/** 世界裂痕的岩層（亮 / 中 / 暗 / 中） */
/** 裂山的岩石、獸神之齒的血肉 */
const MOUNTAIN_ROCK: Tones = [0x9a8c7a, 0x7a6e5e, 0x544a3e, 0x8a7d6c];
const FANG_FLESH: Tones = [0xb02a2a, 0x8a1c1e, 0x501010, 0x9e2426];
const RIFT_ROCK: Tones = [0x8a7a6a, 0x6a5c50, 0x463c34, 0x7a6c5e];

/** 傳奇（橘）與神話（紅）：每一件獨一無二的造型與光芒 */
const UNIQUES: Record<string, UniqueWeapon> = {
  // ── 劍 ──
  'legendary.cold_moon': {
    look: sword({ style: 'crescent', shape: 'straight', length: 22, width: 1.25, curve: 3.2, colors: ICE, trim: SILVER, glow: 0x9fe8ff, guard: 'bar', guardColors: SILVER, pommel: 'ball' }),
    glow: { color: 0x8fdcff, core: 0xe8faff, particle: 'frost' },
    emblem: { kind: 'moon', color: 0xd8f6ff, accent: 0xe6e8ec },
  },
  'legendary.oathkeeper': {
    look: sword({ style: 'knight', shape: 'straight', length: 22, width: 1.6, colors: STEEL, trim: GOLD, glow: 0x6a9cff, guard: 'bar', guardColors: GOLD, pommel: 'ball' }),
    glow: { color: 0xffe08a, core: 0xfffbe8, particle: 'holy' },
    emblem: { kind: 'shield', color: 0x4a78ff, accent: 0xd4ae54 },
  },
  'legendary.crimson_moon': {
    look: sword({ style: 'crescent', shape: 'straight', length: 21, width: 1.2, curve: 3.6, colors: CRIMSON, grip: RED_LEATHER, trim: BLACK_STEEL, glow: 0xff3048, guard: 'bar', guardColors: BLACK_STEEL, pommel: 'ball' }),
    glow: { color: 0xff3048, core: 0xffb0b8, particle: 'blood' },
    emblem: { kind: 'drop', color: 0xff2030, accent: 0x4a4e56 },
  },
  'mythic.world_rift': {
    look: sword({ style: 'rift', shape: 'straight', length: 25, width: 1.7, colors: RIFT_ROCK, trim: BLACK_STEEL, glow: 0xff7a1a, guard: 'bar', guardColors: BLACK_STEEL, pommel: 'ball' }),
    glow: { color: 0xff7a2a, core: 0xffd8a0, particle: 'rock', orbit: 'shards' },
    emblem: { kind: 'rift', color: 0xffa050, accent: 0x8a7a6a },
  },
  'mythic.eternity': {
    look: sword({ style: 'eternal', shape: 'straight', length: 25, width: 1.45, colors: SILVER, trim: GOLD, glow: 0xffb830, guard: 'bar', guardColors: GOLD, pommel: 'ball' }),
    glow: { color: 0xffe9a0, core: 0xffffff, particle: 'star', orbit: 'runes' },
    emblem: { kind: 'star', color: 0xfff4c0, accent: 0xd4ae54 },
  },
  // ── 斧 ──
  'legendary.mountain_splitter': {
    look: axeSpec({ style: 'rock', head: 'single', haft: 17, size: 5, haftColors: BLACK_STEEL, headColors: MOUNTAIN_ROCK, trim: DARK_STEEL, spikes: DARK_STEEL, glow: 0xffb070 }),
    glow: { color: 0xffa040, core: 0xffe0b0, particle: 'rock' },
    emblem: { kind: 'rift', color: 0xffb070, accent: 0xc28a48 },
  },
  'legendary.butcher': {
    look: axeSpec({ style: 'cleaver', head: 'single', haft: 15, size: 4.8, haftColors: RED_LEATHER, headColors: BLOOD_STEEL, trim: BLACK_STEEL, spikes: BLACK_STEEL, glow: 0xff4040 }),
    glow: { color: 0xff4030, core: 0xffb0a0, particle: 'blood' },
    emblem: { kind: 'drop', color: 0xff3040, accent: 0x4a4e56 },
  },
  'legendary.thunder_axe': {
    look: axeSpec({ style: 'moon', head: 'single', haft: 18, size: 4.6, haftColors: DARK_WOOD, headColors: STORM, trim: SILVER, glow: 0xcfe6ff }),
    glow: { color: 0x9fc4ff, core: 0xffffff, particle: 'spark' },
    emblem: { kind: 'bolt', color: 0xfff0a0, accent: 0xe6e8ec },
  },
  'mythic.beast_god_fang': {
    look: axeSpec({ style: 'jaw', head: 'single', haft: 18, size: 5.4, haftColors: RED_LEATHER, headColors: BONE, trim: BRONZE, spikes: FANG_FLESH, glow: 0xff3a2a }),
    glow: { color: 0xff6a30, core: 0xffd0a0, particle: 'ember', orbit: 'shards' },
    emblem: { kind: 'fang', color: 0xff6a30, accent: 0xe8dcc0 },
  },
  'mythic.doomsday': {
    look: axeSpec({ style: 'doom', head: 'single', haft: 19, size: 5.6, haftColors: BLACK_STEEL, headColors: BLACK_STEEL, trim: GOLD, spikes: DARK_STEEL, glow: 0xff6a2a }),
    glow: { color: 0xff3a20, core: 0xffd080, particle: 'ember', orbit: 'runes' },
    emblem: { kind: 'sun', color: 0xff6a3a, accent: 0xd4ae54 },
  },
  // ── 弓 ──
  'legendary.wind_chaser': {
    look: bowSpec({ style: 'recurve', length: 17, bend: 3.2, recurve: 2, thickness: 0.8, colors: JADE, grip: LEATHER, trim: SILVER, glow: 0x9fffc8 }),
    glow: { color: 0x9fffc8, core: 0xf0fff8, particle: 'wind' },
    emblem: { kind: 'feather', color: 0x9fffc8, accent: 0xe6e8ec },
  },
  'legendary.storm_eye': {
    look: bowSpec({ style: 'recurve', length: 17, bend: 3.2, recurve: 1.8, thickness: 0.85, colors: STORM, grip: LEATHER, trim: SILVER, glow: 0xcfe6ff }),
    glow: { color: 0x9fc4ff, core: 0xffffff, particle: 'spark' },
    emblem: { kind: 'bolt', color: 0xdcecff, accent: 0xe6e8ec },
  },
  'legendary.shadow_hunter': {
    look: bowSpec({ style: 'chitin', length: 17, bend: 3.4, recurve: 2.2, thickness: 0.85, colors: SHADOW, grip: LEATHER, trim: BLACK_STEEL, glow: 0xa88aff }),
    glow: { color: 0x9a7aff, core: 0xd8c8ff, particle: 'shadow' },
    emblem: { kind: 'eclipse', color: 0xa88aff, accent: 0x4a4e56 },
  },
  'mythic.sky_rending_string': {
    look: bowSpec({ style: 'sky', length: 19, bend: 3.8, recurve: 2.4, thickness: 0.95, colors: SILVER, grip: LEATHER, trim: GOLD, glow: 0x9ad8ff }),
    glow: { color: 0x9ad8ff, core: 0xffffff, particle: 'wind', orbit: 'runes' },
    emblem: { kind: 'rift', color: 0x9ad8ff, accent: 0xd4ae54 },
  },
  'mythic.starfall_volley': {
    look: bowSpec({ style: 'stars', length: 19, bend: 3.6, recurve: 2.2, thickness: 0.95, colors: VOID, grip: LEATHER, trim: GOLD, glow: 0xfff0b0 }),
    glow: { color: 0xfff0b0, core: 0xffffff, particle: 'star', orbit: 'stars' },
    emblem: { kind: 'star', color: 0xfff0b0, accent: 0xd4ae54 },
  },
  // ── 法杖 ──
  'legendary.star_burner': {
    look: staffSpec({ style: 'crystal', head: 'orb', length: 37, butt: 4, shaft: BRONZE, metal: GOLD, focus: 0xff7a2a }),
    glow: { color: 0xff8a3a, core: 0xffe0a0, particle: 'ember' },
    emblem: { kind: 'sun', color: 0xffa040, accent: 0xd4ae54 },
  },
  'legendary.permafrost': {
    look: staffSpec({ style: 'crystal', head: 'orb', length: 37, butt: 4, shaft: SILVER, metal: ICE, focus: 0x9fe8ff }),
    glow: { color: 0x9fe8ff, core: 0xffffff, particle: 'frost' },
    emblem: { kind: 'snowflake', color: 0xc8f4ff, accent: 0xe6e8ec },
  },
  'legendary.thunder_scepter': {
    look: staffSpec({ style: 'crystal', head: 'orb', length: 36, butt: 3, shaft: DARK_STEEL, metal: STORM, focus: 0xbfd8ff }),
    glow: { color: 0x9fc4ff, core: 0xffffff, particle: 'spark' },
    emblem: { kind: 'bolt', color: 0xfff0a0, accent: 0xc8ccd2 },
  },
  'mythic.void_scepter': {
    look: staffSpec({ style: 'void', head: 'orb', length: 38, butt: 5, shaft: BLACK_STEEL, metal: VOID, focus: 0xc070ff }),
    glow: { color: 0xb060ff, core: 0xffffff, particle: 'prism', orbit: 'shards' },
    emblem: { kind: 'tri', color: 0xe0b0ff, accent: 0x5a4478 },
  },
  'mythic.frozen_throne': {
    look: staffSpec({ style: 'throne', head: 'orb', length: 38, butt: 5, shaft: SILVER, metal: ICE, focus: 0xbff0ff }),
    glow: { color: 0xbfeeff, core: 0xffffff, particle: 'frost', orbit: 'shards' },
    emblem: { kind: 'crown', color: 0xbff0ff, accent: 0xe6e8ec },
  },
  // 擴充的橘 / 紅（uniques/ 各種類檔案）
  ...swordUniques,
  ...axeUniques,
  ...bowUniques,
  ...staffUniques,
};

// ─────────────────────────── 轉到手上的角度 ───────────────────────────

/**
 * 握點空間 → 武器關節：劍與斧跟原本的劍一樣往前下方斜（SWORD_CANT）；
 * 法杖立起來（杖頭朝上、略往前）；弓拿在左手、弓身直立。
 */
export const HOLD: Record<WeaponType, V3> = {
  sword: [SWORD_CANT - Math.PI / 2, 0, 0],
  axe: [SWORD_CANT - Math.PI / 2 + 0.15, 0, 0],
  staff: [Math.PI + 0.35, 0, 0],
  bow: [0.25, 0, 0],
};

function build(spec: Spec, emblem?: Emblem): WeaponLook {
  const raw = spec.kind === 'sword' ? swordLook(spec.spec) : spec.kind === 'axe' ? axeLook(spec.spec) : spec.kind === 'bow' ? bowLook(spec.spec) : staffLook(spec.spec);
  // 代表物件（橘 / 紅）：鑲在造型指定的位置；沒有指定位置的舊造型放在光芒的聚焦點
  if (emblem) {
    const b = raw.badge ?? { at: raw.focus ?? raw.axis[0], size: 1, depth: 2.4, rot: 0 };
    raw.meshes = [...raw.meshes, ...emblemMeshes(emblem, b.at, b.size, b.depth, b.rot)];
  }
  const rot = HOLD[spec.kind];
  const m = jointRotation(rot);
  return {
    kind: spec.kind,
    hand: spec.kind === 'bow' ? 'left' : 'right',
    meshes: raw.meshes.map((part, i) => {
      const mesh = refine(part, { ...WEAPON_FACETS, seed: i });
      const placed = placeMesh(mesh, rot, [0, 0, 0]);
      if (mesh.lod) placed.lod = mesh.lod;
      return placed;
    }),
    tip: apply(m, raw.tip),
    axis: [apply(m, raw.axis[0]), apply(m, raw.axis[1])],
    ...(raw.focus ? { focus: apply(m, raw.focus) } : {}),
  };
}

/**
 * 平常拿武器的方式（攻擊時轉回 HOLD 的角度）：劍尖朝前下；斧柄朝前、斧刃朝下（2026-10-18 設計者回饋：原本斧刃朝上；
 * 這組角度讓斧柄方向與原本相同，只繞斧柄轉半圈）；法杖杖頭往前傾、往外偏（杖頭放大 2 倍後不擋臉）；弓直立在身前（上弓臂朝前、弓背朝外）。
 */
const REST: Partial<Record<WeaponType, V3>> = { axe: [2.26, -3.04, 0.11], staff: [0.35, 0, 0.3], bow: [0.8, 0, 0] };

/** 造型 → 掛到角色手上的資料（PolyFigure.setWeapon） */
export function mountFor(look: WeaponLook): WeaponMount {
  const rest = REST[look.kind];
  return { joint: look.hand === 'left' ? 'weaponL' : 'weapon', meshes: look.meshes, tip: look.tip, axis: look.axis, ...(look.focus ? { focus: look.focus } : {}), ...(rest ? { rest } : {}) };
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
    look = { ...build(def.look, def.emblem), glow: def.glow };
    cache.set(legendaryId, look);
  }
  return look;
}

/** 橘 / 紅的設計（測試用）：基本款與代表物件 */
export function uniqueDesign(legendaryId: string): { style?: string; emblem?: Emblem } | null {
  const def = UNIQUES[legendaryId];
  if (!def) return null;
  const style = (def.look.spec as { style?: string }).style;
  return { ...(style ? { style } : {}), ...(def.emblem ? { emblem: def.emblem } : {}) };
}

/** 有專屬造型的傳奇 / 神話 ID（測試與預覽用） */
export const UNIQUE_WEAPON_IDS = Object.keys(UNIQUES);

// ─────────────────────────── 詞綴主題 ───────────────────────────

/** 在手上時染色減弱，避免整把武器變成一種顏色 */
const HAND_TINT = 0.7;
const STAFF_HEAD: Partial<Record<GearTheme, StaffOptions['head']>> = { fire: 'orb', cold: 'crystal', lightning: 'prongs', poison: 'skull', blood: 'prongs', arcane: 'ring' };

/**
 * 基底造型 + 詞綴主題：
 * - 顏色主題（元素、吸血、法術）：金屬染色、寶石換色，稀有以上有發光符文（劍身符文、斧刃、弓弦、杖頭）
 * - 物理傷害：變寬變重；攻速：變細變長；暴擊：鋸齒、尖刺、刃緣閃光
 */
function themedSpec(spec: Spec, rarity: Rarity, themes: readonly GearTheme[]): Spec {
  const { main, accent } = themeColors(themes);
  const k = RARITY_TINT[rarity] * HAND_TINT;
  const runes = hasRunes(rarity);
  const color = main ? THEMES[main].color : null;
  switch (spec.kind) {
    case 'sword': {
      const s = { ...spec.spec };
      if (color !== null && main !== 'crit') {
        s.colors = tintTones(s.colors, color, k);
        if (runes) s.runes = color;
        if (s.pommel !== 'skull') s.pommel = 'gem';
        s.gem = accent ?? color;
      }
      if (themes.includes('brutal')) {
        s.width *= 1.22;
        if (s.shape === 'straight') s.shape = 'broad';
      }
      if (themes.includes('speed')) {
        s.width *= 0.8;
        s.length *= 1.08;
        if (s.shape === 'straight' || s.shape === 'broad') s.shape = 'leaf';
      }
      if (themes.includes('crit') && s.shape !== 'rift') s.shape = 'serrated';
      return sword(s);
    }
    case 'axe': {
      const s = { ...spec.spec };
      if (color !== null && main !== 'crit') {
        s.headColors = tintTones(s.headColors, color, k);
        if (rarity !== 'normal') s.edgeColor = color;
      }
      if (themes.includes('brutal')) {
        s.size *= 1.18;
        s.spike = true;
      }
      if (themes.includes('speed')) {
        s.size *= 0.88;
        s.haft *= 1.06;
      }
      if (themes.includes('crit')) {
        s.spike = true;
        s.edgeColor = 0xfff0b0;
      }
      return axeSpec(s);
    }
    case 'bow': {
      const s = { ...spec.spec };
      if (color !== null && main !== 'crit') {
        s.colors = tintTones(s.colors, color, k * 0.8);
        s.string = color;
        if (runes) {
          s.tips = 'orb';
          s.tipColors = [accent ?? color];
        }
      }
      if (themes.includes('brutal')) s.thickness *= 1.2;
      if (themes.includes('speed')) s.recurve = (s.recurve ?? 0) + 1;
      if (themes.includes('crit')) {
        s.tips = 'blade';
        s.tipColors = SILVER;
      }
      return bowSpec(s);
    }
    case 'staff': {
      const s = { ...spec.spec };
      if (color !== null && main !== 'crit') {
        s.focus = color;
        s.metal = tintTones(s.metal, color, k * 0.8);
        s.shaft = tintTones(s.shaft, color, k * 0.35);
        const head = main ? STAFF_HEAD[main] : undefined;
        if (rarity !== 'normal' && head) s.head = head;
        if (runes) s.bands = true;
      }
      if (themes.includes('crit') && !s.focus) s.focus = THEMES.crit.color;
      if (themes.includes('speed')) s.length *= 1.04;
      if (themes.includes('brutal')) s.bands = true;
      return staffSpec(s);
    }
  }
}

/** 基底 + 詞綴主題的造型（主題色光芒；同一組合只建一次） */
export function themedLook(kind: WeaponType, tier: number, rarity: Rarity, themes: readonly GearTheme[]): WeaponLook {
  if (rarity === 'normal' || themes.length === 0) return tierLook(kind, tier);
  const key = `${kind}:${tier}:${rarity}:${themes.join(',')}`;
  let look = cache.get(key);
  if (!look) {
    const list = TIERS[kind];
    const spec = themedSpec(list[Math.min(list.length, Math.max(1, tier)) - 1]!, rarity, themes);
    const { main } = themeColors(themes);
    const style = THEMES[main ?? themes[0]!];
    look = { ...build(spec), glow: { color: style.color, particle: style.particle } };
    cache.set(key, look);
  }
  return look;
}

/** 裝備中的武器 → 手上的造型與光芒的稀有度；沒有武器時為 null */
export function weaponLookFor(item: ItemInstance | undefined, data: Pick<DataRegistry, 'items' | 'affixes' | 'legendaries'>): { look: WeaponLook; rarity: Rarity } | null {
  if (!item || !data.items.has(item.baseId)) return null;
  const base = data.items.get(item.baseId);
  if (!base.weaponType) return null;
  const look = (item.legendaryId && uniqueLook(item.legendaryId)) || themedLook(base.weaponType, base.tier ?? 1, item.rarity, itemThemes(item, data));
  return { look, rarity: item.rarity };
}
