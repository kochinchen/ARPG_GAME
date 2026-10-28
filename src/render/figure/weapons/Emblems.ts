import type { Mesh, V3 } from '../Poly3D';
import { darken, gem, lighten, taper, type Tones } from './WeaponParts';

/**
 * 橘 / 紅武器的代表物件（獨特標示物）：依每一件的特殊能力選一個符號，鑲在武器上（劍身靠護手處、斧頭中央、
 * 杖頭下方、弓握把下方）。符號畫在 Y-Z 平面（Y 朝上），X 是厚度，兩面都看得到；大小約半徑 1，放上去時再縮放。
 */
export type EmblemKind =
  | 'snowflake' // 冰霜、凍結
  | 'moon' // 月、快攻
  | 'drop' // 血、吸血
  | 'skull' // 亡者、處決
  | 'eye' // 單眼、看準目標
  | 'fang' // 撕咬、獸牙
  | 'claw' // 爪、突襲
  | 'flame' // 火焰
  | 'bolt' // 閃電
  | 'crown' // 王者、守誓
  | 'star' // 星、暴擊累積
  | 'shield' // 防守反擊、架式
  | 'spore' // 孢子
  | 'flower' // 寄生花
  | 'web' // 蛛網
  | 'rune' // 咒紋、法術
  | 'feather' // 風、機動
  | 'swirl' // 旋舞、迴旋、漩渦
  | 'heart' // 生命、續航
  | 'horn' // 衝撞
  | 'cross' // 斷罪、聖
  | 'rift' // 裂痕、裂地
  | 'arrow' // 投射物、先機
  | 'brain' // 腦、暈眩
  | 'tomb' // 墓、亡者軍團
  | 'sun' // 焚星、群星
  | 'jaw' // 熔顎
  | 'hook' // 鉤、破甲
  | 'tri' // 三元素
  | 'chain' // 纏繞、牽制
  | 'drip' // 毒液、酸
  | 'quake' // 震地
  | 'hammer' // 重擊、碎顱
  | 'tuning' // 共鳴
  | 'wing' // 翼、魔王
  | 'eclipse'; // 虛空、暗黑領域

export interface Emblem {
  kind: EmblemKind;
  /** 主色（多半是發光色） */
  color: number;
  /** 托座 / 次要色 */
  accent?: number;
}

const T = 0.22; // 片狀的半厚度
const tones = (c: number): Tones => [lighten(c, 0.4), c, darken(c, 0.3), lighten(c, 0.15)];
const P = (y: number, z: number, x = 0): V3 => [x, y, z];
/** Y-Z 平面上的一條片狀線段（寬 w） */
const bar = (a: V3, b: V3, w: number, c: number, w1 = w, th = T): Mesh => taper(a, b, [th * 1.41, w * 1.41], [th * 1.41, w1 * 1.41], tones(c), 4, 0, Math.PI / 4);
/** 片狀的折線（扁的方形截面） */
const flat = (pts: V3[], r0: [number, number], r1: [number, number], c: Tones): Mesh[] =>
  pts.slice(0, -1).map((p, i) => {
    const n = pts.length - 1;
    const k0 = i / n, k1 = (i + 1) / n;
    const w0 = r0[1] + (r1[1] - r0[1]) * k0, w1 = r0[1] + (r1[1] - r0[1]) * k1;
    return taper(p, pts[i + 1]!, [r0[0] * 1.41, w0 * 1.41], [r0[0] * 1.41, w1 * 1.41], c, 4, i, Math.PI / 4);
  });
const ball = (r: number, c: V3, color: number, s: V3 = [0.8, 1, 1]): Mesh => gem(r, c, color, s, 6, 4);

