import { DEFAULT_LIMBS, groundQuad, legReach, quadPoses, seg, spike, type QuadLimbs } from './Creatures';
import type { FigureModel, PartDef } from './FigureModel';
import { box, lowSphere, normalize, prism, type Mesh, type V3 } from './Poly3D';

/**
 * 掠界獸系與巨獸系的「生物化」多面體（骨刺獵獸、血鱗獵蜥、暗影獵豹、角甲巨獸、震地獸）。
 * 參考設定圖右側的模型結構：身體由多塊肌肉團塊組成（臀、腰、胸、肩、腹），頂點稍微錯開讓構面不規則；
 * 表面再貼上沿著身體曲面排列的甲片 / 鱗片、脊椎上的骨刺列、外露的肋骨；
 * 腿有大腿肌肉、小腿、腳踝與三趾爪；頭有頭骨、口鼻、張開的上下顎與齒列、眉骨與發光的眼睛。
 * 關節與姿勢和其他四足怪物相同（quadPoses）。
 */

// ─────────────────────────── 生物化的零件 ───────────────────────────

/** 由座標決定的雜訊（-1～1），同一個頂點每次都一樣 */
function noise(x: number, y: number, z: number, salt: number): number {
  let h = Math.imul(Math.round(x * 97) ^ Math.imul(Math.round(y * 57), 73856093) ^ Math.imul(Math.round(z * 31), 19349663), 2654435761) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (((h ^ (h >>> 13)) >>> 0) / 4294967295) * 2 - 1;
}

/** 讓網格的頂點稍微錯開（不規則的構面，像生物而不是幾何體） */
function organic(mesh: Mesh, amount: number, salt = 7): Mesh {
  mesh.verts = mesh.verts.map(([x, y, z]) => [x + noise(x, y, z, salt) * amount, y + noise(x, y, z, salt + 1) * amount, z + noise(x, y, z, salt + 2) * amount]);
  return mesh;
}

/** 肌肉 / 骨骼團塊：radii 為三個方向的半徑 */
const mass = (color: number, c: V3, radii: V3, rough = 0.1, lon = 9, lat = 6): Mesh =>
  organic(lowSphere(1, color, c, lon, lat, radii), Math.min(...radii) * rough, Math.round(c[0] * 13 + c[1] * 7 + c[2] * 3));

/** 貼在表面、法線為 n 的片狀零件（甲片、鱗片、岩塊）：w × d 大小、t 厚 */
function plate(c: V3, n: V3, w: number, d: number, t: number, color: number, rough = 0): Mesh {
  const normal = normalize(n);
  const ref: V3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cr = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const u = normalize(cr(ref, normal));
  const v = cr(u, normal);
  const m = box(w, t, d, color, [0, t / 2, 0]);
  m.verts = m.verts.map(([x, y, z]) => [c[0] + u[0] * x + normal[0] * y + v[0] * z, c[1] + u[1] * x + normal[1] * y + v[1] * z, c[2] + u[2] * x + normal[2] * y + v[2] * z]);
  return rough > 0 ? organic(m, rough, Math.round(c[0] * 5 + c[2] * 11)) : m;
}

/**
 * 沿著橢球上半部排列的甲片：rows 沿身體前後、cols 從左側繞過背到右側。
 * 每片往後傾一點，像鱗片或甲殼一樣前片壓著後片。
 */
function shell(center: V3, radii: V3, rows: number, cols: number, colors: number[], size: number, opts: { from?: number; to?: number; arc?: number; thick?: number; rough?: number } = {}): Mesh[] {
  const out: Mesh[] = [];
  const [rx, ry, rz] = radii;
  const from = opts.from ?? -0.85;
  const to = opts.to ?? 0.85;
  const arc = opts.arc ?? 0.8;
  for (let i = 0; i < rows; i++) {
    const t = rows === 1 ? 0 : from + ((to - from) * i) / (rows - 1);
    const s = Math.sqrt(Math.max(0, 1 - t * t));
    for (let j = 0; j < cols; j++) {
      const a = Math.PI / 2 + (cols === 1 ? 0 : (j / (cols - 1) - 0.5) * Math.PI * arc) + (i % 2 ? 0.12 : -0.12);
      const p: V3 = [center[0] + rx * Math.cos(a) * s, center[1] + ry * Math.sin(a) * s, center[2] + rz * t];
      const n: V3 = [(p[0] - center[0]) / (rx * rx), (p[1] - center[1]) / (ry * ry), (p[2] - center[2]) / (rz * rz) - 0.012];
      out.push(plate(p, n, size, size * 1.1, opts.thick ?? size * 0.28, colors[(i * 3 + j) % colors.length]!, opts.rough ?? size * 0.12));
    }
  }
  return out;
}

