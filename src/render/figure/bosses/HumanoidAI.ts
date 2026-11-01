import { aiFigure, aiPoints, alignDown, I3, sub, type AiMonsterData } from '../AiRig';
import type { FigureModel, Joint, Pose } from '../FigureModel';
import { apply, jointRotation, type M3, type Mesh, type V3 } from '../Poly3D';
import { darkGreatsword, greatMace, towerShield } from './ArmoredBosses';
import { bossPoses, mapPoses, type BossStyle } from './BossPoses';
import { BOSS_HIP, bossSecondary } from './BossRig';
import { priestStaff } from './RobedBosses';
import CRYPT from './cryptGuardianAI.json';
import KNIGHT from './fallenKnightAI.json';
import PRIEST from './fallenPriestAI.json';
import LAVA from './lavaBehemothAI.json';

/**
 * AI 版的人形魔王（5F 墓穴守衛、10F 墮落神官、15F 熔岩巨獸、20F 墮落騎士）：
 * 舊版模型截圖 → ChatGPT 設計稿與白底四視圖（空手）→ 微軟 TRELLIS，由 scripts/monster_ai.py 減面、接上骨架、算好權重，每個三角形一個顏色。
 *
 * 關節名稱與魔王的人形骨架（BossRig）相同，動作沿用舊版（bossPoses）：四肢在遊戲的靜止姿勢是筆直往下，所以轉正（只轉方向、不改形狀）。
 * 披風、腰布、長袍下擺是獨立的骨頭，由次級運動延遲擺動。
 * 武器暫時用舊版程式畫的（依 AI 模型的比例放大）；AI 生成的武器品質還不夠。
 * 武器握在拳心、與手臂垂直（grip）：舊版的動作是武器順著手的延長線，這裡把手的角度換算成「手腕 + 武器在拳心轉動」，揮的方向不變。
 * 單位：骨盆高度與其他魔王相同（BOSS_HIP），其餘依 AI 模型的比例。
 */

function scaled(meshes: Mesh[], k: number): Mesh[] {
  return meshes.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0] * k, v[1] * k, v[2] * k]) }));
}

/** 武器沿 -Y（舊版）→ 與手臂垂直：武器角度為 0 時握把穿過拳心，武器尖端（錘頭、劍尖）朝手的 +Z（T 字與手臂下垂時都水平朝前） */
const TO_GRIP = jointRotation([-Math.PI / 2, 0, 0]);
const gripped = (v: V3): V3 => apply(TO_GRIP, v);
const grip = (meshes: Mesh[]): Mesh[] => meshes.map((m) => ({ ...m, verts: m.verts.map(gripped) }));
/** 法杖相反：舊版的杖頭在 +Y，轉成杖頭朝手的 +Z */
const TO_STAFF_GRIP = jointRotation([Math.PI / 2, 0, 0]);
const gripStaff = (meshes: Mesh[]): Mesh[] => meshes.map((m) => ({ ...m, verts: m.verts.map((v) => apply(TO_STAFF_GRIP, v)) }));

/**
 * 舊版塔盾的盾面朝手的 +X、長邊順著手的 Z → 盾面朝手的 -Y（前臂往前平舉時盾面朝前）、長邊不變；
 * 拳頭握在盾牌正中央，盾的背面在拳頭前方 back 的距離。
 */
function centerGrip(meshes: Mesh[], back: number): Mesh[] {
  const turned = meshes.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[1], -v[0], v[2]]) }));
  const all = turned.flatMap((m) => m.verts);
  const mid = (k: number) => (Math.min(...all.map((v) => v[k]!)) + Math.max(...all.map((v) => v[k]!))) / 2;
  const [cx, cz, top] = [mid(0), mid(2), Math.max(...all.map((v) => v[1]))];
  return turned.map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[0] - cx, v[1] - top - back, v[2] - cz]) }));
}

/** 手腕彎曲的上限（弧度），其餘由武器在拳心轉動 */
const WRIST_MAX = 0.7;

/**
 * 舊版動作：手的角度 h 讓武器（順著手的 -Y）指向要揮的方向。武器改成與手臂垂直後，
 * 要指向同一個方向，手腕 + 武器的角度總和是 h + turn（武器 π/2、法杖 −π/2）；手腕只彎一部分，其餘是武器在拳心轉動。
 */
function gripPose(pose: Pose, hand: Joint, weapon: Joint, turn: number): Pose {
  const h = pose.angles[hand] ?? [0, 0, 0];
  const raw = h[0] + turn;
  const total = Math.atan2(Math.sin(raw), Math.cos(raw));
  const wrist = Math.max(-WRIST_MAX, Math.min(WRIST_MAX, total));
  const w = pose.angles[weapon] ?? [0, 0, 0];
  return { ...pose, angles: { ...pose.angles, [hand]: [wrist, h[1], h[2]], [weapon]: [w[0] + total - wrist, w[1], w[2]] } };
}

