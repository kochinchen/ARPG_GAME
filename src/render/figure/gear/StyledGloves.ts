import type { Joint } from '../FigureModel';
import { aiArmShape, aiHandShape, AI_LIMB, type ArmSide } from '../HeroineAI';
import { bar, detail, knob, loft, tone, type Ring } from '../Facets';
import { box, mapVerts, type Mesh, type V3 } from '../Poly3D';
import { chain, darken, gem, lighten, taper, type Tones } from '../weapons/WeaponParts';
import { dense, F, horn, rand } from './StyledArmors';

/**
 * 橘 / 紅手套的專屬造型（設計稿：art/gear/gloves_unique/concept/）：
 * 手套包住手指，從手腕蓋到前臂，手肘露出來；被蓋住的手與前臂護腕不畫。
 * 手臂模型不在關節中心、左右也不對稱，所以外殼依量到的手臂形狀放樣（aiArmShape、aiHandShape），才會真的套在手臂上。
 * forearm 關節的區域座標：y 往手腕遞減（手腕在 y = -AI_LIMB.forearm）；z+ 朝前；外側是 L 的 x+、R 的 x-。
 * hand 關節的區域座標：手指朝 y-；手背朝外側；拇指朝 z+。
 */

export type GloveLook = 'demonClaw' | 'cryptFist' | 'lavaFist' | 'spiderClaw' | 'godHand' | 'titanGrip' | 'obsidian' | 'carapace' | 'element' | 'barbed' | 'plainGauntlet';
/** 同一款裡的差異零件 */
export type GloveVariant = 'hook' | 'acid' | 'sky' | 'frost' | 'eye' | 'mind' | 'fire' | 'tri' | 'bone' | 'blast' | 'repeater' | 'soft' | 'heavy';

export interface StyledGloveSpec {
  look: GloveLook;
  mat: Tones;
  trim: Tones;
  /** 爪與指節 */
  claw: Tones;
  /** 發光的顏色（火眼、寶石、裂紋） */
  glow: number;
  /** 第二種材質（大刃、古銅底色、倒刺） */
  accent?: Tones;
  variant?: GloveVariant;
  /** 爪的長度（省略 = 沒有爪） */
  clawLen?: number;
  /** 一般手套的詞條小裝飾：外側兩根小尖刺（荊棘） */
  spikes?: Tones;
}

/** 關節 → 網格；hide = 被蓋住、不畫的身體部位 */
export interface StyledGlove {
  parts: Map<Joint, Mesh[]>;
  hide: string[];
}

/** 發光線的顏色：保持飽和（小小的線在光照下很容易被洗白） */
const lit = (c: number): Tones => [c, lighten(c, 0.1), darken(c, 0.15), c];

/** 蛛后毒爪手腕的毒牙 */
const BONE_FANG: Tones = [0xe0d2b4, 0xcbb487, 0x8a7450, 0xc0a878];

/** 外殼比手臂厚多少（比例要粗壯） */
const THICK = 0.4;

/** 前臂的高度 y（區域座標）的外殼截面 */
function armRing(side: ArmSide, y: number, extra = 0): Ring {
  const s = aiArmShape(side, y);
  return { y, rx: s.rx + THICK + extra, rz: s.rz + THICK + extra, cx: s.cx, cz: s.cz };
}

/** 外殼表面上一點與朝外的方向：angle 0 = 外側、正值往前（z+）、負值往後 */
function surface(side: ArmSide, y: number, angle: number, lift = 0): { p: V3; n: V3 } {
  const o = side === 'L' ? 1 : -1;
  const r = armRing(side, y);
  const c = Math.cos(angle), n = Math.sin(angle);
  const len = Math.hypot(c / r.rx, n / r.rz);
  const dir: V3 = [(o * c) / r.rx / len, 0, n / r.rz / len];
  return { p: [r.cx! + o * c * r.rx + dir[0] * lift, y, r.cz! + n * r.rz + dir[2] * lift], n: dir };
}

/** 把零件貼到表面：零件的 Z 軸朝外、Y 軸朝手肘 */
function patch(at: { p: V3; n: V3 }, meshes: Mesh[]): Mesh[] {
  const z = at.n;
  const x: V3 = [z[2], 0, -z[0]];
  return meshes.map((m) => mapVerts(m, ([a, b, c]) => [at.p[0] + x[0] * a + z[0] * c, at.p[1] + b, at.p[2] + x[2] * a + z[2] * c]));
}

/** 順著前臂往手肘彎的尖刺 */
function armSpike(side: ArmSide, y: number, angle: number, len: number, r: number, colors: Tones): Mesh[] {
  const { p, n } = surface(side, y, angle, -0.1);
  const at = (out: number, up: number): V3 => [p[0] + n[0] * out, p[1] + up, p[2] + n[2] * out];
  return horn(p, at(len * 0.75, len * 0.1), at(len * 0.85, len * 0.85), r, colors, 5);
}

