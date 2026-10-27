import { solveJoints, type FigureModel, type Joint, type PartDef, type SkinMesh } from './FigureModel';
import { heroinePoses } from './heroine/HeroinePose';
import { heroineSword, SWORD_TIP } from './heroine/HeroineWeapon';
import { apply, type M3, type Mesh, type V3 } from './Poly3D';
import DATA from './heroine/heroineAI.json';

/**
 * 女主角（AI 版）：設計圖四視圖用微軟 TRELLIS 生成、在 Blender 接上骨架後（scripts/heroine_ai.py），
 * 由 scripts/heroine_ai_game.py 轉成 heroineAI.json：每個三角形一個顏色、每個頂點最多 3 根骨頭的權重。
 *
 * 遊戲的關節與舊版女主角相同（動作、裝備外觀都沿用）：
 * - AI 骨架的骨頭對應到遊戲關節（肩 → upperArm、肘 → forearm …；腰布 → cloth / clothBack；馬尾跟著頭）。
 * - 四肢在遊戲裡的靜止姿勢是筆直往下，所以把 AI 模型的四肢轉正（只轉方向、不改長度，保留設計圖的比例）。
 * - 整個身體是一張蒙皮網格（FigureModel.skin），關節轉動時頂點依權重混合，接縫不會裂開。
 * 單位：遊戲模型單位；骨盆高度與舊版相同（32），其餘依 AI 模型的比例。
 */

