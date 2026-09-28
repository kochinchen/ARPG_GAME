import { grounded, type FigureModel, type Joint, type PartDef, type Pose, type PoseSet } from '../FigureModel';
import { box, lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { F, FF, FS, FSeg } from './BossParts';

/**
 * 25F 蜘蛛女王（約 44 個關節）：紫黑甲殼 + 螢光綠的巨蛛，上面是人形的女王。
 * 人形上半身：淡色皮膚、深色鮑伯頭、綠色發光的眼與耳環、頭頂一圈紫色尖刺冠（正中一根綠水晶）、
 * 胸前綠水晶墜飾、上身周圍一圈尖刺領；雙臂末端是鐮刀狀的長爪。
 * 蜘蛛身體抬得很高：八隻細長帶刺的腳往外撐開，關節是綠色發光的圓珠、腳上有綠色光環、腳尖是綠水晶利刃；
 * 腳與腳之間有發光的綠色蜘蛛網；大而飽滿的腹部，背上綠色菱形紋與兩排尖刺，末端毒針。
 *
 * 動作像動物：八隻腳分兩組交替（四腳一組）走路、身體與腹部隨步伐擺動；
 * 攻擊：前腳與雙爪高舉 → 撲下（上劈）、雙爪橫掃（橫斬）、腹部往前捲、毒針刺出（突刺）；
 * 死亡時八隻腳往內蜷縮。
 */

const CHITIN = 0x2c1a34;
const CHITIN_ALT = 0x3a2446;
const CHITIN_LIGHT = 0x5a3a6e;
const SKIN = 0xd2bccc;
const SKIN_ALT = 0xc2aabd;
const VENOM = 0x7aff4a;
const VENOM_HOT = 0xc0ff90;
const WEB = 0x5ae03a;
const HAIR = 0x1e1024;
const HAIR_ALT = 0x2a1830;

const CH = [CHITIN, CHITIN_ALT];
const CHL = [CHITIN_LIGHT, CHITIN_ALT];
const GLOW = [VENOM, VENOM_HOT];

/** 骨盆（root）離地的高度：身體抬高 */
const HIP = 22;

type Side = 1 | -1;
/** 四對腳：附著點的前後位置、往前的程度（前腳往前、後腳往後） */
const LEGS: { z: number; forward: number }[] = [
  { z: 5, forward: 0.6 },
  { z: 1.8, forward: 0.2 },
  { z: -1.8, forward: -0.2 },
  { z: -5, forward: -0.6 },
];
const legJoint = (side: Side, i: number, seg: 'a' | 'b' | 'c'): Joint => `ex_leg${side === 1 ? 'L' : 'R'}${i + 1}${seg}`;
const FEET: Joint[] = ([1, -1] as const).flatMap((side) => LEGS.map((_, i) => legJoint(side, i, 'c')));

/** 發光的綠色細線（蜘蛛網、光紋） */
const strand = (a: V3, b: V3, r = 0.24): Mesh => FSeg(a, b, r, r, [WEB], 0, 4);
/** 綠色發光的關節圓珠 */
const orb = (r: number, c: V3, seed = 0): Mesh => F(lowSphere(r, VENOM, c, 8, 5), GLOW, seed);

/**
 * 一隻腳的三節：股節（往外往上到高高的膝）、脛節（往外往下）、跗節（長長地往下到地面，末端綠水晶利刃）。
 * 每節帶刺，膝與踝是發光圓珠，脛節與跗節有綠色光環。
 */
function leg(side: Side, i: number): PartDef[] {
  const knee: V3 = [side * 10, 14, 0];
  const ankle: V3 = [side * 9, -6, 0];
  const tipStart: V3 = [side * 5.4, -25, 0];
  // 腳踝離地 = HIP + 14 − 6，所以腳尖往下 HIP + 8 剛好到地面
  const foot: V3 = [side * 6.2, -HIP - 8, 0];
  const k = 1 - i * 0.05;
  return [
    {
      joint: legJoint(side, i, 'a'),
      parent: 'root',
      offset: [side * 6, 0, LEGS[i]!.z],
      meshes: [
        FSeg([0, 0, 0], knee, 1.5 * k, 1.1 * k, CH, 1, 8),
        orb(1.6 * k, knee, 2),
        ...[0.35, 0.65].map((t, j) => FS([side * 10 * t, 14 * t, 0], [side * (10 * t + 1.2), 14 * t + 2.6, j ? 1.2 : -1.2], 0.45, CHITIN_LIGHT, 3 + j)),
        FSeg([side * 7, 9.8, 0], [side * 7.6, 10.6, 0], 1.25 * k, 1.2 * k, GLOW, 5, 8),
      ],
    },
    {
      joint: legJoint(side, i, 'b'),
      parent: legJoint(side, i, 'a'),
      offset: knee,
      meshes: [
        FSeg([0, 0, 0], ankle, 1.1 * k, 0.85 * k, CH, 6, 8),
        orb(1.2 * k, ankle, 7),
        FS([side * 4.5, -3, 0], [side * 6.6, -1.2, -1.2], 0.45, CHITIN_LIGHT, 8),
        FS([side * 6.6, -4.4, 0], [side * 8.8, -3.2, 1.2], 0.4, CHITIN_LIGHT, 9),
        FSeg([side * 3, -2, 0], [side * 3.6, -2.4, 0], 1, 1, GLOW, 10, 8),
      ],
    },
    {
      joint: legJoint(side, i, 'c'),
      parent: legJoint(side, i, 'b'),
      offset: ankle,
      meshes: [
        FSeg([0, 0, 0], tipStart, 0.85 * k, 0.45 * k, CH, 11, 8),
        FSeg([side * 0.9, -4.2, 0], [side * 1.1, -5.4, 0], 0.8, 0.78, GLOW, 12, 8),
        FS([side * 2.4, -11, 0], [side * 4, -10, -1.2], 0.35, CHITIN_LIGHT, 13),
        // 腳尖：綠水晶利刃
        FS(tipStart, foot, 0.5 * k, VENOM, 14),
      ],
    },
  ];
}

/** 鐮刀爪（ex_claw 關節）：三片彎曲的長刃 */
const scythe = (side: Side): Mesh[] => [
  FSeg([0, 0, 0], [side * 0.6, -6, 1.6], 0.8, 0.5, CHL, 1, 6),
  FSeg([side * 0.6, -6, 1.6], [side * 0.2, -11, 4.4], 0.5, 0.08, GLOW, 2, 6),
  FS([-side * 0.8, -1, 0.4], [-side * 1.6, -6.4, 2.2], 0.45, VENOM, 3),
  FS([side * 1.2, -1, 0.4], [side * 2.6, -5.4, 2], 0.4, VENOM, 4),
];

function queenArm(side: Side): PartDef[] {
  const s = side === 1 ? 'L' : 'R';
  return [
    {
      joint: `upperArm${s}`,
      parent: 'chest',
      offset: [6.2 * side, 6.4, 0],
      meshes: [F(lowSphere(2.8, CHITIN, [0.6 * side, 0.6, 0], 8, 5), CH, 1), F(prism(10, 0, -10, [1.8, 1.8], [1.5, 1.5], SKIN), [SKIN, SKIN_ALT], 2), FS([1.6 * side, 2.2, -0.6], [4.4 * side, 6.2, -2], 0.8, CHITIN_LIGHT, 3), FS([2.2 * side, 1.2, 1.2], [4.8 * side, 3.4, 2.6], 0.5, VENOM, 4)],
    },
    {
      joint: `forearm${s}`,
      parent: `upperArm${s}`,
      offset: [0, -10, 0],
      meshes: [F(prism(10, 0, -9, [1.8, 1.8], [2.3, 2.3], CHITIN), CH, 1), F(prism(10, -3, -4, [2.1, 2.1], [2.15, 2.15], VENOM), GLOW, 2), FS([1.4 * side, -3, -1], [3.6 * side, -1, -3], 0.6, CHITIN_LIGHT, 3), FS([1.2 * side, -6.6, -1], [3.2 * side, -5.4, -3], 0.5, CHITIN_LIGHT, 4)],
    },
    { joint: `hand${s}`, parent: `forearm${s}`, offset: [0, -9, 0], meshes: [F(lowSphere(1.7, CHITIN, [0, -1, 0], 8, 5), CH, 1)] },
    { joint: `ex_claw${s}`, parent: `hand${s}`, offset: [0, -1.8, 0.4], meshes: scythe(side) },
  ];
}

/** 腳與腳之間的蜘蛛網（掛在身體上，對齊站姿時的腳）：放射線 + 兩圈折線 */
function webs(): Mesh[] {
  const out: Mesh[] = [];
  for (const side of [1, -1] as const) {
    // 站姿時各隻腳在膝蓋高度的大約位置（身體座標）
    const knees = LEGS.map((l) => {
      const a = -side * l.forward;
      const x = side * 6 + Math.cos(a) * 10 * side;
      const z = l.z + Math.sin(a) * -10;
      return [x, 12, z] as V3;
    });
    for (let i = 0; i < knees.length - 1; i++) {
      const p = knees[i]!;
      const q = knees[i + 1]!;
      const hub: V3 = [side * 6, 2, (p[2] + q[2]) / 2];
      const lerp = (u: V3, v: V3, t: number): V3 => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
      for (const t of [0.45, 0.8]) out.push(strand(lerp(hub, p, t), lerp(hub, q, t)));
      out.push(strand(hub, lerp(p, q, 0.5)));
      out.push(strand(lerp(hub, p, 0.8), lerp(p, q, 0.5)), strand(lerp(hub, q, 0.8), lerp(p, q, 0.5)));
    }
  }
  return out;
}

const PARTS: PartDef[] = [
  {
    joint: 'root',
    parent: null,
    offset: [0, 0, 0],
    meshes: [
      // 頭胸部：甲殼、背上的綠色光紋、前方的小眼、一圈往外的尖刺領
      FF(lowSphere(8.4, CHITIN, [0, 0, 1], 12, 7, [1, 0.62, 1.25]), CH, 1, 0.06),
      F(lowSphere(8.7, CHITIN_LIGHT, [0, 1.4, 1], 12, 7, [0.9, 0.5, 1.15], (c) => c[1] > 1.5), CHL, 2),
      box(1.2, 0.8, 8, VENOM, [0, 5.6, 0]),
      ...[-1.6, -0.5, 0.5, 1.6].map((x, i) => F(lowSphere(0.6, VENOM, [x, 2.4, 10], 5, 3), GLOW, 3 + i)),
      ...Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const c: V3 = [Math.cos(a) * 7.6, 2.4, 1 + Math.sin(a) * 9];
        return FS(c, [Math.cos(a) * 11, 6.6, 1 + Math.sin(a) * 12.4], 0.8, i % 3 === 0 ? VENOM : CHITIN_LIGHT, 7 + i);
      }),
      ...webs(),
    ],
  },
  {
    joint: 'ex_abd1',
    parent: 'root',
    offset: [0, 2, -7],
    meshes: [
      // 大而飽滿的腹部：背上綠色菱形紋、兩排尖刺、兩側毒囊
      FF(lowSphere(12.4, CHITIN, [0, 3, -10], 14, 8, [1, 0.88, 1.12]), CH, 1, 0.05),
      F(placeMesh(prism(4, 0, 0.8, [3.2, 7], [2.8, 6.4], VENOM, [0, 0, 0], 0), [0.12, 0, 0], [0, 13.4, -9]), GLOW, 2),
      F(placeMesh(prism(4, 0, 0.9, [1.4, 3.2], [1.1, 2.8], VENOM_HOT, [0, 0, 0], 0), [0.12, 0, 0], [0, 13.9, -9]), [VENOM_HOT], 3),
      ...[-4, -9, -14, -18].flatMap((z, i) => [FS([4.2, 12.4 - Math.abs(z + 9) * 0.22, z], [6.4, 17, z - 2], 1.1, CHITIN_LIGHT, 4 + i * 2), FS([-4.2, 12.4 - Math.abs(z + 9) * 0.22, z], [-6.4, 17, z - 2], 1.1, CHITIN_LIGHT, 5 + i * 2)]),
      ...[1, -1].map((x, i) => F(lowSphere(2.4, VENOM, [8.8 * x, 3, -12], 8, 5, [0.6, 1, 1.2]), GLOW, 12 + i)),
      ...[-4, -10, -16].map((z) => strand([-7, 9, z], [7, 9, z], 0.2)),
    ],
  },
  {
    joint: 'ex_abd2',
    parent: 'ex_abd1',
    offset: [0, 2, -20],
    meshes: [FF(lowSphere(6.6, CHITIN, [0, 0, -3], 12, 7, [1, 0.9, 1]), CH, 1, 0.05), F(box(8, 1, 1.4, VENOM, [0, 5.6, -3]), GLOW, 2), ...[-1, -5].map((z, i) => FS([0, 5.4, z], [0, 9.4, z - 2], 1, CHITIN_LIGHT, 3 + i))],
  },
  {
    joint: 'ex_sting',
    parent: 'ex_abd2',
    offset: [0, 0, -8.6],
    meshes: [
      // 毒針與兩側的紡績器
      F(lowSphere(2.4, CHITIN_LIGHT, [0, 0, 0], 8, 5), CHL, 1),
      FSeg([0, 0, -1.6], [0, -1, -7], 1.2, 0.8, CH, 2, 8),
      FS([0, -1, -7], [0, -2.2, -11.4], 0.8, VENOM, 3),
      ...[1, -1].map((x, i) => FS([x * 1.6, -0.6, -1], [x * 2.4, -2.6, -3.2], 0.5, CHITIN_LIGHT, 4 + i)),
    ],
  },
  ...([1, -1] as const).flatMap((side) => LEGS.flatMap((_, i) => leg(side, i))),
  {
    joint: 'torso',
    parent: 'root',
    offset: [0, 4, 7.4],
    meshes: [
      // 甲殼束腹（三層）與綠色光紋
      F(prism(14, 0, 2.6, [5, 4], [5.1, 4.1], CHITIN), CH, 1),
      F(prism(14, 2.4, 4.8, [5.1, 4.1], [5.3, 4.1], CHITIN_LIGHT), CHL, 2),
      F(prism(14, 4.6, 7.2, [5.2, 4.1], [5.6, 4.2], CHITIN), CH, 3),
      ...[1.5, 4.5].map((y, i) => F(box(9, 0.8, 0.6, VENOM, [0, y, 4.4]), GLOW, 4 + i)),
    ],
  },
  {
    joint: 'chest',
    parent: 'torso',
    offset: [0, 7, 0],
    meshes: [
      F(prism(24, 0, 6, [5.6, 4.2], [6.6, 4.6], SKIN), [SKIN, SKIN_ALT], 1),
      F(prism(14, 1.5, 5, [6.2, 4.6], [6.6, 4.8], CHITIN_LIGHT), CHL, 2),
      F(prism(14, 6, 8.5, [6.6, 4.6], [4.4, 3.8], SKIN), [SKIN, SKIN_ALT], 3),
      // 上身周圍的尖刺領
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i / 7) * Math.PI;
        const x = Math.cos(a) * 6;
        return FS([x, 6.6, -1.4 - Math.sin(a) * 1.6], [x * 1.6, 12 + Math.sin(a) * 2, -4 - Math.sin(a) * 2], 0.9, i === 3 || i === 4 ? VENOM : CHITIN_LIGHT, 4 + i);
      }),
      // 胸前的綠水晶墜飾
      F(lowSphere(1.3, VENOM, [0, 3.6, 5], 6, 4, [1, 1.3, 0.6]), GLOW, 12),
      FS([0, 2.6, 5.1], [0, 0, 5.4], 0.6, VENOM, 13),
      FS([0, 4.6, 5.1], [0, 6.4, 5.2], 0.4, VENOM_HOT, 14),
    ],
  },
  { joint: 'neck', parent: 'chest', offset: [0, 8.5, 0], meshes: [F(prism(10, 0, 3, [1.8, 1.8], [1.7, 1.7], SKIN), [SKIN], 1)] },
  {
    joint: 'head',
    parent: 'neck',
    offset: [0, 3, 0],
    meshes: [
      FF(lowSphere(5, SKIN, [0, 5, 0.6], 10, 6, [0.92, 1.1, 1]), [SKIN, SKIN_ALT], 1, 0.06),
      // 綠色發光的眼（方形）
      ...[2, -2].map((x) => box(1.6, 1.1, 0.8, VENOM, [x, 5.6, 5.2])),
      ...[2, -2].map((x) => box(0.8, 0.6, 0.9, VENOM_HOT, [x, 5.6, 5.3])),
      // 深色鮑伯頭：頭頂 + 兩側垂到下巴、平齊的瀏海
      F(lowSphere(5.8, HAIR, [0, 5.9, -0.6], 12, 7, [1, 1.05, 1.05], (c) => c[1] > 1.8 || c[2] < -1), [HAIR, HAIR_ALT], 2),
      ...[1, -1].map((x, i) => F(placeMesh(box(1.6, 7, 5, HAIR), [0, 0, 0.06 * x], [4.6 * x, 3.6, -0.4]), [HAIR, HAIR_ALT], 3 + i)),
      F(box(8.6, 1.6, 2.2, HAIR, [0, 8.6, 3.6]), [HAIR, HAIR_ALT], 5),
      // 綠色耳環
      ...[1, -1].flatMap((x, i) => [F(lowSphere(0.6, VENOM, [5.2 * x, 1.6, 1], 5, 3), GLOW, 6 + i), box(0.2, 1.4, 0.2, VENOM, [5.2 * x, 2.6, 1])]),
      // 紫色尖刺冠，正中一根高高的綠水晶
      F(prism(12, 9.2, 10.6, [4.8, 4.4], [4.9, 4.5], CHITIN_LIGHT), CHL, 8),
      ...Array.from({ length: 9 }, (_, i) => {
        const a = ((i - 4) / 4) * 1.35;
        return FS([Math.sin(a) * 4.4, 10.2, Math.cos(a) * 2.2 - 0.6], [Math.sin(a) * 6.2, 16 - Math.abs(i - 4) * 0.9, Math.cos(a) * 2.4 - 1.4], 0.8, CHITIN_LIGHT, 9 + i);
      }),
      FS([0, 10.4, 2], [0, 21, 1.4], 1.3, VENOM, 20),
    ],
  },
  // 口器：一對往內彎的螯
  ...([1, -1] as const).map((side): PartDef => ({ joint: `ex_mand${side === 1 ? 'L' : 'R'}`, parent: 'head', offset: [1.4 * side, 2, 4.4], meshes: [FSeg([0, 0, 0], [side * 0.8, -2, 1], 0.6, 0.4, CHL, 1, 6), FS([side * 0.8, -2, 1], [-side * 0.4, -3.4, 1.6], 0.4, VENOM, 2)] })),
  // 後髮（兩段，隨動作延遲擺動）
  { joint: 'ex_hair1', parent: 'head', offset: [0, 6, -4], meshes: [F(prism(10, 0, -5, [4.6, 2.4], [4, 1.8], HAIR), [HAIR, HAIR_ALT], 1)] },
  { joint: 'ex_hair2', parent: 'ex_hair1', offset: [0, -5, 0], meshes: [F(prism(10, 0, -2.4, [4, 1.8], [3.6, 1.4], HAIR), [HAIR, HAIR_ALT], 1)] },
  ...queenArm(1),
  ...queenArm(-1),
];

