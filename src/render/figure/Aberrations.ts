import { mass, organic, plate, shell, spineRow } from './Beasts';
import { along, floater, floaterPoses, seg, spike, wormPoses } from './Creatures';
import type { FigureModel } from './FigureModel';
import { lowSphere, normalize, prism, type Mesh, type V3 } from './Poly3D';

/**
 * 漂浮異體（單眼浮體、腦海浮體、虛空孢子）、寒霜孢子體與鑽地寄生蟲的「生物化」多面體。
 * 與 Beasts.ts 相同的做法：團塊的頂點稍微錯開、表面貼上甲片 / 斑點 / 血管 / 皺褶，
 * 觸手每一節有環節與吸盤（或根鬚），讓表面由許多小切面組成。
 * 骨架與姿勢沿用 Creatures.ts 的漂浮（floater）與蠕蟲（wormPoses）。
 */

// ─────────────────────────── 共用零件 ───────────────────────────

/** 球面上大致均勻分布的 n 個方向（黃金角螺旋）；from / to 限制高度（y） */
function sphereDirs(n: number, from = -1, to = 1, turn = 0): V3[] {
  return Array.from({ length: n }, (_, i) => {
    const y = to - ((to - from) * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.399963 + turn;
    return [Math.cos(a) * r, y, Math.sin(a) * r] as V3;
  });
}

const at = (c: V3, d: V3, r: number): V3 => [c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r];

/** 沿球面爬的血管 / 皺褶：從方向 a 彎到方向 b，貼在中心 c、半徑 r 的球（或三軸半徑 r 的橢球）面上 */
function vein(c: V3, r: number | V3, a: V3, b: V3, w: number, color: number, n = 3): Mesh[] {
  const [rx, ry, rz] = typeof r === 'number' ? [r, r, r] : r;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const d = normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    return [c[0] + d[0] * rx, c[1] + d[1] * ry, c[2] + d[2] * rz] as V3;
  });
  return pts.slice(1).map((p, i) => seg(pts[i]!, p, w * (1 - i * 0.2), w * (1 - (i + 1) * 0.2) + 0.1, color, 5));
}

/** 肉質觸手的一節：錯開的表面、上端的環節、前側一列吸盤（每節 suckers 個），末節加上尖端 */
const fleshTentacle =
  (c: { skin: number; ring: number; sucker: number; tip: number }, suckers = 3) =>
  (k: 0 | 1 | 2, l: number, r0: number, r1: number): Mesh[] => [
    organic(prism(10, 0, -l, [r0, r0], [r1, r1], k === 2 ? c.tip : c.skin), r0 * 0.1 + 0.04, 11 + k),
    organic(prism(10, -l * 0.04, -l * 0.18, [r0 * 1.14, r0 * 1.14], [r0 * 1.06, r0 * 1.06], c.ring), r0 * 0.08, 17 + k),
    ...(suckers === 3 ? [0.32, 0.55, 0.78] : [0.38, 0.72]).map((t) => {
      const r = r0 + (r1 - r0) * t;
      return lowSphere(r * 0.45 + 0.08, c.sucker, [0, -l * t, r * 0.9], 6, 3, [1, 1, 0.55]);
    }),
    ...(k === 2 ? [spike([0, -l * 0.9, 0], [0, -l * 1.25, 0.5], 0.42, c.tip)] : []),
  ];