/** 脊椎上的一列尖刺：points = [z, 高度（離身體中心）, 長度]，往後上方斜 */
const spineRow = (points: [number, number, number][], r: number, colors: number[], lean = 0.55, x = 0): Mesh[] =>
  points.map(([z, y, len], i) => spike([x, y, z], [x, y + len, z - len * lean], r * (0.8 + (i % 3) * 0.15), colors[i % colors.length]!));

/** 腳掌：腳墊 + 三趾 + 爪 */
function paw(r: number, color: number, clawColor: number, foot: number): Mesh[] {
  const out: Mesh[] = [mass(color, [0, -foot * 0.55, r * 0.5], [r * 1.25, foot * 0.55, r * 1.5], 0.08, 8, 4)];
  for (const x of [-1, 0, 1]) {
    const toe: V3 = [x * r * 0.75, -foot * 0.65, r * 1.9 + (x === 0 ? r * 0.35 : 0)];
    out.push(mass(color, toe, [r * 0.42, foot * 0.4, r * 0.6], 0.06, 6, 4));
    out.push(spike([toe[0], toe[1], toe[2] + r * 0.4], [toe[0] * 1.1, -foot, toe[2] + r * 1.3], r * 0.28, clawColor));
  }
  return out;
}

// ─────────────────────────── 身體骨架 ───────────────────────────

interface BeastOptions {
  /** 後腿髖部高度、身長、身寬、身高 */
  hip: number;
  length: number;
  width: number;
  height: number;
  skin: number;
  dark: number;
  belly: number;
  claw: number;
  legR: number;
  frontLegR?: number;
  /** 肩膀比臀部高多少（巨獸前高後低） */
  shoulderRaise?: number;
  /** 腿往外張開（蜥蜴類） */
  splay?: number;
  neckLength: number;
  /** 脖子往上的角度 */
  neckUp: number;
  neckR: number;
  /** 頭（原點在脖子末端，朝 +Z） */
  head: Mesh[];
  tail: { length: number; r: number; droop: number; color?: number; extras?: (end: V3) => Mesh[] };
  /** 後半身 / 前半身 / 脖子的附加零件（座標與身體相同：臀部 z = 0，胸口 z ≈ length） */
  rear?: Mesh[];
  front?: Mesh[];
  neck?: Mesh[];
  /** 肌肉團塊的粗細倍率 */
  bulk?: number;
  /** 站姿的腿部角度（省略為舊的站姿） */
  limbs?: QuadLimbs;
}