// ─────────────────────────── 姿勢 ───────────────────────────

type Angles = Partial<Record<Joint, V3>>;

/** 每隻腳的角度：swing = 往前擺（+ 前）、lift = 抬起（+ 上）、bend = 脛節與跗節往內彎 */
function legs(fn: (side: Side, i: number) => { swing?: number; lift?: number; bend?: number }): Angles {
  const a: Angles = {};
  for (const side of [1, -1] as const) {
    LEGS.forEach((l, i) => {
      const { swing = 0, lift = 0, bend = 0 } = fn(side, i);
      a[legJoint(side, i, 'a')] = [0, -side * (l.forward + swing), lift * side];
      a[legJoint(side, i, 'b')] = [0, 0, -bend * side];
      a[legJoint(side, i, 'c')] = [0, 0, -bend * 0.6 * side];
    });
  }
  return a;
}
const merge = (...sets: Angles[]): Angles => {
  const out: Angles = {};
  for (const set of sets) {
    for (const [j, v] of Object.entries(set) as [Joint, V3][]) {
      const x = out[j] ?? [0, 0, 0];
      out[j] = [x[0] + v[0], x[1] + v[1], x[2] + v[2]];
    }
  }
  return out;
};
/** 讓最低的腳踩在地上（rootZ 為往前撲） */
const onFeet = (angles: Angles, rootZ = 0, lift = 0): Pose => {
  const p = grounded(PARTS, HIP, { rootY: 0, rootZ, angles }, FEET);
  return { ...p, rootY: p.rootY + lift };
};

