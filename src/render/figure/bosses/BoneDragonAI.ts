import { aiFigure, I3, type AiMonsterData } from '../AiRig';
import { grounded, type FigureModel, type Joint, type PartDef, type Pose, type PoseSet } from '../FigureModel';
import type { V3 } from '../Poly3D';
import DATA from './boneDragonAI.json';

/**
 * 隱藏魔王「骨龍」（AI 版）：怨念把士兵與騎士的骨頭、盔甲拼成的怪物，身體就是一張巨口。
 * 設計稿 → ChatGPT 四視圖 → TRELLIS，由 scripts/monster_ai.py 減面、接骨架（art/monsters/bone_dragon）。
 * 骨架：上顎（head）掛在背上、下顎（jaw）掛在骨盆，張嘴閉嘴是這兩根骨頭；肩背兩側各兩根四節的觸手（ex_tentA? 上、ex_tentB? 下）；
 * 前腳 thigh / shin / foot / ex_toe、後腳 ex_hthigh / ex_hshin / ex_hfoot / ex_htoe。
 * 模型本身就是站好、嘴張開的姿勢，所以不轉正：所有角度為 0 就是模型的樣子。
 *
 * 兩種屬性每次出現時隨機抽：貼圖裡亮橘色的區塊（眼睛、嘴裡、觸手的小嘴）是第一屬性，
 * 青藍色的區塊（背脊裂縫、觸手與腳的關節縫）是第二屬性，依顏色換成抽到的屬性（boneDragonLook）。
 */

const data = DATA as unknown as AiMonsterData;

/** 公尺 → 遊戲單位 */
const SCALE = 85;
const hipHeight = (data.joints.root![1]! - Math.min(...data.verts.map((v) => v[1]!))) * SCALE;

type Key = Partial<Record<Joint, V3>>;
const pose = (angles: Key, rootY = 0, rootZ = 0): Pose => ({ rootY, rootZ, angles });
const SIDES: readonly ['L' | 'R', number][] = [['L', 1], ['R', -1]];

/** 觸手蠕動：每節依序延遲，上下兩根、左右兩邊錯開；amp = 擺動幅度 */
function writhe(t: number, amp: number): Key {
  const out: Key = {};
  for (const [s, m] of SIDES) {
    for (const [row, offset] of [['A', 0], ['B', 1.7]] as const) {
      for (let i = 1; i <= 4; i++) {
        const ph = t - i * 0.75 + offset + (m > 0 ? 0 : 2.4);
        out[`ex_tent${row}${s}${i}`] = [0.05 * amp * Math.sin(ph * 0.8), m * 0.13 * amp * Math.cos(ph * 0.9), m * 0.16 * amp * Math.sin(ph)];
      }
    }
  }
  return out;
}

/** 所有觸手同時擺成一個角度（節數越後面角度越大，往外彎）；y：往後為正（左邊）；z：往上為正（左邊） */
function tents(y: number, z: number, rows: readonly ('A' | 'B')[] = ['A', 'B'], only?: 'L' | 'R'): Key {
  const out: Key = {};
  for (const [s, m] of SIDES) {
    if (only && only !== s) continue;
    for (const row of rows) {
      for (let i = 1; i <= 4; i++) out[`ex_tent${row}${s}${i}`] = [0, m * y * (0.15 + i * 0.1), m * z * (0.15 + i * 0.1)];
    }
  }
  return out;
}

