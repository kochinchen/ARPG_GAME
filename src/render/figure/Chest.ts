import { detail, facetize, knob, tone } from './Facets';
import type { FigureModel, Pose } from './FigureModel';
import { box, orient, type Face, type Mesh, type V3 } from './Poly3D';

/**
 * 寶箱（多面體）：木板拼成的箱身、鐵條箍、四角護鐵、鉚釘、兩側提把、正面鎖扣，
 * 上面是拱形（半圓筒）的箱蓋。箱蓋掛在 ex_lid 關節（後上緣的鉸鏈）上，開啟時往後翻。
 * 箱身是空心的（四面牆 + 底板），打開後看得到裡面。
 *
 * 模型座標：Y 向上、Z 為寶箱正面（鎖扣那一面）。
 */
export type ChestStyle = 'wood' | 'royal';

interface Palette {
  wood: number[];
  woodDark: number[];
  metal: number[];
  lock: number[];
  inside: number;
  gem: number | null;
}

const PALETTES: Record<ChestStyle, Palette> = {
  // 一般寶箱：橡木 + 鐵條 + 黃銅鎖
  wood: { wood: [0x8a5a30, 0x6e4424], woodDark: [0x5a3a1e, 0x4a2e18], metal: [0x5a5e66, 0x3e4148], lock: [0xd0a24a, 0xa87c2a], inside: 0x1e140c, gem: null },
  // 王座廳的寶箱：深紅木 + 金箍 + 紅寶石
  royal: { wood: [0x7a2a26, 0x5c1c1a], woodDark: [0x3e1210, 0x2e0c0a], metal: [0xe0b050, 0xb08030], lock: [0xf0c860, 0xc09838], inside: 0x160808, gem: 0xd8283a },
};

/** 箱身寬（X）、深（Z）、高（Y）、牆厚 */
const W = 32;
const D = 20;
const H = 14;
const T = 2.2;
/** 箱蓋下緣的高度與拱的高度（半徑 D/2 壓扁成這個高度） */
const SKIRT = 2.4;
const ARCH = 6.5;

const faceted = (mesh: Mesh, colors: readonly number[], seed: number, bump = 0.06) => facetize(tone(mesh, colors, seed), bump, seed);

/** 一面牆：三片水平木板（前後略為錯開，看得出板縫） */
function wall(width: number, thick: number, axis: 'x' | 'z', offset: number, colors: readonly number[], seed: number): Mesh[] {
  const plank = (H - 2) / 3;
  return [0, 1, 2].map((i) => {
    const y = 2 + plank * (i + 0.5);
    const jitter = (i % 2 ? 0.25 : -0.15) * Math.sign(offset);
    const w = width - 0.3;
    const h = plank - 0.35;
    const m = axis === 'z' ? box(w, h, thick, colors[0]!, [0, y, offset + jitter]) : box(thick, h, w, colors[0]!, [offset + jitter, y, 0]);
    return faceted(m, colors, seed + i * 5);
  });
}

/**
 * 拱形殼：沿 X 的半圓筒（底面是平的），從 x0 到 x1；拱從後（z = zc − r）經過頂端到前（z = zc + r）。
 * 每一段拱面切成兩個三角形（木板的切面感）。
 */
function arch(x0: number, x1: number, r: number, height: number, yBase: number, zc: number, colors: readonly number[], seed: number, segments = 6): Mesh {
  const verts: V3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI;
    const y = yBase + Math.sin(a) * height;
    const z = zc - Math.cos(a) * r;
    verts.push([x0, y, z], [x1, y, z]);
  }
  const color = colors[0]!;
  const faces: Face[] = [];
  for (let i = 0; i < segments; i++) {
    const [a, b, c, d] = [i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2];
    faces.push({ idx: [a, b, c], color }, { idx: [a, c, d], color });
  }
  // 兩端的半圓面：從底邊中點切成扇形小三角（大面會讓由遠到近的排序出錯，蓋住前面的鐵條）
  for (const [side, x] of [
    [0, x0],
    [1, x1],
  ] as const) {
    const center = verts.push([x, yBase, zc]) - 1;
    for (let i = 0; i < segments; i++) faces.push({ idx: [center, i * 2 + side, (i + 1) * 2 + side], color });
  }
  faces.push({ idx: [0, 1, segments * 2 + 1, segments * 2], color });
  return tone(orient({ verts, faces }), colors, seed);
}

