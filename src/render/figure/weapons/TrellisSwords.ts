import type { Mesh, V3 } from '../Poly3D';
import DATA from './swordTrellis.json';
import { BONE, darken, gem as gemMesh, hilt, lighten, type Tones } from './WeaponParts';
import type { SwordSpec } from './WeaponSpec';
import { baseMesh, lum, mix, pick, ranks, ribbon } from './TrellisAxes';

/**
 * 用 TRELLIS 生成的劍（設計者 2026-11-15；scripts/sword_trellis.py → swordTrellis.json）改出各階級的劍與橘 / 紅劍的劍身：
 * - 劍身：底稿的截面（斜面、中脊、刃緣的小構面）沿著目標的輪廓（每段的中心、半寬、半厚）拉長變形，
 *   所以直刃、寬刃、葉形、彎刀、骨節都共用同一個底稿；顏色依底稿每面的明暗名次對到色票。
 * - 護手、握柄、柄頭：底稿的零件縮放到遊戲的握把大小，護手依 guard 彎折，柄頭依 pommel 換色或變形。
 * - 深淵魔劍：直接用深淵統御者手上那把劍（art/monsters/abyss_sovereign/ai/sword.glb），不另外生成。
 * 座標同 WeaponParts：握把沿 +Y（握點在原點），劍身往 -Y、刃寬是 Z、厚度是 X。
 */
type Prop = { verts: number[][]; faces: number[][] };
const D = DATA as unknown as { props: { sword: Prop; abyss: Prop } };

/** 底稿（公尺，Y 朝柄頭）：劍身到 BLADE_TOP、護手到 GUARD_TOP、握柄到 GRIP_TOP，以上是柄頭；劍尖在 TIP */
const BLADE_TOP = 0.326;
const GUARD_TOP = 0.379;
const GRIP_TOP = 0.446;
const TIP = Math.min(...D.props.sword.verts.map((v) => v[1]!));
const GUARD_C = 0.35;
const POMMEL_C = 0.47;
const GUARD_HALF = Math.max(...D.props.sword.verts.map((v) => Math.abs(v[0]!)));
/** 遊戲的護手中心與柄頭中心（同 WeaponParts.hilt） */
const GAME_GUARD = -1.8;
const GAME_POMMEL = 3.75;
const H = (GAME_POMMEL - GAME_GUARD) / (POMMEL_C - GUARD_C);

interface Part {
  verts: number[][];
  faces: { idx: V3; c: number }[];
}
/** 依面的重心高度切出一個零件（頂點重新編號） */
function part(P: Prop, keep: (y: number, x: number) => boolean): Part {
  const map = new Map<number, number>();
  const verts: number[][] = [];
  const faces: Part['faces'] = [];
  for (const f of P.faces) {
    const a = P.verts[f[0]!]!, b = P.verts[f[1]!]!, c = P.verts[f[2]!]!;
    if (!keep((a[1]! + b[1]! + c[1]!) / 3, (Math.abs(a[0]!) + Math.abs(b[0]!) + Math.abs(c[0]!)) / 3)) continue;
    const idx = [f[0]!, f[1]!, f[2]!].map((i) => {
      let j = map.get(i);
      if (j === undefined) {
        j = verts.length;
        map.set(i, j);
        verts.push(P.verts[i]!);
      }
      return j;
    }) as V3;
    faces.push({ idx, c: f[3]! });
  }
  return { verts, faces };
}
const SW = D.props.sword;
const BLADE = part(SW, (y) => y < BLADE_TOP);
const GUARD = part(SW, (y) => y >= BLADE_TOP && y < GUARD_TOP);
const GRIP = part(SW, (y) => y >= GUARD_TOP && y < GRIP_TOP);
const POMMEL = part(SW, (y) => y >= GRIP_TOP);

/** 底稿劍身沿長度（s：0 = 護手、1 = 劍尖）的半寬、半厚，分段取最大值再平滑 */
const BINS = 48;
const sOf = (y: number) => Math.min(1, Math.max(0, (BLADE_TOP - y) / (BLADE_TOP - TIP)));
function profile(i: 0 | 2): number[] {
  const raw = new Array<number>(BINS + 1).fill(0);
  for (const v of BLADE.verts) {
    const b = Math.round(sOf(v[1]!) * BINS);
    raw[b] = Math.max(raw[b]!, Math.abs(v[i]!));
  }
  // 空的格子用前一格；再平滑兩次
  for (let b = 1; b <= BINS; b++) if (raw[b] === 0) raw[b] = raw[b - 1]!;
  let p = raw;
  for (let k = 0; k < 2; k++) p = p.map((x, b) => (p[Math.max(0, b - 1)]! + 2 * x + p[Math.min(BINS, b + 1)]!) / 4);
  return p.map((x) => Math.max(x, 0.004));
}
const W0 = profile(0);
const T0 = profile(2);
const at = (p: number[], s: number) => {
  const f = s * BINS;
  const i = Math.min(BINS - 1, Math.floor(f));
  return p[i]! + (p[i + 1]! - p[i]!) * (f - i);
};