/** 威嚇站姿：身體抬高、腳大開、前腳微抬；人形上身挺直、雙爪舉在肩高；腹部翹起 */
const STANCE: Angles = merge(
  legs((_, i) => ({ lift: i === 0 ? 0.25 : 0.05, bend: i === 0 ? 0.15 : -0.05 })),
  {
    root: [-0.08, 0, 0],
    ex_abd1: [0.28, 0, 0],
    ex_abd2: [0.25, 0, 0],
    ex_sting: [0.3, 0, 0],
    torso: [-0.12, 0, 0],
    chest: [-0.06, 0, 0],
    head: [0.12, 0, 0],
    ex_hair1: [0.35, 0, 0],
    // 雙臂往外張、前臂往上彎，鐮刀爪舉在身體兩側（螳螂般的威嚇姿勢）
    upperArmL: [-0.45, 0, 0.75],
    upperArmR: [-0.45, 0, -0.75],
    forearmL: [-1.9, 0, 0],
    forearmR: [-1.9, 0, 0],
    ex_clawL: [0.6, 0, 0],
    ex_clawR: [0.6, 0, 0],
  },
);
const BASE = onFeet(STANCE);

/** 前腳高舉、雙爪舉過頭 → 往前撲下（前腳刺向地面、雙爪劈下） */
const overhead = {
  windup: [
    onFeet(merge(STANCE, legs((_, i) => ({ bend: 0.15 })), { root: [0.05, 0, 0] })),
    onFeet(merge(STANCE, legs((_, i) => (i === 0 ? { lift: 0.9, swing: 0.2, bend: -0.3 } : i === 1 ? { lift: 0.3 } : { bend: 0.1 })), { root: [-0.3, 0, 0], torso: [-0.25, 0, 0], head: [-0.2, 0, 0], ex_abd1: [0.3, 0, 0], ex_mandL: [0, 0, 0.4], ex_mandR: [0, 0, -0.4], upperArmL: [-1.9, 0, 0.1], upperArmR: [-1.9, 0, -0.1], forearmL: [0.2, 0, 0], forearmR: [0.2, 0, 0] }), -1, 2),
    onFeet(merge(STANCE, legs((_, i) => (i === 0 ? { lift: 1.1, swing: 0.3, bend: -0.4 } : i === 1 ? { lift: 0.4 } : { bend: 0.15 })), { root: [-0.38, 0, 0], torso: [-0.3, 0, 0], head: [-0.25, 0, 0], ex_abd1: [0.35, 0, 0], ex_mandL: [0, 0, 0.5], ex_mandR: [0, 0, -0.5], upperArmL: [-2.2, 0, 0.1], upperArmR: [-2.2, 0, -0.1], forearmL: [0.3, 0, 0], forearmR: [0.3, 0, 0] }), -0.5, 3),
    onFeet(merge(STANCE, legs((_, i) => (i === 0 ? { lift: 0.4, swing: 0.4 } : {})), { root: [0, 0, 0], torso: [0.15, 0, 0], upperArmL: [-1.4, 0, 0.2], upperArmR: [-1.4, 0, -0.2], forearmL: [0.1, 0, 0], forearmR: [0.1, 0, 0] }), 2),
  ],
  strike: [
    onFeet(merge(STANCE, legs((_, i) => (i === 0 ? { lift: -0.35, swing: 0.45, bend: 0.3 } : { bend: 0.25 })), { root: [0.22, 0, 0], torso: [0.35, 0, 0], head: [0.1, 0, 0], ex_mandL: [0, 0, 0.5], ex_mandR: [0, 0, -0.5], upperArmL: [-0.6, 0, 0.3], upperArmR: [-0.6, 0, -0.3], forearmL: [0.5, 0, 0], forearmR: [0.5, 0, 0] }), 3.4),
    onFeet(merge(STANCE, legs((_, i) => (i === 0 ? { lift: -0.3, swing: 0.4, bend: 0.25 } : { bend: 0.2 })), { root: [0.18, 0, 0], torso: [0.3, 0, 0], upperArmL: [-0.5, 0, 0.35], upperArmR: [-0.5, 0, -0.35], forearmL: [0.4, 0, 0], forearmR: [0.4, 0, 0] }), 3),
  ],
};

