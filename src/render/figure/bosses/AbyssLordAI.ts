import { aiFigure, aiPoints, alignDown, I3, sub, type AiMonsterData } from '../AiRig';
import type { FigureModel } from '../FigureModel';
import { rotY, type M3 } from '../Poly3D';
import { ABYSS_LORD_ROAR, ABYSS_LORD_SECONDARY, ABYSS_LORD_STYLE } from './AbyssLord';
import { bossPoses } from './BossPoses';
import { BOSS_HIP, bossSecondary } from './BossRig';
import DATA from './abyssLordAI.json';

/**
 * 30F 深淵魔王（AI 版，深淵分身共用）：設計者給的造型圖 → ChatGPT 白底四視圖 → 微軟 TRELLIS 生成，
 * 由 scripts/monster_ai.py 減面、接上骨架、算好權重，輸出 abyssLordAI.json（每個三角形一個顏色）。
 *
 * 關節名稱與魔王的人形骨架（BossRig）相同，動作沿用舊版（ABYSS_LORD_STYLE：厚重的步伐、爪擊、仰天怒吼時翅膀張開、尾巴甩動）。
 * - 手臂、腿、尾巴在遊戲的靜止姿勢是筆直往下，所以轉正（只轉方向、不改形狀）；尾巴由動作抬到身後。
 * - 翅膀：舊版動作平時把翅膀往前轉 0.3 弧度（程式畫的翅膀往後長），AI 的翅膀本來就往兩側展開，
 *   所以先往後轉 0.3 抵銷，待機時回到 AI 模型的角度；翼肘之外的四根翼指（ex_wing?3～6）跟著翼肘一起動。
 * 單位：骨盆高度與其他魔王相同（BOSS_HIP），其餘依 AI 模型的比例。
 */

const data = DATA as AiMonsterData;
const { J, TIP } = aiPoints(data);

/** 翅膀往後轉的角度（抵銷動作平時的往前轉） */
const WING_BACK = 0.3;

/** 各關節轉正的旋轉：四肢與尾巴轉成往下、翅膀往後轉，其餘不轉 */
function rotOf(j: string): M3 {
  const limb = /^(upperArm|forearm|hand|ex_fingers|thigh|shin|foot|ex_toe)([LR])$/.exec(j);
  if (limb) {
    const s = limb[2]!;
    if (limb[1] === 'upperArm') return alignDown(sub(J(`forearm${s}`), J(`upperArm${s}`)));
    if (limb[1] === 'thigh') return alignDown(sub(J(`shin${s}`), J(`thigh${s}`)));
    if (/^(forearm|hand|ex_fingers)$/.test(limb[1]!)) return alignDown(sub(J(`hand${s}`), J(`forearm${s}`)));
    return alignDown(sub(J(`foot${s}`), J(`shin${s}`)));
  }
  const tail = /^ex_tail(\d)$/.exec(j);
  if (tail) return alignDown(sub(TIP(j), J(j)));
  const wing = /^ex_wing([LR])\d$/.exec(j);
  if (wing) return rotY((wing[1] === 'L' ? 1 : -1) * WING_BACK);
  return I3;
}

const { parts, skin } = aiFigure(data, { hip: BOSS_HIP }, rotOf);

export const ABYSS_LORD: FigureModel = {
  hipHeight: BOSS_HIP,
  referenceRadius: 0.5,
  parts,
  idleRoar: ABYSS_LORD_ROAR,
  poses: bossPoses(parts, ABYSS_LORD_STYLE),
  skin,
  secondary: bossSecondary(parts, ABYSS_LORD_SECONDARY),
  gaitRate: 0.6,
  dynamicShadow: true,
  softLight: true,
  rimLight: 0.2,
};