/** 根鬚般的腳：錯開的表面、上端的結節、往外岔出的細根、一片結霜的樹皮 */
const rootLeg =
  (c: { skin: number; knot: number; frost: number }) =>
  (k: 0 | 1 | 2, l: number, r0: number, r1: number): Mesh[] => [
    organic(prism(9, 0, -l, [r0, r0], [r1, r1], c.skin), r0 * 0.14 + 0.05, 23 + k),
    mass(c.knot, [0, -l * 0.08, 0], [r0 * 1.3, l * 0.16, r0 * 1.3], 0.12, 7, 4),
    spike([r0 * 0.6, -l * 0.45, 0], [r0 * 2.6, -l * 0.75, r0 * 0.6], r0 * 0.3 + 0.12, c.skin),
    spike([-r0 * 0.5, -l * 0.6, r0 * 0.4], [-r0 * 2.2, -l * 0.95, r0 * 1.4], r0 * 0.25 + 0.1, c.knot),
    plate([0, -l * 0.5, r0 * 0.9], [0, 0, 1], r0 * 1.1, l * 0.3, 0.25, c.frost, 0.08),
    ...(k === 2 ? [spike([0, -l * 0.9, 0], [0.3, -l * 1.3, 0.3], 0.4, c.knot)] : []),
  ];

// ═══════════════════════════ 虛空孢子 ═══════════════════════════

const VOID = { shell: 0x3a1c5c, plate: 0x4a2672, dark: 0x220e38, spike: 0x8a4ad0, core: 0xd090ff, glow: 0xf4dcff, sucker: 0x6a3a9a };
/** 主刺的方向（四面八方，正前方留給發光的核心） */
const VOID_SPIKES: V3[] = (
  [
    [1, 0.2, 0],
    [-1, 0.2, 0],
    [0, 1, 0],
    [0, 0.3, -1],
    [0.7, 0.7, 0.7],
    [-0.7, 0.7, -0.7],
    [0.7, -0.5, -0.7],
    [-0.7, -0.5, 0.7],
    [0.7, 0.6, -0.6],
    [-0.6, 0.6, 0.7],
    [0, -0.8, -0.6],
  ] as V3[]
).map(normalize);
/** 虛空孢子：紫黑色的甲殼球、甲片之間透出紫光、四面八方長著帶倒鉤的發光尖刺、正面裂開露出核心 */
const VOID_SPORE: FigureModel = {
  parts: floater({
    hover: 20,
    core: [
      mass(VOID.shell, [0, 0, 0], [6.4, 6.4, 6.4], 0.1, 14, 9),
      // 甲片底下的紫光縫隙與一層層甲片（正面留空）
      ...sphereDirs(18, -1, 1, 1.2)
        .filter((d) => d[2] < 0.7)
        .map((d) => plate(at([0, 0, 0], d, 6.1), d, 0.5, 2.6, 0.4, VOID.core)),
      ...sphereDirs(40)
        .filter((d) => d[2] < 0.72)
        .map((d, i) => plate(at([0, 0, 0], d, 6.2), d, 2.6, 2.9, 0.7, [VOID.shell, VOID.plate, VOID.dark][i % 3]!, 0.3)),
      // 主刺：深色的刺根、發光的刺身、兩根倒鉤
      ...VOID_SPIKES.flatMap((d, i) => {
        const side = normalize([d[1] + 0.3, -d[0], d[2] * 0.5 + 0.2]);
        return [
          plate(at([0, 0, 0], d, 6.6), d, 2.4, 2.4, 0.6, VOID.dark, 0.2),
          seg(at([0, 0, 0], d, 5.6), at([0, 0, 0], d, 9), 1.5, 1.05, VOID.dark, 6),
          spike(at([0, 0, 0], d, 9), at([0, 0, 0], d, 13 + (i % 3)), 1.05, VOID.spike),
          spike(at(at([0, 0, 0], d, 9.6), side, 0.5), at(at([0, 0, 0], d, 10.6), side, 2.4), 0.42, VOID.spike),
          spike(at(at([0, 0, 0], d, 8.6), side, -0.5), at(at([0, 0, 0], d, 9.6), side, -2.2), 0.4, VOID.core),
        ];
      }),
      // 細小的次刺
      ...sphereDirs(28, -1, 1, 0.6)
        .filter((d) => d[2] < 0.6)
        .map((d) => spike(at([0, 0, 0], d, 6.6), at([0, 0, 0], d, 8.8), 0.45, VOID.spike)),
    ],
    // 正面的裂口：一圈甲殼瓣、往內的齒、發光的核心
    face: [
      lowSphere(3.3, VOID.core, [0, 0, 5], 14, 7, [1, 1, 0.5]),
      lowSphere(1.5, VOID.glow, [0, 0, 6.5], 10, 5, [1, 1, 0.5]),
      ...Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        return [
          plate([ca * 4.3, sa * 4.3, 4.9], [ca * 0.7, sa * 0.7, 1], 2.4, 2.2, 0.6, i % 2 ? VOID.plate : VOID.dark, 0.2),
          spike([ca * 3.7, sa * 3.7, 5.5], [ca * 2.2, sa * 2.2, 6.9], 0.38, VOID.glow),
        ];
      }).flat(),
    ],
    tentacleLength: 9,
    tentacleR: 0.9,
    tentacle: fleshTentacle({ skin: VOID.dark, ring: VOID.plate, sucker: VOID.sucker, tip: VOID.spike }),
    tentacleRadius: 3,
    tentacleY: -5,
  }),
  hipHeight: 20,
  referenceRadius: 0.3,
  poses: floaterPoses({ hover: 20, bob: 3, rest: 6 }),
};