/** 身體往右扭、雙爪由右往左橫掃 */
const slash = {
  windup: [
    onFeet(merge(STANCE, legs(() => ({ bend: 0.1 })))),
    onFeet(merge(STANCE, { root: [0, -0.2, 0], torso: [0, -0.3, 0], upperArmR: [-0.4, 0, -0.9], upperArmL: [-0.6, 0, -0.3] }), -0.5),
    onFeet(merge(STANCE, { root: [0, -0.35, 0], torso: [-0.05, -0.55, 0], head: [0, 0.4, 0], upperArmR: [-0.3, 0, -1.2], forearmR: [0.6, 0, 0], upperArmL: [-0.8, 0, -0.5] }), -0.8),
    onFeet(merge(STANCE, { root: [0.05, 0.1, 0], torso: [0.05, -0.2, 0], upperArmR: [-0.9, 0, -0.9], forearmR: [0.9, 0, 0], upperArmL: [-0.8, 0, -0.4] }), 1),
  ],
  strike: [
    onFeet(merge(STANCE, legs((_, i) => (i === 0 ? { swing: 0.2 } : {})), { root: [0.08, 0.4, 0], torso: [0.1, 0.4, 0], head: [0, -0.3, 0], upperArmR: [-0.9, 0, 0.4], forearmR: [1.1, 0, 0], upperArmL: [-0.4, 0, 0.6], forearmL: [0.6, 0, 0] }), 2),
    onFeet(merge(STANCE, { root: [0.05, 0.5, 0], torso: [0.08, 0.55, 0], head: [0, -0.4, 0], upperArmR: [-0.8, 0, 0.7], forearmR: [1, 0, 0], upperArmL: [-0.3, 0, 0.7], forearmL: [0.5, 0, 0] }), 1.8),
  ],
};

