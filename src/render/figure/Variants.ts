import type { FigureModel, Joint } from './FigureModel';
import { lowSphere, type Mesh, type V3 } from './Poly3D';
import { seg, spike } from './Creatures';

/**
 * 怪物變種：沿用原本的模型與姿勢，只換顏色、在關節上加零件（冰晶、膿疱、餘燼、雷光、鏽刺）。
 * 換色以 HSL 處理：依原本的色相 / 飽和度 / 亮度判斷是哪種材質（骨頭、金屬、布料…），
 * 換成新的色相與飽和度，亮度依倍率調整，原本的明暗層次保留。
 */

// ─────────────────────────── 顏色 ───────────────────────────

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function toHsl(c: number): Hsl {
  const r = ((c >> 16) & 0xff) / 255;
  const g = ((c >> 8) & 0xff) / 255;
  const b = (c & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h, s, l };
}

export function fromHsl({ h, s, l }: Hsl): number {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (ch(f(0)) << 16) | (ch(f(8)) << 8) | ch(f(4));
}

/** 換色規則：符合 match 的顏色換成色相 h、飽和度 s，亮度 × l（省略的項目保持原本） */
export interface RecolorRule {
  match: (c: Hsl) => boolean;
  h?: number;
  s?: number;
  l?: number;
}

/** 依規則換色（第一條符合的規則生效；都不符合時不變） */
export const recolor =
  (rules: readonly RecolorRule[]) =>
  (color: number): number => {
    const c = toHsl(color);
    const rule = rules.find((r) => r.match(c));
    if (!rule) return color;
    return fromHsl({ h: rule.h ?? c.h, s: rule.s ?? c.s, l: Math.min(0.97, c.l * (rule.l ?? 1)) });
  };

// ─────────────────────────── 變種 ───────────────────────────

export interface VariantOptions {
  /** 每個面的顏色換成什麼 */
  color: (c: number) => number;
  /** 加在關節上的零件（關節座標） */
  add?: Partial<Record<Joint, Mesh[]>>;
}

/** 以原本的模型產生變種：換色、加零件；姿勢、尺寸、武器尖端等設定不變 */
export function variant(base: FigureModel, o: VariantOptions): FigureModel {
  const paint = (m: Mesh): Mesh => ({
    ...m,
    faces: m.faces.map((f) => ({ ...f, color: o.color(f.color), ...(f.base !== undefined ? { base: o.color(f.base) } : {}) })),
  });
  return {
    ...base,
    parts: base.parts.map((p) => ({ ...p, meshes: [...p.meshes.map(paint), ...(o.add?.[p.joint] ?? [])] })),
  };
}

// ─────────────────────────── 變種的零件 ───────────────────────────

/** 冰晶簇：3 根往 dir 方向長的尖晶 */
export const iceCluster = (c: V3, dir: V3, len: number, r: number, colors: readonly [number, number]): Mesh[] => [
  spike(c, [c[0] + dir[0] * len, c[1] + dir[1] * len, c[2] + dir[2] * len], r, colors[0]),
  spike([c[0] + r * 0.8, c[1], c[2] - r * 0.5], [c[0] + dir[0] * len * 0.6 + r * 1.6, c[1] + dir[1] * len * 0.6, c[2] + dir[2] * len * 0.6 - r], r * 0.7, colors[1]),
  spike([c[0] - r * 0.8, c[1], c[2] + r * 0.4], [c[0] + dir[0] * len * 0.55 - r * 1.6, c[1] + dir[1] * len * 0.55, c[2] + dir[2] * len * 0.55 + r * 0.8], r * 0.65, colors[1]),
];

/** 膿疱：鼓起的小球（外層 + 亮色的頂端） */
export const pustule = (c: V3, r: number, color: number, tip: number): Mesh[] => [lowSphere(r, color, c, 7, 4), lowSphere(r * 0.45, tip, [c[0], c[1] + r * 0.55, c[2] + r * 0.45], 5, 3)];

/** 發光的眼睛（填在眼窩裡） */
export const glowEyes = (x: number, y: number, z: number, r: number, color: number): Mesh[] => [lowSphere(r, color, [x, y, z], 6, 4), lowSphere(r, color, [-x, y, z], 6, 4)];

/** 鋸齒狀的雷光：從 a 到 b 折三次的細條 */
export function bolt(a: V3, b: V3, w: number, color: number, jag = 1.2): Mesh[] {
  const pts: V3[] = [a];
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    const side = i % 2 ? jag : -jag;
    pts.push([a[0] + (b[0] - a[0]) * t + side, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - side * 0.5]);
  }
  pts.push(b);
  return pts.slice(1).map((p, i) => seg(pts[i]!, p, w, w * 0.8, color, 4));
}

/** 鏽刺：鉚在甲片上的底座 + 粗短的四角錐（broken = 尖端斷掉，只剩一半長） */
export const rustSpike = (c: V3, dir: V3, len: number, r: number, color: number, base: number, broken = false): Mesh[] => [
  lowSphere(r * 1.3, base, c, 6, 3, [1, 0.6, 1]),
  broken
    ? seg(c, [c[0] + dir[0] * len * 0.55, c[1] + dir[1] * len * 0.55, c[2] + dir[2] * len * 0.55], r, r * 0.45, color, 4)
    : spike(c, [c[0] + dir[0] * len, c[1] + dir[1] * len, c[2] + dir[2] * len], r, color),
];
