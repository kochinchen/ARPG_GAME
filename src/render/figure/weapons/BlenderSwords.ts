import type { Mesh, V3 } from '../Poly3D';
import DATA from './swordBase.json';
import { BONE, darken, gem as gemMesh, hilt, lighten, type Tones } from './WeaponParts';
import type { SwordSpec } from './WeaponSpec';
import { baseMesh, mix, pick, ranks } from './TrellisAxes';

/**
 * 用 Blender 建的劍底稿（scripts/sword_base.py → swordBase.json）改出各階級的劍（設計者 2026-11-14 的試作；
 * 劍的形狀單純，不用 TRELLIS）：劍身依 length / width 拉長加寬，依 shape 變形（寬刃收得少、劍尖短；鋸齒在背刃切出倒鉤；
 * 裂刃從中間裂開，裂縫填符文色），護手依 guard 彎成一字 / 上翹 / 爪，荊棘與翼另外加程式畫的尖角；柄頭依 pommel 換寶石色、拉成尖錐，
 * 或換成程式畫的骷髏 / 環。顏色依每面的明暗名次對到色票。
 * 座標同 WeaponParts：握把沿 +Y（握點在原點），劍身往 -Y、刃寬是 Z、厚度是 X。
 */
type Part = { verts: number[][]; faces: number[][] };
type Meta = { bladeStart: number; bladeLength: number; tipLength: number; halfWidth: number; thickness: number; narrow: number; guardZ: number; guardHalf: number; pommelZ: number; pommelR: number };
const D = DATA as unknown as { meta: Meta; parts: Record<string, Part>; tags: string[] };
const M = D.meta;
const TAG = Object.fromEntries(D.tags.map((t, i) => [t, i])) as Record<string, number>;

/** 底稿護手兩端往柄頭翹的量（同 sword_base.py；Blender 的 -Z = 柄頭方向） */
const baseLift = (u: number) => (u < 0.55 ? 0 : -0.75 * ((u - 0.55) / 0.45) ** 2);

/** 葉形劍身的寬度（同 WeaponParts.blade 的 leaf：0.8 → 1.2 → 0.5） */
const LEAF = [0.8, 1.05, 1.2, 1.1, 0.8, 0.5];
const leafW = (k: number) => {
  const f = Math.min(0.9999, Math.max(0, k)) * (LEAF.length - 1);
  const i = Math.floor(f);
  return LEAF[i]! + (LEAF[i + 1]! - LEAF[i]!) * (f - i);
};

/** Blender（X 刃寬、Y 厚度、Z 劍尖方向）→ 遊戲（X 厚度、Y = -Z、Z 刃寬） */
const toGame = (x: number, y: number, z: number): V3 => [y, -z, x];