/** 腹部往上往前捲起、毒針從頭頂上方往前刺出（蠍子般） */
const thrust = {
  windup: [
    onFeet(merge(STANCE, legs(() => ({ bend: 0.15 })))),
    onFeet(merge(STANCE, legs(() => ({ bend: 0.25 })), { root: [0.08, 0, 0], ex_abd1: [0.6, 0, 0], ex_abd2: [0.7, 0, 0], ex_sting: [0.6, 0, 0] }), -0.8),
    onFeet(merge(STANCE, legs(() => ({ bend: 0.3 })), { root: [0.12, 0, 0], ex_abd1: [0.95, 0, 0], ex_abd2: [1.1, 0, 0], ex_sting: [1, 0, 0], torso: [0.1, 0, 0] }), -1),
    onFeet(merge(STANCE, legs(() => ({ bend: 0.1 })), { root: [0.15, 0, 0], ex_abd1: [1.1, 0, 0], ex_abd2: [1.3, 0, 0], ex_sting: [1.3, 0, 0], torso: [0.25, 0, 0] }), 1.5),
  ],
  strike: [
    onFeet(merge(STANCE, legs((_, i) => ({ swing: i < 2 ? 0.15 : -0.1, bend: 0.05 })), { root: [0.2, 0, 0], ex_abd1: [1.15, 0, 0], ex_abd2: [1.45, 0, 0], ex_sting: [1.65, 0, 0], torso: [0.35, 0, 0], head: [0.1, 0, 0] }), 3),
    onFeet(merge(STANCE, { root: [0.15, 0, 0], ex_abd1: [1, 0, 0], ex_abd2: [1.2, 0, 0], ex_sting: [1.4, 0, 0], torso: [0.25, 0, 0] }), 2.6),
  ],
};