function beast(o: BeastOptions): { parts: PartDef[]; hip: number } {
  const L = o.length;
  const W = o.width / 2;
  const H = o.height / 2;
  const k = o.bulk ?? 1;
  const splay = o.splay ?? 0;
  const raise = o.shoulderRaise ?? 0;
  const foot = 1.8;
  const rearTop = o.hip - H * 0.4;
  const limbs = o.limbs ?? DEFAULT_LIMBS;
  const rearLen = (rearTop - foot) / legReach(limbs.rear, splay, limbs.kneeIn);
  const frontTop = o.hip + raise - H * 0.4;
  const frontLen = (frontTop - foot) / legReach(limbs.front, splay, limbs.kneeIn);
  const fr = o.frontLegR ?? o.legR;
  // 身體中心對準角色位置：臀部往後移
  const dz = -L * 0.3;
  const shift = (m: Mesh): Mesh => ({ verts: m.verts.map(([x, y, z]) => [x, y, z + dz]), faces: m.faces });
  const torsoZ = L * 0.45;
  /** 前半身零件原本以臀部為原點；轉成 torso 關節的座標 */
  const toTorso = (m: Mesh): Mesh => ({ verts: m.verts.map(([x, y, z]) => [x, y, z - torsoZ]), faces: m.faces });

  const legs = (side: 1 | -1): PartDef[] => {
    const s = side === 1 ? 'L' : 'R';
    const r = o.legR;
    return [
      {
        joint: `thigh${s}`,
        parent: 'root',
        offset: [W * 0.72 * side, -H * 0.35, -L * 0.1 + dz],
        meshes: [
          mass(o.skin, [0, -rearLen * 0.12, 0.2], [r * 2 * k, rearLen * 0.34, r * 2.4 * k], 0.1),
          mass(o.dark, [side * r * 0.3, -rearLen * 0.3, -r * 0.4], [r * 1.3 * k, rearLen * 0.22, r * 1.5 * k], 0.1, 8, 5),
        ],
      },
      {
        joint: `shin${s}`,
        parent: `thigh${s}`,
        offset: [0, -rearLen * 0.5, 0],
        meshes: [prism(8, 0.5, -rearLen * 0.5, [r * 1.05, r * 1.15], [r * 0.7, r * 0.75], o.dark), mass(o.skin, [0, -rearLen * 0.12, -r * 0.2], [r * 1.1, rearLen * 0.16, r * 1.2], 0.1, 7, 4)],
      },
      { joint: `foot${s}`, parent: `shin${s}`, offset: [0, -rearLen * 0.5, 0], meshes: paw(r, o.dark, o.claw, foot) },
      {
        joint: `upperArm${s}`,
        parent: 'torso',
        offset: [W * 0.78 * side, raise - H * 0.35, L * 0.36],
        meshes: [
          mass(o.skin, [0, -frontLen * 0.14, 0], [fr * 1.9 * k, frontLen * 0.32, fr * 2.1 * k], 0.1),
          mass(o.dark, [side * fr * 0.4, -frontLen * 0.34, fr * 0.2], [fr * 1.25 * k, frontLen * 0.2, fr * 1.4 * k], 0.1, 8, 5),
        ],
      },
      {
        joint: `forearm${s}`,
        parent: `upperArm${s}`,
        offset: [0, -frontLen * 0.5, 0],
        meshes: [prism(8, 0.5, -frontLen * 0.5, [fr * 1.1, fr * 1.2], [fr * 0.8, fr * 0.85], o.dark), mass(o.skin, [0, -frontLen * 0.1, fr * 0.2], [fr * 1.15, frontLen * 0.15, fr * 1.2], 0.1, 7, 4)],
      },
      { joint: `hand${s}`, parent: `forearm${s}`, offset: [0, -frontLen * 0.5, 0], meshes: paw(fr, o.dark, o.claw, foot) },
    ] as PartDef[];
  };

  const neckEnd: V3 = [0, Math.sin(o.neckUp) * o.neckLength, Math.cos(o.neckUp) * o.neckLength];
  const tailSegs = 3;
  const tail: Mesh[] = [];
  let prev: V3 = [0, 0, 0];
  for (let i = 1; i <= tailSegs; i++) {
    const t = i / tailSegs;
    // 尾巴先往後、再依 droop 慢慢下垂
    const angle = o.tail.droop * (0.5 + t * 0.7);
    const p: V3 = [0, prev[1] - Math.sin(angle) * (o.tail.length / tailSegs), prev[2] - Math.cos(angle) * (o.tail.length / tailSegs)];
    tail.push(seg(prev, p, o.tail.r * (1 - (i - 1) / tailSegs) + 0.2, o.tail.r * (1 - i / tailSegs) + 0.2, o.tail.color ?? o.skin, 7));
    prev = p;
  }

  const parts: PartDef[] = [
    {
      joint: 'root',
      parent: null,
      offset: [0, 0, 0],
      meshes: [
        // 臀部、腰、腹部
        mass(o.skin, [0, 0, L * 0.02], [W * 1.02 * k, H * 0.95 * k, L * 0.26]),
        mass(o.skin, [0, H * 0.06, L * 0.3], [W * 0.86 * k, H * 0.86 * k, L * 0.24]),
        mass(o.belly, [0, -H * 0.42, L * 0.24], [W * 0.66, H * 0.46, L * 0.26], 0.08),
        mass(o.dark, [0, H * 0.2, -L * 0.14], [W * 0.7, H * 0.6, L * 0.12], 0.12, 8, 5),
        ...(o.rear ?? []),
      ].map(shift),
    },
    {
      joint: 'torso',
      parent: 'root',
      offset: [0, 0, torsoZ + dz],
      meshes: [
        // 胸口、兩側肩膀、胸腹、脖子根部
        mass(o.skin, [0, raise * 0.55, L * 0.72], [W * 1.12 * k, H * 1.12 * k, L * 0.3]),
        mass(o.skin, [W * 0.72, raise * 0.7 + H * 0.12, L * 0.8], [W * 0.46 * k, H * 0.62 * k, L * 0.17]),
        mass(o.skin, [-W * 0.72, raise * 0.7 + H * 0.12, L * 0.8], [W * 0.46 * k, H * 0.62 * k, L * 0.17]),
        mass(o.belly, [0, raise * 0.4 - H * 0.52, L * 0.74], [W * 0.72, H * 0.5, L * 0.26], 0.08),
        mass(o.dark, [0, raise + H * 0.3, L * 0.98], [W * 0.62, H * 0.62, L * 0.14], 0.12, 8, 5),
        ...(o.front ?? []),
      ].map(toTorso),
    },
    {
      joint: 'neck',
      parent: 'torso',
      offset: [0, raise + H * 0.3, L * 0.62],
      meshes: [
        seg([0, 0, -2], neckEnd, o.neckR, o.neckR * 0.78, o.skin, 9),
        mass(o.skin, [neckEnd[0] * 0.5, neckEnd[1] * 0.5 + o.neckR * 0.2, neckEnd[2] * 0.5], [o.neckR * 1.05, o.neckR * 1.02, o.neckLength * 0.36], 0.1, 8, 5),
        ...(o.neck ?? []),
      ],
    },
    { joint: 'head', parent: 'neck', offset: neckEnd, meshes: o.head },
    { joint: 'ponytail', parent: 'root', offset: [0, H * 0.3, -L * 0.18 + dz], meshes: [...tail, ...(o.tail.extras?.(prev) ?? [])] },
    ...legs(1),
    ...legs(-1),
  ];
  return { parts, hip: o.hip };
}