/** 沉重的對角步伐：左前配右後、右前配左後；s = 這一步的擺動，lift = 抬腳 */
function gait(phase: number, amp: number): Pose {
  const s = Math.sin(phase);
  const liftA = Math.max(0, Math.cos(phase));
  const liftB = Math.max(0, -Math.cos(phase));
  const bend = (x: number): V3 => [x, 0, 0];
  const leg = (front: 'L' | 'R', sway: number, lift: number): Key => ({
    [`thigh${front}`]: bend(-0.34 * sway * amp - 0.12 * lift * amp),
    [`shin${front}`]: bend(0.42 * lift * amp),
    [`foot${front}`]: bend(-0.25 * lift * amp),
  });
  const hind = (back: 'L' | 'R', sway: number, lift: number): Key => ({
    [`ex_hthigh${back}`]: bend(-0.3 * sway * amp - 0.1 * lift * amp),
    [`ex_hshin${back}`]: bend(0.38 * lift * amp),
    [`ex_hfoot${back}`]: bend(-0.22 * lift * amp),
  });
  const chew = 0.05 * amp * Math.abs(Math.cos(phase));
  return pose(
    {
      root: [0.015 * amp, 0.05 * s * amp, 0.05 * s * amp],
      torso: [0, -0.03 * s * amp, -0.03 * s * amp],
      head: [-0.05 - chew, 0.05 * s * amp, 0],
      jaw: [0.05 + chew, 0.04 * s * amp, 0],
      ...writhe(phase * 0.8, 1 + amp * 0.5),
      ...leg('L', s, liftA),
      ...hind('R', s, liftA),
      ...leg('R', -s, liftB),
      ...hind('L', -s, liftB),
    },
    -0.8 * amp + 0.8 * amp * Math.abs(Math.cos(phase)),
  );
}

/**
 * 巨口全開：上下顎張成約 90 度、兩邊差不多長，整個身體幾乎變成一個直角。
 * 模型原本張開約 34 度；上顎沿著腰、胸、上顎一路往上轉，下顎往下轉，身體前端抬起讓下顎不會插進地板，前後腳反轉回來踩住地面。
 */
const MAW_OPEN: Key = {
  root: [-0.2, 0, 0],
  torso: [-0.04, 0, 0],
  chest: [-0.1, 0, 0],
  head: [-0.35, 0, 0],
  jaw: [0.49, 0, 0],
  thighL: [0.2, 0, 0],
  thighR: [0.2, 0, 0],
  ex_hthighL: [0.2, 0, 0],
  ex_hthighR: [0.2, 0, 0],
  ...tents(0.1, 0.45),
};

/** 巨口咬：往後縮、嘴張到最大 → 整個身體撲出去，上下顎用力合起來 */
const BITE = {
  windup: [
    pose({ root: [-0.05, 0, 0], head: [-0.2, 0, 0], jaw: [0.2, 0, 0], ...tents(0.1, 0.15) }, 0.5, -1),
    pose(MAW_OPEN, 1, -2.2),
  ],
  strike: [
    pose({ root: [0.1, 0, 0], head: [0.3, 0, 0], jaw: [-0.32, 0, 0], ...tents(-0.2, -0.1), thighL: [-0.2, 0, 0], thighR: [-0.2, 0, 0] }, -2, 7),
    pose({ root: [0.08, 0, 0], head: [0.24, 0, 0], jaw: [-0.26, 0, 0], ...tents(-0.15, -0.05) }, -1.6, 5.5),
  ],
};
/** 觸手橫掃：上面兩根往後拉 → 往前掃過去，身體跟著扭 */
const SWEEP = {
  windup: [pose({ root: [0, 0.14, 0], head: [-0.08, 0.1, 0], jaw: [0.08, 0.1, 0], ...tents(0.45, 0.2, ['A']) }, 0.3, -0.5), pose({ root: [0, 0.24, 0], head: [-0.12, 0.14, 0], jaw: [0.1, 0.14, 0], ...tents(0.7, 0.3, ['A']) }, 0.5, -1)],
  strike: [pose({ root: [0.03, -0.24, 0], head: [-0.1, -0.16, 0], jaw: [0.1, -0.16, 0], ...tents(-0.75, -0.12, ['A']) }, -0.8, 2.5), pose({ root: [0.03, -0.28, 0], head: [-0.08, -0.16, 0], jaw: [0.08, -0.16, 0], ...tents(-0.85, -0.16, ['A']) }, -0.8, 2.2)],
};
/** 觸手突刺：下面兩根抬起往後 → 往前刺出去 */
const STAB = {
  windup: [pose({ head: [-0.08, 0, 0], jaw: [0.08, 0, 0], ...tents(0.3, 0.3, ['B']) }, 0.5, -0.8), pose({ head: [-0.12, 0, 0], jaw: [0.1, 0, 0], ...tents(0.55, 0.45, ['B']) }, 0.7, -1.5)],
  strike: [pose({ root: [0.05, 0, 0], head: [-0.1, 0, 0], jaw: [0.1, 0, 0], ...tents(-0.9, 0.02, ['B']) }, -0.8, 4), pose({ root: [0.04, 0, 0], head: [-0.08, 0, 0], jaw: [0.08, 0, 0], ...tents(-0.8, 0, ['B']) }, -0.6, 3.4)],
};