/** 繞著前臂的弧形甲片：中間隆起成一道脊，兩端收尖；sweep = 兩端往手肘翹 */
function arcPlate(side: ArmSide, y: number, h: number, a0: number, a1: number, lift: number, colors: Tones, seed: number, sweep = 0): Mesh {
  const n = 8;
  const verts: V3[] = [];
  const faces: Mesh['faces'] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const edge = 2 * Math.abs(t - 0.5);
    const yy = y + sweep * edge;
    const half = (h / 2) * (1 - edge ** 3);
    verts.push(surface(side, yy + half, a, -0.05).p, surface(side, yy, a, lift * (1 - edge ** 2)).p, surface(side, yy - half, a, -0.05).p);
  }
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    faces.push({ idx: [k, k + 1, k + 4], color: colors[0]! }, { idx: [k, k + 4, k + 3], color: colors[0]! }, { idx: [k + 1, k + 2, k + 5], color: colors[0]! }, { idx: [k + 1, k + 5, k + 4], color: colors[0]! });
  }
  // 頂點順序朝外（從手臂中心往外看）
  const center = armRing(side, y);
  for (const f of faces) {
    const [p, q, r] = [verts[f.idx[0]!]!, verts[f.idx[1]!]!, verts[f.idx[2]!]!];
    const u: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const v: V3 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const nx = u[1] * v[2] - u[2] * v[1], nz = u[0] * v[1] - u[1] * v[0];
    if (nx * (p[0] - center.cx!) + nz * (p[2] - center.cz!) < 0) f.idx.reverse();
  }
  return dense(tone({ verts, faces }, colors, seed), seed);
}

/** 手的造型選項 */
interface HandOptions {
  mat: Tones;
  /** 指節的甲片與爪 */
  claw: Tones;
  /** 爪的長度（0 = 粗短的指尖，沒有爪） */
  clawLen: number;
  /** 手背的 V 形護片 */
  vee?: Tones;
  /** 手背的寶石 */
  gem?: number;
  /** 手背的發光裂紋 */
  veins?: number;
}

/** 手掌的中心與手背（朝外側）的 x */
function handFrame(side: ArmSide) {
  const o = side === 'L' ? 1 : -1;
  const { cx, cz, rz } = aiHandShape(side);
  return { o, cx, cz, wide: Math.max(rz, 1.9), back: cx + o * 1.52 };
}

/** 粗短的手套手：手掌（手背朝外側）、四指、拇指、指節甲片；右手握武器，手指彎得多 */
function gauntletHand(side: ArmSide, h: HandOptions): Mesh[] {
  const { o, cx, cz, wide, back } = handFrame(side);
  const { mat, claw, clawLen } = h;
  const curl = side === 'R' ? 1.7 : 1;
  const out: Mesh[] = [
    dense(
      loft(
        [
          { y: 0.5, rx: 1.3, rz: wide * 0.82, cx, cz },
          { y: -0.5, rx: 1.5, rz: wide * 0.98, cx, cz },
          { y: -1.5, rx: 1.5, rz: wide * 1.05, cx: cx - o * 0.05, cz },
          { y: -2.5, rx: 1.15, rz: wide * 0.98, cx: cx - o * 0.2, cz },
        ],
        10,
        mat,
        201,
      ),
      201,
    ),
  ];
  const tipOf = (tip: V3, dx: number, dy: number, seed: number) => dense(taper(tip, [tip[0] + dx, tip[1] + dy, tip[2]], [0.42, 0.42], [0.04, 0.04], claw, 5, seed, 0.3), seed);
  [-0.72, -0.24, 0.24, 0.72].forEach((k, i) => {
    const dz = k * wide * 1.02;
    const len = [1.5, 2, 2.15, 1.85][i]!;
    const x0 = cx - o * 0.2;
    const pts: V3[] = [
      [x0, -2.3, cz + dz],
      [x0 - o * 0.28 * curl, -2.3 - len * 0.55, cz + dz * 1.05],
      [x0 - o * 0.85 * curl, -2.3 - len, cz + dz * 1.08],
    ];
    out.push(...chain(pts, [0.68, 0.56], [0.54, 0.46], mat, false).map((m, j) => dense(m, 210 + i * 2 + j)));
    out.push(F(tone(box(0.95, 0.75, 0.95, claw[0]!, [x0 + o * 0.42, -2.45, cz + dz]), claw, 220 + i), 220 + i, 0.1));
    if (clawLen) out.push(tipOf(pts[2]!, -o * 0.48 * curl * clawLen, -clawLen, 230 + i));
  });
  const thumb: V3[] = [
    [cx - o * 0.25, -0.5, cz + wide * 0.75],
    [cx - o * 0.45, -1.3, cz + wide + 0.55],
    [cx - o * 0.8, -2.25, cz + wide + 0.6],
  ];
  out.push(...chain(thumb, [0.6, 0.56], [0.46, 0.44], mat, false).map((m, j) => dense(m, 240 + j)));
  if (clawLen) out.push(tipOf(thumb[2]!, -o * 0.4, -clawLen * 0.8, 243));
  if (h.vee) for (const dir of [-1, 1]) out.push(F(bar([back, 0.1, cz + dir * wide * 0.82], [back + o * 0.08, -1.75, cz], 0.55, 0.32, h.vee, 250 + dir), 250 + dir, 0.08));
  if (h.veins !== undefined) {
    const pts: V3[] = [[back, 0.3, cz + 0.6], [back + o * 0.05, -0.5, cz - 0.5], [back + o * 0.05, -1.2, cz + 0.5], [back, -2, cz - 0.3]];
    pts.slice(0, -1).forEach((p, i) => out.push(tone(bar(p, pts[i + 1]!, 0.26, 0.2, lit(h.veins!), 260 + i), lit(h.veins!), 260 + i)));
  }
  if (h.gem !== undefined) out.push(gem(0.72, [back + o * 0.12, -0.75, cz], h.gem, [0.42, 1.05, 0.72], 8, 5));
  return out;
}

