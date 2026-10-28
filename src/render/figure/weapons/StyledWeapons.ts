import { tone } from '../Facets';
import { prism, type Mesh, type V3 } from '../Poly3D';
import { chain, darken, edge, gem, GOLD, lighten, taper, type StaffOptions, type Tones } from './WeaponParts';

/**
 * 橘 / 紅專用的三種基本款（法杖；劍在 StyledSwords、斧在 StyledAxes、弓在 WeaponParts.bow）：設計稿 art/gear/staves_unique/concept。
 * beast = 獸材（骨節、皮繩與金屬箍、骨刺與爪）、elemental = 精工元素（銀白與金色、發光晶體與凹槽）、
 * demon = 魔王（黑鐵、整排尖刃倒刺、裂縫透光、發光核心）。座標與原本的劍 / 斧 / 杖相同（見 WeaponParts）。
 * badge：代表物件（Emblems）鑲的位置、大小與厚度。
 */
export type WeaponStyle = 'beast' | 'elemental' | 'demon';
export interface Badge {
  at: V3;
  size: number;
  depth: number;
  /** 符號在 Y-Z 平面的旋轉（斧、杖的頭在 -Y，轉半圈讓符號朝頭的方向立起） */
  rot: number;
}

export const glowTones = (c: number): Tones => [lighten(c, 0.45), c, darken(c, 0.25), lighten(c, 0.2)];
/** 套在 Y 軸上的一圈箍 */
export const ring = (y: number, r: number, h: number, c: Tones, seed = 0): Mesh => tone(prism(8, y + h / 2, y - h / 2, [r, r], [r, r], c[0]!), c, seed);
/** Y 軸上一段柄 */
export const rod = (y0: number, y1: number, r0: number, r1: number, c: Tones, seed = 0): Mesh => taper([0, y0, 0], [0, y1, 0], [r0, r0], [r1, r1], c, 6, seed, Math.PI / 6);
/** 符號的厚度倍率：片狀符號半厚 0.22，要比 half 厚一點才兩面都凸出來 */
export const depthFor = (half: number) => (half + 0.14) / 0.22;
