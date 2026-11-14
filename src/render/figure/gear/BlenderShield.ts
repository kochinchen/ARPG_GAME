import type { Mesh, V3 } from '../Poly3D';
import DATA from './shieldBase.json';
import { shieldMeshes, shieldOutline, type ShieldSpec } from './ArmorPieces';
import { baseMesh, pick, ranks } from '../weapons/TrellisAxes';

/**
 * 用 Blender 建的盾牌底稿（scripts/shield_base.py → shieldBase.json）改出各階級（設計者 2026-11-14 的試作）：
 * 盾面與盾緣存的是參數座標，沿 ArmorPieces 的輪廓（圓、鳶、塔、騎士）與大小擺好，正面隆起同 shieldMeshes；
 * 十字紋章、鏡面、放射尖刺、尖刺、寶石、符文仍用程式畫的（取自 shieldMeshes 的結果）。橘 / 紅的專屬造型照舊。
 * 座標同 shieldMeshes：盾面朝 +X、原點 = 握把，Y = 高、Z = 寬。
 */
type Part = { verts: number[][]; faces: number[][] };
const D = DATA as unknown as { parts: Record<string, Part>; tags: string[] };

/** 從中心沿角度 a 射出去，碰到輪廓的距離 */
function radiusAt(outline: [number, number][], a: number): number {
  const dy = Math.cos(a), dz = Math.sin(a);
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const [y1, z1] = outline[i]!;
    const [y2, z2] = outline[(i + 1) % outline.length]!;
    const ey = y2 - y1, ez = z2 - z1;
    const den = dy * ez - dz * ey;
    if (Math.abs(den) < 1e-9) continue;
    const t = (y1 * ez - z1 * ey) / den;
    const u = (y1 * dz - z1 * dy) / den;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 1;
}

export function blenderShield(s: ShieldSpec): Mesh[] {
  if (s.style) return shieldMeshes(s);
  const outline = shieldOutline(s.shape, s.size);
  const R = (a: number) => radiusAt(outline, a);
  const bulge = 0.6 * s.size;
  const paint = (part: Part, place: (v: number[]) => V3, tones: readonly number[]): Mesh => {
    const r = ranks(part.faces.map((f) => f[3]!));
    return baseMesh({ verts: part.verts.map(place), faces: part.faces.map((f, i) => ({ idx: [f[0]!, f[1]!, f[2]!], color: pick(tones, r[i]!) })) });
  };
  const TAU = Math.PI * 2;
  const meshes: Mesh[] = [
    // 盾面：正面中央隆起（同 shieldMeshes 的 slab），背面平
    paint(D.parts.plate!, ([sr, a, side]) => {
      const ang = a! * TAU;
      const rr = R(ang) * sr!;
      return [side ? 0.75 + bulge * (1 - sr! * sr!) : 0.3, Math.cos(ang) * rr, Math.sin(ang) * rr];
    }, s.mat),
    // 盾緣：沿輪廓外側的管子
    paint(D.parts.rim!, ([a, b]) => {
      const ang = a! * TAU;
      const rr = R(ang) * 1.02 + 0.12;
      const k = b! * TAU;
      const out = rr + Math.cos(k) * 0.3 * Math.max(0.9, s.size);
      return [0.35 + Math.sin(k) * 0.42, Math.cos(ang) * out, Math.sin(ang) * out];
    }, s.rim),
  ];
  if (s.boss) meshes.push(paint(D.parts.boss!, ([x, y, z]) => [0.65 + bulge + x! * 1.1 * s.size, y! * 1.1 * s.size, z! * 1.1 * s.size], s.boss));
  // 程式畫的裝飾：shieldMeshes 的 [盾緣, 盾面, 鏡面?, 十字 ×2?, 盾心?, …] 去掉盾緣、盾面與盾心
  const program = shieldMeshes(s);
  const bossAt = 2 + (s.face ? 1 : 0) + (s.cross ? 2 : 0);
  meshes.push(...program.filter((_, i) => i >= 2 && !(s.boss && i === bossAt)));
  return meshes;
}