type AiJoint = keyof typeof DATA.joints;
const J = (n: string): V3 => {
  const p = DATA.joints[n as AiJoint];
  if (!p) throw new Error(`AI 骨架沒有 ${n}`);
  return [p[0]!, p[1]!, p[2]!];
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** 骨盆高度（與舊版女主角相同） */
const HIP = 32;
/** 公尺 → 遊戲單位 */
const S = HIP / J('pelvis')[1];

/** 把方向 d 轉到正下方的旋轉矩陣（四肢轉正用） */
function alignDown(d: V3): M3 {
  const a = mulS(d, 1 / len(d));
  const b: V3 = [0, -1, 0];
  const v: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const k = 1 / (1 + c);
  return [
    1 - k * (v[1] * v[1] + v[2] * v[2]), k * v[0] * v[1] - v[2], k * v[0] * v[2] + v[1],
    k * v[0] * v[1] + v[2], 1 - k * (v[0] * v[0] + v[2] * v[2]), k * v[1] * v[2] - v[0],
    k * v[0] * v[2] - v[1], k * v[1] * v[2] + v[0], 1 - k * (v[0] * v[0] + v[1] * v[1]),
  ];
}
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 遊戲關節：AI 骨架上的支點、轉正的旋轉、遊戲裡的靜止位置 */
interface Rig {
  pivot: V3;
  rot: M3;
  rest: V3;
}
const rig = new Map<Joint, Rig>();
const set = (j: Joint, pivot: V3, rot: M3, rest: V3) => rig.set(j, { pivot, rot, rest });
set('root', J('pelvis'), I3, mulS(J('pelvis'), S));
set('torso', J('waist'), I3, mulS(J('waist'), S));
set('chest', J('chest'), I3, mulS(J('chest'), S));
set('neck', J('neck'), I3, mulS(J('neck'), S));
set('head', J('head'), I3, mulS(J('head'), S));
const CLOTH_PIVOT = add(J('pelvis'), [0, 0.075, 0]);
set('cloth', CLOTH_PIVOT, I3, mulS(CLOTH_PIVOT, S));
set('clothBack', CLOTH_PIVOT, I3, mulS(CLOTH_PIVOT, S));
/** 四肢各段的長度（遊戲單位；裝備外觀依這個長度拉伸） */
export const AI_LIMB = { upperArm: 0, forearm: 0, thigh: 0, shin: 0 };
for (const s of ['L', 'R'] as const) {
  const sh = J(`shoulder${s}`), el = J(`elbow${s}`), wr = J(`wrist${s}`);
  const hp = J(`hip${s}`), kn = J(`knee${s}`), an = J(`ankle${s}`);
  AI_LIMB.upperArm = len(sub(el, sh)) * S;
  AI_LIMB.forearm = len(sub(wr, el)) * S;
  AI_LIMB.thigh = len(sub(kn, hp)) * S;
  AI_LIMB.shin = len(sub(an, kn)) * S;
  const ua = mulS(sh, S);
  const fa = add(ua, [0, -AI_LIMB.upperArm, 0]);
  const hd = add(fa, [0, -AI_LIMB.forearm, 0]);
  const fore = alignDown(sub(wr, el));
  set(`upperArm${s}`, sh, alignDown(sub(el, sh)), ua);
  set(`forearm${s}`, el, fore, fa);
  set(`hand${s}`, wr, fore, hd);
  const th = mulS(hp, S);
  const sn = add(th, [0, -AI_LIMB.thigh, 0]);
  const ft = add(sn, [0, -AI_LIMB.shin, 0]);
  const shin = alignDown(sub(an, kn));
  set(`thigh${s}`, hp, alignDown(sub(kn, hp)), th);
  set(`shin${s}`, kn, shin, sn);
  set(`foot${s}`, an, shin, ft);
}

/** AI 模型上的一點（公尺、遊戲軸向）→ 關節的區域座標（遊戲單位；四肢同樣轉正）：AI 生成的裝備掛在關節上用 */
export function aiToJoint(j: Joint, p: V3): V3 {
  const r = rig.get(j);
  if (!r) throw new Error(`AI 骨架沒有對應 ${j} 的關節`);
  return apply(r.rot, mulS(sub(p, r.pivot), S));
}

/** 軀幹各段的長度（遊戲單位）：胸 = 胸到脖子、腰 = 腰到胸（盔甲依這個長度拉伸） */
export const AI_TORSO = { chest: (J('neck')[1] - J('chest')[1]) * S, waist: (J('chest')[1] - J('waist')[1]) * S };

/** AI 骨頭 → 遊戲關節 */
const FRONT_FLAPS = new Set([0, 2, 3]);
function jointOf(bone: string): Joint {
  const side = bone.endsWith('L') ? 'L' : 'R';
  if (bone === 'pelvis') return 'root';
  if (bone === 'waist') return 'torso';
  if (bone === 'chest' || bone.startsWith('clav')) return 'chest';
  if (bone === 'neck') return 'neck';
  if (bone === 'head' || bone.startsWith('pony')) return 'head';
  if (bone.startsWith('shoulder')) return `upperArm${side}`;
  if (bone.startsWith('elbow')) return `forearm${side}`;
  if (bone === 'shield') return 'forearmL';
  if (bone.startsWith('wrist')) return `hand${side}`;
  if (bone === 'sword') return 'handR';
  if (bone.startsWith('hip')) return `thigh${side}`;
  if (bone.startsWith('knee')) return `shin${side}`;
  if (bone.startsWith('ankle')) return `foot${side}`;
  if (bone.startsWith('flap')) return FRONT_FLAPS.has(Number(bone.slice(4, -1))) ? 'cloth' : 'clothBack';
  throw new Error(`沒有對應的關節：${bone}`);
}

// ── 頂點：AI 模型（公尺）→ 遊戲單位，四肢轉正；權重合併到遊戲關節 ──
const verts: V3[] = [];
const infl: { joint: Joint; w: number }[][] = [];
/** 每個頂點權重最大的 AI 骨頭（決定面屬於哪個部位） */
const domBone: string[] = [];
DATA.verts.forEach((raw, i) => {
  const v: V3 = [raw[0]!, raw[1]!, raw[2]!];
  const ws = DATA.weights[i] as [string, number][];
  const merged = new Map<Joint, number>();
  let out: V3 = [0, 0, 0];
  for (const [bone, w] of ws) {
    const j = jointOf(bone);
    const r = rig.get(j)!;
    const local = apply(r.rot, mulS(sub(v, r.pivot), S));
    out = add(out, mulS(add(r.rest, local), w));
    merged.set(j, (merged.get(j) ?? 0) + w);
  }
  verts.push(out);
  infl.push([...merged].map(([joint, w]) => ({ joint, w })));
  domBone.push(ws[0]?.[0] ?? 'pelvis');
});

/** 靴子的上緣（AI 模型的高度，公尺）：膝蓋往上一點，包含護膝 */
const BOOT_TOP = J('kneeL')[1] + 0.12;
const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff] as const;
const skinLike = (c: number) => {
  const [r, g, b] = rgb(c);
  return r > 130 && r > g * 1.15 && g > b * 1.05 && r - b > 50;
};

