import type { Mesh, V3 } from '../Poly3D';
import DATA from './bowTrellis.json';
import { glowTones } from './StyledWeapons';
import { baseMesh } from './TrellisAxes';
import { bowString, type BowStyle } from './WeaponParts';

/**
 * 紅弓的 TRELLIS 模型（設計者 2026-11-15；art/gear/bows_unique/ai/<名稱>.glb → scripts/bow_trellis.py → bowTrellis.json）：
 * 整把弓直接用生成的模型，弓弦（生成時刻意不畫）由這裡補一道光。還沒生成的款式回傳 null，沿用 StyledBows 程式畫的。
 * 座標同 StyledBows：弓臂沿 ±Y（弓梢在 ±length）、裝飾朝 +Z、弓弦在 -Z 側；握把中心放在 z = bend × 0.25（代表物件鑲的位置）。
 */
type Prop = { verts: number[][]; faces: number[][] };
const PROPS = (DATA as unknown as { props: Partial<Record<BowStyle, Prop>> }).props;

export function trellisBow(style: BowStyle, length: number, bend: number, glow: number): { meshes: Mesh[]; top: V3; bottom: V3 } | null {
  const P = PROPS[style];
  if (!P) return null;
  const ys = P.verts.map((v) => v[1]!);
  const hi = Math.max(...ys), lo = Math.min(...ys);
  const k = (2 * length) / (hi - lo);
  const mid = (hi + lo) / 2;
  const gripZ = bend * 0.25;
  const place = ([x, y, z]: number[]): V3 => [x! * k, (y! - mid) * k, gripZ + z! * k];
  const mesh = baseMesh({ verts: P.verts.map(place), faces: P.faces.map((f) => ({ idx: [f[0]!, f[1]!, f[2]!] as V3, color: f[3]! })) });
  // 弓弦接在兩端弓梢鉤爪往內勾的尖端（設計者 2026-11-15）：弓臂外側（|y| > 15%）最靠弓弦那側（-Z）的一帶裡，最靠近握把的頂點
  const nock = (sd: 1 | -1): V3 => {
    const half = P.verts.filter((v) => v[1]! * sd > (hi - lo) * 0.15);
    const minZ = Math.min(...half.map((v) => v[2]!));
    const near = half.filter((v) => v[2]! <= minZ + (hi - lo) * 0.015);
    return place(near.reduce((a, b) => (Math.abs(b[1]! - mid) < Math.abs(a[1]! - mid) ? b : a)));
  };
  const top = nock(1);
  const bottom = nock(-1);
  const string = bowString(top, bottom, 0.11, glowTones(glow));
  return { meshes: [mesh, string], top, bottom };
}