/** 前臂的外殼：上緣停在手肘下方 */
function armShell(side: ArmSide, mat: Tones): Mesh {
  const ys = [-1.05, -1.9, -2.9, -3.9, -4.9, -5.9, -6.9, -AI_LIMB.forearm + 0.1];
  return dense(loft(ys.map((y) => armRing(side, y)), 12, mat, 101), 101);
}

/** 上緣的深色護圈：往手肘收窄、貼住手臂（放樣的封口才不會從背面看成一片圓盤），下面一圈飾邊 */
function armCuff(side: ArmSide, mat: Tones, trim: Tones): Mesh[] {
  const top = aiArmShape(side, -1.1);
  const ring = (y: number, extra: number, k = 1): Ring => ({ y, rx: (top.rx + THICK + extra) * k, rz: (top.rz + THICK + extra) * k, cx: top.cx, cz: top.cz });
  return [
    dense(loft([ring(-0.25, 0, 0.62), ring(-0.75, 0.05, 0.9), ring(-1.3, 0.2), ring(-1.8, 0.12)], 12, [mat[2]!, mat[1]!, mat[2]!, mat[1]!], 102), 102),
    dense(loft([ring(-1.2, 0.18), ring(-1.42, 0.34), ring(-1.64, 0.2)], 12, trim, 103), 103),
  ];
}

/** 繞前臂一圈的環帶：y0 → y1，extra = 比外殼厚多少 */
const armBand = (side: ArmSide, y0: number, y1: number, extra: number, colors: Tones, seed: number): Mesh =>
  dense(loft([armRing(side, y0, extra * 0.4), armRing(side, (y0 + y1) / 2, extra), armRing(side, y1, extra * 0.4)], 12, colors, seed), seed);

/** 手腕的外擴護環 */
const wristFlare = (side: ArmSide, colors: Tones): Mesh => dense(loft([armRing(side, -6.45, 0.05), armRing(side, -6.85, 0.34), armRing(side, -AI_LIMB.forearm + 0.15, 0.42)], 12, colors, 104), 104);

/** 一排尖刺：[高度, 角度, 長度, 粗細] */
function spikes(side: ArmSide, list: readonly (readonly [number, number, number, number])[], colors: Tones, seed: number): Mesh[] {
  return list.flatMap(([y, a, len, r], i) => armSpike(side, y, a, len, r, colors).map((m, k) => dense(m, seed + i * 6 + k)));
}

/** 貼在外殼上的發光線：[高度, 角度] 依序連起來（比外殼高 lift，凹凸的岩塊之間就像裂縫） */
function vein(side: ArmSide, pts: readonly (readonly [number, number])[], width: number, color: number, lift: number, seed: number): Mesh[] {
  const at = pts.map(([y, a]) => surface(side, y, a, lift).p);
  return at.slice(0, -1).map((p, i) => tone(bar(p, at[i + 1]!, width, 0.22, lit(color), seed + i), lit(color), seed + i));
}

/** 小鉚釘：放大才畫 */
const rivets = (side: ArmSide, y: number, count: number, colors: Tones, lift: number, seed: number): Mesh[] =>
  detail(2, Array.from({ length: count }, (_, i) => knob(0.2, surface(side, y, -1.9 + (i * 3.8) / Math.max(1, count - 1), lift).p, colors, seed + i)));

/** 兩隻手套：build 回傳一隻手的前臂與手 */
function pair(build: (side: ArmSide) => { fore: Mesh[]; hand: Mesh[] }): StyledGlove {
  const parts = new Map<Joint, Mesh[]>();
  for (const side of ['L', 'R'] as const) {
    const { fore, hand } = build(side);
    parts.set(`forearm${side}`, fore);
    parts.set(`hand${side}`, hand);
  }
  return { parts, hide: ['handL', 'handR', 'bracerL', 'bracerR'] };
}

// ─────────────────────────── 紅 魔王之爪 ───────────────────────────

/** 魔王之爪（照統御者魔鎧上的手套）：暗紅甲殼、骨白飾邊與往手肘彎的尖刺、前臂外側的火眼、手背的 V 形護片、黑褐色的短爪 */
function demonClaw(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow } = s;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, trim), wristFlare(side, trim)];
    // 甲殼一片片往手肘翹
    for (const [i, y] of [-2.3, -5.6].entries()) fore.push(arcPlate(side, y, 0.95, -1.5, 1.5, 0.55, mat, 110 + i, 0.8));
    // 前臂上斜跨的骨白脊
    fore.push(arcPlate(side, -2.65, 0.55, -0.4, 2.2, 0.4, trim, 115, 0.6), arcPlate(side, -5.25, 0.55, -0.4, 2.2, 0.4, trim, 116, -0.6));
    // 往手肘彎的骨白尖刺：外側一排（最上面最大），前後各幾根小的
    fore.push(
      ...spikes(
        side,
        [
          [-1.9, 0.15, 3.6, 0.62],
          [-3.5, -0.3, 2.3, 0.5],
          [-5.2, 0.05, 2.6, 0.52],
          [-6.6, -0.35, 1.9, 0.44],
          [-2.2, 1.75, 1.7, 0.4],
          [-5.6, 1.8, 1.4, 0.36],
          [-3.1, -1.25, 1.5, 0.38],
        ],
        trim,
        120,
      ),
    );
    // 前臂外側偏前的火眼：骨白菱形框、橘色眼球、直立的黑色瞳孔
    fore.push(
      ...patch(surface(side, -3.95, 1.1, 0.42), [
        ...[
          [[0, 1.55, 0], [1, 0, 0.05]],
          [[1, 0, 0.05], [0, -1.55, 0]],
          [[0, -1.55, 0], [-1, 0, 0.05]],
          [[-1, 0, 0.05], [0, 1.55, 0]],
        ].map(([a, b], i) => F(bar(a as V3, b as V3, 0.42, 0.34, trim, 170 + i), 170 + i, 0.08)),
        gem(0.82, [0, 0, 0.08], glow, [0.72, 1.12, 0.42], 8, 5),
        tone(box(0.2, 1.3, 0.16, 0x1a0806, [0, 0, 0.42]), [0x1a0806, 0x2a0c08]),
      ]),
    );
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen: 1.15, vee: trim }) };
  });
}