/** 劍身的一個截面：y、中心線的 z、半寬 h、半厚 t（同 StyledSwords） */
export interface Sec {
  y: number;
  c?: number;
  h: number;
  t: number;
}
export interface BladeLook {
  colors: Tones;
  /** 裂刃中間的裂縫（左右兩半分開後，跨過中線的面）的顏色 */
  core?: number | undefined;
  /** 刃寬方向的額外位移（鋸齒、裂刃）：n = 底稿的相對寬度位置（-1～1）、s = 長度位置、h = 這裡的半寬 */
  warp?: (n: number, s: number, h: number) => number;
}

/** 依截面串起的輪廓（有 tip 就連劍尖）：長度位置 s → 截面 */
function outline(secs: readonly Sec[], tip?: V3): (s: number) => Required<Sec> {
  const pts: Required<Sec>[] = secs.map((a) => ({ y: a.y, c: a.c ?? 0, h: a.h, t: a.t }));
  if (tip) pts.push({ y: tip[1], c: tip[2], h: 0.05, t: 0.03 });
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1]! + Math.hypot(pts[i]!.y - pts[i - 1]!.y, pts[i]!.c - pts[i - 1]!.c));
  const total = d[d.length - 1]!;
  return (s) => {
    const x = s * total;
    let i = 1;
    while (i < pts.length - 1 && d[i]! < x) i++;
    const a = pts[i - 1]!, b = pts[i]!;
    const f = Math.min(1, Math.max(0, (x - d[i - 1]!) / Math.max(1e-6, d[i]! - d[i - 1]!)));
    return { y: a.y + (b.y - a.y) * f, c: a.c + (b.c - a.c) * f, h: a.h + (b.h - a.h) * f, t: a.t + (b.t - a.t) * f };
  };
}

/** 底稿的劍身沿 secs（＋劍尖）變形：截面的相對位置不變，寬、厚、中心線照目標 */
export function trellisBlade(secs: readonly Sec[], look: BladeLook, tip?: V3): Mesh {
  const line = outline(secs, tip);
  const n: number[] = [];
  const ss: number[] = [];
  const verts = BLADE.verts.map(([x, y, z]): V3 => {
    const s = sOf(y!);
    const q = line(s);
    const nx = x! / at(W0, s);
    n.push(nx);
    ss.push(s);
    const zz = q.c + nx * q.h + (look.warp ? look.warp(nx, s, q.h) : 0);
    return [(z! / at(T0, s)) * q.t, q.y, zz];
  });
  const r = ranks(BLADE.faces.map((f) => lum(f.c)));
  return baseMesh({
    verts,
    faces: BLADE.faces.map((f, i) => {
      const [a, b, c] = f.idx;
      const an = (Math.abs(n[a]!) + Math.abs(n[b]!) + Math.abs(n[c]!)) / 3;
      const s = (ss[a]! + ss[b]! + ss[c]!) / 3;
      let color: number;
      const across = Math.sign(n[a]!) !== Math.sign(n[b]!) || Math.sign(n[b]!) !== Math.sign(n[c]!);
      if (look.core !== undefined && across && s < 0.97) color = mix(look.core, 0xffffff, r[i]! * 0.35);
      else if (an > 0.78) color = pick(look.colors, 0.6 + r[i]! * 0.4);
      else color = pick(look.colors, r[i]! * 0.85);
      return { idx: f.idx, color };
    }),
  });
}

/** 底稿零件 → 遊戲（以護手中心為準縮放）；k = [刃寬方向, 長度方向, 厚度方向] 的額外倍數 */
const hiltVert = (x: number, y: number, z: number, kz = 1, ky = 1, kx = 1): V3 => [z * H * kx, GAME_GUARD + (y - GUARD_C) * H * ky, x * H * kz];
function partMesh(p: Part, tones: Tones, place: (v: number[]) => V3, color?: (q: number, i: number) => number): Mesh {
  const r = ranks(p.faces.map((f) => lum(f.c)));
  return baseMesh({ verts: p.verts.map(place), faces: p.faces.map((f, i) => ({ idx: f.idx, color: color ? color(r[i]!, i) : pick(tones, r[i]!) })) });
}