const castWindup = onFeet(merge(STANCE, legs((_, i) => (i === 0 ? { lift: 0.6 } : {})), { root: [-0.25, 0, 0], torso: [-0.3, 0, 0], head: [-0.35, 0, 0], ex_abd1: [0.5, 0, 0], ex_mandL: [0, 0, 0.5], ex_mandR: [0, 0, -0.5], upperArmL: [-2.4, 0, -0.8], upperArmR: [-2.4, 0, 0.8], forearmL: [0.3, 0, 0], forearmR: [0.3, 0, 0] }), 0, 1.5);
const castRelease = onFeet(merge(STANCE, { torso: [0.2, 0, 0], ex_abd1: [0.1, 0, 0], upperArmL: [-1.3, 0, 0.2], upperArmR: [-1.3, 0, -0.2], forearmL: [0.2, 0, 0], forearmR: [0.2, 0, 0] }), 1);

const hitKeys = [
  onFeet(merge(STANCE, { head: [-0.3, 0, 0], ex_mandL: [0, 0, 0.4], ex_mandR: [0, 0, -0.4] })),
  onFeet(merge(STANCE, legs(() => ({ lift: 0.15, bend: -0.15 })), { torso: [-0.3, 0, 0.1], head: [-0.25, 0, 0] }), -0.6),
  onFeet(merge(STANCE, legs(() => ({ lift: 0.1 })), { root: [-0.1, 0, 0.05], torso: [-0.2, 0, 0.1], ex_abd1: [0.15, 0, 0] }), -1),
  onFeet(merge(STANCE, { root: [-0.05, 0, 0], torso: [-0.1, 0, 0] }), -0.6),
];