// ─────────────────────────── 紅 墓守鐵拳 ───────────────────────────

/** 墓守鐵拳（照墮騎黑鎧上的手套）：鏽鐵板層層鉚合、骨白尖刺、手背一顆餘燼寶石；粗短的指尖 */
function cryptFist(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow } = s;
  const iron: Tones = [mat[1]!, mat[2]!, mat[2]!, mat[1]!];
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, iron), wristFlare(side, iron)];
    // 三道鉚合的鐵環
    for (const [i, y] of [-2.9, -4.6].entries()) {
      fore.push(armBand(side, y + 0.45, y - 0.45, 0.32, iron, 110 + i), ...rivets(side, y, 7, trim, 0.32, 300 + i * 10));
    }
    fore.push(...rivets(side, -6.95, 7, trim, 0.42, 330));
    // 甲片往外翹，骨白尖刺
    fore.push(arcPlate(side, -3.75, 0.85, -1.2, 1.4, 0.5, mat, 113, 0.7), arcPlate(side, -5.6, 0.85, -1.2, 1.4, 0.5, mat, 114, 0.7));
    fore.push(
      ...spikes(
        side,
        [
          [-1.9, 0.2, 3.2, 0.66],
          [-3.7, -0.2, 2.2, 0.56],
          [-5.5, 0.15, 2.2, 0.54],
          [-6.8, -0.3, 1.5, 0.46],
          [-2.1, 1.7, 1.4, 0.42],
        ],
        trim,
        120,
      ),
    );
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen: 0, vee: trim, gem: glow }) };
  });
}

// ─────────────────────────── 紅 熔岩巨拳 ───────────────────────────

/** 熔岩巨拳（照熔岩巨甲上的手套）：暗褐岩塊包住前臂，岩縫流著亮橘的熔岩，往外伸的岩刺 */
function lavaFist(s: StyledGloveSpec): StyledGlove {
  const { mat, claw, glow } = s;
  const rock: Tones = [darken(mat[0]!, 0.12), darken(mat[1]!, 0.08), mat[2]!, mat[1]!];
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, mat), wristFlare(side, mat)];
    // 岩塊：一圈圈排在外殼上，相鄰兩圈錯開
    for (const [row, y] of [-1.9, -3.1, -4.3, -5.5, -6.7].entries()) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + ((i + (row % 2) * 0.5) / 7) * Math.PI * 2;
        const r = 0.68 + rand(row * 7 + i) * 0.22;
        fore.push(dense(knob(r, surface(side, y + (rand(row * 13 + i) - 0.5) * 0.3, a, 0.05).p, rock, 110 + row * 7 + i, [1, 0.95, 1]), 110 + row * 7 + i));
      }
    }
    // 岩縫的熔岩
    fore.push(
      ...vein(side, [[-1.5, 0.7], [-2.5, 1.3], [-3.4, 0.8], [-4.4, 1.45], [-5.3, 0.9], [-6.4, 1.4]], 0.32, glow, 0.5, 170),
      ...vein(side, [[-3.4, 0.8], [-3.8, 0.1], [-4.9, -0.4], [-5.8, 0.2]], 0.26, glow, 0.5, 180),
      ...vein(side, [[-2.2, -1.9], [-3.3, -2.3], [-4.5, -1.9], [-5.6, -2.4]], 0.26, glow, 0.5, 186),
    );
    // 岩刺
    fore.push(
      ...spikes(
        side,
        [
          [-1.9, 0.1, 2.9, 0.86],
          [-3.5, -0.45, 2.2, 0.74],
          [-5.1, 0.25, 2.3, 0.74],
          [-6.4, -0.4, 1.6, 0.6],
        ],
        rock,
        120,
      ),
    );
    return { fore, hand: gauntletHand(side, { mat: rock, claw, clawLen: 0, veins: glow }) };
  });
}

// ─────────────────────────── 紅 蛛后毒爪 ───────────────────────────