// ═══════════════════════════ 寒霜孢子體 ═══════════════════════════

const FROST = {
  cap: 0x8ec8e4,
  capDark: 0x5a98bc,
  spot: 0xf0fbff,
  frost: 0xcfeefa,
  ice: 0xa8dcf4,
  stem: 0xd6e2e8,
  stemDark: 0xa8b8c2,
  gill: 0x7a8c9a,
  gillDark: 0x5a6a78,
  eye: 0x9ae8ff,
  socket: 0x2a4a6a,
};
/** 菌柄在高度 y 的半徑（與菌柄的團塊相同） */
const stemR = (y: number) => 4.3 * Math.sqrt(Math.max(0, 1 - ((y + 2.6) / 6.8) ** 2));
/** 寒霜孢子體：走動的冰藍色蕈菇。傘蓋上有白斑與冰晶、下緣垂著冰柱、傘蓋下一圈菌褶；菌柄上有菌環與霜片，根鬚當腳 */
const FROST_SPORELING: FigureModel = {
  parts: floater({
    hover: 9,
    core: [
      // 菌柄、菌環與垂下的環膜、一圈圈霜片
      mass(FROST.stem, [0, -2.6, 0], [4.3, 6.8, 4.3], 0.08, 12, 8),
      organic(prism(14, 0.6, -1.4, [5.2, 5.2], [4.6, 4.6], FROST.stemDark), 0.25),
      ...Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return plate([Math.cos(a) * 4.8, -1.6, Math.sin(a) * 4.8], [Math.cos(a), -0.5, Math.sin(a)], 1.7, 2.2, 0.3, i % 2 ? FROST.stem : FROST.stemDark, 0.12);
      }),
      ...[-7, -5, -3].flatMap((y, j) =>
        Array.from({ length: 7 }, (_, i) => {
          const a = ((i + j * 0.5) / 7) * Math.PI * 2 + 0.4;
          return plate([Math.cos(a) * stemR(y), y, Math.sin(a) * stemR(y)], [Math.cos(a), 0.15, Math.sin(a)], 1.5, 1.8, 0.4, i % 3 ? FROST.frost : FROST.ice, 0.12);
        }),
      ),
      // 傘蓋：上半球、深色下緣、菌褶
      organic(lowSphere(9, FROST.cap, [0, 5, 0], 18, 10, [1, 0.62, 1], (c) => c[1] > -0.3), 0.3),
      organic(prism(18, 5.2, 4.2, [9.1, 9.1], [8.6, 8.6], FROST.capDark), 0.22),
      prism(18, 4.4, 3.8, [8.6, 8.6], [4, 4], FROST.gillDark),
      ...Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        return seg([Math.cos(a) * 3.8, 3.9, Math.sin(a) * 3.8], [Math.cos(a) * 8.4, 4.2, Math.sin(a) * 8.4], 0.5, 0.32, i % 2 ? FROST.gill : FROST.gillDark, 4);
      }),
      // 白斑、隆起的疣、傘蓋頂的冰晶簇、下緣垂著的冰柱
      ...shell([0, 5, 0], [9, 5.58, 9], 4, 5, [FROST.spot, FROST.frost, FROST.spot], 1.6, { from: -0.7, to: 0.7, arc: 0.9, thick: 0.5, rough: 0.15 }),
      ...sphereDirs(7, 0.35, 0.9, 0.8).map((d) => mass(FROST.spot, [d[0] * 9 * 0.95, 5 + d[1] * 5.58 * 0.95, d[2] * 9 * 0.95], [1.1, 0.7, 1.1], 0.12, 6, 4)),
      ...(
        [
          [3, 9.6, -2],
          [-4, 8.6, 3],
          [5.6, 7.6, 3.4],
          [-3.4, 9.2, -4],
        ] as V3[]
      ).flatMap(([x, y, z], i) => [
        spike([x, y, z], [x * 1.25, y + 4 + (i % 2), z * 1.25], 0.8, FROST.ice),
        spike([x + 0.5, y - 0.2, z - 0.5], [x * 1.4 + 1, y + 2.4, z * 1.1 - 1], 0.55, FROST.frost),
        spike([x - 0.5, y - 0.2, z + 0.4], [x * 1.1 - 1, y + 2.6, z * 1.4 + 1], 0.5, FROST.spot),
      ]),
      ...Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + 0.2;
        return spike([Math.cos(a) * 8.8, 4.4, Math.sin(a) * 8.8], [Math.cos(a) * 8.6, 1.8 - (i % 3) * 0.9, Math.sin(a) * 8.6], 0.45, i % 2 ? FROST.ice : FROST.frost);
      }),
    ],
    // 臉：凹陷的眼窩與發光的眼、霜眉、嘴與冰牙
    face: [
      ...[1, -1].flatMap((x) => [
        mass(FROST.socket, [x * 1.5, 0.2, 3.7], [1.1, 1.3, 0.6], 0.05, 8, 5),
        lowSphere(0.75, FROST.eye, [x * 1.5, 0.2, 4.2], 8, 4),
        plate([x * 1.6, 1.8, 3.8], [x * 0.2, 0.6, 1], 1.8, 0.7, 0.4, FROST.frost, 0.08),
      ]),
      mass(FROST.socket, [0, -2, 3.8], [1.6, 0.5, 0.5], 0.05, 9, 4),
      ...[-0.9, -0.3, 0.3, 0.9].map((x) => spike([x, -1.6, 4.1], [x * 0.9, -2.3, 4.3], 0.25, FROST.spot)),
    ],
    faceAt: [0, 0, 0],
    tentacleLength: 9,
    tentacleR: 1.1,
    tentacle: rootLeg({ skin: FROST.stem, knot: FROST.stemDark, frost: FROST.ice }),
    tentacleRadius: 4,
    tentacleY: -8,
  }),
  hipHeight: 17,
  referenceRadius: 0.32,
  poses: floaterPoses({ hover: 17, bob: 0.6, rest: 6 }),
};