function shape(kind: EmblemKind, c: number, a: number): Mesh[] {
  switch (kind) {
    case 'snowflake':
      return [
        ...[0, 1, 2].map((i) => {
          const t = (i / 3) * Math.PI;
          return bar(P(Math.cos(t) * 1.1, Math.sin(t) * 1.1), P(-Math.cos(t) * 1.1, -Math.sin(t) * 1.1), 0.2, c);
        }),
        ...[0, 1, 2, 3, 4, 5].map((i) => ball(0.2, P(Math.cos((i / 6) * Math.PI * 2) * 1.15, Math.sin((i / 6) * Math.PI * 2) * 1.15), lighten(c, 0.3))),
        ball(0.3, P(0, 0), lighten(c, 0.5)),
      ];
    case 'moon': {
      // 新月：外弧與內弧之間填滿（中間粗、兩端尖）
      const out: Mesh[] = [];
      const deg = [-140, -100, -60, -20, 20, 60, 100, 140];
      for (let i = 0; i < deg.length - 1; i++) {
        const t0 = (deg[i]! * Math.PI) / 180, t1 = (deg[i + 1]! * Math.PI) / 180;
        const w = (t: number) => 0.06 + 0.38 * Math.cos(t * 0.55);
        out.push(taper(P(Math.sin(t0) * 0.95, Math.cos(t0) * 0.95 - 0.15), P(Math.sin(t1) * 0.95, Math.cos(t1) * 0.95 - 0.15), [T * 1.41, w(t0) * 1.41], [T * 1.41, w(t1) * 1.41], tones(c), 4, i, Math.PI / 4));
      }
      return out;
    }
    case 'drop':
      return [ball(0.75, P(-0.3, 0), c, [0.55, 0.9, 0.9]), taper(P(0.2, 0), P(1.2, 0), [T * 1.6, 0.55], [0.05, 0.05], tones(c), 4, 0, Math.PI / 4)];
    case 'skull':
      return [ball(0.85, P(0.15, 0), a, [0.7, 1, 0.95]), ball(0.25, P(0.2, 0.32, 0.45), c), ball(0.25, P(0.2, -0.32, 0.45), c), ball(0.25, P(0.2, 0.32, -0.45), c), ball(0.25, P(0.2, -0.32, -0.45), c), bar(P(-0.6, -0.4), P(-0.6, 0.4), 0.2, a)];
    case 'eye':
      return [ball(0.95, P(0, 0), 0xf0ece4, [0.55, 0.7, 1.2]), ball(0.42, P(0, 0, 0.3), c, [1, 1, 1]), ball(0.42, P(0, 0, -0.3), c, [1, 1, 1]), ball(0.16, P(0, 0, 0.55), 0x101018), ball(0.16, P(0, 0, -0.55), 0x101018)];
    case 'fang':
      return flat([P(1, -0.3), P(0.3, 0.1), P(-0.5, 0.25), P(-1.2, 0)], [T * 1.4, 0.55], [0.05, 0.05], tones(a)).concat([ball(0.22, P(0.9, -0.3), c)]);
    case 'claw':
      return [-0.55, 0, 0.55].flatMap((z) => flat([P(0.9, z * 0.6), P(0.1, z), P(-0.9, z + 0.35)], [T, 0.25], [0.04, 0.05], tones(a))).concat([ball(0.3, P(0.95, 0), c)]);
    case 'flame':
      return [
        taper(P(-0.8, 0), P(1.3, 0.1), [T * 1.5, 0.6], [0.04, 0.05], tones(c), 4, 0, Math.PI / 4),
        taper(P(-0.7, 0.45), P(0.7, 0.75), [T * 1.3, 0.38], [0.04, 0.05], tones(lighten(c, 0.2)), 4, 1, Math.PI / 4),
        taper(P(-0.7, -0.45), P(0.5, -0.8), [T * 1.3, 0.35], [0.04, 0.05], tones(darken(c, 0.1)), 4, 2, Math.PI / 4),
        ball(0.35, P(-0.6, 0), lighten(c, 0.5)),
      ];
    case 'bolt':
      return flat([P(1.2, 0.35), P(0.2, -0.25), P(0.1, 0.35), P(-1.2, -0.3)], [T, 0.32], [T, 0.12], tones(c));
    case 'crown':
      return [bar(P(-0.6, -0.9), P(-0.6, 0.9), 0.32, a), ...[-0.8, 0, 0.8].map((z, i) => taper(P(-0.5, z), P(i === 1 ? 1.1 : 0.6, z * 1.1), [T, 0.3], [0.04, 0.04], tones(a), 4, i, Math.PI / 4)), ball(0.25, P(-0.6, 0), c), ball(0.2, P(1.1, 0), c)];
    case 'star':
      return [bar(P(-1.2, 0), P(0, 0), 0.05, c, 0.4), bar(P(0, 0), P(1.2, 0), 0.4, c, 0.05), bar(P(0, -1.1), P(0, 0), 0.05, c, 0.38), bar(P(0, 0), P(0, 1.1), 0.38, c, 0.05), ball(0.32, P(0, 0), lighten(c, 0.5))];
    case 'shield':
      return [bar(P(0.9, 0), P(-1.1, 0), 0.85, a, 0.06, T * 1.2), ball(0.32, P(0.25, 0, 0.1), c), ball(0.32, P(0.25, 0, -0.1), c)];
    case 'spore':
      return [P(0.4, 0.4), P(-0.3, 0.5), P(0.5, -0.45), P(-0.45, -0.3), P(0, 0)].map((p, i) => ball(0.38 - i * 0.03, p, i === 4 ? lighten(c, 0.4) : c, [0.9, 1, 1]));
    case 'flower':
      return [...[0, 1, 2, 3, 4].map((i) => {
        const t = (i / 5) * Math.PI * 2;
        return bar(P(Math.cos(t) * 0.25, Math.sin(t) * 0.25), P(Math.cos(t) * 1.1, Math.sin(t) * 1.1), 0.42, a, 0.08);
      }), ball(0.38, P(0, 0), c)];
    case 'web': {
      const ring = [0, 1, 2, 3, 4, 5, 6].map((i) => P(Math.cos((i / 6) * Math.PI * 2) * 0.75, Math.sin((i / 6) * Math.PI * 2) * 0.75));
      return [...[0, 1, 2].map((i) => {
        const t = (i / 3) * Math.PI;
        return bar(P(Math.cos(t) * 1.15, Math.sin(t) * 1.15), P(-Math.cos(t) * 1.15, -Math.sin(t) * 1.15), 0.08, a);
      }), ...flat(ring, [T * 0.8, 0.07], [T * 0.8, 0.07], tones(a)), ball(0.35, P(0, 0), c)];
    }
    case 'rune':
      return [bar(P(1.2, 0), P(0, 0), 0.05, a, 0.7), bar(P(0, 0), P(-1.2, 0), 0.7, a, 0.05), bar(P(0.4, -0.35), P(-0.4, 0.35), 0.1, c, 0.1, T * 1.3), bar(P(0.4, 0.35), P(-0.4, -0.35), 0.1, c, 0.1, T * 1.3)];
    case 'feather':
      return [bar(P(-1.2, 0), P(1.2, 0), 0.1, a, 0.04), ...[-0.6, -0.1, 0.4].flatMap((y, i) => [bar(P(y, 0), P(y + 0.5, 0.75 - i * 0.1), 0.16, c, 0.05), bar(P(y, 0), P(y + 0.5, -0.75 + i * 0.1), 0.16, c, 0.05)])];
    case 'swirl': {
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i * 0.75;
        const r = 0.15 + i * 0.13;
        pts.push(P(Math.sin(t) * r, Math.cos(t) * r));
      }
      return flat(pts, [T, 0.08], [T, 0.22], tones(c));
    }
    case 'heart':
      return [ball(0.5, P(0.3, 0.4), c, [0.7, 0.9, 0.9]), ball(0.5, P(0.3, -0.4), c, [0.7, 0.9, 0.9]), taper(P(0.25, 0), P(-1.1, 0), [T * 1.6, 0.7], [0.04, 0.05], tones(c), 4, 0, Math.PI / 4)];
    case 'horn':
      return flat([P(-1, -0.6), P(-0.2, -0.2), P(0.5, 0.1), P(1.1, 0.7)], [T * 1.5, 0.55], [0.05, 0.05], tones(a)).concat([ball(0.25, P(-0.9, -0.6), c)]);
    case 'cross':
      return [bar(P(1.2, 0), P(-1.2, 0), 0.24, a, 0.24), bar(P(0.4, -0.75), P(0.4, 0.75), 0.24, a, 0.24), ball(0.3, P(0.4, 0), c)];
    case 'rift':
      return [bar(P(1.2, -0.1), P(-1.2, -0.25), 0.35, a, 0.1), bar(P(1.2, 0.25), P(-1.2, 0.1), 0.1, a, 0.35), ...flat([P(1, 0.05), P(0.3, -0.1), P(-0.3, 0.12), P(-1, -0.05)], [T * 1.3, 0.08], [T * 1.3, 0.08], tones(c))];
    case 'arrow':
      return [bar(P(-1.2, 0), P(0.6, 0), 0.08, a), taper(P(0.5, 0), P(1.3, 0), [T * 1.2, 0.45], [0.04, 0.04], tones(c), 4, 0, Math.PI / 4), bar(P(-1.2, 0), P(-0.7, 0.4), 0.12, c, 0.05), bar(P(-1.2, 0), P(-0.7, -0.4), 0.12, c, 0.05)];
    case 'brain':
      return [ball(0.65, P(0.1, 0.3), c, [0.7, 0.9, 0.85]), ball(0.65, P(0.1, -0.3), c, [0.7, 0.9, 0.85]), bar(P(0.7, 0), P(-0.5, 0), 0.06, darken(c, 0.4), 0.06, T * 2.6), taper(P(-0.4, 0), P(-1.1, 0), [T, 0.25], [T, 0.15], tones(darken(c, 0.2)), 4, 0, Math.PI / 4)];
    case 'tomb':
      return [bar(P(-1.1, 0), P(0.7, 0), 0.8, a, 0.8, T * 1.1), ball(0.62, P(0.65, 0), a, [0.75, 0.6, 1.25]), bar(P(0.4, 0), P(-0.6, 0), 0.1, c, 0.1, T * 1.4), bar(P(0.05, -0.35), P(0.05, 0.35), 0.1, c, 0.1, T * 1.4)];
    case 'sun':
      return [ball(0.55, P(0, 0), c, [0.9, 1, 1]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const t = (i / 8) * Math.PI * 2;
        return taper(P(Math.cos(t) * 0.55, Math.sin(t) * 0.55), P(Math.cos(t) * (i % 2 ? 1 : 1.3), Math.sin(t) * (i % 2 ? 1 : 1.3)), [T, 0.2], [0.04, 0.04], tones(lighten(c, 0.2)), 4, i, Math.PI / 4);
      })];
    case 'jaw':
      return [1, -1].flatMap((s) => flat([P(s * 0.9, -0.9), P(s * 0.5, 0), P(s * 0.9, 0.9)], [T, 0.3], [T, 0.3], tones(a)).concat([0.45, 0, -0.45].map((z) => taper(P(s * 0.6, z), P(s * 0.1, z), [T, 0.15], [0.04, 0.04], tones(0xfff4e0), 4, 0, Math.PI / 4)))).concat([ball(0.3, P(0, 0), c)]);
    case 'hook':
      return flat([P(-1.1, 0), P(0.4, 0), P(1, -0.45), P(0.7, -0.95)], [T, 0.22], [0.04, 0.06], tones(a)).concat([ball(0.25, P(-1.1, 0), c)]);
    case 'tri':
      return [0, 1, 2].map((i) => {
        const t = (i / 3) * Math.PI * 2 + Math.PI / 2;
        return ball(0.42, P(Math.sin(t) * 0.65, Math.cos(t) * 0.65), [0xff6a2a, 0x8ae0ff, 0xd8b8ff][i]!);
      }).concat([ball(0.25, P(0, 0), c)]);
    case 'chain': {
      const out: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const y = 0.8 - i * 0.8;
        out.push(...flat([P(y + 0.4, 0), P(y, 0.3), P(y - 0.4, 0), P(y, -0.3), P(y + 0.4, 0)], [T, 0.1], [T, 0.1], tones(i === 1 ? c : a)));
      }
      return out;
    }
    case 'drip':
      return [bar(P(1, -0.8), P(1, 0.8), 0.25, a), ...[-0.5, 0.1, 0.6].map((z, i) => ball(0.3, P(0.2 - i * 0.35, z), c, [0.6, 1.4, 0.8]))];
    case 'quake':
      return [bar(P(-0.9, -1.1), P(-0.9, 1.1), 0.3, a), ...flat([P(1.1, 0), P(0.4, 0.3), P(0, -0.25), P(-0.6, 0.2)], [T * 1.2, 0.14], [T * 1.2, 0.1], tones(c))];
    case 'hammer':
      return [bar(P(-1.2, 0), P(0.4, 0), 0.14, a), bar(P(0.75, -0.8), P(0.75, 0.8), 0.45, a, 0.45, T * 1.5), ball(0.24, P(0.75, 0, 0.3), c), ball(0.24, P(0.75, 0, -0.3), c)];
    case 'tuning':
      return [bar(P(-1.2, 0), P(-0.2, 0), 0.12, a), bar(P(-0.2, -0.45), P(-0.2, 0.45), 0.12, a), bar(P(-0.2, 0.45), P(1.1, 0.45), 0.12, a), bar(P(-0.2, -0.45), P(1.1, -0.45), 0.12, a), ...[0.3, 0.7, 1.1].map((y) => ball(0.13, P(y, 0), c))];
    case 'wing':
      return [0, 1, 2].map((i) => bar(P(-0.7, -0.6), P(1.15 - i * 0.6, 0.3 + i * 0.45), 0.42 - i * 0.06, i === 0 ? a : darken(a, i * 0.12), 0.06)).concat([ball(0.3, P(-0.7, -0.6), c)]);
    case 'eclipse':
      return [ball(0.95, P(0, 0), c, [0.5, 1, 1]), ball(0.8, P(0.15, 0.2, 0.18), 0x140c20, [0.5, 1, 1]), ball(0.8, P(0.15, 0.2, -0.18), 0x140c20, [0.5, 1, 1])];
  }
}

