import { aiFigure, aiPoints, alignDown, alignTo, I3, sub, type AiMonsterData } from '../AiRig';
import type { FigureModel } from '../FigureModel';
import { rotY, type M3, type V3 } from '../Poly3D';
import { legJoint, spiderQueenPoses } from './SpiderQueen';
import DATA from './spiderQueenAI.json';

/**
 * 25F 蜘蛛女王（AI 版）：ChatGPT 設計圖 → 四視圖 → 微軟 TRELLIS 生成，
 * 由 scripts/monster_ai.py 減面、接上骨架、算好權重，輸出 spiderQueenAI.json（每個三角形一個顏色）。
 *
 * 整隻是一張蒙皮網格（FigureModel.skin，AiRig 建立），動作沿用舊版（spiderQueenPoses）：
 * - AI 模型每邊有 6 隻腳（舊版 4 隻），走路時一樣分兩組交替；每隻腳靜止時往前的角度依模型量出來。
 * - 腳在遊戲的靜止姿勢是筆直往兩側（往前的角度由動作加上），所以把每隻腳轉到正側面（只轉方向、不改形狀）。
 * - 手臂和女主角一樣轉成筆直往下；鐮爪轉成往後下方（動作把前臂往前舉起時，爪尖朝前下方，像螳螂）。
 * - 短螯肢、頭髮跟著身體與頭，不另外動。
 * 單位：公尺 × 80 → 遊戲單位（整體大小與舊版相近），腳尖踩在 y = 0。
 */

const data = DATA as AiMonsterData & { legs: number };
const { J, TIP } = aiPoints(data);

/** 每隻腳靜止時往前的角度：髖 → 腳尖的水平方向（左右平均） */
const FORWARD = Array.from({ length: data.legs }, (_, i) => {
  const angle = (s: 'L' | 'R') => {
    const d = sub(TIP(`ex_leg${s}${i + 1}c`), J(`ex_leg${s}${i + 1}a`));
    return Math.atan2(d[2], Math.abs(d[0]));
  };
  return (angle('L') + angle('R')) / 2;
});

/** 鐮爪在手臂下垂時的方向：往下、往後（威嚇站姿上臂前舉 0.45、前臂 1.9、爪往回 0.6 弧度後，爪尖朝前下方 45°） */
const CLAW_DIR: V3 = [0, -0.56, -0.81];

/** 各關節轉正的旋轉：腳轉到正側面、手臂轉成往下、鐮爪往後下方，其餘不轉 */
function rotOf(j: string): M3 {
  const leg = /^ex_leg([LR])(\d)[abc]$/.exec(j);
  if (leg) return rotY((leg[1] === 'L' ? 1 : -1) * FORWARD[Number(leg[2]) - 1]!);
  const arm = /^(upperArm|forearm|hand|ex_claw)([LR])$/.exec(j);
  if (arm) {
    const s = arm[2]!;
    if (arm[1] === 'upperArm') return alignDown(sub(J(`forearm${s}`), J(`upperArm${s}`)));
    if (arm[1] === 'ex_claw') return alignTo(sub(TIP(`ex_claw${s}`), J(`ex_claw${s}`)), CLAW_DIR);
    return alignDown(sub(J(`hand${s}`), J(`forearm${s}`)));
  }
  return I3;
}

const { parts, skin, hip } = aiFigure(data, { scale: 80 }, rotOf);

// 每隻腳的關節名稱與動作一致（legJoint）
for (let i = 0; i < data.legs; i++) for (const s of [1, -1] as const) if (!parts.some((p) => p.joint === legJoint(s, i, 'c'))) throw new Error(`AI 骨架缺少 ${legJoint(s, i, 'c')}`);

export const SPIDER_QUEEN: FigureModel = {
  hipHeight: hip,
  referenceRadius: 0.5,
  parts,
  poses: spiderQueenPoses(parts, hip, FORWARD),
  skin,
  secondary: {
    ex_abd2: { rate: 10, gravity: 0 },
    ex_sting: { rate: 12, gravity: 0 },
  },
  gaitRate: 0.8,
  dynamicShadow: true,
  softLight: true,
  rimLight: 0.2,
};
