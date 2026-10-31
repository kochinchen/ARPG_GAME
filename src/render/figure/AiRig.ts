import { solveJoints, type Joint, type PartDef, type SkinMesh } from './FigureModel';
import { apply, type M3, type Mesh, type V3 } from './Poly3D';

/**
 * AI 生成的怪物（scripts/monster_ai.py 輸出的 JSON）→ 遊戲的關節與蒙皮網格。
 * JSON：關節的支點與末端（公尺、遊戲軸向）、父關節、頂點、每個頂點最多 3 根骨頭的權重、每個三角形一個顏色。
 *
 * 遊戲的靜止姿勢（所有角度為 0）不一定是 AI 模型的姿勢：例如四肢在遊戲裡是筆直往下，
 * 所以每個關節可以指定一個「轉正」的旋轉（只轉方向、不改形狀），動作再從這個姿勢轉出去。
 * 靜止位置 = 父關節的靜止位置 + 父關節的旋轉 ×（支點的差）；頂點 = 依權重混合各骨頭轉正後的位置。
 */
export interface AiMonsterData {
  joints: Record<string, number[]>;
  tips: Record<string, number[]>;
  parents: Record<string, string | null>;
  verts: number[][];
  weights: unknown[];
  faces: number[][];
}

export const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

/** 把方向 d 轉到方向 t 的旋轉矩陣 */
export function alignTo(d: V3, t: V3): M3 {
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
/** 把方向 d 轉到正下方（四肢轉正） */
export const alignDown = (d: V3): M3 => alignTo(d, [0, -1, 0]);

/** 讀 AI 骨架上的點（支點 / 末端，公尺） */
export function aiPoints(data: AiMonsterData) {
  const read = (table: Record<string, number[]>, n: string): V3 => {
    const p = table[n];
    if (!p) throw new Error(`AI 骨架沒有 ${n}`);
    return [p[0]!, p[1]!, p[2]!];
  };
  return { J: (n: string) => read(data.joints, n), TIP: (n: string) => read(data.tips, n) };
}

/**
 * 建立關節（每個關節放一組「探測點」：只有頂點、沒有面，讓腳踩地、倒地的計算照常運作）與蒙皮網格。
 * size：scale = 公尺 → 遊戲單位；或 hip = 骨盆（root）離地的高度（遊戲單位），依此算出比例。腳底踩在 y = 0。
 */
export function aiFigure(data: AiMonsterData, size: { scale: number } | { hip: number }, rotOf: (joint: string) => M3) {
  const { J } = aiPoints(data);
  const ground = Math.min(...data.verts.map((v) => v[1]!));
  const S = 'scale' in size ? size.scale : size.hip / (J('root')[1] - ground);
  const names = Object.keys(data.joints);
  const rig = new Map<string, { pivot: V3; rot: M3; rest: V3 }>();
  for (const j of names) {
    const parent = data.parents[j];
    const pivot = J(j);
    // 骨盆（root）在水平方向放在原點：solveJoints 一律把 root 放在 (0, 骨盆高, 0)，網格要跟著移，
  // 否則骨盆不在 AI 模型正中央時，所有關節都會在偏掉的位置旋轉（深淵統御者的骨盆偏前 18 公分）
  const rest = parent ? add(rig.get(parent)!.rest, apply(rig.get(parent)!.rot, mulS(sub(pivot, J(parent)), S))) : mulS(sub(pivot, [pivot[0], ground, pivot[2]]), S);
    rig.set(j, { pivot, rot: rotOf(j), rest });
  }

  const verts: V3[] = [];
  const infl: { joint: Joint; w: number }[][] = [];
  data.verts.forEach((raw, i) => {
    const v: V3 = [raw[0]!, raw[1]!, raw[2]!];
    let out: V3 = [0, 0, 0];
    const list: { joint: Joint; w: number }[] = [];
    for (const [bone, w] of data.weights[i] as [string, number][]) {
      const r = rig.get(bone)!;
      out = add(out, mulS(add(r.rest, apply(r.rot, mulS(sub(v, r.pivot), S))), w));
      list.push({ joint: bone as Joint, w });
    }
    verts.push(out);
    infl.push(list);
  });

  const probe = (j: string): Mesh[] => {
    const rest = rig.get(j)!.rest;
    const pts = verts.filter((_, i) => infl[i]!.some((x) => x.joint === j && x.w > 0.6));
    const step = Math.max(1, Math.floor(pts.length / 40));
    return [{ verts: pts.filter((_, i) => i % step === 0).map((v) => sub(v, rest)), faces: [] }];
  };
  const parts: PartDef[] = names.map((j) => {
    const parent = data.parents[j] ?? null;
    const rest = rig.get(j)!.rest;
    return { joint: j as Joint, parent: parent as Joint | null, offset: parent ? sub(rest, rig.get(parent)!.rest) : [0, 0, 0], meshes: probe(j) };
  });

  const hip = rig.get('root')!.rest[1];
  const restPos: Partial<Record<Joint, V3>> = {};
  for (const [j, f] of solveJoints(parts, hip, { rootY: 0, angles: {} })) restPos[j] = f.p;
  const skin: SkinMesh = {
    verts,
    infl,
    faces: data.faces.map((f) => ({ idx: [f[0]!, f[1]!, f[2]!], color: f[3]!, region: 'body' })),
    rest: restPos,
  };
  return { parts, skin, hip };
}
