import type { FigureModel, PartDef } from './FigureModel';
import { stretchMeshes } from './Poly3D';
import { backCloth, bootCuff, bootFoot, bootShin, bracer, chestArmor, frontCloth, pauldron, pelvisArmor } from './heroine/HeroineArmor';
import { BOOT_STRETCH, FOREARM_LENGTH, HEAD_SCALE, heroineChest, heroineForearm, heroineHand, heroineHead, heroineNeck, heroineThigh, heroineUpperArm, heroineWaist, scaleHead, SHIN_LENGTH, THIGH_LENGTH, UPPER_ARM_LENGTH } from './heroine/HeroineBody';
import { heroineHairOnHead, ponytailRoot, ponytailSegment, ponytailTip } from './heroine/HeroineHair';
import { LEATHER_DARK } from './heroine/HeroinePalette';
import { heroinePoses } from './heroine/HeroinePose';
import { heroineSword, SWORD_TIP } from './heroine/HeroineWeapon';

/**
 * 女主角（暗黑奇幻、多切面 low-poly 的女劍士，約 7.3 頭身，長腿；照設定圖）：
 * 深緋紅的蓬鬆高馬尾（垂到腰）與側分長瀏海、米白平口短上衣、兩肩收成 V 字的皮帶與金環、胸下束腰皮帶、
 * 兩條腰帶（金扣）與兩側小腰包、左後腰短劍、暗紅長腰布、深藍灰短裙、藍灰鋼肩甲、護腕、
 * 有鋼護膝與脛甲的棕色長靴、右手單手長劍。
 *
 * 主角是畫面焦點：圓形截面的邊數、球體分段約為怪物的兩倍（更細的切面）。
 *
 * 零件與姿勢分在 heroine/ 目錄：Palette（色階）、Body（身體）、Hair（頭髮）、
 * Armor（皮甲與配件）、Weapon（劍）、Pose（站姿與動畫）；繪製由 PolyFigure 負責。
 */

/** 骨盆高度 = 髖關節下移 1.4 + 大腿 + 小腿 + 腳踝到地面 0.8 */
const HIP = 1.4 + THIGH_LENGTH + SHIN_LENGTH + 0.8;

const arm = (side: 1 | -1): PartDef[] => {
  const s = side === 1 ? 'L' : 'R';
  return [
    { joint: `upperArm${s}`, parent: 'chest', offset: [5.9 * side, 9, -0.3], meshes: [...heroineUpperArm(side === 1 ? 1 : 2), ...pauldron(side)] },
    { joint: `forearm${s}`, parent: `upperArm${s}`, offset: [0, -UPPER_ARM_LENGTH, 0], meshes: [...heroineForearm(side === 1 ? 3 : 4), ...bracer(side)] },
    { joint: `hand${s}`, parent: `forearm${s}`, offset: [0, -FOREARM_LENGTH, 0], meshes: heroineHand(side === -1, LEATHER_DARK) },
  ];
};

const leg = (side: 1 | -1): PartDef[] => {
  const s = side === 1 ? 'L' : 'R';
  return [
    { joint: `thigh${s}`, parent: 'root', offset: [3.3 * side, -1.4, 0.2], meshes: [...heroineThigh(side === 1 ? 1 : 2), ...bootCuff()] },
    { joint: `shin${s}`, parent: `thigh${s}`, offset: [0, -THIGH_LENGTH, 0], meshes: stretchMeshes(bootShin(), [1, BOOT_STRETCH, 1]) },
    { joint: `foot${s}`, parent: `shin${s}`, offset: [0, -SHIN_LENGTH, 0], meshes: bootFoot() },
  ];
};

const PARTS: PartDef[] = [
  { joint: 'root', parent: null, offset: [0, 0, 0], meshes: pelvisArmor() },
  { joint: 'cloth', parent: 'root', offset: [0, 2.4, 0], meshes: frontCloth() },
  { joint: 'clothBack', parent: 'root', offset: [0, 2.4, 0], meshes: backCloth() },
  { joint: 'torso', parent: 'root', offset: [0, 3.4, -0.2], meshes: heroineWaist() },
  { joint: 'chest', parent: 'torso', offset: [0, 6.2, 0], meshes: [...heroineChest(), ...chestArmor()] },
  { joint: 'neck', parent: 'chest', offset: [0, 10.4, -0.4], meshes: heroineNeck() },
  { joint: 'head', parent: 'neck', offset: [0, 2.7, 0.3], meshes: scaleHead([...heroineHead(), ...heroineHairOnHead()]) },
  { joint: 'ponytail', parent: 'head', offset: [0, 8.8 * HEAD_SCALE, -4.2 * HEAD_SCALE], meshes: ponytailRoot() },
  // 馬尾垂到腰：三段 7 長 + 尖端
  { joint: 'ponytail2', parent: 'ponytail', offset: [0, -6, 0], meshes: ponytailSegment(2.5, 2.9, 2.3, 7, 4) },
  { joint: 'ponytail3', parent: 'ponytail2', offset: [0, -7, 0], meshes: ponytailSegment(2.3, 2.5, 2.1, 7, 5) },
  { joint: 'ponytail4', parent: 'ponytail3', offset: [0, -7, 0], meshes: ponytailTip() },
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
  // 主角用三階色塊（卡通）光影：臉與皮膚乾淨、與怪物的逐面光影區隔
  lighting: 'toon',
  secondary: {
    // 馬尾：越往尾端越慢（延遲越大）；前兩段不可往前穿過頭、後兩段不可往前穿過身體
    ponytail: { rate: 28, gravity: 0.25, clampTo: 'head', maxZ: -0.55 },
    ponytail2: { rate: 14, gravity: 0.45, clampTo: 'chest', maxZ: -0.1 },
    ponytail3: { rate: 9, gravity: 0.55, clampTo: 'chest', maxZ: 0.1 },
    ponytail4: { rate: 6, gravity: 0.6, clampTo: 'chest', maxZ: 0.2 },
    cloth: { rate: 14, gravity: 0.4 },
    clothBack: { rate: 10, gravity: 0.4 },
  },
};