// ═══════════════════════════ 單眼浮體 ═══════════════════════════

const EYE = { flesh: 0x8c5464, fleshDark: 0x5a3040, wart: 0xa86a78, white: 0xeee6dc, iris: 0xd03028, irisDark: 0x8a1814, pupil: 0x140808, vein: 0x7a2a3c, bloodshot: 0xc04050, tooth: 0xe8dcc8, glow: 0xffb060, sucker: 0xc88a96 };
/** 單眼浮體：一顆巨大的眼珠嵌在肉質的身體裡；眼瞼長著齒狀的睫毛、背上爬滿血管與膿疱、頭頂幾根末端發光的觸角 */
const EYE_FLOATER: FigureModel = {
  parts: floater({
    hover: 30,
    core: [
      mass(EYE.flesh, [0, 0, -1], [8, 8, 8], 0.07, 14, 9),
      organic(lowSphere(8.6, EYE.fleshDark, [0, 1.5, -2], 14, 8, [1, 0.92, 1], (c) => c[2] < -2 || c[1] > 6), 0.3),
      // 背上的血管
      ...sphereDirs(9, -0.5, 0.8, 0.3).flatMap((d) => vein([0, 0, -1], 8.15, [d[0] * 0.6, d[1], 0.5], [d[0], d[1] * 0.6, -1], 0.32, EYE.vein, 3)),
      // 膿疱
      ...sphereDirs(12, -0.7, 0.9, 2)
        .filter((d) => d[2] < 0.3)
        .map((d, i) => mass(i % 3 ? EYE.wart : EYE.fleshDark, at([0, 0, -1], d, 8.1), [1 + (i % 3) * 0.3, 1 + (i % 3) * 0.3, 1 + (i % 3) * 0.3], 0.12, 5, 3)),
      // 眼窩周圍的肉褶
      ...Array.from({ length: 11 }, (_, i) => {
        const a = (i / 11) * Math.PI * 2;
        return mass(EYE.fleshDark, [Math.cos(a) * 6.3, Math.sin(a) * 6.3, 3.2], [1.7, 1.7, 1.3], 0.12, 5, 3);
      }),
    ],
    face: [
      lowSphere(6.2, EYE.white, [0, 0, 3], 14, 8, [1, 1, 0.8]),
      lowSphere(3.6, EYE.irisDark, [0, 0, 7.1], 16, 4, [1, 1, 0.35]),
      lowSphere(3.2, EYE.iris, [0, 0, 7.4], 16, 6, [1, 1, 0.45]),
      lowSphere(1.5, EYE.pupil, [0, 0, 8.6], 10, 4, [1, 1, 0.4]),
      lowSphere(0.6, EYE.white, [1, 1.2, 8.9], 6, 3),
      // 眼白上的血絲（從邊緣往虹膜爬）
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        return vein([0, 0, 3], [6.25, 6.25, 5], [Math.cos(a), Math.sin(a), 0.25], [Math.cos(a + 0.25) * 0.9, Math.sin(a + 0.25) * 0.9, 0.7], 0.16, EYE.bloodshot, 2);
      }).flat(),
      // 上下眼瞼與齒狀睫毛
      organic(lowSphere(6.8, EYE.fleshDark, [0, 0.4, 2.6], 16, 8, [1.05, 1, 0.85], (c) => c[1] > 3.4), 0.2),
      organic(lowSphere(6.8, EYE.flesh, [0, -0.4, 2.6], 16, 8, [1.05, 1, 0.85], (c) => c[1] < -3.8), 0.2),
      ...Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI * (0.18 + (i / 8) * 0.64);
        return spike([Math.cos(a) * 5.4, Math.sin(a) * 4.6 + 0.4, 5.6], [Math.cos(a) * 6.4, Math.sin(a) * 6.2 + 0.6, 7.6], 0.32, EYE.tooth);
      }),
      ...Array.from({ length: 7 }, (_, i) => {
        const a = -Math.PI * (0.22 + (i / 6) * 0.56);
        return spike([Math.cos(a) * 5.2, Math.sin(a) * 4.4 - 0.4, 5.6], [Math.cos(a) * 6, Math.sin(a) * 5.6 - 0.6, 7.2], 0.28, EYE.tooth);
      }),
    ],
    // 頭頂的觸角：兩段、末端發光
    crest: [
      [2, 6, -3, 4.4, 13, -6.4],
      [-2, 6, -3, -4.2, 12.4, -7.2],
      [0, 7, -5, 0.4, 12.6, -10.4],
      [3.6, 5, -5.4, 7, 9.4, -9],
      [-3.4, 5.2, -5.6, -6.6, 9, -9.6],
    ].flatMap(([x0, y0, z0, x1, y1, z1]) => {
      const mid: V3 = [(x0! + x1!) / 2, (y0! + y1!) / 2 + 1, (z0! + z1!) / 2];
      return [seg([x0!, y0!, z0!], mid, 0.9, 0.6, EYE.fleshDark, 6), seg(mid, [x1!, y1!, z1!], 0.6, 0.35, EYE.flesh, 6), lowSphere(0.8, EYE.glow, [x1!, y1!, z1!], 6, 4)];
    }),
    tentacleLength: 18,
    tentacleR: 1.3,
    tentacle: fleshTentacle({ skin: EYE.flesh, ring: EYE.fleshDark, sucker: EYE.sucker, tip: EYE.fleshDark }, 2),
    tentacleRadius: 5,
    tentacleY: -5,
  }),
  hipHeight: 30,
  referenceRadius: 0.33,
  poses: floaterPoses({ hover: 30, rest: 8 }),
};