function beastModel(o: BeastOptions, referenceRadius: number, heavy = false): FigureModel {
  const { parts, hip } = beast(o);
  const poses = quadPoses({ ...(o.splay !== undefined ? { splay: o.splay } : {}), ...(o.limbs ? { limbs: o.limbs } : {}), heavy });
  poses.dead = { ...poses.dead, rootY: -hip + o.width * 0.5 };
  const model: FigureModel = { parts, hipHeight: hip, referenceRadius, poses };
  return o.limbs ? groundQuad(model) : model;
}

/** 張開的嘴：上顎齒列朝下、下顎齒列朝上 */
function teeth(z0: number, z1: number, count: number, halfWidth: number, upperY: number, lowerY: number, lowerDrop: number, len: number, color: number): Mesh[] {
  const out: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const z = z0 + (z1 - z0) * t;
    const w = halfWidth * (1 - t * 0.45);
    for (const side of [1, -1]) {
      out.push(spike([side * w, upperY, z], [side * w * 0.95, upperY - len * (i === 1 ? 1.5 : 1), z + 0.15], 0.32, color));
      out.push(spike([side * w * 0.9, lowerY - lowerDrop * t, z], [side * w * 0.85, lowerY - lowerDrop * t + len * 0.8, z + 0.1], 0.26, color));
    }
  }
  return out;
}

/** 獵食者（獵獸、獵豹）：後腿大腿往前、小腿往後（跗關節在後）；前腿上臂往後、前臂往前下；關節往外突 */
const HUNTER_LIMBS: QuadLimbs = { rear: [-0.72, 1.4], front: [0.6, -1.1], kneeIn: 1.5 };
/** 巨獸：粗壯的四肢彎曲承重（彎曲較少、外張較多，手肘與膝蓋往外突、腳掌收回身體下方） */
const BRUTE_LIMBS: QuadLimbs = { rear: [-0.45, 0.85], front: [0.35, -0.75], kneeIn: 1.7 };

// ═══════════════════════════ 骨刺獵獸 ═══════════════════════════

const H1 = { hide: 0x5e4a38, dark: 0x3a2c20, belly: 0x7a6450, bone: 0xe6d8ba, boneDark: 0xb49e7c, eye: 0xffa030, mouth: 0x5a1a14, tooth: 0xf2e8d0 };
const BONE_HOUND = beastModel(
  {
    hip: 18,
    // 獵食者的站姿：後腿跗關節在後、前腿手肘朝後朝外，四肢外張
    limbs: HUNTER_LIMBS,
    splay: 0.26,
    length: 27,
    width: 10,
    height: 10,
    skin: H1.hide,
    dark: H1.dark,
    belly: H1.belly,
    claw: H1.bone,
    legR: 1.35,
    neckLength: 8,
    neckUp: 0.42,
    neckR: 3,
    head: [
      // 頭骨、骨質面甲、眉骨
      mass(H1.hide, [0, 0.6, 1.8], [3.3, 2.9, 3.6]),
      plate([0, 2.9, 2.4], [0, 1, 0.15], 4.8, 6.4, 0.9, H1.bone, 0.2),
      plate([1.9, 2.1, 4.2], [0.5, 1, 0.5], 2.2, 1.6, 0.8, H1.boneDark, 0.15),
      plate([-1.9, 2.1, 4.2], [-0.5, 1, 0.5], 2.2, 1.6, 0.8, H1.boneDark, 0.15),
      // 口鼻與上顎、張開的下顎
      organic(seg([0, 0.2, 3.4], [0, -0.5, 10.4], 2.3, 1.2, H1.hide, 8), 0.2),
      plate([0, 1.35, 7.2], [0, 1, 0.1], 2.6, 5.4, 0.6, H1.bone, 0.15),
      organic(seg([0, -2, 2.8], [0, -4.4, 9.2], 1.6, 0.8, H1.dark, 7), 0.15),
      mass(H1.mouth, [0, -1.6, 5.4], [1.5, 1.1, 3.2], 0.06, 7, 4),
      ...teeth(4.6, 9.4, 4, 1.25, -1.2, -2.6, 1.6, 1.5, H1.tooth),
      // 發光的眼睛、往後彎的骨角、頰刺
      ...[1, -1].flatMap((x) => [
        lowSphere(0.72, H1.eye, [x * 1.95, 1.25, 4.5], 6, 4),
        seg([x * 1.8, 2.6, 1.2], [x * 3.1, 5, -1.8], 0.9, 0.55, H1.bone, 6),
        spike([x * 3.1, 5, -1.8], [x * 3.6, 6.2, -5.2], 0.55, H1.bone),
        spike([x * 2.8, -0.2, 2.8], [x * 4.8, 0.4, 0.8], 0.55, H1.boneDark),
      ]),
    ],
    tail: {
      length: 13,
      r: 1.6,
      droop: 0.35,
      extras: (end) => [spike(end, [end[0], end[1] - 0.5, end[2] - 3], 0.7, H1.bone), ...spineRow([[-3, 1.4, 3], [-6.5, 0.8, 2.6], [-9.5, 0, 2.2]], 0.6, [H1.bone, H1.boneDark])],
    },
    // 背上兩排骨刺（中央長、兩側短）與外露的肋骨
    rear: [
      ...spineRow([[-2, 4.6, 5.5], [2.5, 5, 6.5], [7, 5.2, 7]], 1.2, [H1.bone, H1.boneDark, H1.bone]),
      ...[1, -1].flatMap((x) => spineRow([[0, 3.8, 3], [5, 4, 3.5]], 0.75, [H1.boneDark, H1.bone], 0.5, x * 2.6)),
      ...[1, -1].flatMap((x) => [0, 2.5].map((z) => spike([x * 4.4, 1.4, z], [x * 6.6, 3.2, z - 2], 0.7, H1.boneDark))),
    ],
    front: [
      ...spineRow([[11.5, 6, 7.5], [16, 6.2, 8.5], [20.5, 6.5, 7]], 1.35, [H1.bone, H1.boneDark, H1.bone]),
      ...[1, -1].flatMap((x) => spineRow([[13.5, 5, 4], [18, 5.2, 4.5]], 0.8, [H1.boneDark, H1.bone], 0.5, x * 3)),
      // 肋骨：從背往肚子彎的骨條
      ...[1, -1].flatMap((x) => [11, 13.4, 15.8, 18.2].map((z, i) => seg([x * 4.2, 3.2, z], [x * 5.1, -2.8 + i * 0.3, z + 1.2], 0.42, 0.3, i % 2 ? H1.boneDark : H1.bone, 5))),
      ...[1, -1].map((x) => spike([x * 5, 5, 18.5], [x * 7.4, 7.6, 16], 0.8, H1.bone)),
    ],
    neck: [...spineRow([[0, 3, 3], [3.5, 5, 3.5]], 0.8, [H1.bone, H1.boneDark], 0.8)],
  },
  0.34,
);