// 死亡：失去平衡 → 腳一隻隻蜷縮 → 身體落地、八隻腳往內捲起
const curled = (k: number) => legs(() => ({ lift: 0.6 * k, bend: 1.6 * k }));
const deathKeys = [
  onFeet(merge(STANCE, legs(() => ({ bend: 0.3 })), { torso: [-0.3, 0, 0.15], head: [-0.4, 0, 0], ex_abd1: [-0.1, 0, 0] }), -1),
  grounded(PARTS, HIP, { rootY: 0, angles: merge(STANCE, curled(0.4), { root: [0.1, 0, 0.1], torso: [0.4, 0, 0.2], head: [0.3, 0, 0], ex_abd1: [-0.2, 0, 0] }) }, 'all'),
  grounded(PARTS, HIP, { rootY: 0, angles: merge(STANCE, curled(0.8), { root: [0.15, 0, 0.15], torso: [0.8, 0, 0.3], head: [0.4, 0.4, 0.2], upperArmL: [0.4, 0, 0.8], upperArmR: [0.4, 0, -0.8], ex_abd1: [-0.35, 0, 0] }) }, 'all'),
  grounded(PARTS, HIP, { rootY: 0, angles: merge(STANCE, curled(1), { root: [0.15, 0, 0.2], torso: [0.9, 0, 0.3], head: [0.4, 0.5, 0.3], upperArmL: [0.4, 0, 0.9], upperArmR: [0.4, 0, -0.9], ex_abd1: [-0.4, 0, 0], ex_abd2: [-0.2, 0, 0] }) }, 'all'),
];