// ═══════════════════════════ 腦海浮體 ═══════════════════════════

const BRAIN = { lobe: 0xd48c9c, fold: 0xa85e70, deep: 0x8a4a5c, stem: 0x8c4e5e, eye: 0xf0e060, socket: 0x4a1a2a, vein: 0x6a2a40, sucker: 0xc87a8c };
/** 半腦（side = 1 左、-1 右）：團塊 + 表面一條條隆起的腦回 */
function lobe(side: 1 | -1): Mesh[] {
  const c: V3 = [side * 3.2, 3, 0];
  const radii: V3 = [5.8, 5.4, 8];
  return [
    mass(BRAIN.lobe, c, radii, 0.08, 14, 9),
    ...sphereDirs(16, -0.3, 1, side === 1 ? 0 : 1.3)
      .filter((d) => d[0] * side > -0.25)
      .map((d, i) =>
        mass(
          i % 2 ? BRAIN.fold : BRAIN.lobe,
          [c[0] + d[0] * radii[0] * 0.93, c[1] + d[1] * radii[1] * 0.93, c[2] + d[2] * radii[2] * 0.93],
          i % 2 ? [1.1, 0.75, 3.2] : [2.9, 0.75, 1.1],
          0.1,
          7,
          4,
        ),
      ),
  ];
}
/** 腦海浮體：裸露的大腦（左右兩半、隆起的腦回、中間的腦溝與血管）、後方的小腦、腦幹下一對小眼睛和長觸手 */
const BRAIN_FLOATER: FigureModel = {
  parts: floater({
    hover: 30,
    core: [
      ...lobe(1),
      ...lobe(-1),
      // 中央的腦溝與爬過表面的血管
      ...vein([0, 3, 0], 5.6, [0, 0.6, 1], [0, 0.6, -1], 0.7, BRAIN.deep, 4),
      ...[1, -1].flatMap((x) => [...vein([x * 3.2, 3, 0], 6, [x * 0.4, 0.8, 0.6], [x, 0.2, -0.4], 0.32, BRAIN.vein), ...vein([x * 3.2, 3, 0], 6, [x * 0.3, 0.9, -0.5], [x, 0, 0.6], 0.3, BRAIN.vein)]),
      // 腦幹與一節節的脊椎環
      organic(seg([0, -1, -1], [0, -6, -2], 3.4, 2, BRAIN.stem, 10), 0.2),
      ...[-1.6, -3, -4.4, -5.8].map((y, i) => mass(i % 2 ? BRAIN.fold : BRAIN.stem, [0, y, -1.3 - i * 0.2], [3.6 - i * 0.35, 0.6, 3.2 - i * 0.3], 0.1, 8, 4)),
    ],
    // 腦幹前方：凹陷的眼窩、發光的小眼、口器
    face: [
      ...[1, -1].flatMap((x) => [mass(BRAIN.socket, [x * 1.6, -2, 3.9], [1.3, 1.2, 0.7], 0.06, 8, 5), lowSphere(1, BRAIN.eye, [x * 1.6, -2, 4.3], 8, 4)]),
      spike([0, -3.6, 3.6], [0, -5.2, 4.6], 0.5, BRAIN.fold),
      spike([1, -3.4, 3.4], [1.6, -4.8, 4.4], 0.35, BRAIN.vein),
      spike([-1, -3.4, 3.4], [-1.6, -4.8, 4.4], 0.35, BRAIN.vein),
    ],
    // 小腦：橫向的皺褶
    crest: [
      mass(BRAIN.fold, [0, 0, 0], [4, 2.6, 2.6], 0.08, 10, 6),
      ...[-1.6, -0.6, 0.4, 1.4, 2.2].map((y, i) => mass(i % 2 ? BRAIN.lobe : BRAIN.deep, [0, y, 1.6 - Math.abs(y) * 0.3], [3.6 - Math.abs(y) * 0.5, 0.5, 1.1], 0.1, 7, 4)),
    ],
    crestAt: [0, 4, -7],
    tentacleLength: 22,
    tentacleR: 1.2,
    tentacle: fleshTentacle({ skin: BRAIN.stem, ring: BRAIN.deep, sucker: BRAIN.sucker, tip: BRAIN.vein }),
    tentacleRadius: 3,
    tentacleY: -5,
  }),
  hipHeight: 32,
  referenceRadius: 0.35,
  poses: floaterPoses({ hover: 32, rest: 7 }),
};