// ═══════════════════════════ 血鱗獵蜥 ═══════════════════════════

const L1 = { scale: 0xa8261e, dark: 0x5e120e, light: 0xc8402c, deep: 0x7a1812, belly: 0xd88a5a, crest: 0xeacb96, eye: 0xffd040, mouth: 0x3a0a08, tooth: 0xf6ead2 };
const BLOOD_LIZARD = beastModel(
  {
    hip: 12,
    length: 28,
    width: 10,
    height: 8,
    skin: L1.scale,
    dark: L1.dark,
    belly: L1.belly,
    claw: L1.crest,
    legR: 1.35,
    splay: 0.45,
    neckLength: 5,
    neckUp: 0.18,
    neckR: 2.8,
    head: [
      // 扁長的楔形頭：頭頂鱗片、額冠、張開的長吻與齒列
      mass(L1.scale, [0, 0.5, 2], [3.2, 2.3, 3.6]),
      ...shell([0, 0.6, 2.6], [3, 2.1, 3.4], 3, 3, [L1.light, L1.deep, L1.scale], 1.9, { from: -0.5, to: 0.7, arc: 0.7 }),
      organic(seg([0, 0.3, 4], [0, 0, 11.5], 2.3, 0.9, L1.scale, 7), 0.2),
      organic(seg([0, -1.7, 3.6], [0, -3.6, 10.6], 1.6, 0.6, L1.deep, 7), 0.15),
      mass(L1.mouth, [0, -1.4, 6.2], [1.4, 0.9, 3.4], 0.05, 7, 4),
      ...teeth(4.8, 10.4, 5, 1.25, -1, -2.3, 1.4, 1.2, L1.tooth),
      ...[1, -1].flatMap((x) => [
        lowSphere(0.78, L1.eye, [x * 2.1, 1.3, 4.3], 6, 4),
        plate([x * 2.2, 2, 4.2], [x * 0.6, 1, 0.3], 1.8, 1.4, 0.5, L1.dark, 0.1),
        spike([x * 2.4, 1.6, 0.5], [x * 4.6, 2.6, -3], 0.7, L1.crest),
        spike([x * 2.6, 0, 0.8], [x * 4.4, 0.2, -2], 0.55, L1.crest),
      ]),
      ...spineRow([[0.6, 2.4, 3.6], [-1.2, 2.2, 3]], 0.7, [L1.crest]),
    ],
    tail: {
      length: 24,
      r: 2.6,
      droop: 0.2,
      extras: (end) => [
        spike(end, [end[0], end[1], end[2] - 3.5], 0.8, L1.crest),
        ...spineRow([[-3, 2.2, 3.4], [-7, 1.7, 3], [-11, 1.2, 2.7], [-15, 0.6, 2.2], [-19, 0.1, 1.8]], 0.65, [L1.crest]),
        ...shell([0, 0, -8], [2.4, 2.2, 8], 4, 3, [L1.light, L1.deep, L1.scale], 1.9, { arc: 0.8 }),
      ],
    },
    // 全身的紅鱗（前片壓後片）與背上的鱗冠
    rear: [
      ...shell([0, 0.3, 6], [5.3, 4.3, 9.5], 5, 5, [L1.scale, L1.light, L1.deep, L1.scale], 2.6),
      ...spineRow([[-2, 4.4, 3.6], [2, 4.6, 4.2], [6, 4.6, 4.6], [10, 4.4, 4.4]], 0.85, [L1.crest]),
    ],
    front: [
      ...shell([0, 0.4, 20], [5.6, 4.6, 8.4], 4, 5, [L1.light, L1.scale, L1.deep, L1.scale], 2.6),
      ...spineRow([[14, 5, 5], [18, 5.2, 5.6], [22, 5, 4.6]], 0.95, [L1.crest]),
      ...[1, -1].map((x) => spike([x * 5.2, 3, 22], [x * 7, 5, 19], 0.75, L1.crest)),
    ],
  },
  0.32,
);