function chestParts(p: Palette): FigureModel['parts'] {
  const bandX = W * 0.3;
  const rivet = (c: V3, i: number) => knob(0.55, c, p.metal, 40 + i);
  const body: Mesh[] = [
    // 底座與內部底板
    faceted(box(W + 1.6, 2, D + 1.6, p.woodDark[0]!, [0, 1, 0]), p.woodDark, 1),
    box(W - T * 2, 0.6, D - T * 2, p.inside, [0, 2.3, 0]),
    // 四面牆（前後長、左右短）
    ...wall(W, T, 'z', D / 2 - T / 2, p.wood, 2),
    ...wall(W, T, 'z', -(D / 2 - T / 2), p.wood, 12),
    ...wall(D - T * 2, T, 'x', W / 2 - T / 2, p.wood, 22),
    ...wall(D - T * 2, T, 'x', -(W / 2 - T / 2), p.wood, 32),
    // 鐵條箍：前、後各兩條直的，繞過底座
    ...[-bandX, bandX].flatMap((x, i) => [
      faceted(box(3, H - 0.4, 0.8, p.metal[0]!, [x, H / 2 + 0.6, D / 2 + 0.35]), p.metal, 50 + i),
      faceted(box(3, H - 0.4, 0.8, p.metal[0]!, [x, H / 2 + 0.6, -D / 2 - 0.35]), p.metal, 54 + i),
    ]),
    // 上緣的鐵框
    faceted(box(W + 0.6, 1.2, 1, p.metal[0]!, [0, H - 0.2, D / 2 + 0.2]), p.metal, 58),
    // 四角護鐵
    ...[
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].map(([sx, sz], i) => faceted(box(2.8, H, 2.8, p.metal[0]!, [(sx! * (W - 1.6)) / 2, H / 2 + 0.5, (sz! * (D - 1.6)) / 2]), p.metal, 60 + i)),
    // 正面鎖板與鑰匙孔
    faceted(box(6.5, 6, 1, p.lock[0]!, [0, H - 4, D / 2 + 0.75]), p.lock, 70, 0.1),
    box(1, 2.2, 0.4, 0x120c08, [0, H - 4.6, D / 2 + 1.35]),
    box(1.8, 1, 0.4, 0x120c08, [0, H - 3.4, D / 2 + 1.35]),
    // 兩側提把（U 形鐵環）
    ...[-1, 1].flatMap((s, i) => [
      faceted(box(0.9, 1, 7, p.metal[0]!, [s * (W / 2 + 1.4), H - 5.5, 0]), p.metal, 80 + i),
      faceted(box(1.4, 3, 0.9, p.metal[0]!, [s * (W / 2 + 0.9), H - 4.5, -3]), p.metal, 82 + i),
      faceted(box(1.4, 3, 0.9, p.metal[0]!, [s * (W / 2 + 0.9), H - 4.5, 3]), p.metal, 84 + i),
    ]),
    // 鉚釘（近看才畫）
    ...detail(
      1,
      [-bandX, bandX].flatMap((x, i) => [3.5, 7.5, 11.5].map((y, k) => rivet([x, y, D / 2 + 0.95], i * 3 + k))),
    ),
  ];
  if (p.gem !== null) body.push(knob(1.1, [0, H - 2.2, D / 2 + 1.4], [p.gem, 0x901020], 90));
  // 滿滿一堆金幣（打開時才看得到；鏡頭的角度看不到箱底，所以堆到接近箱口）
  const GOLD = [0xf0c860, 0xc89a30];
  body.push(knob(9, [0, 7, 0], GOLD, 130, [1.5, 0.55, 0.8]));
  const coins: V3[] = [
    [-8, 11, -2],
    [-3, 12, 1],
    [2, 12.2, -1],
    [7, 11.2, 1],
    [-5, 11.2, 3],
    [4, 11.4, 3.5],
  ];
  body.push(...detail(1, coins.map((c, i) => knob(1.8, c, GOLD, 131 + i, [1, 0.35, 1]))));

  // 箱蓋（鉸鏈座標：原點在後上緣，z = 0 → D 往前）
  const zc = D / 2;
  const lid: Mesh[] = [
    // 下緣（與箱身等寬的一圈）
    faceted(box(W + 0.4, SKIRT, D + 0.4, p.wood[0]!, [0, SKIRT / 2, zc]), p.wood, 100),
    // 拱：中間木板 + 兩端
    arch(-W / 2 + 0.2, W / 2 - 0.2, D / 2 + 0.2, ARCH, SKIRT, zc, p.wood, 101, 7),
    // 拱上的鐵條（比木板高一點）
    ...[-bandX, bandX].map((x, i) => arch(x - 1.6, x + 1.6, D / 2 + 0.75, ARCH + 0.6, SKIRT - 0.2, zc, p.metal, 110 + i, 7)),
    // 前緣垂下的鎖扣
    faceted(box(3.6, 4.4, 1, p.lock[0]!, [0, 0.2, D + 0.9]), p.lock, 120, 0.1),
    ...detail(1, [-bandX, bandX].map((x, i) => rivet([x, SKIRT / 2, D + 0.55], 20 + i))),
  ];

  return [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: body },
    { joint: 'ex_lid', parent: 'root', offset: [0, H, -D / 2], meshes: lid },
  ];
}

/** 箱蓋開啟的角度（弧度；往後翻 110°） */
export const CHEST_OPEN_ANGLE = 1.92;

/** 箱蓋的姿勢：open = 0（關）～ 1（全開） */
export function chestPose(open: number): Pose {
  return { rootY: 0, angles: { ex_lid: [-CHEST_OPEN_ANGLE * open, 0, 0] } };
}

function chestModel(style: ChestStyle): FigureModel {
  const closed = chestPose(0);
  return {
    hipHeight: 0,
    referenceRadius: 0.5,
    parts: chestParts(PALETTES[style]),
    poses: {
      ready: () => closed,
      run: () => closed,
      attackWindup: closed,
      attackStrike: closed,
      castWindup: closed,
      castRelease: closed,
      hit: closed,
      dead: closed,
    },
  };
}

export const CHESTS: Record<ChestStyle, FigureModel> = { wood: chestModel('wood'), royal: chestModel('royal') };