// ═══════════════════════════ 鑽地寄生蟲 ═══════════════════════════

const WORM = { flesh: 0x9a7262, belly: 0xb88e7a, ring: 0x5c4436, plate: 0x7a5a48, plateDark: 0x5a4234, lip: 0x7a3a30, maw: 0x2a1010, jaw: 0xe0d0b0, eye: 0xff8040 };
/** 蠕蟲的一節：錯開的肉質身體、淺色腹部、深色環節、背上一排甲片、兩側的剛毛 */
const wormSegment = (r: number): Mesh[] => [
  mass(WORM.flesh, [0, 0, 0], [r, r * 0.9, 3.6], 0.06, 12, 6),
  mass(WORM.belly, [0, -r * 0.5, 0], [r * 0.78, r * 0.48, 3.1], 0.06, 9, 5),
  organic(along(2.3, 3.5, [r * 1.1, r], [r * 1.08, r * 0.98], WORM.ring, [0, 0, 0], 12), r * 0.05),
  ...shell([0, 0, 0], [r * 0.95, r * 0.88, 3.2], 2, 3, [WORM.plate, WORM.plateDark], r * 0.48, { from: -0.5, to: 0.4, arc: 0.75, thick: r * 0.1 }),
  ...[1, -1].flatMap((x) => [spike([x * r * 0.9, -r * 0.2, 1], [x * (r + 1.6), -r * 0.5, -0.4], 0.3, WORM.ring), spike([x * r * 0.85, -r * 0.35, -1.6], [x * (r + 1.3), -r * 0.7, -3], 0.28, WORM.ring)]),
];
/** 大顎：兩節、內側一排鋸齒（side = 1 左、-1 右） */
const mandible = (side: 1 | -1): Mesh[] => [
  seg([0, 0, 0], [-side * 0.3, 0, 2.6], 0.9, 0.7, WORM.jaw, 6),
  seg([-side * 0.3, 0, 2.6], [-side * 1, 0, 5], 0.7, 0.4, WORM.jaw, 6),
  spike([-side * 1, 0, 5], [-side * 1.8, 0, 6.6], 0.4, WORM.jaw),
  ...[1.4, 2.8, 4].map((z) => spike([-side * 0.5, 0, z], [-side * 1.4, 0, z + 0.4], 0.22, WORM.plateDark)),
];
/** 鑽地寄生蟲：一節一節的長蟲；頭部是圓形的口器（兩圈往內的牙齒）、一對鋸齒大顎、背上有甲片 */
const BURROWER: FigureModel = {
  parts: [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: wormSegment(4.4) },
    { joint: 'torso', parent: 'root', offset: [0, 0.4, 6], meshes: wormSegment(4.2) },
    { joint: 'neck', parent: 'torso', offset: [0, 0.4, 6], meshes: wormSegment(3.8) },
    {
      joint: 'head',
      parent: 'neck',
      offset: [0, 0.4, 5.6],
      meshes: [
        mass(WORM.flesh, [0, 0, 1.5], [4, 3.6, 4.8], 0.07, 12, 7),
        ...shell([0, 0, 1.2], [3.9, 3.5, 4.4], 2, 3, [WORM.plateDark, WORM.plate], 2.4, { from: -0.6, to: 0.2, arc: 0.7, thick: 0.6 }),
        // 口器：肉質的唇、喉嚨、兩圈往內的牙齒
        organic(along(4.6, 6, [3.4, 3.2], [3, 2.8], WORM.lip, [0, 0, 0], 14), 0.2),
        lowSphere(2.4, WORM.maw, [0, 0, 5.6], 12, 5, [1, 1, 0.4]),
        ...Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          const b = a + Math.PI / 10;
          return [
            spike([Math.cos(a) * 2.8, Math.sin(a) * 2.6, 6], [Math.cos(a) * 1.1, Math.sin(a) * 1, 6.8], 0.34, WORM.jaw),
            spike([Math.cos(b) * 1.9, Math.sin(b) * 1.8, 5.6], [Math.cos(b) * 0.6, Math.sin(b) * 0.6, 6.2], 0.26, WORM.jaw),
          ];
        }).flat(),
        // 四顆小眼、觸鬚、上下兩根角
        ...[1, -1].flatMap((x) => [
          lowSphere(0.6, WORM.eye, [x * 2.4, 2, 3.6], 6, 4),
          lowSphere(0.45, WORM.eye, [x * 3.1, 1.2, 2.6], 6, 4),
          spike([x * 3, -1.6, 4.2], [x * 4.6, -2.6, 6.4], 0.3, WORM.plateDark),
        ]),
        ...spineRow([[2.4, 3, 2.6], [-0.2, 3.2, 2]], 0.7, [WORM.jaw, WORM.plate], 0.3),
        spike([0, -3, 3], [0, -4.5, 6.5], 0.8, WORM.jaw),
      ],
    },
    { joint: 'handL', parent: 'head', offset: [2.6, 0, 4], meshes: mandible(1) },
    { joint: 'handR', parent: 'head', offset: [-2.6, 0, 4], meshes: mandible(-1) },
    { joint: 'ponytail', parent: 'root', offset: [0, -0.2, -6], meshes: wormSegment(4) },
    { joint: 'thighL', parent: 'ponytail', offset: [0, -0.3, -6], meshes: wormSegment(3.4) },
    { joint: 'shinL', parent: 'thighL', offset: [0, -0.3, -5.6], meshes: wormSegment(2.8) },
    {
      joint: 'footL',
      parent: 'shinL',
      offset: [0, -0.2, -5],
      meshes: [
        organic(along(-1, -6, [2.2, 2], [0.3, 0.3], WORM.flesh, [0, 0, 0], 10), 0.12),
        ...shell([0, 0, -2.4], [1.8, 1.6, 2.6], 2, 2, [WORM.plate, WORM.plateDark], 1.3, { from: -0.4, to: 0.5, arc: 0.6, thick: 0.4 }),
        spike([0, 1.5, -2], [0, 4, -4], 0.6, WORM.plate),
        spike([0, 0, -5.6], [0, -0.4, -8], 0.4, WORM.jaw),
      ],
    },
  ],
  hipHeight: 4,
  referenceRadius: 0.3,
  poses: wormPoses(4),
};

/** EnemyDef ID → 生物化的漂浮異體、寒霜孢子體、鑽地寄生蟲 */
export const ABERRATION_MODELS: Record<string, FigureModel> = {
  'enemy.void_spore': VOID_SPORE,
  'enemy.frost_sporeling': FROST_SPORELING,
  'enemy.eye_floater': EYE_FLOATER,
  'enemy.brain_floater': BRAIN_FLOATER,
  'enemy.burrower': BURROWER,
};