export function blenderSword(s: SwordSpec, lengthScale: number): { meshes: Mesh[]; tip: V3 } {
  const L = s.length * lengthScale;
  const broad = s.shape === 'broad';
  const leaf = s.shape === 'leaf';
  const tipLen = broad ? 2.4 : M.tipLength;
  const wk = s.width / M.halfWidth;
  const tk = 0.75 + 0.25 * wk;
  const gw = (s.guardWidth ?? 3.1) / 3.1;
  const meshes: Mesh[] = [];

  // ── 劍身 ──
  const B = D.parts.blade!;
  const bladeVerts = B.verts.map(([x, y, z]): V3 => {
    let nz: number, w: number, k: number;
    if (z! <= M.bladeStart + M.bladeLength) {
      k = Math.max(0, (z! - M.bladeStart) / M.bladeLength);
      nz = z! < M.bladeStart ? z! : M.bladeStart + k * L;
      // 底稿收窄到 narrow；寬刃只收 0.95；葉形（攻速詞綴）中段鼓起、兩頭收細
      w = broad ? (1 - 0.05 * k) / (1 - (1 - M.narrow) * k) : leaf ? leafW(k) / (1 - (1 - M.narrow) * k) : 1;
    } else {
      k = 1 + (z! - M.bladeStart - M.bladeLength) / M.tipLength;
      nz = M.bladeStart + L + (k - 1) * tipLen;
      w = broad ? 0.95 / M.narrow : leaf ? leafW(1) / M.narrow : 1;
    }
    let nx = x! * wk * w;
    const local = M.halfWidth * wk * (k <= 1 ? 1 - (1 - M.narrow) * k : M.narrow * (1 - (k - 1)));
    if (s.shape === 'serrated' && nx < 0 && k > 1 / 12 && k < 11 / 12) {
      // 背刃 5 個倒鉤：每段從劍尖往握把慢慢長出、尖端朝握把
      const p = 1 - ((k * 6) % 1);
      const out = Math.max(0, (-nx / Math.max(0.01, local) - 0.5) / 0.5);
      nx -= p * 0.55 * out * wk;
    }
    if (s.shape === 'rift') {
      // 從中間裂開：裂縫到劍尖前收攏
      const gap = s.width * 0.32 * (k <= 1 ? 1 : Math.max(0, 1 - (k - 1) * 1.4));
      nx += Math.sign(x!) * gap;
    }
    return toGame(nx, y! * tk, nz);
  });
  const tagOf = (f: number[]) => f[4]!;
  const rankIn = (part: Part, sel: (f: number[]) => boolean) => {
    const idx = part.faces.map((_, i) => i).filter((i) => sel(part.faces[i]!));
    const r = ranks(idx.map((i) => part.faces[i]![3]!));
    return new Map(idx.map((i, n) => [i, r[n]!]));
  };
  const bladeRank = rankIn(B, (f) => tagOf(f) === TAG.blade || tagOf(f) === TAG.core);
  const edgeRank = rankIn(B, (f) => tagOf(f) === TAG.edge);
  const fullerRank = rankIn(B, (f) => tagOf(f) === TAG.fuller);
  const fullerTones: Tones = s.fuller !== undefined ? [s.fuller, darken(s.fuller, 0.2), lighten(s.fuller, 0.1)] : s.colors.map((c) => darken(c, 0.25));
  const runeBand = (z: number) => {
    // 遊戲座標 y = -z：符文是沿血槽的四段
    const k = (-z - M.bladeStart) / L;
    return [0.14, 0.33, 0.52, 0.71].some((c) => Math.abs(k - c) < 0.055);
  };
  meshes.push(baseMesh({
    verts: bladeVerts,
    faces: B.faces.map((f, i) => {
      const idx: V3 = [f[0]!, f[1]!, f[2]!];
      const t = tagOf(f);
      let color: number;
      if (t === TAG.core && s.shape === 'rift' && s.runes !== undefined) color = mix(s.runes, 0xffffff, bladeRank.get(i)! * 0.35);
      else if (t === TAG.edge) color = pick(s.colors, 0.6 + edgeRank.get(i)! * 0.4);
      else if (t === TAG.fuller) {
        const cy = (bladeVerts[idx[0]]![1] + bladeVerts[idx[1]]![1] + bladeVerts[idx[2]]![1]) / 3;
        const glow = s.runes !== undefined && (s.shape === 'rift' || runeBand(cy));
        color = glow ? mix(s.runes!, 0xffffff, fullerRank.get(i)! * 0.35) : pick(fullerTones, fullerRank.get(i)!);
      } else color = pick(s.colors, bladeRank.get(i)! * 0.85);
      return { idx, color };
    }),
  }));

  // ── 護手：把底稿的護手沿中心線彎折、拉長、收尖（Blender 的 +Z = 劍尖方向） ──
  // e = 從護手 70% 處到末端的比例；回傳 [長度倍數, 往劍尖的偏移, 截面縮放]
  const bend = (u: number): [number, number, number] => {
    const e = Math.max(0, (u - 0.7) / 0.3);
    switch (s.guard) {
      case 'bar':
        return [1, 0, 1];
      case 'upturned':
        return [1, baseLift(u) * 1.8, 1];
      case 'thorns':
        // 兩端拉長成往劍尖斜的尖刺
        return [1 + 0.3 * e, 1.1 * e * e, 1 - 0.85 * e];
      case 'claws':
        // 兩端往劍尖彎成爪
        return [1 + 0.08 * e, 2.4 * e * e, 1 - 0.7 * e];
      case 'wings':
        // 兩端往柄頭大幅翹起、變寬，像翅膀
        return [1 + 0.2 * e, -2.4 * e ** 1.5, 1 + 0.35 * e - 0.6 * e * e];
      default:
        return [1, baseLift(u), 1];
    }
  };
  for (const name of ['guard', 'guard_block']) {
    const P = D.parts[name]!;
    const r = rankIn(P, () => true);
    const verts = P.verts.map(([x, y, z]): V3 => {
      // 中央護片跟著劍身寬
      if (name === 'guard_block') return toGame(x! * Math.max(1, wk), y! * tk, z!);
      const u = Math.min(1, Math.abs(x!) / M.guardHalf);
      const c = M.guardZ + baseLift(u);
      const [len, off, sec] = bend(u);
      return toGame(x! * gw * len, y! * sec, M.guardZ + off + (z! - c) * sec);
    });
    meshes.push(baseMesh({ verts, faces: P.faces.map((f, i) => ({ idx: [f[0]!, f[1]!, f[2]!] as V3, color: pick(s.guardColors, r.get(i)!) })) }));
  }

  // ── 握把、金屬箍 ──
  const grip = s.grip ?? [0x4a3029, 0x3f2923, 0x352320];
  for (const name of ['grip', 'collar_top', 'collar_pommel']) {
    const P = D.parts[name]!;
    const wrapR = rankIn(P, (f) => tagOf(f) === TAG.wrap);
    const gripR = rankIn(P, (f) => tagOf(f) !== TAG.wrap);
    meshes.push(baseMesh({
      verts: P.verts.map(([x, y, z]) => toGame(x!, y!, z!)),
      faces: P.faces.map((f, i) => {
        const t = tagOf(f);
        const color = t === TAG.collar ? pick(s.guardColors, gripR.get(i)! * 0.7) : t === TAG.wrap ? pick(grip, 0.5 + wrapR.get(i)! * 0.5) : mix(pick(grip, gripR.get(i)! * 0.5), 0x000000, 0.25);
        return { idx: [f[0]!, f[1]!, f[2]!] as V3, color };
      }),
    }));
  }

  // ── 柄頭：圓球；寶石換色；尖刺拉成尖錐；骷髏換骨色加兩個眼窩（程式畫的，hilt() 的最後兩個零件）；環用程式畫的 ──
  if (s.pommel === 'ring') meshes.push(...hilt('ring', grip, s.guardColors).slice(3));
  else {
    const P = D.parts.pommel!;
    const r = rankIn(P, () => true);
    const gemC = s.gem ?? 0xd03040;
    const tones: Tones = s.pommel === 'gem' ? [gemC, darken(gemC, 0.3), lighten(gemC, 0.25)] : s.pommel === 'skull' ? BONE : s.guardColors;
    const k = s.pommel === 'skull' ? 1.2 : s.pommel === 'gem' ? 0.9 : 1;
    meshes.push(baseMesh({
      verts: P.verts.map(([x, y, z]): V3 => {
        if (s.pommel === 'spike' && z! < M.pommelZ) {
          // 往柄尾拉成尖錐
          const t = Math.min(1, (M.pommelZ - z!) / M.pommelR);
          return toGame(x! * (1 - 0.85 * t), y! * (1 - 0.85 * t), M.pommelZ - (M.pommelZ - z!) * 2.8);
        }
        const kz = s.pommel === 'gem' ? 1.2 : k;
        return toGame(x! * k, y! * k, M.pommelZ - 0.15 * (k - 1) * 4 + (z! - M.pommelZ) * kz);
      }),
      faces: P.faces.map((f, i) => ({ idx: [f[0]!, f[1]!, f[2]!] as V3, color: pick(tones, r.get(i)!) })),
    }));
    if (s.pommel === 'skull') {
      // 眼窩：同 hilt() 的骷髏，朝刃緣（遊戲的 +Z）
      for (const sd of [1, -1]) meshes.push(gemMesh(0.3, [sd * 0.4, -M.pommelZ + 0.1, 1.08], 0x201010));
    }
  }

  return { meshes, tip: toGame(0, 0, M.bladeStart + L + tipLen) };
}