/**
 * 靴子（bootL / bootR）：腿上的面、整個面在靴子上緣以下、不是皮膚色。
 * 和身體分開成獨立的部位，穿上靴子裝備時換成裝備的顏色（ArmorLooks），沒穿時就是設計圖的皮靴。
 */
function bootOf(f: number[]): string | null {
  const bones = [f[0]!, f[1]!, f[2]!].map((v) => domBone[v]!);
  const side = bones[0]!.slice(-1);
  if (!bones.every((b) => /^(hip|knee|ankle)[LR]$/.test(b) && b.endsWith(side))) return null;
  // 膝蓋以下全是靴子（腳踝的皮革在貼圖上偏亮，看起來像皮膚）；膝蓋到靴子上緣之間才排除露出的大腿
  const top = Math.max(...[f[0]!, f[1]!, f[2]!].map((v) => DATA.verts[v]![1]!));
  if (top > BOOT_TOP || (top > J('kneeL')[1] && skinLike(f[3]!))) return null;
  return `boot${side}`;
}

/**
 * 面的部位（穿裝備時藏起被蓋住的部位）：靴子；其餘是多數頂點所屬的遊戲關節；
 * 頭上的面再分成臉（head）與頭髮（hair，偏紅、不像皮膚的顏色）；馬尾另外一區（戴頭盔時仍露在後面）。
 */
function regionOf(f: number[], i: number): string {
  if (i >= DATA.decalStart) return 'head';
  const boot = bootOf(f);
  if (boot) return boot;
  const bones = [f[0]!, f[1]!, f[2]!].map((v) => domBone[v]!);
  if (bones.filter((b) => b.startsWith('pony')).length >= 2) return 'ponytail';
  const count = new Map<Joint, number>();
  for (const b of bones) count.set(jointOf(b), (count.get(jointOf(b)) ?? 0) + 1);
  const j = [...count].sort((a, b) => b[1] - a[1])[0]![0];
  if (j === 'head') {
    const c = f[3]!;
    const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff;
    if (r > 70 && g < r * 0.55) return 'hair';
  }
  return j;
}
const skinFaces = DATA.faces.map((f, i) => ({ idx: [f[0]!, f[1]!, f[2]!] as [number, number, number], color: f[3]!, region: regionOf(f, i) }));

/** 靴子的面：材質（金屬 = 灰、不飽和的護膝與扣環；其餘是皮革）與亮度相對於同材質的中位數（裝備換色時保留明暗） */
export interface BootFace {
  index: number;
  metal: boolean;
  /** 在膝蓋以上（護膝的上半、靴口）：裝備的靴口顏色畫在這裡 */
  upper: boolean;
  shade: number;
}
const lum = (c: number) => {
  const [r, g, b] = rgb(c);
  return 0.3 * r + 0.59 * g + 0.11 * b;
};
const isMetal = (c: number) => {
  const [r, g, b] = rgb(c);
  const mx = Math.max(r, g, b);
  return mx > 0 && (mx - Math.min(r, g, b)) / mx <= 0.3;
};
export const AI_BOOT_FACES: readonly BootFace[] = (() => {
  const faces = skinFaces.map((f, index) => ({ f, index })).filter(({ f }) => f.region.startsWith('boot'));
  const median = (metal: boolean) => {
    const ls = faces.filter(({ f }) => isMetal(f.color) === metal).map(({ f }) => lum(f.color)).sort((a, b) => a - b);
    return ls[Math.floor(ls.length / 2)] ?? 1;
  };
  const ref = { true: median(true), false: median(false) };
  return faces.map(({ f, index }) => {
    const metal = isMetal(f.color);
    const upper = f.idx.reduce((sum, v) => sum + DATA.verts[v]![1]!, 0) / 3 > J('kneeL')[1] + 0.02;
    return { index, metal, upper, shade: lum(f.color) / ref[`${metal}`] };
  });
})();