/** 蛛后毒爪（照蛛后絲甲上的手套）：紫黑甲殼層層往手肘翹，螢光綠的毒紋，手腕兩根毒牙，短而尖的指尖 */
function spiderClaw(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow } = s;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, trim), wristFlare(side, trim)];
    for (const [i, y] of [-2.2, -3.7, -5.2].entries()) fore.push(arcPlate(side, y, 1.05, -1.9, 1.9, 0.6, i % 2 ? trim : mat, 110 + i, 0.9));
    // 毒紋
    fore.push(
      ...vein(side, [[-1.6, 0.9], [-2.6, 0.35], [-3.5, 0.95], [-4.6, 0.4], [-5.5, 1], [-6.5, 0.5]], 0.17, glow, 0.6, 170),
      ...vein(side, [[-3.5, 0.95], [-3.1, 1.6], [-4.3, 1.9]], 0.14, glow, 0.6, 180),
      ...vein(side, [[-4.6, 0.4], [-5.1, -0.4], [-6.1, -0.2]], 0.14, glow, 0.6, 184),
    );
    fore.push(
      ...spikes(
        side,
        [
          [-1.9, -0.1, 3, 0.6],
          [-3.4, 0.05, 1.8, 0.46],
          [-4.9, -0.1, 1.9, 0.46],
          [-3, -1.5, 1.2, 0.34],
        ],
        trim,
        120,
      ),
    );
    // 手腕的毒牙：往手掌彎的骨白尖牙
    for (const [i, a] of [0.35, -0.65].entries()) {
      const { p, n } = surface(side, -6.7, a, 0);
      const at = (out: number, y: number): V3 => [p[0] + n[0] * out, y, p[2] + n[2] * out];
      fore.push(...horn(p, at(1.6, -6.9), at(1.5, -8.8), 0.42, BONE_FANG, 5).map((m, k) => dense(m, 140 + i * 6 + k)));
    }
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen: 0.95, veins: glow }) };
  });
}

// ─────────────────────────── 紅 獵神之手 ───────────────────────────

/** 獵神之手（照深淵甲殼上的手套）：深藍紫的甲殼，前臂外側一片彎曲的大刃，白色星形寶石與放射的光紋 */
function godHand(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow } = s;
  const blade = s.accent ?? trim;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, trim), wristFlare(side, trim)];
    fore.push(arcPlate(side, -2.8, 1, -1.5, 1.5, 0.5, mat, 110, 0.8), arcPlate(side, -5.5, 1, -1.5, 1.5, 0.5, mat, 111, 0.8));
    // 大刃：從前臂外側伸出、往手肘彎的新月形，壓扁成刀片
    const { p, n } = surface(side, -4.6, 0, -0.1);
    const at = (out: number, y: number): V3 => [p[0] + n[0] * out, y, p[2] + n[2] * out];
    const flat = (m: Mesh): Mesh => mapVerts(m, ([x, y, z]) => [x, y, p[2] + (z - p[2]) * 0.38]);
    fore.push(...horn(p, at(3.9, -3.9), at(2.7, 0.9), 1.15, blade, 7).map((m, k) => dense(flat(m), 130 + k)));
    fore.push(...horn(surface(side, -6.3, 0, -0.1).p, at(2.2, -6.3), at(1.9, -8.3), 0.7, blade, 5).map((m, k) => dense(flat(m), 140 + k)));
    fore.push(
      ...spikes(
        side,
        [
          [-1.8, 0.75, 1.8, 0.46],
          [-2, -0.7, 1.5, 0.42],
          [-6.4, 1.1, 1.3, 0.36],
        ],
        blade,
        150,
      ),
    );
    // 星形寶石與放射的光紋
    const star = 0xf2f0ff;
    fore.push(
      ...patch(surface(side, -3.95, 1.1, 0.46), [
        ...(
          [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ] as const
        ).map(([dx, dy], i) => tone(taper([0, 0, 0.05], [dx * 1.05, dy * 1.5, 0], [0.42, 0.2], [0.04, 0.04], lit(star), 4, 170 + i, Math.PI / 4), lit(star), 170 + i)),
        gem(0.52, [0, 0, 0.1], star, [1, 1, 0.6], 8, 5),
      ]),
      ...vein(side, [[-2.1, 0.5], [-3.1, 0.95]], 0.2, glow, 0.5, 180),
      ...vein(side, [[-4.8, 0.95], [-5.6, 0.5], [-6.5, 0.85]], 0.2, glow, 0.5, 184),
    );
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen: 0.95, veins: glow }) };
  });
}

// ─────────────────────────── 紅 泰坦之握 ───────────────────────────

/** 泰坦之握（照不朽者上的手套）：古銅底、厚重的金色板甲與尖頂，前臂一圈刻著發光古文字的粗環 */
function titanGrip(s: StyledGloveSpec): StyledGlove {
  const { trim, claw, glow } = s;
  const mat = s.accent ?? s.mat;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, trim)];
    // 粗環與發光的古文字（前半圈）
    fore.push(armBand(side, -4.45, -5.95, 0.7, trim, 110), wristFlare(side, trim));
    for (let i = 0; i < 7; i++) {
      const a = -0.5 + i * 0.42;
      const { p } = surface(side, -5.2, a, 0.72);
      fore.push(tone(box(0.3, 0.62, 0.3, glow, p), lit(glow), 120 + i));
    }
    // 尖頂的金色護片：外側偏前一片高高的板甲
    fore.push(arcPlate(side, -2.5, 1.5, -0.4, 1.6, 0.62, trim, 130, 0.7));
    fore.push(...vein(side, [[-1.9, 0.95], [-3.7, 0.95]], 0.3, glow, 0.7, 135), ...vein(side, [[-2.6, 0.55], [-2.6, 1.35]], 0.26, glow, 0.7, 138));
    fore.push(
      ...spikes(
        side,
        [
          [-1.9, 0.5, 3.2, 0.8],
          [-3.7, -0.3, 1.9, 0.6],
          [-1.9, 1.7, 1.7, 0.5],
          [-6.4, 0.1, 1.5, 0.56],
        ],
        trim,
        140,
      ),
    );
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen: 0, vee: trim }) };
  });
}