interface Options {
  style: BossStyle;
  gaitRate: number;
  /** 右手的武器、左手的副手：關節的區域座標（握點在原點） */
  weapon?: Mesh[];
  weaponL?: Mesh[];
  /** 哪隻手的武器握在拳心、與手臂垂直（塔盾不用） */
  gripped?: { hand: Joint; weapon: Joint; turn: number };
  weaponTip?: V3;
  secondary?: NonNullable<FigureModel['secondary']>;
}

function humanoidAi(json: unknown, o: Options): FigureModel {
  const data = json as AiMonsterData;
  const { J } = aiPoints(data);
  const rotOf = (j: string): M3 => {
    const limb = /^(upperArm|forearm|hand|ex_fingers|thigh|shin|foot|ex_toe)([LR])$/.exec(j);
    if (!limb) return I3;
    const s = limb[2]!;
    if (limb[1] === 'upperArm') return alignDown(sub(J(`forearm${s}`), J(`upperArm${s}`)));
    if (limb[1] === 'thigh') return alignDown(sub(J(`shin${s}`), J(`thigh${s}`)));
    if (limb[1] === 'shin' || limb[1] === 'foot' || limb[1] === 'ex_toe') return alignDown(sub(J(`foot${s}`), J(`shin${s}`)));
    return alignDown(sub(J(`hand${s}`), J(`forearm${s}`)));
  };
  const { parts, skin } = aiFigure(data, { hip: BOSS_HIP }, rotOf);
  // 動作的貼地計算不算武器（否則錘頭、杖尾先碰地，身體被抬高）
  const base = bossPoses([...parts], o.style);
  const held = o.gripped;
  const poses = held ? mapPoses(base, (p) => gripPose(p, held.hand, held.weapon, held.turn)) : base;
  // 握點：拳頭中間
  const palm = Math.hypot(...parts.find((p) => p.joint === 'ex_fingersR')!.offset) * 0.6;
  if (o.weapon) parts.push({ joint: 'weapon', parent: 'handR', offset: [0, -palm, 0], meshes: o.weapon });
  if (o.weaponL) parts.push({ joint: 'weaponL', parent: 'handL', offset: [0, -palm, 0], meshes: o.weaponL });
  return {
    hipHeight: BOSS_HIP,
    referenceRadius: 0.5,
    parts,
    poses,
    skin,
    secondary: bossSecondary(parts, o.secondary),
    gaitRate: o.gaitRate,
    dynamicShadow: true,
    softLight: true,
    rimLight: 0.2,
    ...(o.weaponTip ? { weaponJoint: 'weapon' as const, weaponTip: o.weaponTip } : {}),
  };
}

const CRYPT_WEAPON_SCALE = 1.35;
/** 塔盾的背面離拳心的距離 */
const SHIELD_BACK = 3;
const KNIGHT_WEAPON_SCALE = 1.4;
const PRIEST_STAFF_SCALE = 1.25;

export const CRYPT_GUARDIAN = humanoidAi(CRYPT, {
  style: { weapon: 'mace', cast: 'roar' },
  gaitRate: 0.62,
  weapon: grip(scaled(greatMace(), CRYPT_WEAPON_SCALE)),
  weaponL: centerGrip(scaled(towerShield(), CRYPT_WEAPON_SCALE), SHIELD_BACK),
  gripped: { hand: 'handR', weapon: 'weapon', turn: Math.PI / 2 },
});

export const FALLEN_PRIEST = humanoidAi(PRIEST, {
  style: { weapon: 'staff', cast: 'staff' },
  gaitRate: 0.7,
  weaponL: gripStaff(scaled(priestStaff(), PRIEST_STAFF_SCALE)),
  gripped: { hand: 'handL', weapon: 'weaponL', turn: -Math.PI / 2 },
});

export const LAVA_BEHEMOTH = humanoidAi(LAVA, {
  style: { weapon: 'fists', hunch: 0.12, cast: 'roar' },
  gaitRate: 0.52,
});

export const FALLEN_KNIGHT = humanoidAi(KNIGHT, {
  style: { weapon: 'greatsword', cast: 'roar' },
  gaitRate: 0.68,
  // 劍刃的寬度順著前臂（劍鋒在手臂的方向上），舊版的劍面朝前：先繞劍身轉 90°
  weapon: grip(scaled(darkGreatsword(), KNIGHT_WEAPON_SCALE).map((m) => ({ ...m, verts: m.verts.map((v): V3 => [v[2], v[1], -v[0]]) }))),
  gripped: { hand: 'handR', weapon: 'weapon', turn: Math.PI / 2 },
  weaponTip: gripped([0, -37 * KNIGHT_WEAPON_SCALE, 0]),
});