// ═══════════════════════════ 暗影獵豹 ═══════════════════════════

const P1 = { fur: 0x2a2436, dark: 0x17131f, facet: 0x3c3450, belly: 0x221c2c, glow: 0xb070ff, crystal: 0x8a4ae0, fang: 0xece4f6 };
/** 發光的水晶簇（2～3 根一組） */
const crystals = (c: V3, dir: V3, len: number, r: number): Mesh[] => [
  spike(c, [c[0] + dir[0] * len, c[1] + dir[1] * len, c[2] + dir[2] * len], r, P1.glow),
  spike([c[0] + 0.5, c[1], c[2] - 0.6], [c[0] + dir[0] * len * 0.6 + 0.8, c[1] + dir[1] * len * 0.6, c[2] + dir[2] * len * 0.6 - 0.6], r * 0.7, P1.crystal),
  spike([c[0] - 0.5, c[1], c[2] + 0.5], [c[0] + dir[0] * len * 0.55 - 0.8, c[1] + dir[1] * len * 0.55, c[2] + dir[2] * len * 0.55 + 0.4], r * 0.65, P1.crystal),
];
const SHADOW_PANTHER = beastModel(
  {
    hip: 17,
    // 獵食者的站姿：後腿跗關節在後、前腿手肘朝後朝外，四肢外張
    limbs: HUNTER_LIMBS,
    splay: 0.26,
    length: 31,
    width: 8.6,
    height: 8.4,
    skin: P1.fur,
    dark: P1.dark,
    belly: P1.belly,
    claw: P1.glow,
    legR: 1.2,
    neckLength: 6.5,
    neckUp: 0.12,
    neckR: 2.6,
    bulk: 0.92,
    head: [
      // 貓科頭骨：圓頭、短吻、長獠牙、尖耳，頭後兩根水晶角
      mass(P1.fur, [0, 0.4, 2.4], [3.2, 2.7, 3.3]),
      mass(P1.facet, [0, 1.3, 1.6], [2.4, 1.6, 2.4], 0.14, 7, 4),
      organic(seg([0, -0.4, 4.2], [0, -1, 8.2], 2, 1.3, P1.fur, 8), 0.15),
      organic(seg([0, -2, 3.8], [0, -3.4, 7.6], 1.3, 0.8, P1.dark, 7), 0.12),
      mass(0x3a0a2a, [0, -1.8, 5.6], [1.2, 0.8, 2], 0.05, 6, 4),
      ...[1, -1].flatMap((x) => [
        lowSphere(0.78, P1.glow, [x * 1.7, 0.7, 5], 6, 4),
        spike([x * 0.95, -1.8, 7.4], [x * 0.95, -4.4, 7.7], 0.42, P1.fang),
        spike([x * 1.9, 2.4, 1.6], [x * 2.9, 5, 0.6], 0.8, P1.dark),
        ...crystals([x * 1.6, 2.6, 0.2], [x * 0.35, 0.55, -0.75], 4.6, 0.55),
      ]),
    ],
    tail: {
      length: 20,
      r: 1.3,
      droop: 0.55,
      extras: (end) => [...crystals(end, [0, 0.3, -1], 4, 0.6), spike([0, -2, -9], [0, 0, -11], 0.5, P1.crystal)],
    },
    // 背上的暗紋團塊與沿脊椎發光的水晶
    rear: [
      mass(P1.facet, [0, 3.4, 2], [3.2, 1.4, 4.2], 0.18, 7, 4),
      mass(P1.facet, [0, 3.2, 8], [2.8, 1.3, 3.6], 0.18, 7, 4),
      ...crystals([0, 4.2, 0.5], [0.1, 0.8, -0.6], 3.6, 0.6),
      ...crystals([0, 4.2, 6.5], [-0.1, 0.8, -0.6], 4, 0.65),
    ],
    front: [
      mass(P1.facet, [0, 4.4, 20], [3.6, 1.5, 4.4], 0.18, 7, 4),
      ...crystals([0, 5, 15], [0.1, 0.85, -0.5], 4.8, 0.7),
      ...crystals([0, 5.2, 21], [-0.1, 0.85, -0.5], 5.2, 0.75),
      ...[1, -1].flatMap((x) => crystals([x * 4, 3.6, 23], [x * 0.6, 0.7, -0.4], 3.4, 0.55)),
    ],
  },
  0.34,
);