// ─────────────────────────── 橘 四種基本款 ───────────────────────────
// 照盔甲設計稿上的手套（art/gear/gloves_unique/concept/橘手套四種基本款-照盔甲重畫.png）；同一款用 variant 換零件，不只換色

/** 往手肘斜伸的晶體：下半加粗、上半收尖 */
function crystal(side: ArmSide, y: number, a: number, len: number, r: number, color: number, seed: number): Mesh[] {
  const { p, n } = surface(side, y, a, -0.1);
  const at = (k: number): V3 => [p[0] + n[0] * len * k * 0.8, p[1] + len * k * 0.6, p[2] + n[2] * len * k * 0.8];
  const c = lit(color);
  return [tone(taper(p, at(0.32), [r * 0.45, r * 0.45], [r, r], c, 5, seed, 0.3), c, seed), tone(taper(at(0.32), at(1), [r, r], [0.04, 0.04], c, 5, seed + 1, 0.3), c, seed + 1)];
}

/** 綁帶：繞前臂一圈，外側一個扣環 */
function strap(side: ArmSide, y: number, colors: Tones, buckle: Tones, seed: number): Mesh[] {
  return [armBand(side, y + 0.3, y - 0.3, 0.26, colors, seed), ...patch(surface(side, y, 0.9, 0.3), [F(tone(box(0.75, 0.75, 0.22, buckle[0]!), buckle, seed + 1), seed + 1, 0.08)])];
}

/** 晶岩護手（晶岩重甲）：塊狀岩石、橘色裂紋、手腕一圈岩環；碎擊者之握的指節是金色重拳 */
function obsidianGauntlet(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow } = s;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, mat), wristFlare(side, mat)];
    for (const [row, y] of [-2, -3.4, -4.8, -6].entries()) {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI + ((i + (row % 2) * 0.5) / 6) * Math.PI * 2;
        fore.push(dense(knob(0.62 + rand(row * 5 + i) * 0.2, surface(side, y, a, 0).p, mat, 110 + row * 6 + i, [1, 1.15, 1]), 110 + row * 6 + i));
      }
    }
    fore.push(...vein(side, [[-1.7, 0.6], [-2.8, 1.25], [-3.8, 0.7], [-5, 1.35], [-6.2, 0.8]], 0.3, glow, 0.42, 170), ...vein(side, [[-3.8, 0.7], [-4.5, -0.1], [-5.6, 0.1]], 0.24, glow, 0.42, 180));
    fore.push(
      ...spikes(
        side,
        [
          [-2, 0.1, 2, 0.74],
          [-4.3, -0.3, 1.5, 0.62],
        ],
        mat,
        120,
      ),
      armBand(side, -6.5, -7.3, 0.42, trim, 140),
    );
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen: 0, veins: glow }) };
  });
}

/** 甲殼護手（甲殼鱗甲）：外側往上翹的尖角甲殼、殼間透光、飾邊；hook = 骨白鉤爪，acid = 垂下的酸液，sky = 銀色翼片 */
function carapaceGauntlet(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow, clawLen = 0, variant } = s;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, trim), wristFlare(side, trim)];
    fore.push(arcPlate(side, -2.5, 1.5, -1.3, 1.5, 0.7, mat, 110, 1), arcPlate(side, -5.3, 1.3, -1.3, 1.5, 0.62, mat, 111, 0.9));
    fore.push(arcPlate(side, -3.2, 0.42, -0.5, 1.7, 0.42, trim, 112, 0.7));
    fore.push(...vein(side, [[-1.9, 0.75], [-3.4, 0.3]], 0.42, glow, 0.62, 170), ...vein(side, [[-4.8, 0.85], [-6.1, 0.35]], 0.36, glow, 0.62, 174));
    const horns: (readonly [number, number, number, number])[] = [
      [-2, 0.05, 3, 0.86],
      [-5, -0.05, 2.2, 0.72],
    ];
    if (variant === 'hook') horns.push([-3.5, -0.4, 1.9, 0.5], [-6.3, -0.5, 1.5, 0.44]);
    fore.push(...spikes(side, horns.slice(0, 2), mat, 120));
    if (variant === 'hook') fore.push(...spikes(side, horns.slice(2), claw, 134));
    if (variant === 'acid') {
      // 酸液從手腕滴下
      for (const [i, [a, y]] of ([[0.4, -7.3], [1.3, -7.2], [-0.5, -7.25]] as const).entries()) {
        const { p } = surface(side, y, a, 0.45);
        fore.push(tone(taper(p, [p[0], p[1] - 0.9 - i * 0.22, p[2]], [0.26, 0.26], [0.05, 0.05], lit(glow), 5, 150 + i, 0.3), lit(glow), 150 + i), gem(0.2, [p[0], p[1] - 1.15 - i * 0.22, p[2]], glow, [1, 1.3, 1], 5, 3));
      }
    }
    if (variant === 'sky') {
      // 外側的銀色翼片：壓扁成三片羽狀
      const { p, n } = surface(side, -3.6, -0.1, -0.1);
      const at = (out: number, y: number): V3 => [p[0] + n[0] * out, y, p[2] + n[2] * out];
      const flat = (m: Mesh): Mesh => mapVerts(m, ([x, y, z]) => [x, y, p[2] + (z - p[2]) * 0.3]);
      for (const [i, [y0, out, top]] of ([[-3.2, 3.1, 0.3], [-4.2, 2.6, -1.1], [-5.2, 2.1, -2.6]] as const).entries()) {
        fore.push(...horn(at(0, y0), at(out, y0 + 0.6), at(out + 0.3, top), 0.62, trim, 5).map((m, k) => dense(flat(m), 150 + i * 6 + k)));
      }
    }
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen, ...(variant === 'acid' ? { veins: glow } : { vee: trim }) }) };
  });
}