function poses(parts: readonly PartDef[]): PoseSet {
  const onGround = (angles: Key, rootZ = 0): Pose => grounded(parts, hipHeight, { rootY: 0, rootZ, angles }, 'all');
  const legsFold = (k: number): Key => ({
    thighL: [-0.6 * k, 0, 0.15 * k], thighR: [-0.6 * k, 0, -0.15 * k], shinL: [1.1 * k, 0, 0], shinR: [1.1 * k, 0, 0], footL: [-0.5 * k, 0, 0], footR: [-0.5 * k, 0, 0],
    ex_hthighL: [-0.55 * k, 0, 0.15 * k], ex_hthighR: [-0.55 * k, 0, -0.15 * k], ex_hshinL: [k, 0, 0], ex_hshinR: [k, 0, 0], ex_hfootL: [-0.45 * k, 0, 0], ex_hfootR: [-0.45 * k, 0, 0],
  });
  const deathKeys = [
    pose({ root: [-0.1, 0.06, 0], head: [-0.4, 0, 0], jaw: [0.3, 0, 0], ...tents(0.2, 0.5) }, 1, -1),
    onGround({ root: [0.08, 0.05, 0.03], head: [-0.1, 0, 0], jaw: [0.15, 0, 0], ...legsFold(0.55), ...tents(0, -0.35) }, 1),
    onGround({ root: [0.03, 0.08, 0.05], head: [0.1, 0.05, 0], jaw: [-0.02, 0, 0], ...legsFold(1), ...tents(0.1, -0.8) }, 1.5),
  ];
  return {
    // 嘴慢慢開合、觸手不停蠕動
    ready: (t) =>
      pose(
        {
          chest: [0.015 * Math.sin(t * 0.9), 0.015 * Math.sin(t * 0.4), 0],
          head: [-0.04 - 0.04 * Math.sin(t * 0.9), 0.03 * Math.sin(t * 0.4), 0],
          jaw: [0.03 + 0.04 * Math.sin(t * 0.9), 0.02 * Math.sin(t * 0.4), 0],
          ...writhe(t * 1.3, 1),
        },
        0.3 * Math.sin(t * 0.9),
      ),
    walk: (phase) => gait(phase, 1),
    run: (phase) => gait(phase, 1.25),
    attackWindup: BITE.windup[1]!,
    attackStrike: BITE.strike[0]!,
    attackChain: BITE,
    attackVariants: { overhead: BITE, slash: SWEEP, thrust: STAB },
    // 施法：巨口全開、觸手朝天 → 往前吐
    castWindup: pose(MAW_OPEN, 1, -1.5),
    castRelease: pose({ root: [0.1, 0, 0], head: [-0.26, 0, 0], jaw: [0.28, 0, 0], ...tents(-0.55, 0.05) }, -1.6, 3),
    hit: pose({ root: [-0.05, 0, 0.02], head: [-0.2, 0, 0], jaw: [0.14, 0, 0], ...tents(0.1, 0.2) }, 0.2, -1),
    hitKeys: [pose({ head: [-0.2, 0, 0], jaw: [0.14, 0, 0] }), pose({ root: [-0.05, 0, 0.02], head: [-0.2, 0, 0], jaw: [0.14, 0, 0], ...tents(0.1, 0.2) }, 0.2, -1), pose({ root: [-0.02, 0, 0], ...tents(0.04, 0.08) }, -0.2, -0.5)],
    dead: deathKeys[2]!,
    deathKeys,
  };
}