/** 左腳的靴子單獨拿出來（shin 關節的區域座標，遊戲單位）：物品圖示用；color 決定每個面的顏色（裝備換色） */
export function aiBootMesh(color: (f: BootFace) => number): Mesh {
  const rest = rig.get('shinL')!.rest;
  const map = new Map<number, number>();
  const out: Mesh = { verts: [], faces: [] };
  for (const f of AI_BOOT_FACES) {
    const face = skinFaces[f.index]!;
    if (face.region !== 'bootL') continue;
    const idx = face.idx.map((v) => {
      if (!map.has(v)) {
        map.set(v, out.verts.length);
        out.verts.push(sub(verts[v]!, rest));
      }
      return map.get(v)!;
    });
    out.faces.push({ idx, color: color(f) });
  }
  return out;
}

/**
 * 靴筒的外形（shin 關節的區域座標，遊戲單位；左右相同，取左腳）：高度 y 處靴子正面的 z 與左右半寬。
 * 裝備的尖刺、寶石、符文、翅膀貼在這個表面上。
 */
export function aiBootShape(y: number): { front: number; half: number } {
  const rest = rig.get('shinL')!.rest;
  let front = 0, half = 0;
  for (const f of AI_BOOT_FACES) {
    const face = skinFaces[f.index]!;
    if (face.region !== 'bootL') continue;
    for (const v of face.idx) {
      const p = sub(verts[v]!, rest);
      if (Math.abs(p[1] - y) > 0.8) continue;
      if (Math.abs(p[0]) < 1) front = Math.max(front, p[2]);
      half = Math.max(half, Math.abs(p[0]));
    }
  }
  return { front, half };
}

// ── 關節（父關節在前）；每個關節放一組「探測點」（只有頂點、沒有面），讓站姿貼地、倒地的計算照常運作 ──
const PARENT: [Joint, Joint | null][] = [
  ['root', null], ['cloth', 'root'], ['clothBack', 'root'], ['torso', 'root'], ['chest', 'torso'], ['neck', 'chest'], ['head', 'neck'],
  ['upperArmL', 'chest'], ['forearmL', 'upperArmL'], ['handL', 'forearmL'],
  ['upperArmR', 'chest'], ['forearmR', 'upperArmR'], ['handR', 'forearmR'],
  ['thighL', 'root'], ['shinL', 'thighL'], ['footL', 'shinL'],
  ['thighR', 'root'], ['shinR', 'thighR'], ['footR', 'shinR'],
];
const probe = (j: Joint): Mesh[] => {
  const rest = rig.get(j)!.rest;
  const pts = verts.filter((_, i) => infl[i]!.some((x) => x.joint === j && x.w > 0.6));
  const step = Math.max(1, Math.floor(pts.length / 40));
  return [{ verts: pts.filter((_, i) => i % step === 0).map((v) => sub(v, rest)), faces: [] }];
};
/** 武器握點：拳頭中心（手腕往下、略往前） */
const GRIP: V3 = [0, -2.0, 0.4];
const PARTS: PartDef[] = [];
for (const [j, parent] of PARENT) {
  const rest = rig.get(j)!.rest;
  const offset = parent ? sub(rest, rig.get(parent)!.rest) : [0, 0, 0];
  PARTS.push({ joint: j, parent, offset: offset as V3, meshes: probe(j) });
  // 預設的劍（遊戲裡依裝備換武器，見 PolyFigure.setWeapon）
  if (j === 'handR') PARTS.push({ joint: 'weapon', parent: 'handR', offset: GRIP, meshes: heroineSword() });
  if (j === 'handL') PARTS.push({ joint: 'weaponL', parent: 'handL', offset: GRIP, meshes: [] });
}
// root 的靜止高度 = HIP（rig 的 root rest 已是 pelvis × S = HIP）

/** 靜止姿勢時各關節的位置（蒙皮用） */
const REST = solveJoints(PARTS, HIP, { rootY: 0, angles: {} });
const restPos: Partial<Record<Joint, V3>> = {};
for (const [j, f] of REST) restPos[j] = f.p;

const SKIN: SkinMesh = { verts, infl, faces: skinFaces, rest: restPos };

export const HEROINE_AI: FigureModel = {
  parts: PARTS,
  hipHeight: HIP,
  referenceRadius: 0.3,
  poses: heroinePoses(PARTS, HIP),
  weaponJoint: 'weapon',
  weaponTip: SWORD_TIP,
  dynamicShadow: true,
  rimLight: 0.2,
  softLight: true,
  lighting: 'toon',
  skin: SKIN,
  secondary: {
    cloth: { rate: 14, gravity: 0.4 },
    clothBack: { rate: 10, gravity: 0.4 },
  },
};