/**
 * 代表物件：中心 at、大小 size（約半徑）；depth 是厚度方向（X）的倍率，要比鑲上去的劍身、斧刃厚，兩面才都凸出來。
 * rot：在 Y-Z 平面上的旋轉（弧度），例如劍尖朝下時符號轉正。
 */
export function emblemMeshes(e: Emblem, at: V3, size: number, depth = size, rot = 0): Mesh[] {
  const a = e.accent ?? 0xd4ae54;
  const c = Math.cos(rot), s = Math.sin(rot);
  const place = (m: Mesh, xk: number, dx = 0): Mesh => ({
    ...m,
    verts: m.verts.map(([x, y, z]) => [at[0] + dx + x * xk, at[1] + (y * c - z * s) * size, at[2] + (y * s + z * c) * size] as V3),
  });
  // 兩面各墊一塊深色的薄圓牌（緊貼在符號底下、不隨厚度變厚），符號和武器同色時也看得出來
  // 每一片符號至少凸出到 T × depth（比較薄的小零件一起加厚，才不會陷進武器裡）；圓牌貼在那個高度底下
  const parts = shape(e.kind, e.color, a).map((m) => place(m, depth * Math.max(1, T / Math.max(...m.verts.map((v) => v[0])))));
  const back = Math.max(0.1, T * depth - 0.16);
  const plates = [1, -1].map((sd) => place(gem(1.25, [0, 0, 0], darken(a, 0.72), [0.06, 1, 1], 8, 4), 1, sd * back));
  return [...plates, ...parts];
}