// ═══════════════════════════ 角甲巨獸 ═══════════════════════════

const R1 = { hide: 0x5a4a3a, dark: 0x3a3026, belly: 0x6e5c48, plate: 0x7e6c56, plateLight: 0x8e7c62, plateDark: 0x5a4a3a, horn: 0xeadfc6, hornDark: 0xc4b494, eye: 0xff3020 };
/** 岩塊般的甲片：不規則的厚方塊 */
const armor = (c: V3, n: V3, size: number, color: number) => plate(c, n, size, size * 1.15, size * 0.55, color, size * 0.18);
const HORNED_BRUTE = beastModel(
  {
    hip: 24,
    // 巨獸的站姿：四肢粗壯地彎曲外張、手肘與膝蓋朝外
    limbs: BRUTE_LIMBS,
    splay: 0.36,
    length: 34,
    width: 18,
    height: 16,
    skin: R1.hide,
    dark: R1.dark,
    belly: R1.belly,
    claw: R1.hornDark,
    legR: 2.5,
    frontLegR: 3.1,
    shoulderRaise: 5,
    neckLength: 5,
    neckUp: -0.25,
    neckR: 5.2,
    bulk: 1.05,
    head: [
      // 犀牛般的巨頭：厚重口鼻、額頭甲片、巨大的彎角
      mass(R1.hide, [0, 0.4, 2.8], [5, 4.4, 5]),
      organic(seg([0, -0.6, 5.5], [0, -1.6, 12], 4, 2.8, R1.hide, 8), 0.35),
      organic(seg([0, -3.4, 5], [0, -4.6, 10.8], 2.6, 1.8, R1.dark, 7), 0.25),
      armor([0, 4, 3.4], [0, 1, 0.3], 5.2, R1.plate),
      armor([2.6, 3, 6.2], [0.5, 1, 0.5], 2.8, R1.plateLight),
      armor([-2.6, 3, 6.2], [-0.5, 1, 0.5], 2.8, R1.plateDark),
      // 主角：從鼻端往上前方彎起，三段
      seg([0, 0.4, 10], [0, 4.6, 15], 2.8, 2, R1.horn, 8),
      seg([0, 4.6, 15], [0, 9.6, 16.4], 2, 1.2, R1.horn, 8),
      seg([0, 9.6, 16.4], [0, 13.4, 14.6], 1.2, 0.6, R1.hornDark, 7),
      spike([0, 13.4, 14.6], [0, 15, 12], 0.6, R1.horn),
      seg([0, 3, 7.4], [0, 5.8, 8.6], 1.2, 0.6, R1.hornDark, 6),
      ...[1, -1].flatMap((x) => [
        lowSphere(0.75, R1.eye, [x * 3.4, 1.6, 6.6], 6, 4),
        spike([x * 4, 2.6, 1.6], [x * 6.6, 4.6, 5], 1.2, R1.hornDark),
        armor([x * 4.4, 0.6, 3.4], [x, 0.4, 0.2], 3, R1.plate),
      ]),
    ],
    tail: { length: 10, r: 2.4, droop: 0.9, extras: (end) => [spike(end, [end[0], end[1] - 1.5, end[2] - 2.2], 1, R1.hornDark)] },
    // 背上一層層岩塊般的甲片
    rear: [
      ...shell([0, 1, 5], [9.4, 8.4, 10.5], 3, 5, [R1.plate, R1.plateLight, R1.plateDark], 5.2, { thick: 2.4, rough: 0.8, arc: 0.85 }),
      ...[1, -1].map((x) => armor([x * 9, -1, 3], [x, 0.3, 0], 4.4, R1.plateDark)),
    ],
    front: [
      ...shell([0, 4, 24], [10.4, 9.8, 10.5], 3, 5, [R1.plateLight, R1.plate, R1.plateDark], 5.6, { thick: 2.6, rough: 0.9, arc: 0.85 }),
      ...[1, -1].flatMap((x) => [armor([x * 10, 1, 25], [x, 0.3, 0.1], 5, R1.plate), spike([x * 6, 13, 26], [x * 8, 17, 22], 1.4, R1.horn)]),
    ],
  },
  0.5,
  true,
);

// ═══════════════════════════ 震地獸 ═══════════════════════════