const poses: PoseSet = {
  /** 待機：身體隨呼吸起伏、腹部緩緩擺動、腳尖輕點、雙爪開合 */
  ready: (t) => {
    const b = Math.sin(t * 1.8);
    const angles = merge(STANCE, legs((side, i) => ({ lift: Math.max(0, Math.sin(t * 1.4 + i * 1.3 + (side === 1 ? 0 : 2))) * (i === 0 ? 0.12 : 0.03) })), {
      torso: [b * 0.03, Math.sin(t * 0.6) * 0.1, 0],
      head: [0, Math.sin(t * 0.5 + 1) * 0.12, 0],
      ex_abd1: [Math.sin(t * 0.9) * 0.05, Math.sin(t * 0.7) * 0.08, 0],
      ex_sting: [Math.sin(t * 1.3) * 0.12, 0, 0],
      ex_clawL: [Math.max(0, Math.sin(t * 1.1)) * 0.3, 0, 0],
      ex_clawR: [Math.max(0, Math.sin(t * 1.1 + 1.5)) * 0.3, 0, 0],
      ex_mandL: [0, 0, Math.max(0, Math.sin(t * 2.3)) * 0.2],
      ex_mandR: [0, 0, -Math.max(0, Math.sin(t * 2.3)) * 0.2],
    });
    return { ...BASE, angles, rootY: BASE.rootY + b * 0.5 };
  },
  /** 走路：八隻腳分兩組交替（左 1、右 2、左 3、右 4 一組），抬起的腳往前擺；身體與腹部左右晃 */
  run: (p) => {
    const angles = merge(
      STANCE,
      legs((side, i) => {
        const phase = p + ((i + (side === 1 ? 0 : 1)) % 2) * Math.PI;
        return { swing: Math.sin(phase) * 0.28, lift: Math.max(0, Math.cos(phase)) * 0.4 };
      }),
      { root: [0.04, Math.sin(p) * 0.06, 0], torso: [0.05, -Math.sin(p) * 0.08, 0], ex_abd1: [0, -Math.sin(p - 0.8) * 0.15, 0], ex_abd2: [0, -Math.sin(p - 1.4) * 0.12, 0] },
    );
    return onFeet(angles, 0, Math.abs(Math.sin(p * 2)) * 0.6);
  },
  attackWindup: overhead.windup[2]!,
  attackStrike: overhead.strike[0]!,
  castWindup,
  castRelease,
  hit: hitKeys[1]!,
  dead: deathKeys[deathKeys.length - 1]!,
  attackChain: overhead,
  attackVariants: { overhead, slash, thrust },
  hitKeys,
  deathKeys,
};

export const SPIDER_QUEEN: FigureModel = {
  hipHeight: HIP,
  referenceRadius: 0.5,
  parts: PARTS,
  poses,
  secondary: {
    ex_hair1: { rate: 10, gravity: 0.4 },
    ex_hair2: { rate: 7, gravity: 0.5 },
    ex_abd2: { rate: 10, gravity: 0 },
    ex_sting: { rate: 12, gravity: 0 },
  },
  gaitRate: 0.8,
  dynamicShadow: true,
};
