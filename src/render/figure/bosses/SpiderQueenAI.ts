import { solveJoints, type FigureModel, type Joint, type PartDef, type SkinMesh } from '../FigureModel';
import { alignDown } from '../HeroineAI';
import { apply, rotY, type M3, type Mesh, type V3 } from '../Poly3D';
import { legJoint, spiderQueenPoses } from './SpiderQueen';
import DATA from './spiderQueenAI.json';

/**
 * 25F 蜘蛛女王（AI 版）：ChatGPT 設計圖 → 四視圖 → 微軟 TRELLIS 生成，
 * 由 scripts/spider_queen_ai.py 減面、接上骨架、算好權重，輸出 spiderQueenAI.json（每個三角形一個顏色）。
 *
 * 整隻是一張蒙皮網格（FigureModel.skin），動作沿用舊版（spiderQueenPoses）：
 * - AI 模型每邊有 6 隻腳（舊版 4 隻），走路時一樣分兩組交替；每隻腳靜止時往前的角度依模型量出來。
 * - 腳在遊戲的靜止姿勢是筆直往兩側（往前的角度由動作加上），所以把每隻腳轉到正側面（只轉方向、不改形狀）。
 * - 手臂和女主角一樣轉成筆直往下；鐮爪轉成往後下方（動作把前臂往前舉起時，爪尖朝前下方，像螳螂）。
 * - 短螯肢、頭髮跟著身體與頭，不另外動。
 * 單位：公尺 × S → 遊戲單位，腳尖踩在 y = 0。
 */

type AiJoint = keyof typeof DATA.joints;
const raw = (table: Record<string, number[]>, n: string): V3 => {
  const p = table[n];
  if (!p) throw new Error(`AI 骨架沒有 ${n}`);
  return [p[0]!, p[1]!, p[2]!];
};
const J = (n: string) => raw(DATA.joints, n);
const TIP = (n: string) => raw(DATA.tips, n);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 公尺 → 遊戲單位（整體大小與舊版相近） */
const S = 80;
/** 地面：最低的頂點（腳尖） */
const GROUND = Math.min(...DATA.verts.map((v) => v[1]!));

/** 每隻腳靜止時往前的角度：髖 → 腳尖的水平方向（左右平均） */
const FORWARD = Array.from({ length: DATA.legs }, (_, i) => {
  const angle = (s: 'L' | 'R') => {
    const d = sub(TIP(`ex_leg${s}${i + 1}c`), J(`ex_leg${s}${i + 1}a`));
    return Math.atan2(d[2], Math.abs(d[0]));
  };
  return (angle('L') + angle('R')) / 2;
});

/** 把方向 d 轉到方向 t 的旋轉矩陣 */
function alignTo(d: V3, t: V3): M3 {
  const n = (v: V3) => mulS(v, 1 / Math.hypot(v[0], v[1], v[2]));
  const a = n(d);
  const b = n(t);
  const v: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const k = 1 / (1 + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
  return [
    1 - k * (v[1] * v[1] + v[2] * v[2]), k * v[0] * v[1] - v[2], k * v[0] * v[2] + v[1],
    k * v[0] * v[1] + v[2], 1 - k * (v[0] * v[0] + v[2] * v[2]), k * v[1] * v[2] - v[0],
    k * v[0] * v[2] - v[1], k * v[1] * v[2] + v[0], 1 - k * (v[0] * v[0] + v[1] * v[1]),
  ];
}
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

/** 遊戲關節：AI 模型上的支點、轉正的旋轉、靜止時的位置（父關節在前） */
interface Rig {
  pivot: V3;
  rot: M3;
  rest: V3;
}
const rig = new Map<string, Rig>();
const NAMES = Object.keys(DATA.joints) as AiJoint[];
for (const j of NAMES) {
  const parent = DATA.parents[j] as AiJoint | null;
  const pivot = J(j);
  // 靜止位置 = 父關節的靜止位置 + 父關節的旋轉 ×（支點的差）
  const rest = parent ? add(rig.get(parent)!.rest, apply(rig.get(parent)!.rot, mulS(sub(pivot, J(parent)), S))) : mulS(sub(pivot, [0, GROUND, 0]), S);
  rig.set(j, { pivot, rot: rotOf(j), rest });
}
const HIP = rig.get('root')!.rest[1];

// ── 頂點：AI 模型 → 每根骨頭各自轉正後的位置，依權重混合 ──
const verts: V3[] = [];
const infl: { joint: Joint; w: number }[][] = [];
DATA.verts.forEach((v, i) => {
  let out: V3 = [0, 0, 0];
  const list: { joint: Joint; w: number }[] = [];
  for (const [bone, w] of DATA.weights[i] as [AiJoint, number][]) {
    const r = rig.get(bone)!;
    out = add(out, mulS(add(r.rest, apply(r.rot, mulS(sub(v as V3, r.pivot), S))), w));
    list.push({ joint: bone as Joint, w });
  }
  verts.push(out);
  infl.push(list);
});

// ── 關節；每個關節放一組「探測點」（只有頂點、沒有面），讓腳踩地、倒地的計算照常運作 ──
const probe = (j: string): Mesh[] => {
  const rest = rig.get(j)!.rest;
  const pts = verts.filter((_, i) => infl[i]!.some((x) => x.joint === j && x.w > 0.6));
  const step = Math.max(1, Math.floor(pts.length / 40));
  return [{ verts: pts.filter((_, i) => i % step === 0).map((v) => sub(v, rest)), faces: [] }];
};
const PARTS: PartDef[] = NAMES.map((j) => {
  const parent = DATA.parents[j] as AiJoint | null;
  const rest = rig.get(j)!.rest;
  return { joint: j as Joint, parent: parent as Joint | null, offset: parent ? sub(rest, rig.get(parent)!.rest) : [0, 0, 0], meshes: probe(j) };
});

const REST = solveJoints(PARTS, HIP, { rootY: 0, angles: {} });
const restPos: Partial<Record<Joint, V3>> = {};
for (const [j, f] of REST) restPos[j] = f.p;

const SKIN: SkinMesh = {
  verts,
  infl,
  faces: DATA.faces.map((f) => ({ idx: [f[0]!, f[1]!, f[2]!], color: f[3]!, region: 'body' })),
  rest: restPos,
};

// 每隻腳的關節名稱與動作一致（legJoint）
for (let i = 0; i < DATA.legs; i++) for (const s of [1, -1] as const) if (!rig.has(legJoint(s, i, 'c'))) throw new Error(`AI 骨架缺少 ${legJoint(s, i, 'c')}`);

export const SPIDER_QUEEN: FigureModel = {
  hipHeight: HIP,
  referenceRadius: 0.5,
  parts: PARTS,
  poses: spiderQueenPoses(PARTS, HIP, FORWARD),
  skin: SKIN,
  secondary: {
    ex_abd2: { rate: 10, gravity: 0 },
    ex_sting: { rate: 12, gravity: 0 },
  },
  gaitRate: 0.8,
  dynamicShadow: true,
  softLight: true,
  rimLight: 0.2,
};