/** 元素護手（元素法袍）：細長的護甲配飾邊、外側伸出晶體；frost = 冰晶叢，eye = 前臂一顆單眼，mind = 手背腦紋寶珠，fire = 火焰碎片，tri = 火冰雷三色 */
function elementGauntlet(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow, clawLen = 0, variant } = s;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, trim), wristFlare(side, trim)];
    fore.push(arcPlate(side, -2.7, 0.5, -0.9, 1.5, 0.36, trim, 110, -0.6), arcPlate(side, -5.5, 0.5, -0.9, 1.5, 0.36, trim, 111, 0.6));
    if (variant === 'frost') {
      for (const [i, [y, a, len, r]] of ([[-2.4, 0.2, 3, 0.68], [-2.8, -0.45, 2, 0.48], [-3.4, 0.75, 2.1, 0.5], [-5.2, 0.05, 2.4, 0.56], [-5.8, -0.5, 1.5, 0.4], [-6.2, 0.6, 1.5, 0.4]] as const).entries()) fore.push(...crystal(side, y, a, len, r, glow, 120 + i * 2));
    } else if (variant === 'eye') {
      fore.push(...crystal(side, -2.3, 0.05, 2.5, 0.56, glow, 120), ...crystal(side, -5.6, 0, 1.8, 0.44, glow, 124));
      fore.push(
        ...patch(surface(side, -4, 0.85, 0.4), [
          ...[0, 1, 2, 3, 4, 5].map((i) => {
            const [a, b] = [(i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2];
            return F(bar([Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0], [Math.cos(b) * 0.95, Math.sin(b) * 0.95, 0], 0.3, 0.26, trim, 130 + i), 130 + i, 0.06);
          }),
          gem(0.78, [0, 0, 0.06], 0xe8f2ff, [1, 1, 0.5], 8, 5),
          gem(0.32, [0, 0, 0.42], glow, [1, 1, 0.4], 6, 4),
        ]),
      );
    } else if (variant === 'mind') {
      // 前臂浮著幾顆圓潤的腦紋瘤
      for (const [i, [y, a, r]] of ([[-2.5, 0.2, 0.72], [-3.6, 0.8, 0.62], [-4.8, 0.1, 0.68], [-3.4, -0.5, 0.52]] as const).entries()) fore.push(dense(knob(r, surface(side, y, a, 0.2).p, mat, 120 + i), 120 + i), gem(r * 0.42, surface(side, y, a, 0.2 + r * 0.8).p, glow, [1, 1, 1], 6, 4));
      fore.push(...crystal(side, -2, -0.1, 1.9, 0.42, trim[0]!, 130));
    } else if (variant === 'fire') {
      // 往手肘竄的火焰碎片
      for (const [i, [y, a, len, r]] of ([[-2.3, 0.15, 3, 0.62], [-3.2, -0.45, 2.1, 0.5], [-3.8, 0.75, 2.2, 0.5], [-5.4, 0, 2.3, 0.54]] as const).entries()) fore.push(...armSpike(side, y, a, len, r, lit(glow)).map((m, k) => tone(m, lit(glow), 120 + i * 6 + k)));
      fore.push(...vein(side, [[-4.6, 0.9], [-5.5, 1.3], [-6.3, 0.9]], 0.24, glow, 0.36, 150));
    } else {
      // 火、冰、雷各一顆
      for (const [i, [y, a, len, r, c]] of ([[-2.2, 0.1, 2.7, 0.6, 0xff6a20], [-3.9, 0.45, 2.3, 0.54, 0x62c8ff], [-5.5, -0.05, 2.2, 0.5, 0xffe040]] as const).entries()) fore.push(...crystal(side, y, a, len, r, c, 120 + i * 2));
    }
    const hand = gauntletHand(side, { mat, claw, clawLen, ...(variant === 'mind' ? { gem: glow } : { vee: trim }) });
    if (variant === 'tri') {
      // 指尖輪流燃燒、結凍、放電
      const { o, cz, wide, back } = handFrame(side);
      for (const [i, c] of [0xff6a20, 0x62c8ff, 0xffe040].entries()) hand.push(gem(0.32, [back - o * 0.4, -2.35, cz + (i - 1) * wide * 0.62], c, [0.8, 1, 1], 6, 4));
    }
    return { fore, hand };
  });
}

