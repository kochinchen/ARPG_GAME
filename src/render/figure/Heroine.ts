import type { FigureModel, PartDef } from './FigureModel';
import { prism } from './Poly3D';
import { tone } from './Facets';
import { backCloth, bootCuff, bootFoot, bootShin, bracer, chestArmor, frontCloth, pauldron, pelvisArmor } from './heroine/HeroineArmor';
import { heroineChest, heroineForearm, heroineHand, heroineHead, heroineNeck, heroineThigh, heroineUpperArm, heroineWaist } from './heroine/HeroineBody';
import { heroineHairOnHead, ponytailRoot, ponytailSegment, ponytailTip, scarfTail, scarfWrap } from './heroine/HeroineHair';
import { LEATHER_DARK, SCARF } from './heroine/HeroinePalette';
import { heroinePoses } from './heroine/HeroinePose';
import { heroineSword, SWORD_TIP } from './heroine/HeroineWeapon';

/**
 * 女主角（暗黑奇幻、多切面 low-poly 的女劍士，約 6.3 頭身）：
 * 深紅棕高馬尾（紅髮帶、四段馬尾）、紅色短圍巾、白色內衣與棕色皮甲、斜背帶、腰帶與小腰包、
 * 紅色腰布、深色短褲與裙片、金屬肩甲、護腕、棕色長靴、右手單手長劍。
 *
 * 零件與姿勢分在 heroine/ 目錄：Palette（色階）、Body（身體）、Hair（頭髮與圍巾）、
 * Armor（皮甲與配件）、Weapon（劍）、Pose（站姿與動畫）；繪製由 PolyFigure 負責。
 */

const HIP = 27.8;

const arm = (side: 1 | -1): PartDef[] => {
  const s = side === 1 ? 'L' : 'R';
  return [
    { joint: `upperArm${s}`, parent: 'chest', offset: [5.9 * side, 9, -0.3], meshes: [...heroineUpperArm(side === 1 ? 1 : 2), ...pauldron(side)] },
    { joint: `forearm${s}`, parent: `upperArm${s}`, offset: [0, -10, 0], meshes: [...heroineForearm(side === 1 ? 3 : 4), ...bracer(side)] },
    { joint: `hand${s}`, parent: `forearm${s}`, offset: [0, -9, 0], meshes: heroineHand(side === -1, LEATHER_DARK) },
  ];
};

const leg = (side: 1 | -1): PartDef[] => {
  const s = side === 1 ? 'L' : 'R';
  return [
    { joint: `thigh${s}`, parent: 'root', offset: [3.1 * side, -1.4, 0.2], meshes: [...heroineThigh(side === 1 ? 1 : 2), ...bootCuff()] },
    { joint: `shin${s}`, parent: `thigh${s}`, offset: [0, -13, 0], meshes: bootShin() },
    { joint: `foot${s}`, parent: `shin${s}`, offset: [0, -12.6, 0], meshes: bootFoot() },
  ];
};

const PARTS: PartDef[] = [
  { joint: 'root', parent: null, offset: [0, 0, 0], meshes: pelvisArmor() },
  { joint: 'cloth', parent: 'root', offset: [0, 2.4, 0], meshes: frontCloth() },
  { joint: 'clothBack', parent: 'root', offset: [0, 2.4, 0], meshes: backCloth() },
  { joint: 'torso', parent: 'root', offset: [0, 3.4, -0.2], meshes: heroineWaist() },
  { joint: 'chest', parent: 'torso', offset: [0, 6.2, 0], meshes: [...heroineChest(), ...chestArmor(), ...scarfWrap()] },
  { joint: 'neck', parent: 'chest', offset: [0, 10.4, -0.4], meshes: heroineNeck() },
  { joint: 'head', parent: 'neck', offset: [0, 2.7, 0.3], meshes: [...heroineHead(), ...heroineHairOnHead()] },
  { joint: 'ponytail', parent: 'head', offset: [0, 8.8, -4.2], meshes: ponytailRoot() },
  { joint: 'ponytail2', parent: 'ponytail', offset: [0, -6, 0], meshes: [ponytailSegment(2.1, 2.4, 1.8, 6.5, 4)] },
  { joint: 'ponytail3', parent: 'ponytail2', offset: [0, -6.5, 0], meshes: [ponytailSegment(1.8, 1.9, 1.3, 6, 5)] },
  { joint: 'ponytail4', parent: 'ponytail3', offset: [0, -6, 0], meshes: ponytailTip() },
  { joint: 'scarfA', parent: 'chest', offset: [1.8, 10, -3.1], meshes: scarfTail(5.5, 1.4, 1.1, 1) },
  { joint: 'scarfA2', parent: 'scarfA', offset: [0, -5.5, 0], meshes: [tone(prism(4, 0.3, -4.5, [1.1, 0.3], [0.12, 0.2], SCARF[0]), SCARF, 2)] },
  { joint: 'scarfB', parent: 'chest', offset: [2.9, 10.2, -2.4], meshes: [tone(prism(4, 0.3, -6, [1.1, 0.3], [0.1, 0.2], SCARF[2]), SCARF, 3)] },
  ...arm(1),
  ...arm(-1),
  { joint: 'weapon', parent: 'handR', offset: [0, -2.3, 0.35], meshes: heroineSword() },
  // 左手握點（弓）：平常沒有東西，由 PolyFigure.setWeapon 放入
  { joint: 'weaponL', parent: 'handL', offset: [0, -2.3, 0.35], meshes: [] },
  ...leg(1),
  ...leg(-1),
];

export const HEROINE: FigureModel = {
  parts: PARTS,
  hipHeight: HIP,
  referenceRadius: 0.3,
  poses: heroinePoses(PARTS, HIP),
  weaponJoint: 'weapon',
  weaponTip: SWORD_TIP,
  dynamicShadow: true,
  rimLight: 0.2,
  softLight: true,
  secondary: {
    // 馬尾：越往尾端越慢（延遲越大）；前兩段不可往前穿過頭、後兩段不可往前穿過身體
    ponytail: { rate: 28, gravity: 0.25, clampTo: 'head', maxZ: -0.55 },
    ponytail2: { rate: 14, gravity: 0.45, clampTo: 'chest', maxZ: -0.1 },
    ponytail3: { rate: 9, gravity: 0.55, clampTo: 'chest', maxZ: 0.1 },
    ponytail4: { rate: 6, gravity: 0.6, clampTo: 'chest', maxZ: 0.2 },
    scarfA: { rate: 12, gravity: 0.4, clampTo: 'chest', maxZ: -0.2 },
    scarfA2: { rate: 8, gravity: 0.5 },
    scarfB: { rate: 10, gravity: 0.4, clampTo: 'chest', maxZ: -0.2 },
    cloth: { rate: 14, gravity: 0.4 },
    clothBack: { rate: 10, gravity: 0.4 },
  },
};