/** 護手的中心線：底稿兩端往柄頭翹，依 |x| 分段取平均高度 */
const GUARD_LIFT = (() => {
  const n = 12;
  const sum = new Array<number>(n + 1).fill(0), cnt = new Array<number>(n + 1).fill(0);
  for (const v of GUARD.verts) {
    const b = Math.round((Math.abs(v[0]!) / GUARD_HALF) * n);
    sum[b] = sum[b]! + v[1]!;
    cnt[b] = cnt[b]! + 1;
  }
  const out = sum.map((s, b) => (cnt[b] ? s / cnt[b]! : NaN));
  for (let b = 0; b <= n; b++) if (Number.isNaN(out[b])) out[b] = out[b - 1] ?? GUARD_C;
  return (u: number) => {
    const f = Math.min(n, u * n);
    const i = Math.min(n - 1, Math.floor(f));
    return out[i]! + (out[i + 1]! - out[i]!) * (f - i) - out[0]!;
  };
})();

/** 葉形劍身的寬度（同 WeaponParts.blade 的 leaf：0.8 → 1.2 → 0.5） */
const LEAF = [0.8, 1.05, 1.2, 1.1, 0.8, 0.5];
const leafW = (k: number) => {
  const f = Math.min(0.9999, Math.max(0, k)) * (LEAF.length - 1);
  const i = Math.floor(f);
  return LEAF[i]! + (LEAF[i + 1]! - LEAF[i]!) * (f - i);
};