/** 倒刺護手（倒刺輕甲）：皮革與綁帶、外側一排倒刺；bone = 弓手的骨片護臂，blast = 金屬板與火口，repeater = 機簧與弩箭 */
function barbedGauntlet(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow, variant } = s;
  const accent = s.accent ?? trim;
  const band: Tones = [mat[2]!, mat[1]!, mat[2]!, mat[1]!];
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, band), wristFlare(side, band)];
    fore.push(...strap(side, -2.6, band, trim, 110), ...strap(side, -5.2, band, trim, 114));
    if (variant === 'bone') {
      // 前臂的骨片護臂、外側一排較短的骨刺
      fore.push(arcPlate(side, -3.9, 1.5, 0.1, 1.8, 0.48, accent, 118));
      fore.push(
        ...spikes(
          side,
          [
            [-2.2, 0, 2.4, 0.56],
            [-4, -0.1, 1.9, 0.5],
            [-5.8, 0, 1.6, 0.44],
          ],
          accent,
          120,
        ),
      );
    } else if (variant === 'blast') {
      // 金屬板與三個發光的火口
      fore.push(arcPlate(side, -3.9, 1.7, -0.6, 1.9, 0.5, trim, 118));
      for (let i = 0; i < 3; i++) fore.push(...patch(surface(side, -3.4 - i * 0.55, 0.65, 0.58), [tone(box(0.9, 0.24, 0.16, glow), lit(glow), 130 + i)]));
      fore.push(
        ...spikes(
          side,
          [
            [-2.2, -0.1, 2.3, 0.6],
            [-5.9, -0.1, 1.8, 0.52],
          ],
          claw,
          120,
        ),
      );
    } else if (variant === 'repeater') {
      // 前臂一排弩箭、手腕的機簧
      for (let i = 0; i < 3; i++) {
        const a = 0.15 + i * 0.5;
        const base = surface(side, -5.6, a, 0.34).p, tip = surface(side, -2.2, a, 0.34).p;
        fore.push(tone(bar(base, tip, 0.2, 0.2, trim, 120 + i), trim, 120 + i), dense(taper(tip, [tip[0], tip[1] + 0.8, tip[2]], [0.28, 0.28], [0.03, 0.03], claw, 4, 124 + i, 0.3), 124 + i));
      }
      for (let i = 0; i < 4; i++) fore.push(armBand(side, -6.1 + i * -0.24, -6.22 + i * -0.24, 0.2, trim, 130 + i));
      fore.push(
        ...spikes(
          side,
          [
            [-2.3, -0.5, 1.6, 0.42],
            [-4.4, -0.6, 1.4, 0.4],
          ],
          accent,
          140,
        ),
      );
    } else {
      fore.push(
        ...spikes(
          side,
          [
            [-2, 0, 2.6, 0.6],
            [-3.4, -0.2, 2.2, 0.54],
            [-4.8, 0, 2.1, 0.54],
            [-6.1, -0.2, 1.7, 0.46],
          ],
          accent,
          120,
        ),
      );
    }
    const hand = gauntletHand(side, { mat, claw, clawLen: 0 });
    if (variant === 'repeater') {
      // 手指關節的機簧
      const { o, cz, wide, back } = handFrame(side);
      for (const [i, k] of [-0.72, -0.24, 0.24, 0.72].entries()) hand.push(...detail(1, [dense(knob(0.3, [back - o * 0.55, -3.35, cz + k * wide], trim, 150 + i), 150 + i)]));
    }
    return { fore, hand };
  });
}

// ─────────────────────────── 一般 樸實的手套 ───────────────────────────

/**
 * 一般手套（設計稿：art/gear/plain_sets/concept/八階整套.png）：前臂護甲、皮帶與小扣環、飾邊，沒有尖刺與爪；
 * soft = 全皮革（沒有護甲片）、heavy = 多一片護甲；有詞條時前臂多一顆小寶石（glow 不是白色）、外側兩根小尖刺。
 */
function plainGauntlet(s: StyledGloveSpec): StyledGlove {
  const { mat, trim, claw, glow, variant } = s;
  const leather = s.accent ?? mat;
  return pair((side) => {
    const fore: Mesh[] = [armShell(side, mat), ...armCuff(side, mat, trim), wristFlare(side, mat)];
    if (variant !== 'soft') fore.push(arcPlate(side, -4, 2.5, -0.9, 1.5, 0.3, mat, 110));
    if (variant === 'heavy') fore.push(arcPlate(side, -5.7, 1.1, -1.2, 1.2, 0.46, mat, 111, 0.5), arcPlate(side, -2.5, 1.1, -1.2, 1.2, 0.46, mat, 120, -0.5));
    fore.push(...strap(side, -2.7, leather, trim, 112), ...strap(side, -5.6, leather, trim, 115));
    fore.push(armBand(side, -6.95, -7.25, 0.46, trim, 118));
    if (glow !== 0xffffff) fore.push(gem(0.42, surface(side, -4, 0.75, 0.42).p, glow, [1, 1.1, 1], 6, 3));
    if (s.spikes) {
      fore.push(
        ...spikes(
          side,
          [
            [-3.2, 0, 1.2, 0.34],
            [-5, 0, 1.1, 0.32],
          ],
          s.spikes,
          130,
        ),
      );
    }
    return { fore, hand: gauntletHand(side, { mat, claw, clawLen: 0 }) };
  });
}

const LOOKS: Record<GloveLook, (s: StyledGloveSpec) => StyledGlove> = { demonClaw, cryptFist, lavaFist, spiderClaw, godHand, titanGrip, obsidian: obsidianGauntlet, carapace: carapaceGauntlet, element: elementGauntlet, barbed: barbedGauntlet, plainGauntlet };

export const styledGlove = (s: StyledGloveSpec): StyledGlove => LOOKS[s.look](s);
