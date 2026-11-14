import type { Mesh, V3 } from '../Poly3D';
import BOW_DATA from './bowBase.json';
import STAFF_DATA from './staffBase.json';
import { bow, darken, sample, staff, taper, type BowOptions, type StaffOptions, type Tones } from './WeaponParts';
import { baseMesh, pick, ranks } from './TrellisAxes';

/**
 * 用 Blender 建的弓與法杖底稿（scripts/bow_staff_base.py → bowBase.json、staffBase.json）改出各階級（設計者 2026-11-14 的試作）。
 * 弓臂、杖身存的是參數座標，沿 WeaponParts.bow / staff 同樣的路徑擺放，所以長短、彎度、反曲都跟著 BowOptions / StaffOptions；
 * 弓梢的刃 / 鉤 / 翼 / 寶珠與杖頭的水晶、骷髏、尖叉、環等仍用程式畫的（取自 bow() / staff() 的結果）。
 * 回傳的形狀同 bow() / staff()，所以 WeaponLooks 的 bowLook / staffLook 照樣縮放、擺到手上。
 */
type Part = { verts: number[][]; faces: number[][] };
type Data = { parts: Record<string, Part>; tags: string[] };
const BOW = BOW_DATA as unknown as Data;
const STAFF = STAFF_DATA as unknown as Data;

/** 一個零件依明暗名次換色；place 把底稿座標換成遊戲座標；flip = 鏡射後翻面 */
function paint(part: Part, place: (v: number[]) => V3, colorOf: (tag: string, q: number) => number, tags: string[], flip = false): Mesh {
  const r = ranks(part.faces.map((f) => f[3]!));
  return baseMesh({
    verts: part.verts.map(place),
    faces: part.faces.map((f, i) => ({ idx: (flip ? [f[0]!, f[2]!, f[1]!] : [f[0]!, f[1]!, f[2]!]) as V3, color: colorOf(tags[f[4]!]!, r[i]!) })),
  });
}

/** 依局部座標系（x, y, z 三個軸）擺放 */
const frame = (o: V3, x: V3, y: V3, z: V3) => (v: number[]): V3 => [o[0] + x[0] * v[0]! + y[0] * v[1]! + z[0] * v[2]!, o[1] + x[1] * v[0]! + y[1] * v[1]! + z[1] * v[2]!, o[2] + x[2] * v[0]! + y[2] * v[1]! + z[2] * v[2]!];

/** 折線 → 通過每個點的平滑曲線（Catmull-Rom，每段切 6 份），弓臂才不會一節一節折 */
function smooth(pts: V3[], n = 6): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = (a: number, b: number, c_: number, d: number) => 0.5 * (2 * b + (-a + c_) * t + (2 * a - 5 * b + 4 * c_ - d) * t2 + (-a + 3 * b - 3 * c_ + d) * t3);
      out.push([0, c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

export function blenderBow(o: BowOptions): { meshes: Mesh[]; top: V3; bottom: V3 } {
  const L = o.length;
  const b = o.bend;
  const r = o.recurve ?? 0;
  const th = o.thickness * 1.15;
  const trim: Tones = o.trim ?? o.tipColors ?? o.colors.map((c) => darken(c, 0.35));
  const colorOf = (tag: string, q: number) => (tag === 'grip' ? pick(o.grip, q) : tag === 'trim' ? pick(trim, q) : pick(o.colors, q));
  const meshes: Mesh[] = [];
  const tips: V3[] = [];
  for (const sd of [1, -1] as const) {
    // 同 WeaponParts.bow 的弓臂折線
    const pts = smooth([
      [0, sd * 2.2, b * 0.25],
      [0, sd * L * 0.4, b * 0.85],
      [0, sd * L * 0.72, b],
      [0, sd * L * 0.92, b * 0.7 - r * 0.3],
      [0, sd * L, b * 0.35 - r],
    ]);
    meshes.push(
      paint(
        BOW.parts.limb!,
        ([t, w, d]) => {
          const s = sample(pts, t!);
          return [w! * th, s.p[1] + s.n[1] * d! * th, s.p[2] + s.n[2] * d! * th];
        },
        colorOf,
        BOW.tags,
        sd < 0,
      ),
    );
    const end = sample(pts, 1);
    tips.push(end.p);
    // 弓梢套：局部 +Y 朝弓梢外
    meshes.push(paint(BOW.parts.nock!, frame(end.p, [1, 0, 0], end.d, end.n), colorOf, BOW.tags, sd < 0));
  }
  // 弓身中段、握把、箭台（弓背 +Z；握把中心在 z = bend × 0.2）
  const mid = frame([0, 0, b * 0.2], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  for (const name of ['riser', 'grip', 'shelf']) meshes.push(paint(BOW.parts[name]!, mid, colorOf, BOW.tags));
  const [top, bottom] = tips as [V3, V3];
  meshes.push(taper(top, bottom, [0.07, 0.07], [0.07, 0.07], [o.string ?? 0xe8e0c8], 4, 0, Math.PI / 4));
  // 弓梢的刃 / 鉤 / 翼 / 寶珠：程式畫的（bow() 在弓臂、握把、弓弦之後的零件）
  if (o.tips) {
    const noTips = { ...o };
    delete noTips.tips;
    const plain = bow(noTips).meshes.length;
    meshes.push(...bow(o).meshes.slice(plain));
  }
  return { meshes, top, bottom };
}

export function blenderStaff(o: StaffOptions): { meshes: Mesh[]; focus: V3 } {
  const y = -o.length;
  const top = y + 1;
  const colorOf = (tag: string, q: number) => (tag === 'metal' ? pick(o.metal, q) : pick(o.shaft, q));
  const at = (oy: number) => frame([0, oy, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const meshes: Mesh[] = [
    paint(STAFF.parts.shaft!, ([t, x, z]) => [x!, o.butt + t! * (top - o.butt), z!], colorOf, STAFF.tags),
    paint(STAFF.parts.butt!, at(o.butt), colorOf, STAFF.tags),
  ];
  if (o.bands) for (const k of [0.4, 0.3, 0.55, 0.8]) meshes.push(paint(STAFF.parts.band!, at(y * k), colorOf, STAFF.tags));
  const program = staff(o);
  if (o.head === 'knob') meshes.push(paint(STAFF.parts.knob!, at(y), colorOf, STAFF.tags));
  else {
    // 杖頭：底稿的套環＋程式畫的杖頭（staff() 在杖身、杖尾、箍、套環之後的零件）
    const plain = staff({ ...o, head: 'knob' }).meshes.length - 1;
    meshes.push(paint(STAFF.parts.collar!, at(y + 0.2), colorOf, STAFF.tags), ...program.meshes.slice(plain + 1));
  }
  return { meshes, focus: program.focus };
}