export type GlowElement = 'fire' | 'cold' | 'lightning' | 'poison';
/** 各屬性發光的顏色（亮部；暗的面依亮度縮放） */
const GLOW: Record<GlowElement, number> = { fire: 0xff6a14, cold: 0x6cc8f8, lightning: 0xb070ff, poison: 0x6ce030 };

/**
 * 面屬於哪個發光區塊：1 = 第一屬性（眼睛、嘴裡、觸手的小嘴）、2 = 第二屬性（青藍色的縫）、0 = 不發光；回傳 [區塊, 亮度]。
 * 顏色分不開的地方看位置：眼睛和金邊都是黃橘色、喉嚨是暗紅棕色，所以只在這些部位內才放寬顏色的判斷（x、y、z 是面的中心，公尺、遊戲軸向）。
 */
function glowKind(c: number, x: number, y: number, z: number): [number, number] {
  const r = (c >> 16) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return [0, max];
  const hue = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  const sat = d / max;
  const ax = Math.abs(x);
  if (hue > 165 && hue < 215 && sat > 0.3 && max > 0.3) return [2, max];
  if (hue < 30 && sat > 0.7 && max > 0.6) return [1, max];
  // 嘴裡：暖色、彩度夠的面（牙齒與骨手彩度低，不會被換）
  const inMouth = ax < 0.2 && z > 0.02 && y > -0.13 && y < 0.1;
  if (inMouth && hue < 42 && sat > 0.45) return [1, max];
  // 眼睛：上顎前緣左右各兩顆，中間的金色尖吻不算
  const inEyes = ax > 0.025 && ax < 0.16 && y > 0.13 && y < 0.23 && z > 0.18;
  if (inEyes && hue < 48 && sat > 0.55 && max > 0.55) return [1, max];
  // 觸手的小嘴
  if (ax > 0.4 && hue < 42 && sat > 0.5) return [1, max];
  return [0, max];
}

const shade = (c: number, k: number): number => {
  const ch = (s: number) => Math.round(Math.min(255, ((c >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** 依抽到的兩種屬性換色：第一屬性是眼睛、嘴裡、小嘴；第二屬性是裂縫與關節縫 */
export function boneDragonLook(first: GlowElement, second: GlowElement): FigureModel {
  const faces = data.faces.map((f) => {
    const center = [0, 1, 2].map((k) => (data.verts[f[0]!]![k]! + data.verts[f[1]!]![k]! + data.verts[f[2]!]![k]!) / 3);
    const [kind, value] = glowKind(f[3]!, center[0]!, center[1]!, center[2]!);
    return kind === 0 ? f : [f[0]!, f[1]!, f[2]!, shade(GLOW[kind === 1 ? first : second], Math.min(1.1, value * 1.15))];
  });
  const { parts, skin } = aiFigure({ ...data, faces }, { scale: SCALE }, () => I3);
  return {
    hipHeight,
    referenceRadius: 0.5,
    // 和結晶獸差不多高（女主角 ×2.26～2.5）；npm run docs:models 的 manifest 量得到
    visualScale: 2.77,
    parts,
    poses: poses(parts),
    skin,
    gaitRate: 0.5,
    dynamicShadow: true,
    softLight: true,
    rimLight: 0.2,
  };
}

export const BONE_DRAGON = boneDragonLook('fire', 'cold');
/** 巨口全開的姿勢（檢查用） */
export const BONE_DRAGON_MAW_OPEN = pose(MAW_OPEN, 1, 0);