const Q1 = { stone: 0x6e6250, dark: 0x4a4034, belly: 0x5e5242, rock: 0x7e725e, rockDark: 0x5a4e3e, moss: 0x5a6e32, mossLight: 0x74903e, eye: 0xffb040, ember: 0xff7a26, tusk: 0xe2d6b8 };
/** 岩塊（上面長著苔蘚） */
const boulder = (c: V3, n: V3, size: number, mossy = false): Mesh[] => {
  const rock = plate(c, n, size, size * 1.1, size * 0.8, (Math.round(c[0] + c[2]) & 1) === 0 ? Q1.rock : Q1.rockDark, size * 0.22);
  if (!mossy) return [rock];
  const nn = normalize(n);
  return [rock, plate([c[0] + nn[0] * size * 0.8, c[1] + nn[1] * size * 0.8, c[2] + nn[2] * size * 0.8], n, size * 0.7, size * 0.8, size * 0.18, (Math.round(c[2]) & 1) === 0 ? Q1.moss : Q1.mossLight, size * 0.12)];
};
const QUAKE_BEAST = beastModel(
  {
    hip: 21,
    // 巨獸的站姿：四肢粗壯地彎曲外張、手肘與膝蓋朝外
    limbs: BRUTE_LIMBS,
    splay: 0.36,
    length: 27,
    width: 21,
    height: 18,
    skin: Q1.stone,
    dark: Q1.dark,
    belly: Q1.belly,
    claw: Q1.rockDark,
    legR: 3,
    frontLegR: 4.4,
    shoulderRaise: 9,
    neckLength: 3,
    neckUp: -0.35,
    neckR: 5,
    bulk: 1.12,
    head: [
      // 縮在肩膀之間的小頭：厚眉骨、下顎與獠牙、琥珀色的眼
      mass(Q1.stone, [0, 0, 2.6], [4.4, 3.8, 4]),
      ...boulder([0, 3.2, 3.2], [0, 1, 0.4], 4.4, true),
      organic(seg([0, -1.2, 4.6], [0, -2, 8], 3, 2.2, Q1.dark, 7), 0.3),
      organic(seg([0, -3.4, 3.8], [0, -4.4, 7.6], 2.2, 1.6, Q1.stone, 7), 0.25),
      ...[1, -1].flatMap((x) => [
        lowSphere(0.72, Q1.eye, [x * 2.2, 0.8, 5.8], 6, 4),
        spike([x * 1.6, -3.6, 7], [x * 2.2, -0.8, 8.4], 0.7, Q1.tusk),
        ...boulder([x * 3.6, 1, 3], [x, 0.6, 0.3], 2.6),
      ]),
    ],
    tail: { length: 6, r: 2.4, droop: 1, extras: (end) => boulder(end, [0, 0.2, -1], 2.2) },
    // 背上堆滿長苔的岩塊、裂縫透出一點熔岩光
    rear: [
      ...[[-3, 6.4, 1], [3.6, 6.8, 3], [0, 7.4, 7], [-4.4, 6, 8.4], [4.6, 5.6, 9.4], [0, 5.2, -2]].flatMap(([x, y, z], i) => boulder([x!, y!, z!], [x! * 0.12, 1, (i % 3) * 0.2 - 0.2], 3.6 + (i % 3) * 0.6, i % 2 === 0)),
      ...[1, -1].flatMap((x) => boulder([x * 9.4, 1, 4], [x, 0.4, 0], 3.2)),
      plate([2, 4.6, 5.4], [0.2, 1, 0], 0.6, 5, 0.3, Q1.ember),
    ],
    front: [
      ...[[0, 17.4, 18], [-5, 16, 16], [5.4, 16.4, 19], [-3.4, 15, 22.6], [3.6, 14.6, 23.4], [0, 13.4, 25.6], [-7.4, 12.6, 20], [7.6, 12.4, 17.6]].flatMap(([x, y, z], i) =>
        boulder([x!, y!, z!], [x! * 0.1, 1, (i % 3) * 0.25 - 0.1], 4.2 + (i % 3) * 0.7, i % 3 !== 1),
      ),
      ...[1, -1].flatMap((x) => [...boulder([x * 11, 9, 20], [x, 0.5, 0], 4.2, true), ...boulder([x * 10, 3, 24], [x, 0.2, 0.3], 3.2)]),
      plate([-2.4, 15.8, 20.6], [0, 1, 0.1], 0.6, 5.6, 0.3, Q1.ember),
    ],
  },
  0.5,
  true,
);

/** EnemyDef ID → 生物化的掠界獸與巨獸 */
export const BEAST_MODELS: Record<string, FigureModel> = {
  'enemy.bone_hound': BONE_HOUND,
  'enemy.blood_lizard': BLOOD_LIZARD,
  'enemy.shadow_panther': SHADOW_PANTHER,
  'enemy.horned_brute': HORNED_BRUTE,
  'enemy.quake_beast': QUAKE_BEAST,
};
