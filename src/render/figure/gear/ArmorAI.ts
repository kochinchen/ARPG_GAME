import type { Joint } from '../FigureModel';
import { aiToJoint } from '../HeroineAI';
import type { Mesh, V3 } from '../Poly3D';
import LAVA_BEHEMOTH from './ai/armor_lava_behemoth.json';

/**
 * AI 生成的盔甲（微軟 TRELLIS；scripts/gear_ai.py 在 Blender 裡對齊 AI 版女主角、補上熔核、拆成各關節的零件）。
 * JSON：fine / coarse 兩份（放大時畫細的，遊戲地圖上畫粗的），各自依關節分好；頂點是 AI 模型的座標（公尺、遊戲軸向），
 * 這裡換成各關節的區域座標。每個面 [a, b, c, 顏色]。
 */
type PartData = { verts: number[][]; faces: number[][] };
type ArmorData = { fine: Record<string, PartData>; coarse: Record<string, PartData> };

function mesh(j: Joint, d: PartData): Mesh {
  return {
    verts: d.verts.map((v) => aiToJoint(j, [v[0]!, v[1]!, v[2]!] as V3)),
    faces: d.faces.map((f) => ({ idx: [f[0]!, f[1]!, f[2]!], color: f[3]! })),
  };
}

function load(data: ArmorData): Map<Joint, Mesh[]> {
  const parts = new Map<Joint, Mesh[]>();
  for (const [j, fine] of Object.entries(data.fine) as [Joint, PartData][]) {
    const coarse = data.coarse[j];
    parts.set(j, [{ ...mesh(j, fine), ...(coarse ? { coarse: mesh(j, coarse) } : {}) }]);
  }
  return parts;
}

const MODELS = { lava_behemoth: LAVA_BEHEMOTH as ArmorData };
export type ArmorModel = keyof typeof MODELS;

const cache = new Map<ArmorModel, Map<Joint, Mesh[]>>();

/** AI 生成的盔甲：關節 → 網格（胸甲在 chest、護肩在 upperArmL / upperArmR） */
export function aiArmorParts(model: ArmorModel): ReadonlyMap<Joint, Mesh[]> {
  let parts = cache.get(model);
  if (!parts) cache.set(model, (parts = load(MODELS[model])));
  return parts;
}