/** 各階級的劍（取代 BlenderSwords 的底稿） */
export function trellisSword(s: SwordSpec, lengthScale: number): { meshes: Mesh[]; tip: V3 } {
  const L = s.length * lengthScale;
  const Y0 = -2.4;
  const broad = s.shape === 'broad';
  const leaf = s.shape === 'leaf';
  const tipLen = broad ? 2.4 : 3.4;
  const w = s.width;
  const t = 0.36 * (0.75 + 0.25 * (w / 1.4));
  const meshes: Mesh[] = [];

  // ── 劍身 ──
  const ks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const width = (k: number) => w * (broad ? 1 - 0.05 * k : leaf ? leafW(k) : 1 - 0.15 * k);
  const secs: Sec[] = ks.map((k) => ({ y: Y0 - L * k, h: width(k), t }));
  const tip: V3 = [0, Y0 - L - tipLen, 0];
  const bodyEnd = L / (L + tipLen);
  meshes.push(trellisBlade(secs, {
    colors: s.colors,
    core: s.shape === 'rift' ? s.runes ?? darken(s.colors[0]!, 0.5) : undefined,
    warp: (n, sv, h) => {
      const k = sv / bodyEnd;
      let dz = 0;
      if (s.shape === 'serrated' && n < -0.5 && k > 1 / 12 && k < 11 / 12) {
        // 背刃 5 個倒鉤：每段從劍尖往握把慢慢長出、尖端朝握把
        const p = 1 - ((k * 6) % 1);
        dz -= p * 0.55 * ((-n - 0.5) / 0.5) * (w / 1.4) * (h / Math.max(0.01, w));
      }
      if (s.shape === 'rift') dz += Math.sign(n) * w * 0.32 * (k <= 1 ? 1 : Math.max(0, 1 - (k - 1) * 5));
      return dz;
    },
  }, tip));
  // 血槽：劍身中央兩面各一道平帶（從護手到劍尖前），有符文的在上面再疊四段發光的；裂刃的裂縫本身就是符文色
  if (s.shape !== 'rift') {
    const fuller: Tones = s.fuller !== undefined ? [s.fuller, darken(s.fuller, 0.2)] : [darken(s.colors[0]!, 0.25), darken(s.colors[0]!, 0.4)];
    const along = (k0: number, k1: number, n = 6): V3[] => Array.from({ length: n + 1 }, (_, i): V3 => [0, Y0 - L * (k0 + ((k1 - k0) * i) / n), 0]);
    meshes.push((ribbon(along(0.02, 0.86, 10), w * 0.16, t + 0.06, fuller)));
    if (s.runes !== undefined) for (const c of [0.14, 0.33, 0.52, 0.71]) meshes.push((ribbon(along(c - 0.05, c + 0.05, 2), w * 0.13, t + 0.1, [lighten(s.runes, 0.15), s.runes])));
  }

  // ── 護手：底稿沿中心線彎折、拉長、收尖 ──
  const gw = ((s.guardWidth ?? 3.1) / 3.1) * (3.0 / (GUARD_HALF * H));
  const bend = (u: number): [number, number, number] => {
    // 回傳 [長度倍數, 往柄頭的偏移（遊戲單位）, 截面縮放]；e = 從護手 70% 處到末端的比例
    const e = Math.max(0, (u - 0.7) / 0.3);
    const lift = GUARD_LIFT(u) * H;
    switch (s.guard) {
      case 'bar':
        return [1, -lift, 1];
      case 'upturned':
        return [1, lift * 0.8, 1];
      case 'thorns':
        return [1 + 0.3 * e, -lift - 1.1 * e * e, 1 - 0.85 * e];
      case 'claws':
        return [1 + 0.08 * e, -lift - 2.4 * e * e, 1 - 0.7 * e];
      case 'wings':
        return [1 + 0.2 * e, 2.4 * e ** 1.5 - lift, 1 + 0.35 * e - 0.6 * e * e];
      default:
        return [1, 0, 1];
    }
  };
  meshes.push(partMesh(GUARD, s.guardColors, ([x, y, z]) => {
    const u = Math.min(1, Math.abs(x!) / GUARD_HALF);
    const c = GUARD_C + GUARD_LIFT(u);
    const [len, off, sec] = bend(u);
    // 中央護片跟著劍身寬
    const kz = u < 0.3 ? Math.max(gw, (w / 1.4) * gw) : gw * len;
    return [z! * H * sec, GAME_GUARD + (c - GUARD_C) * H + off + (y! - c) * H * sec, x! * H * kz];
  }));

  // ── 握柄：細一點（底稿的柄比遊戲的粗） ──
  const grip = s.grip ?? [0x4a3029, 0x3f2923, 0x352320];
  meshes.push(partMesh(GRIP, grip, ([x, y, z]) => hiltVert(x!, y!, z!, 0.75, 1, 0.75)));

  // ── 柄頭：圓球；寶石換色；尖刺拉成尖錐；骷髏換骨色加兩個眼窩；環用程式畫的 ──
  if (s.pommel === 'ring') meshes.push(...hilt('ring', grip, s.guardColors).slice(3));
  else {
    const gemC = s.gem ?? 0xd03040;
    const tones: Tones = s.pommel === 'gem' ? [gemC, darken(gemC, 0.3), lighten(gemC, 0.25)] : s.pommel === 'skull' ? BONE : s.guardColors;
    const k = s.pommel === 'skull' ? 1.25 : 1;
    meshes.push(partMesh(POMMEL, tones, ([x, y, z]) => {
      const d = y! - GRIP_TOP;
      if (s.pommel === 'spike') {
        const f = Math.min(1, d / (Math.max(...POMMEL.verts.map((v) => v[1]!)) - GRIP_TOP));
        return hiltVert(x! * (1 - 0.8 * f), GRIP_TOP + d * 2.6, z! * (1 - 0.8 * f));
      }
      return hiltVert(x! * k, GRIP_TOP + d * (s.pommel === 'gem' ? 1.25 : k), z! * k);
    }));
    if (s.pommel === 'skull') for (const sd of [1, -1]) meshes.push(gemMesh(0.3, [sd * 0.4, GAME_POMMEL + 0.2, 1.15], 0x201010));
  }
  return { meshes, tip };
}

/**
 * 深淵魔劍：深淵統御者的劍原樣縮放（顏色也照原本的貼圖）。握柄底端對到 y = -1.3（同 StyledSwords 的握柄），
 * 劍尖對到 tipY。回傳護手中心（代表物件的位置）與護手半寬。
 */
export function abyssSovereignSword(tipY: number): { meshes: Mesh[]; tip: V3; guard: V3; guardHalf: number } {
  const P = D.props.abyss;
  const ys = P.verts.map((v) => v[1]!);
  const lo = Math.min(...ys);
  const GRIP_LO = 0.31;
  const k = (-1.3 - tipY) / (GRIP_LO - lo);
  const place = ([x, y, z]: number[]): V3 => [z! * k, -1.3 + (y! - GRIP_LO) * k, x! * k];
  const mesh = baseMesh({ verts: P.verts.map(place), faces: P.faces.map((f) => ({ idx: [f[0]!, f[1]!, f[2]!] as V3, color: f[3]! })) });
  const halfAt = (y0: number, y1: number) => Math.max(...P.verts.filter((v) => v[1]! >= y0 && v[1]! < y1).map((v) => Math.abs(v[0]!)));
  return { meshes: [mesh], tip: place([0, lo, 0]), guard: place([0, 0.22, 0]), guardHalf: halfAt(0.14, 0.24) * k };
}
