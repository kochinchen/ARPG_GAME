import type { AxeOptions, BladeOptions, BowOptions, GuardShape, PommelShape, StaffOptions, Tones } from './WeaponParts';

/**
 * 武器造型參數與光芒的型別、寫法輔助（WeaponLooks 與 uniques/ 的各種類專屬造型共用）。
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

export interface SwordSpec extends Omit<BladeOptions, 'start'> {
  guard: GuardShape;
  guardWidth?: number;
  guardColors: Tones;
  pommel: PommelShape;
  grip?: Tones;
  gem?: number;
}

export type Spec = { kind: 'sword'; spec: SwordSpec } | { kind: 'axe'; spec: AxeOptions } | { kind: 'bow'; spec: BowOptions } | { kind: 'staff'; spec: StaffOptions };

export const sword = (spec: SwordSpec): Spec => ({ kind: 'sword', spec });
export const axeSpec = (spec: AxeOptions): Spec => ({ kind: 'axe', spec });
export const bowSpec = (spec: BowOptions): Spec => ({ kind: 'bow', spec });
export const staffSpec = (spec: StaffOptions): Spec => ({ kind: 'staff', spec });

/** 傳奇 / 神話武器的專屬造型與光芒 */
export interface UniqueWeapon {
  look: Spec;
  glow: WeaponGlowStyle;
}
