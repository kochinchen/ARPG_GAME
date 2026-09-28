import { grounded, type FigureModel, type Joint, type PartDef, type Pose, type PoseSet } from './FigureModel';
import { box, lowSphere, normalize, placeMesh, prism, type Mesh, type V3 } from './Poly3D';

/**
 * 非人形怪物（10 樓以上）的多面體模型。與人形共用同一組關節名稱，但每種體型自行決定關節的
 * 父子關係與位置（例如四足獸的 upperArm = 前腿、thigh = 後腿、ponytail = 尾巴）。
 *
 * 五種體型：
 * - 四足（掠界獸、巨獸、部分噴吐異種）
 * - 節肢（甲蟲、蜘蛛、鉤爪蟲、卵囊母體）：6 或 8 隻腳
 * - 漂浮（單眼、腦海、虛空孢子、寒霜孢子體）：浮在空中、下方垂著觸手
 * - 寄生植物（奪魂寄生花）：固定在地上
 * - 蠕蟲（鑽地寄生蟲）：一節一節的身體
 *
 * 模型座標：Y 向上、Z 為前方、+X 為左邊。
 */

type Angles = Partial<Record<Joint, V3>>;

// ─────────────────────────── 共用零件 ───────────────────────────

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 從 a 到 b 的稜柱（肢體、觸手、尖刺），半徑由 r0 漸變到 r1 */
export function seg(a: V3, b: V3, r0: number, r1: number, color: number, n = 8): Mesh {
  const d = sub(b, a);
  const length = Math.hypot(d[0], d[1], d[2]) || 1;
  const dir = normalize(d);
  const u = normalize(cross(Math.abs(dir[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], dir));
  const w = cross(u, dir);
  const mesh = prism(n, 0, length, [r0, r0], [r1, r1], color);
  mesh.verts = mesh.verts.map(([x, y, z]) => [a[0] + u[0] * x + dir[0] * y + w[0] * z, a[1] + u[1] * x + dir[1] * y + w[1] * z, a[2] + u[2] * x + dir[2] * y + w[2] * z]);
  return mesh;
}

/** 尖刺 / 角：四角錐 */
export const spike = (a: V3, b: V3, r: number, color: number): Mesh => seg(a, b, r, 0.05, color, 4);

/** 沿 Z 軸（前後）的身體段：r = [寬, 高] */
export const along = (z0: number, z1: number, r0: [number, number], r1: [number, number], color: number, offset: V3 = [0, 0, 0], n = 10): Mesh =>
  placeMesh(prism(n, z0, z1, r0, r1, color), [Math.PI / 2, 0, 0], offset);

/** 一對發光的眼睛（位於頭的前方） */
export const eyes = (x: number, y: number, z: number, r: number, color: number): Mesh[] => [lowSphere(r, color, [x, y, z], 8, 4), lowSphere(r, color, [-x, y, z], 8, 4)];

export const pose = (rootY: number, angles: Angles): Pose => ({ rootY, angles });
export const plus = (base: Pose, extra: Angles, rootY = base.rootY): Pose => {
  const angles: Angles = { ...base.angles };
  for (const [j, v] of Object.entries(extra) as [Joint, V3][]) {
    const b = angles[j] ?? [0, 0, 0];
    angles[j] = [b[0] + v[0], b[1] + v[1], b[2] + v[2]];
  }
  return { rootY, angles };
};

// ─────────────────────────── 四足 ───────────────────────────

/**
 * 四足站姿的腿部角度（弧度，繞 X：負 = 往前、正 = 往後）。
 * rear = [大腿, 小腿（相對大腿）]、front = [上臂, 前臂（相對上臂）]；腳掌自動放平。
 * 預設（舊的站姿）：後腿 [-0.35, 0.7]、前腿 [0.2, -0.2]（前腿幾乎是直的）。
 * 生物感的站姿：後腿大腿往前、小腿往後（跗關節在後）；前腿上臂往後、前臂往前下（手肘朝後），再加上 splay 讓四肢外張。
 */
export interface QuadLimbs {
  rear: [number, number];
  front: [number, number];
  /**
   * 下半截（小腿、前臂）往內收的程度（splay 的倍數）：上半截往外張、下半截往內收，
   * 手肘與膝蓋往外突出、腳掌回到身體下方（省略 = 0，整條腿一起外張）。
   */
  kneeIn?: number;
}
export const DEFAULT_LIMBS: QuadLimbs = { rear: [-0.35, 0.7], front: [0.2, -0.2] };

/** 兩節腿在站姿時的垂直比例（腿長 × 這個值 = 腿的高度）：上半截外張 splay、下半截外張 splay × (1 − kneeIn) */
export const legReach = ([a, b]: [number, number], splay: number, kneeIn = 0): number =>
  0.5 * (Math.cos(a) * Math.cos(splay) + Math.cos(a + b) * Math.cos(splay * (1 - kneeIn)));

/**
 * 讓四隻腳掌踩在地上：以待機姿勢量出最低的腳掌，把所有姿勢（倒地以外）一起往上 / 下移。
 */
export function groundQuad(model: FigureModel): FigureModel {
  const feet: Joint[] = ['footL', 'footR', 'handL', 'handR'];
  const rest = model.poses.ready(0);
  const delta = grounded(model.parts, model.hipHeight, rest, feet).rootY - rest.rootY;
  if (Math.abs(delta) < 0.01) return model;
  const lift = (p: Pose): Pose => ({ ...p, rootY: p.rootY + delta });
  const P = model.poses;
  return {
    ...model,
    poses: {
      ...P,
      ready: (t) => lift(P.ready(t)),
      run: (x) => lift(P.run(x)),
      attackWindup: lift(P.attackWindup),
      attackStrike: lift(P.attackStrike),
      castWindup: lift(P.castWindup),
      castRelease: lift(P.castRelease),
      hit: lift(P.hit),
    },
  };
}

interface QuadOptions {
  /** 後腿髖部高度 */
  hip: number;
  /** 身長（臀部到胸口）、身寬、身高 */
  length: number;
  width: number;
  height: number;
  skin: number;
  dark: number;
  belly?: number;
  /** 腿粗（前腿可以更粗：巨獸） */
  legR: number;
  frontLegR?: number;
  /** 肩膀比臀部高多少（巨獸前高後低） */
  shoulderRaise?: number;
  /** 腿往外張開（蜥蜴類） */
  splay?: number;
  neckLength: number;
  /** 脖子往上的角度（弧度） */
  neckUp: number;
  /** 頭（原點在脖子末端，朝 +Z） */
  head: Mesh[];
  tailLength: number;
  tailR: number;
  /** 尾巴往下垂的角度 */
  tailDroop?: number;
  rearExtras?: Mesh[];
  frontExtras?: Mesh[];
  tailExtras?: Mesh[];
  /** 腳掌：爪子顏色 */
  claw?: number;
  /** 站姿的腿部角度（省略為舊的站姿） */
  limbs?: QuadLimbs;
}

function quadruped(o: QuadOptions): { parts: PartDef[]; hip: number } {
  const L = o.length;
  const W = o.width / 2;
  const H = o.height / 2;
  const splay = o.splay ?? 0;
  const raise = o.shoulderRaise ?? 0;
  const foot = 1.6;
  // 後腿：大腿往前下、小腿往後下（ready 姿勢時的角度），長度讓腳剛好踩在地上
  const rearTop = o.hip - H * 0.4;
  const limbs = o.limbs ?? DEFAULT_LIMBS;
  const rearLen = (rearTop - foot) / legReach(limbs.rear, splay, limbs.kneeIn);
  const frontTop = o.hip + raise - H * 0.4;
  const frontLen = (frontTop - foot) / legReach(limbs.front, splay, limbs.kneeIn);
  const fr = o.frontLegR ?? o.legR;
  // 身體中心（臀部到胸口的中點）對準角色位置：root 的零件與子關節整體往後移
  const dz = -L * 0.3;
  const shift = (m: Mesh) => placeMesh(m, [0, 0, 0], [0, 0, dz]);
  const claw = o.claw ?? 0x2a2420;
  const paw = (r: number): Mesh[] => [box(r * 2.2, foot, r * 3, o.dark, [0, -foot / 2, r * 0.6]), box(r * 2, 0.6, 1, claw, [0, -foot + 0.3, r * 2.2])];
  const legs = (side: 1 | -1): PartDef[] => {
    const s = side === 1 ? 'L' : 'R';
    return [
      {
        joint: `thigh${s}`,
        parent: 'root',
        offset: [W * 0.7 * side, -H * 0.4, -L * 0.12 + dz],
        meshes: [prism(9, H * 0.4, -rearLen * 0.5, [o.legR * 1.7, o.legR * 2.2], [o.legR * 1.1, o.legR * 1.2], o.skin)],
      },
      { joint: `shin${s}`, parent: `thigh${s}`, offset: [0, -rearLen * 0.5, 0], meshes: [prism(9, 0, -rearLen * 0.5, [o.legR, o.legR], [o.legR * 0.8, o.legR * 0.8], o.dark)] },
      { joint: `foot${s}`, parent: `shin${s}`, offset: [0, -rearLen * 0.5, 0], meshes: paw(o.legR) },
      {
        joint: `upperArm${s}`,
        parent: 'torso',
        offset: [W * 0.75 * side, raise - H * 0.4, L * 0.38],
        meshes: [prism(9, H * 0.4, -frontLen * 0.5, [fr * 1.6, fr * 1.9], [fr * 1.1, fr * 1.1], o.skin)],
      },
      { joint: `forearm${s}`, parent: `upperArm${s}`, offset: [0, -frontLen * 0.5, 0], meshes: [prism(9, 0, -frontLen * 0.5, [fr, fr], [fr * 0.85, fr * 0.85], o.dark)] },
      { joint: `hand${s}`, parent: `forearm${s}`, offset: [0, -frontLen * 0.5, 0], meshes: paw(fr) },
    ] as PartDef[];
  };
  const neckEnd: V3 = [0, Math.sin(o.neckUp) * o.neckLength, Math.cos(o.neckUp) * o.neckLength];
  const droop = o.tailDroop ?? 0.5;
  const tailEnd: V3 = [0, -Math.sin(droop) * o.tailLength, -Math.cos(droop) * o.tailLength];
  const parts: PartDef[] = [
    {
      joint: 'root',
      parent: null,
      offset: [0, 0, 0],
      meshes: [
        along(-L * 0.2, L * 0.5, [W * 0.85, H * 0.85], [W, H], o.skin),
        ...(o.belly !== undefined ? [along(-L * 0.05, L * 0.5, [W * 0.6, H * 0.3], [W * 0.7, H * 0.35], o.belly, [0, -H * 0.7, 0])] : []),
        ...(o.rearExtras ?? []),
      ].map(shift),
    },
    {
      joint: 'torso',
      parent: 'root',
      offset: [0, 0, L * 0.45 + dz],
      meshes: [
        placeMesh(along(0, L * 0.55, [W, H], [W * 1.05, H * 1.05], o.skin), [-Math.atan2(raise, L * 0.55), 0, 0], [0, 0, 0]),
        lowSphere(Math.max(W, H) * 1.02, o.skin, [0, raise * 0.8, L * 0.5], 11, 6, [W / Math.max(W, H), H / Math.max(W, H), 1]),
        ...(o.belly !== undefined ? [along(0, L * 0.5, [W * 0.7, H * 0.35], [W * 0.75, H * 0.4], o.belly, [0, -H * 0.7 + raise * 0.4, 0])] : []),
        ...(o.frontExtras ?? []),
      ],
    },
    {
      joint: 'neck',
      parent: 'torso',
      offset: [0, raise + H * 0.3, L * 0.62],
      meshes: [seg([0, 0, -2], neckEnd, Math.min(W, H) * 0.75, Math.min(W, H) * 0.55, o.skin, 8)],
    },
    { joint: 'head', parent: 'neck', offset: neckEnd, meshes: o.head },
    {
      joint: 'ponytail',
      parent: 'root',
      offset: [0, H * 0.3, -L * 0.18 + dz],
      meshes: [seg([0, 0, 0], tailEnd, o.tailR, 0.3, o.skin, 8), ...(o.tailExtras ?? [])],
    },
    ...legs(1),
    ...legs(-1),
  ];
  return { parts, hip: o.hip };
}

export function quadPoses(o: { splay?: number; heavy?: boolean; limbs?: QuadLimbs }): PoseSet {
  const sp = o.splay ?? 0;
  const { rear, front, kneeIn = 0 } = o.limbs ?? DEFAULT_LIMBS;
  const rearFoot = -(rear[0] + rear[1]);
  const frontHand = -(front[0] + front[1]);
  // 下半截往內收 kneeIn × splay；腳掌再轉回水平
  const inward = sp * kneeIn;
  const flat = sp - inward;
  const ready = pose(0, {
    thighL: [rear[0], 0, sp],
    thighR: [rear[0], 0, -sp],
    shinL: [rear[1], 0, -inward],
    shinR: [rear[1], 0, inward],
    footL: [rearFoot, 0, -flat],
    footR: [rearFoot, 0, flat],
    upperArmL: [front[0], 0, sp],
    upperArmR: [front[0], 0, -sp],
    forearmL: [front[1], 0, -inward],
    forearmR: [front[1], 0, inward],
    handL: [frontHand, 0, -flat],
    handR: [frontHand, 0, flat],
  });
  const k = o.heavy ? 0.6 : 1;
  return {
    ready: (t) => plus(ready, { torso: [Math.sin(t * 2) * 0.02, 0, 0], neck: [Math.sin(t * 1.3) * 0.06, Math.sin(t * 0.7) * 0.15, 0], ponytail: [0, Math.sin(t * 1.8) * 0.3, 0] }, Math.sin(t * 2) * 0.4),
    // 小跑：對角的兩隻腳一起動（左後 + 右前）
    run: (p) => {
      const s = Math.sin(p) * k;
      return plus(
        ready,
        {
          torso: [Math.cos(p * 2) * 0.04, 0, 0],
          neck: [0.15 + Math.cos(p * 2) * 0.05, 0, 0],
          ponytail: [-0.25, Math.sin(p) * 0.3, 0],
          thighL: [0.5 * s, 0, 0],
          shinL: [0.45 * Math.max(0, -s), 0, 0],
          thighR: [-0.5 * s, 0, 0],
          shinR: [0.45 * Math.max(0, s), 0, 0],
          upperArmR: [0.55 * s, 0, 0],
          forearmR: [-0.6 * Math.max(0, s), 0, 0],
          upperArmL: [-0.55 * s, 0, 0],
          forearmL: [-0.6 * Math.max(0, -s), 0, 0],
        },
        Math.abs(Math.cos(p)) * 1.5 * k,
      );
    },
    // 咬：蹲低、抬頭 → 往前撲咬
    attackWindup: plus(ready, { torso: [-0.12, 0, 0], neck: [-0.45, 0, 0], head: [-0.3, 0, 0], thighL: [-0.2, 0, 0], thighR: [-0.2, 0, 0], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0] }, -2),
    attackStrike: plus(ready, { torso: [0.12, 0, 0], neck: [0.4, 0, 0], head: [0.35, 0, 0], upperArmL: [-0.6, 0, 0], upperArmR: [-0.4, 0, 0], thighL: [0.3, 0, 0], thighR: [0.3, 0, 0] }, 1),
    // 吼叫 / 噴吐：頭往後仰 → 往前伸
    castWindup: plus(ready, { torso: [-0.15, 0, 0], neck: [-0.6, 0, 0], head: [-0.4, 0, 0] }, -1),
    castRelease: plus(ready, { torso: [0.05, 0, 0], neck: [0.35, 0, 0], head: [0.2, 0, 0], upperArmL: [-0.3, 0, 0], upperArmR: [-0.3, 0, 0] }),
    hit: plus(ready, { torso: [-0.18, 0, 0.08], neck: [-0.35, 0.2, 0], ponytail: [0.3, 0, 0] }, -1),
    // 倒地：側躺、四肢伸直
    dead: pose(0, {
      root: [0, 0, 1.45],
      neck: [0.3, 0, 0],
      head: [0.2, 0, 0],
      ponytail: [0.5, 0, 0],
      thighL: [-0.6, 0, 0],
      thighR: [-0.3, 0, 0],
      upperArmL: [-0.5, 0, 0],
      upperArmR: [-0.2, 0, 0],
      shinL: [0.3, 0, 0],
      shinR: [0.2, 0, 0],
    }),
  };
}

/** 四足模型：倒地時依身寬決定往下降多少（側躺在地上） */
function quadModel(o: QuadOptions, referenceRadius: number, heavy = false): FigureModel {
  const { parts, hip } = quadruped(o);
  const poses = quadPoses({ ...(o.splay !== undefined ? { splay: o.splay } : {}), ...(o.limbs ? { limbs: o.limbs } : {}), heavy });
  poses.dead = { ...poses.dead, rootY: -hip + o.width * 0.5 };
  const model: FigureModel = { parts, hipHeight: hip, referenceRadius, poses };
  return o.limbs ? groundQuad(model) : model;
}

// ─────────────────────────── 節肢 ───────────────────────────

const LEG_JOINTS: Record<'L' | 'R', Joint[]> = {
  L: ['upperArmL', 'forearmL', 'handL', 'thighL'],
  R: ['upperArmR', 'forearmR', 'handR', 'thighR'],
};

interface BugOptions {
  /** 身體中心高度 */
  hip: number;
  body: Mesh[];
  head: Mesh[];
  /** 頭的位置（身體座標） */
  headAt: V3;
  /** 腹部（掛在 ponytail，向後延伸） */
  abdomen?: Mesh[];
  abdomenAt?: V3;
  legs: 6 | 8;
  /** 每對腳在身體上的位置（z）與身體半寬 */
  legZ: number[];
  bodyHalfWidth: number;
  /** 腳伸出的距離與膝蓋高度 */
  span: number;
  knee: number;
  legR: number;
  legColor: number;
  jointColor?: number;
  /** 頭上的顎 / 鉤爪（掛在 shinL / shinR，左右對稱，函式給出 +X 那一側） */
  pincer?: (side: 1 | -1) => Mesh[];
  pincerAt?: V3;
}

function arthropod(o: BugOptions): PartDef[] {
  const pairs = o.legs / 2;
  const parts: PartDef[] = [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: o.body },
    { joint: 'head', parent: 'root', offset: o.headAt, meshes: o.head },
  ];
  if (o.abdomen) parts.push({ joint: 'ponytail', parent: 'root', offset: o.abdomenAt ?? [0, 0, 0], meshes: o.abdomen });
  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    for (let i = 0; i < pairs; i++) {
      // 前面的腳往前伸、後面的腳往後伸
      const spread = pairs === 1 ? 0 : (i / (pairs - 1) - 0.5) * 2;
      const kneeP: V3 = [side * o.span * 0.45, o.knee, -spread * o.span * 0.15];
      const footP: V3 = [side * o.span, -o.hip, -spread * o.span * 0.45];
      parts.push({
        joint: LEG_JOINTS[s][i]!,
        parent: 'root',
        offset: [side * o.bodyHalfWidth, 0, o.legZ[i]!],
        meshes: [seg([0, 0, 0], kneeP, o.legR * 1.2, o.legR, o.legColor, 7), lowSphere(o.legR * 1.3, o.jointColor ?? o.legColor, kneeP, 8, 4), seg(kneeP, footP, o.legR, 0.25, o.legColor, 7)],
      });
    }
    if (o.pincer) parts.push({ joint: `shin${s}`, parent: 'head', offset: [side * (o.pincerAt?.[0] ?? 2), o.pincerAt?.[1] ?? 0, o.pincerAt?.[2] ?? 3], meshes: o.pincer(side) });
  }
  return parts;
}

function bugPoses(o: { legs: 6 | 8; hip: number; bigPincers?: boolean }): PoseSet {
  const pairs = o.legs / 2;
  const legAngles = (swing: (i: number, side: 1 | -1) => number, lift: (i: number, side: 1 | -1) => number): Angles => {
    const a: Angles = {};
    for (const side of [1, -1] as const) {
      const s = side === 1 ? 'L' : 'R';
      for (let i = 0; i < pairs; i++) a[LEG_JOINTS[s][i]!] = [0, swing(i, side), lift(i, side) * side];
    }
    return a;
  };
  const pinch = (open: number): Angles => ({ shinL: [o.bigPincers ? -open : 0, open, 0], shinR: [o.bigPincers ? -open : 0, -open, 0] });
  const ready = pose(0, {});
  return {
    ready: (t) => plus(ready, { ...legAngles((i) => Math.sin(t * 3 + i) * 0.03, () => 0), ...pinch(0.1 + Math.sin(t * 4) * 0.08), ponytail: [Math.sin(t * 2) * 0.04, 0, 0] }, Math.sin(t * 2.5) * 0.3),
    // 三腳步態：左 0、2 與右 1、3 一組交替
    run: (p) =>
      plus(
        ready,
        {
          ...legAngles(
            (i, side) => Math.sin(p + (i + (side === 1 ? 0 : 1)) * Math.PI) * 0.35,
            (i, side) => Math.max(0, Math.cos(p + (i + (side === 1 ? 0 : 1)) * Math.PI)) * 0.3,
          ),
          ...pinch(0.15),
          ponytail: [Math.sin(p * 2) * 0.05, Math.sin(p) * 0.06, 0],
        },
        Math.abs(Math.sin(p)) * 0.6,
      ),
    // 攻擊：前半身抬起、張開顎 → 往前咬下
    attackWindup: plus(ready, { root: [-0.3, 0, 0], ...pinch(0.7), ...legAngles((i) => (i === 0 ? -0.3 : 0), (i) => (i === 0 ? 0.6 : 0)) }, 1.5),
    attackStrike: plus(ready, { root: [0.18, 0, 0], ...pinch(-0.2), ...legAngles((i) => (i === 0 ? 0.2 : 0), () => 0) }, -0.5),
    // 施法（噴吐 / 產卵）：腹部翹起
    castWindup: plus(ready, { root: [-0.15, 0, 0], ponytail: [0.45, 0, 0], ...pinch(0.4) }, 1),
    castRelease: plus(ready, { root: [0.1, 0, 0], ponytail: [-0.2, 0, 0], ...pinch(0.2) }),
    hit: plus(ready, { root: [-0.15, 0, 0.1], ...pinch(0.5) }, 0.8),
    // 倒地：翻過來、腳縮起來
    dead: pose(-o.hip * 0.4, { root: [0, 0, Math.PI], ...legAngles(() => 0, () => -0.6), ...pinch(0.6) }),
  };
}

// ─────────────────────────── 漂浮 ───────────────────────────

const TENTACLES: [Joint, Joint, Joint][] = [
  ['upperArmL', 'forearmL', 'handL'],
  ['upperArmR', 'forearmR', 'handR'],
  ['thighL', 'shinL', 'footL'],
  ['thighR', 'shinR', 'footR'],
];

interface FloaterOptions {
  hover: number;
  core: Mesh[];
  /** 眼睛 / 臉（掛在 head，會轉向、施法時發光的部分） */
  face?: Mesh[];
  faceAt?: V3;
  /** 頂部的冠 / 觸角（ponytail） */
  crest?: Mesh[];
  crestAt?: V3;
  /** 四條觸手：每條 3 節，掛點在 core 下方 */
  tentacleLength: number;
  tentacleR: number;
  tentacleColor: number;
  tentacleTip?: number;
  /** 觸手掛點離中心的距離、高度 */
  tentacleRadius: number;
  tentacleY: number;
}

function floater(o: FloaterOptions): PartDef[] {
  const parts: PartDef[] = [{ joint: 'root', parent: null, offset: [0, 0, 0], meshes: o.core }];
  if (o.face) parts.push({ joint: 'head', parent: 'root', offset: o.faceAt ?? [0, 0, 0], meshes: o.face });
  if (o.crest) parts.push({ joint: 'ponytail', parent: 'root', offset: o.crestAt ?? [0, 0, 0], meshes: o.crest });
  const l = o.tentacleLength / 3;
  const r = o.tentacleR;
  const at: V3[] = [
    [o.tentacleRadius * 0.7, o.tentacleY, o.tentacleRadius * 0.5],
    [-o.tentacleRadius * 0.7, o.tentacleY, o.tentacleRadius * 0.5],
    [o.tentacleRadius * 0.6, o.tentacleY, -o.tentacleRadius * 0.6],
    [-o.tentacleRadius * 0.6, o.tentacleY, -o.tentacleRadius * 0.6],
  ];
  TENTACLES.forEach(([a, b, c], i) => {
    parts.push(
      { joint: a, parent: 'root', offset: at[i]!, meshes: [prism(9, 0, -l, [r, r], [r * 0.8, r * 0.8], o.tentacleColor)] },
      { joint: b, parent: a, offset: [0, -l, 0], meshes: [prism(9, 0, -l, [r * 0.8, r * 0.8], [r * 0.55, r * 0.55], o.tentacleColor)] },
      { joint: c, parent: b, offset: [0, -l, 0], meshes: [prism(8, 0, -l, [r * 0.55, r * 0.55], [0.15, 0.15], o.tentacleTip ?? o.tentacleColor)] },
    );
  });
  return parts;
}

function floaterPoses(o: { hover: number; bob?: number; rest: number }): PoseSet {
  const bob = o.bob ?? 2;
  /** 觸手擺動：每條觸手相位不同，越末端擺得越大 */
  const sway = (t: number, amount: number, lean = 0): Angles => {
    const a: Angles = {};
    TENTACLES.forEach(([j0, j1, j2], i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const w = Math.sin(t + i * 1.7) * amount;
      a[j0] = [lean + w * 0.5, 0, side * 0.25];
      a[j1] = [lean * 0.6 + w, 0, -side * 0.1];
      a[j2] = [lean * 0.4 + w * 1.4, 0, 0];
    });
    return a;
  };
  return {
    ready: (t) => pose(Math.sin(t * 2) * bob, { ...sway(t * 1.6, 0.2), root: [0, Math.sin(t * 0.5) * 0.15, 0] }),
    // 飄移：身體前傾、觸手往後拖
    run: (p) => pose(Math.sin(p * 0.5) * bob * 0.6, { ...sway(p * 0.8, 0.15, 0.55), root: [0.18, 0, 0] }),
    attackWindup: pose(bob, { root: [-0.3, 0, 0], head: [-0.2, 0, 0], ...sway(0, 0.1, -0.5) }),
    attackStrike: pose(-bob, { root: [0.35, 0, 0], head: [0.2, 0, 0], ...sway(0, 0.1, -0.9) }),
    // 施法：浮高、觸手張開 → 往前釋放
    castWindup: pose(bob * 2, { root: [-0.2, 0, 0], ponytail: [-0.3, 0, 0], ...sway(1, 0.1, -0.3) }),
    castRelease: pose(0, { root: [0.25, 0, 0], ponytail: [0.2, 0, 0], ...sway(2, 0.1, 0.4) }),
    hit: pose(bob * 1.5, { root: [-0.35, 0, 0.2], ...sway(3, 0.3, 0.3) }),
    // 倒地：掉到地上、觸手攤開
    dead: pose(-o.hover + o.rest, { root: [0.5, 0, 0.35], ...sway(0, 0, -1.2) }),
  };
}

// ─────────────────────────── 蠕蟲 ───────────────────────────

/** 身體各節（由前到後）；root 為中間那節 */
const WORM_FRONT: Joint[] = ['torso', 'neck', 'head'];
const WORM_BACK: Joint[] = ['ponytail', 'thighL', 'shinL', 'footL'];

function wormPoses(hip: number): PoseSet {
  const wave = (p: number, amount: number): Angles => {
    const a: Angles = { root: [0, Math.sin(p) * amount, 0] };
    WORM_FRONT.forEach((j, i) => (a[j] = [0, Math.sin(p + (i + 1) * 0.9) * amount, 0]));
    WORM_BACK.forEach((j, i) => (a[j] = [0, Math.sin(p - (i + 1) * 0.9) * amount, 0]));
    return a;
  };
  const jaws = (open: number): Angles => ({ handL: [0, open, 0], handR: [0, -open, 0] });
  const ready = pose(0, {});
  return {
    ready: (t) => plus(ready, { ...wave(t * 1.5, 0.08), ...jaws(0.15 + Math.sin(t * 5) * 0.1) }),
    run: (p) => plus(ready, { ...wave(p, 0.35), ...jaws(0.1) }),
    // 前半身抬高、張開顎 → 往下咬
    attackWindup: plus(ready, { torso: [-0.5, 0, 0], neck: [-0.4, 0, 0], head: [0.3, 0, 0], ...jaws(0.8) }),
    attackStrike: plus(ready, { torso: [0.15, 0, 0], neck: [0.4, 0, 0], head: [0.2, 0, 0], ...jaws(-0.1) }),
    // 鑽地前：整條身體弓起
    castWindup: plus(ready, { root: [-0.2, 0, 0], torso: [-0.4, 0, 0], neck: [-0.2, 0, 0], ponytail: [0.3, 0, 0], ...jaws(0.6) }, 2),
    castRelease: plus(ready, { root: [0.1, 0, 0], torso: [0.4, 0, 0], neck: [0.3, 0, 0], ...jaws(0) }, -1),
    hit: plus(ready, { ...wave(1.5, 0.3), torso: [-0.25, 0.2, 0], ...jaws(0.6) }),
    dead: pose(-hip * 0.3, { ...wave(0.5, 0.25), root: [0, 0, 1.2], ...jaws(0.5) }),
  };
}

// ═══════════════════════════ 掠界獸系與巨獸系（骨刺獵獸、血鱗獵蜥、暗影獵豹、角甲巨獸、震地獸）見 Beasts.ts ═══════════════════════════

// ═══════════════════════════ 巨獸系：熔顎巨獸 ═══════════════════════════

const MOLTEN = { rock: 0x3a2c26, dark: 0x201814, crack: 0xff7a20, glow: 0xffc040 };
/** 熔顎巨獸：岩石般的外皮、裂縫透出熔岩光、下顎燒得通紅 */
const MOLTEN_BRUTE = quadModel(
  {
    hip: 22,
    // 巨獸的站姿：四肢粗壯地彎曲外張、手肘與膝蓋朝外
    limbs: { rear: [-0.45, 0.85], front: [0.35, -0.75], kneeIn: 1.7 },
    splay: 0.36,
    length: 32,
    width: 17,
    height: 15,
    skin: MOLTEN.rock,
    dark: MOLTEN.dark,
    belly: MOLTEN.crack,
    legR: 2.4,
    frontLegR: 2.8,
    shoulderRaise: 3,
    neckLength: 4,
    neckUp: 0,
    head: [
      along(-2, 8, [5, 4], [4.2, 3.2], MOLTEN.rock),
      // 發光的巨大下顎與牙齒
      along(1, 11, [4.6, 2.2], [3.6, 1.8], MOLTEN.crack, [0, -3.6, 0]),
      along(3, 10.5, [3.4, 0.8], [2.8, 0.6], MOLTEN.glow, [0, -2.2, 0]),
      ...[-2.4, 0, 2.4].map((x) => spike([x, -1.6, 10], [x, 0.6, 10.4], 0.6, MOLTEN.glow)),
      ...eyes(3.2, 1.8, 6.4, 0.9, MOLTEN.glow),
      spike([3, 3, 2], [5, 7, -3], 1.3, MOLTEN.dark),
      spike([-3, 3, 2], [-5, 7, -3], 1.3, MOLTEN.dark),
    ],
    tailLength: 12,
    tailR: 2.4,
    tailDroop: 0.6,
    tailExtras: [spike([0, 1, -6], [0, 4, -8], 1, MOLTEN.crack)],
    rearExtras: [
      ...[-3, 4, 11].map((z, i) => spike([i - 1, 6, z], [(i - 1) * 2, 11, z - 2], 1.8, MOLTEN.dark)),
      along(-2, 14, [8.8, 0.7], [9, 0.7], MOLTEN.crack, [0, 2, 0]),
    ],
    frontExtras: [
      ...[3, 10].map((z, i) => spike([(i - 0.5) * 2, 9, z], [(i - 0.5) * 4, 15, z - 3], 2, MOLTEN.dark)),
      along(1, 15, [9.2, 0.7], [9.4, 0.7], MOLTEN.crack, [0, 3, 0]),
    ],
    claw: MOLTEN.crack,
  },
  0.48,
  true,
);

// ═══════════════════════════ 噴吐異種 ═══════════════════════════

const TOAD = { skin: 0x5a7a2c, dark: 0x34481a, belly: 0xb8c46a, sac: 0xa8d040, wart: 0x7a9a3a, eye: 0xffe040 };
/** 毒沫噴吐者：蟾蜍般矮胖、喉嚨鼓著毒囊、背上長疣 */
const POISON_SPITTER = quadModel(
  {
    hip: 10,
    length: 18,
    width: 15,
    height: 10,
    skin: TOAD.skin,
    dark: TOAD.dark,
    belly: TOAD.belly,
    legR: 1.8,
    splay: 0.45,
    shoulderRaise: 3,
    neckLength: 2,
    neckUp: 0.3,
    head: [
      along(-2, 6, [6, 4], [5, 3], TOAD.skin),
      // 喉嚨下的毒囊、寬嘴
      lowSphere(4.4, TOAD.sac, [0, -3.4, 3], 11, 6, [1.1, 0.9, 1]),
      along(4, 6.4, [5, 0.6], [4.6, 0.5], 0x2a1a10, [0, -0.8, 0]),
      lowSphere(1.6, TOAD.eye, [3.4, 3.2, 2.4], 9, 5),
      lowSphere(1.6, TOAD.eye, [-3.4, 3.2, 2.4], 9, 5),
    ],
    tailLength: 1,
    tailR: 0.5,
    rearExtras: [[3, 5, 2], [-3.5, 4.8, 5], [0, 5.2, -1]].map((p) => lowSphere(1.6, TOAD.wart, p as V3, 8, 4)),
    frontExtras: [[3, 6, 4], [-2.5, 6.4, 8], [1, 6, 11]].map((p) => lowSphere(1.5, TOAD.wart, p as V3, 8, 4)),
  },
  0.36,
);

const FIRE_SAC = { skin: 0x4a2a1c, dark: 0x2a160e, sac: 0xff8a30, sacCore: 0xffd060, eye: 0xffe080 };
/** 火囊爬行者：貼地爬行的蜥形怪、背上鼓著一顆發光的火囊 */
const FIRE_CRAWLER = quadModel(
  {
    hip: 8,
    length: 22,
    width: 11,
    height: 6,
    skin: FIRE_SAC.skin,
    dark: FIRE_SAC.dark,
    legR: 1.2,
    splay: 0.6,
    neckLength: 3,
    neckUp: 0.2,
    head: [along(-1, 6, [3, 2.2], [2.2, 1.5], FIRE_SAC.skin), along(3, 7, [2.2, 0.8], [1.6, 0.6], FIRE_SAC.sac, [0, -1.2, 0]), ...eyes(2, 1, 4, 0.7, FIRE_SAC.eye)],
    tailLength: 14,
    tailR: 2,
    tailDroop: 0.2,
    tailExtras: [lowSphere(1.6, FIRE_SAC.sac, [0, -1, -12], 8, 4)],
    rearExtras: [lowSphere(6.5, FIRE_SAC.sac, [0, 6, 4], 11, 6, [1, 0.85, 1.1]), lowSphere(3.4, FIRE_SAC.sacCore, [0, 8.5, 5], 9, 5), along(0, 3, [7, 4.2], [7, 4.2], FIRE_SAC.dark, [0, 2.4, 0])],
    frontExtras: [spike([0, 3, 4], [0, 6, 1], 1, FIRE_SAC.dark), spike([0, 3, 9], [0, 5.5, 6], 0.9, FIRE_SAC.dark)],
  },
  0.34,
);

const FROST = { cap: 0x8ec8e4, capDark: 0x5a98bc, spot: 0xf0fbff, stem: 0xd6e2e8, gill: 0x7a8c9a, eye: 0x2a5a8a };
/** 寒霜孢子體：走動的冰藍色蕈菇，傘蓋上有白色斑點，根鬚當腳 */
const FROST_SPORELING: FigureModel = {
  parts: floater({
    hover: 9,
    core: [
      prism(12, -9, 4, [4.2, 4.2], [3.4, 3.4], FROST.stem),
      // 傘蓋：上半球 + 下緣
      lowSphere(9, FROST.cap, [0, 5, 0], 12, 6, [1, 0.62, 1], (c) => c[1] > -0.5),
      prism(10, 4.6, 3.4, [9, 9], [7.6, 7.6], FROST.gill),
      ...[[4, 9.4, 2], [-3.5, 9.6, -2.5], [0, 10.4, -4.5], [-4.4, 8.6, 4], [5, 8.4, -3.6]].map((p) => lowSphere(1.2, FROST.spot, p as V3, 8, 4)),
      spike([6, 6, 5], [9, 9.5, 8], 0.7, FROST.spot),
      spike([-6, 6.4, -4], [-9, 10, -6], 0.7, FROST.spot),
    ],
    face: [box(1.2, 1.6, 0.8, FROST.eye, [1.5, 0, 3.6]), box(1.2, 1.6, 0.8, FROST.eye, [-1.5, 0, 3.6]), box(2.4, 0.6, 0.6, FROST.eye, [0, -2, 3.5])],
    faceAt: [0, 0, 0],
    tentacleLength: 9,
    tentacleR: 1.1,
    tentacleColor: FROST.stem,
    tentacleTip: FROST.capDark,
    tentacleRadius: 4,
    tentacleY: -8,
  }),
  hipHeight: 17,
  referenceRadius: 0.32,
  poses: floaterPoses({ hover: 17, bob: 0.6, rest: 6 }),
};

// ═══════════════════════════ 漂浮異體 ═══════════════════════════

const EYE = { flesh: 0x8c5464, fleshDark: 0x5a3040, white: 0xeee6dc, iris: 0xd03028, pupil: 0x140808, vein: 0xb04050 };
/** 單眼浮體：一顆巨大的眼珠、肉質的眼瞼與背上的小觸角，下方垂著觸手 */
const EYE_FLOATER: FigureModel = {
  parts: floater({
    hover: 30,
    core: [lowSphere(8, EYE.flesh, [0, 0, -1], 12, 7), lowSphere(8.4, EYE.fleshDark, [0, 1.5, -2], 12, 7, [1, 0.9, 1], (c) => c[2] < -2 || c[1] > 6)],
    face: [
      lowSphere(6.2, EYE.white, [0, 0, 3], 12, 7, [1, 1, 0.8]),
      lowSphere(3.2, EYE.iris, [0, 0, 6.6], 11, 5, [1, 1, 0.45]),
      lowSphere(1.5, EYE.pupil, [0, 0, 7.8], 9, 4, [1, 1, 0.4]),
      box(8, 1.2, 1, EYE.vein, [0, 4.6, 5]),
      box(1, 5, 1, EYE.vein, [4.6, 0.6, 4.2]),
    ],
    crest: [spike([2, 6, -3], [4, 13, -6], 0.9, EYE.fleshDark), spike([-2, 6, -3], [-4, 12, -7], 0.9, EYE.fleshDark), spike([0, 7, -5], [0, 12, -10], 0.8, EYE.flesh)],
    tentacleLength: 18,
    tentacleR: 1.3,
    tentacleColor: EYE.flesh,
    tentacleTip: EYE.fleshDark,
    tentacleRadius: 5,
    tentacleY: -5,
  }),
  hipHeight: 30,
  referenceRadius: 0.33,
  poses: floaterPoses({ hover: 30, rest: 8 }),
};

const BRAIN = { lobe: 0xd48c9c, fold: 0xa85e70, stem: 0x8c4e5e, eye: 0xf0e060, vein: 0x6a2a40 };
/** 腦海浮體：裸露的大腦（左右兩半、皺褶）、下方一對小眼睛和長觸手 */
const BRAIN_FLOATER: FigureModel = {
  parts: floater({
    hover: 30,
    core: [
      lowSphere(6.4, BRAIN.lobe, [3.2, 3, 0], 11, 6, [0.9, 0.85, 1.25]),
      lowSphere(6.4, BRAIN.lobe, [-3.2, 3, 0], 11, 6, [0.9, 0.85, 1.25]),
      ...[-4, 0, 4].flatMap((z) => [box(5, 1, 1.2, BRAIN.fold, [3.2, 8, z]), box(5, 1, 1.2, BRAIN.fold, [-3.2, 8, z])]),
      box(1, 3, 15, BRAIN.vein, [0, 7, 0]),
      prism(12, -1, -6, [4, 4], [2.2, 2.2], BRAIN.stem),
    ],
    face: [...eyes(1.6, -2, 4.2, 1, BRAIN.eye)],
    crest: [lowSphere(2.4, BRAIN.fold, [0, 0, 0], 9, 4)],
    crestAt: [0, 4, -7],
    tentacleLength: 22,
    tentacleR: 1.2,
    tentacleColor: BRAIN.stem,
    tentacleTip: BRAIN.vein,
    tentacleRadius: 3,
    tentacleY: -5,
  }),
  hipHeight: 32,
  referenceRadius: 0.35,
  poses: floaterPoses({ hover: 32, rest: 7 }),
};

const VOID = { shell: 0x3a1c5c, dark: 0x220e38, spike: 0x8a4ad0, core: 0xd090ff };
/** 虛空孢子：紫黑色的孢子球、四面八方長著發光尖刺、中心透出光 */
const VOID_SPORE: FigureModel = {
  parts: floater({
    hover: 20,
    core: [
      lowSphere(6.5, VOID.shell, [0, 0, 0], 12, 7),
      ...(
        [
          [1, 0.2, 0],
          [-1, 0.2, 0],
          [0, 1, 0],
          [0, 0.3, 1],
          [0, 0.3, -1],
          [0.7, 0.7, 0.7],
          [-0.7, 0.7, -0.7],
          [0.7, -0.5, -0.7],
          [-0.7, -0.5, 0.7],
          [0.7, 0.6, -0.6],
          [-0.6, 0.6, 0.7],
        ] as V3[]
      ).map((d) => {
        const n = normalize(d);
        return spike([n[0] * 5, n[1] * 5, n[2] * 5], [n[0] * 12, n[1] * 12, n[2] * 12], 1.3, VOID.spike);
      }),
    ],
    face: [lowSphere(3.2, VOID.core, [0, 0, 5], 11, 5, [1, 1, 0.5])],
    tentacleLength: 9,
    tentacleR: 0.9,
    tentacleColor: VOID.dark,
    tentacleTip: VOID.spike,
    tentacleRadius: 3,
    tentacleY: -5,
  }),
  hipHeight: 20,
  referenceRadius: 0.3,
  poses: floaterPoses({ hover: 20, bob: 3, rest: 6 }),
};

// ═══════════════════════════ 甲殼蟲與節肢系 ═══════════════════════════

const BEETLE = { shell: 0x3c6a2a, shellDark: 0x24461a, acid: 0xa6e84a, leg: 0x1e2614, head: 0x2a3a1c };
/** 酸液甲蟲：隆起的甲殼（左右兩片翅鞘）、背上滲出綠色酸液、一對大顎 */
const ACID_BEETLE: FigureModel = {
  parts: arthropod({
    hip: 7,
    body: [
      along(-10, 6, [7, 4], [6.5, 4], BEETLE.shellDark, [0, 0, 0], 10),
      lowSphere(7.4, BEETLE.shell, [3.4, 2.5, -2], 11, 6, [0.55, 0.7, 1.4], (c) => c[1] > -1),
      lowSphere(7.4, BEETLE.shell, [-3.4, 2.5, -2], 11, 6, [0.55, 0.7, 1.4], (c) => c[1] > -1),
      ...[[2, 6.8, 0], [-3, 6.4, -4], [1.5, 6, -8], [-1.5, 6.9, 3]].map((p) => lowSphere(1.3, BEETLE.acid, p as V3, 8, 4)),
      box(1, 1, 16, BEETLE.shellDark, [0, 7.2, -2]),
    ],
    head: [lowSphere(4, BEETLE.head, [0, 0, 2], 11, 5, [1, 0.8, 1]), ...eyes(2.4, 1.2, 4.6, 0.8, BEETLE.acid)],
    headAt: [0, 0, 6],
    legs: 6,
    legZ: [4, 0, -5],
    bodyHalfWidth: 5,
    span: 12,
    knee: 6,
    legR: 0.9,
    legColor: BEETLE.leg,
    pincer: (side) => [spike([0, 0, 0], [-side * 2.4, -0.6, 5], 1.1, BEETLE.shellDark)],
    pincerAt: [2, -1, 4.5],
  }),
  hipHeight: 7,
  referenceRadius: 0.36,
  poses: bugPoses({ legs: 6, hip: 7 }),
};

const SPIDER = { body: 0x4a3440, dark: 0x2a1c24, mark: 0xc04040, leg: 0x3a2830, eye: 0xff4030 };
/** 孵化蜘蛛：小型、八隻腳、腹部有紅色斑紋、成群出現 */
const HATCHLING: FigureModel = {
  parts: arthropod({
    hip: 5,
    body: [lowSphere(3.4, SPIDER.body, [0, 0, 1], 11, 5, [1, 0.8, 1.1])],
    head: [lowSphere(2.2, SPIDER.dark, [0, 0, 1.4], 9, 5), ...eyes(0.9, 0.8, 3.2, 0.45, SPIDER.eye), ...eyes(1.6, 0.3, 2.8, 0.35, SPIDER.eye)],
    headAt: [0, 0.4, 3.6],
    abdomen: [lowSphere(5, SPIDER.body, [0, 1.5, -4.5], 11, 6, [1, 0.85, 1.15]), box(1.4, 1, 5, SPIDER.mark, [0, 5.6, -4.5]), box(4, 1, 1.4, SPIDER.mark, [0, 5.4, -4.5])],
    abdomenAt: [0, 0.5, -1.5],
    legs: 8,
    legZ: [2.4, 1, -0.4, -1.8],
    bodyHalfWidth: 2.2,
    span: 10,
    knee: 5,
    legR: 0.55,
    legColor: SPIDER.leg,
    jointColor: SPIDER.dark,
    pincer: (side) => [spike([0, 0, 0], [-side * 0.6, -1.8, 1.4], 0.5, SPIDER.dark)],
    pincerAt: [0.8, -0.6, 2.8],
  }),
  hipHeight: 5,
  referenceRadius: 0.24,
  poses: bugPoses({ legs: 8, hip: 5 }),
};

const HOOK = { shell: 0x8a6a30, dark: 0x54401c, blade: 0xe0d0a0, leg: 0x4a3818, eye: 0x40e060 };
/** 鉤爪蟲：螳螂般的身形，前半身挺起、一對巨大的鐮刀鉤爪 */
const HOOK_CLAW: FigureModel = {
  parts: arthropod({
    hip: 9,
    body: [along(-4, 6, [3.6, 3.2], [3, 3.4], HOOK.shell), placeMesh(along(0, 9, [2.6, 2.6], [2, 2], HOOK.shell), [-0.7, 0, 0], [0, 1, 5])],
    head: [lowSphere(3, HOOK.dark, [0, 0, 1], 11, 5, [1.2, 0.9, 1]), ...eyes(2.6, 0.8, 1.6, 1, HOOK.eye), spike([0.8, 1.6, 0], [2.4, 6, -3], 0.35, HOOK.dark), spike([-0.8, 1.6, 0], [-2.4, 6, -3], 0.35, HOOK.dark)],
    headAt: [0, 8, 10],
    abdomen: [along(0, -14, [4.2, 3.6], [1.6, 1.4], HOOK.shell, [0, 0, 0], 8), ...[-3, -7, -11].map((z) => along(z, z - 1, [4.3 - z * 0.12, 3.7], [4 - z * 0.12, 3.5], HOOK.dark))],
    abdomenAt: [0, 1, -4],
    legs: 6,
    legZ: [4, 0, -3],
    bodyHalfWidth: 2.8,
    span: 12,
    knee: 7,
    legR: 0.7,
    legColor: HOOK.leg,
    // 鐮刀鉤爪：上臂往前下、刀刃往上彎
    pincer: (side) => [seg([0, 0, 0], [side * 1, -4, 6], 1.2, 1, HOOK.shell), seg([side * 1, -4, 6], [side * 1, 3, 11], 1, 0.3, HOOK.blade), spike([side * 1, 3, 11], [side * 1, 1, 14], 0.6, HOOK.blade)],
    pincerAt: [3, -3, -1],
  }),
  hipHeight: 9,
  referenceRadius: 0.34,
  poses: bugPoses({ legs: 6, hip: 9, bigPincers: true }),
};

// ═══════════════════════════ 寄生變異體 ═══════════════════════════

const MATRON = { body: 0x5a3848, dark: 0x3a2230, sac: 0xd8c49a, egg: 0xf0e2b8, vein: 0x9a4a5a, leg: 0x4a2c3a, eye: 0xff6040 };
/** 卵囊母體：巨大的卵囊腹部（表面一顆顆卵）、八隻粗腳；會生出孵化蜘蛛 */
const EGG_MATRON: FigureModel = {
  parts: arthropod({
    hip: 11,
    body: [lowSphere(6, MATRON.body, [0, 0, 1], 11, 6, [1, 0.8, 1.1])],
    head: [lowSphere(3.6, MATRON.dark, [0, 0, 2], 11, 5), ...eyes(1.4, 1.4, 5, 0.7, MATRON.eye), ...eyes(2.6, 0.6, 4.4, 0.55, MATRON.eye)],
    headAt: [0, 1, 6],
    abdomen: [
      lowSphere(11, MATRON.sac, [0, 4, -11], 12, 7, [1, 0.9, 1.1]),
      ...(
        [
          [5, 11, -8],
          [-4, 12, -12],
          [0, 13.5, -6],
          [7, 6, -15],
          [-8, 7, -9],
          [2, 9, -19],
          [-3, 5, -20],
          [8, 9, -5],
        ] as V3[]
      ).map((p) => lowSphere(2, MATRON.egg, p, 9, 5)),
      box(1.2, 1.2, 18, MATRON.vein, [0, 14.2, -11]),
      box(18, 1.2, 1.2, MATRON.vein, [0, 10, -3]),
    ],
    abdomenAt: [0, 1, -2],
    legs: 8,
    legZ: [4, 1.5, -1, -3.5],
    bodyHalfWidth: 4.5,
    span: 17,
    knee: 9,
    legR: 1.2,
    legColor: MATRON.leg,
    jointColor: MATRON.dark,
    pincer: (side) => [spike([0, 0, 0], [-side * 1, -3, 2.4], 0.9, MATRON.dark)],
    pincerAt: [1.4, -1, 4.4],
  }),
  hipHeight: 11,
  referenceRadius: 0.45,
  poses: bugPoses({ legs: 8, hip: 11 }),
};

const FLOWER = { stalk: 0x3a5a2a, stalkDark: 0x243a1a, petal: 0x8a2a6a, petalDark: 0x5a1a46, maw: 0x2a0a18, tooth: 0xf0e8d0, bulb: 0x5a4a2a, glow: 0x9aff9a };
/** 花瓣：以花心為中心、向外張開的尖片 */
const petal = (angle: number, open: number, color: number): Mesh => placeMesh(prism(4, 0, 11, [3.6, 0.6], [0.3, 0.2], color, [0, 0, 0], 0), [open, angle, 0], [Math.sin(angle) * 3.4, 0, Math.cos(angle) * 3.4]);
/** 奪魂寄生花：地上鼓起的球根、彎曲的莖、花心是長滿牙齒的嘴；藤蔓在地上蔓延 */
const SOUL_FLOWER: FigureModel = {
  parts: [
    {
      joint: 'root',
      parent: null,
      offset: [0, 0, 0],
      meshes: [lowSphere(7, FLOWER.bulb, [0, 0, 0], 12, 6, [1, 0.6, 1]), ...[0, 2.1, 4.2].map((a) => spike([Math.sin(a) * 5, 1, Math.cos(a) * 5], [Math.sin(a) * 8, 4, Math.cos(a) * 8], 0.8, FLOWER.stalkDark))],
    },
    { joint: 'torso', parent: 'root', offset: [0, 2, 0], meshes: [prism(12, 0, 13, [2.4, 2.4], [1.8, 1.8], FLOWER.stalk), placeMesh(prism(4, 0, 6, [2.6, 0.4], [0.2, 0.2], FLOWER.stalk, [0, 0, 0], 0), [0.9, 0.6, 0], [1.4, 6, 0])] },
    { joint: 'neck', parent: 'torso', offset: [0, 13, 0], meshes: [prism(12, 0, 10, [1.8, 1.8], [1.5, 1.5], FLOWER.stalk)] },
    {
      joint: 'head',
      parent: 'neck',
      offset: [0, 10, 0],
      meshes: [
        lowSphere(5.4, FLOWER.petalDark, [0, 1, 0], 11, 5, [1, 0.8, 1]),
        lowSphere(3.8, FLOWER.maw, [0, 1.6, 2.8], 11, 5, [1, 1, 0.6]),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => spike([Math.sin(i * 0.8) * 2.6, 1.6 + Math.cos(i * 0.8) * 2.6, 4.2], [Math.sin(i * 0.8) * 1.1, 1.6 + Math.cos(i * 0.8) * 1.1, 5.4], 0.45, FLOWER.tooth)),
        ...[0, 1, 2, 3, 4, 5, 6].map((i) => petal((i / 7) * Math.PI * 2, -0.5, i % 2 ? FLOWER.petal : FLOWER.petalDark)),
        lowSphere(0.9, FLOWER.glow, [0, 1.6, 3.4], 8, 4),
      ].map((m) => placeMesh(m, [-1.2, 0, 0], [0, 0, 0])),
    },
    // 藤蔓：四條在地上蔓延的觸手
    ...TENTACLES.flatMap(([a, b, c], i): PartDef[] => {
      const ang = (i / 4) * Math.PI * 2 + 0.6;
      return [
        { joint: a, parent: 'root', offset: [Math.sin(ang) * 5, -1, Math.cos(ang) * 5], meshes: [seg([0, 0, 0], [Math.sin(ang) * 5, -1.5, Math.cos(ang) * 5], 1.2, 1, FLOWER.stalkDark)] },
        { joint: b, parent: a, offset: [Math.sin(ang) * 5, -1.5, Math.cos(ang) * 5], meshes: [seg([0, 0, 0], [Math.sin(ang + 0.5) * 5, -0.5, Math.cos(ang + 0.5) * 5], 1, 0.7, FLOWER.stalk)] },
        {
          joint: c,
          parent: b,
          offset: [Math.sin(ang + 0.5) * 5, -0.5, Math.cos(ang + 0.5) * 5],
          meshes: [seg([0, 0, 0], [Math.sin(ang - 0.3) * 4, 0, Math.cos(ang - 0.3) * 4], 0.7, 0.2, FLOWER.stalkDark), spike([0, 0, 0], [0, 2.5, 0], 0.4, FLOWER.petal)],
        },
      ];
    }),
  ],
  hipHeight: 4,
  referenceRadius: 0.36,
  poses: (() => {
    const vines = (t: number, amount: number): Angles => {
      const a: Angles = {};
      TENTACLES.forEach(([j0, j1, j2], i) => {
        a[j0] = [0, Math.sin(t + i) * amount * 0.5, 0];
        a[j1] = [0, Math.sin(t + i + 1) * amount, 0];
        a[j2] = [0, Math.sin(t + i + 2) * amount, 0];
      });
      return a;
    };
    const ready = (t: number): Pose => pose(0, { torso: [Math.sin(t * 1.2) * 0.08, 0, Math.sin(t * 0.9) * 0.08], neck: [0.25 + Math.sin(t * 1.2 + 1) * 0.1, 0, 0], head: [0, Math.sin(t * 0.6) * 0.2, 0], ...vines(t, 0.15) });
    const base = ready(0);
    return {
      ready,
      run: (p) => ready(p),
      // 花頭往後仰 → 往前咬
      attackWindup: plus(base, { torso: [-0.3, 0, 0], neck: [-0.5, 0, 0], head: [-0.3, 0, 0] }),
      attackStrike: plus(base, { torso: [0.4, 0, 0], neck: [0.6, 0, 0], head: [0.3, 0, 0], ...vines(2, 0.3) }),
      castWindup: plus(base, { torso: [-0.2, 0, 0], neck: [-0.4, 0, 0], head: [-0.4, 0, 0], ...vines(1, 0.3) }),
      castRelease: plus(base, { torso: [0.2, 0, 0], neck: [0.2, 0, 0], head: [0.3, 0, 0] }),
      hit: plus(base, { torso: [-0.3, 0, 0.2], neck: [-0.3, 0, 0] }),
      // 枯萎：莖彎到地上
      dead: pose(-2, { torso: [1.2, 0, 0.2], neck: [0.8, 0, 0], head: [0.4, 0, 0], ...vines(0, 0) }),
    };
  })(),
};

const WORM = { flesh: 0x9a7262, ring: 0x5c4436, plate: 0x7a5a48, jaw: 0xe0d0b0, eye: 0xff8040 };
/** 蠕蟲的一節：肉色身體 + 深色環節 + 背甲 */
const wormSegment = (r: number): Mesh[] => [
  along(-3.2, 3.2, [r, r * 0.9], [r, r * 0.9], WORM.flesh),
  along(2.4, 3.4, [r * 1.08, r], [r * 1.08, r], WORM.ring),
  along(-2.6, 2.2, [r * 0.8, r * 0.3], [r * 0.7, r * 0.25], WORM.plate, [0, r * 0.8, 0]),
];
/** 鑽地寄生蟲：一節一節的長蟲，頭部有四片顎，背上有甲片 */
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
        lowSphere(4, WORM.flesh, [0, 0, 1.5], 11, 6, [1, 0.9, 1.2]),
        lowSphere(2.2, 0x2a1010, [0, 0, 5.2], 9, 4, [1, 1, 0.4]),
        ...eyes(2.4, 2, 3.6, 0.6, WORM.eye),
        spike([0, 3, 3], [0, 5.5, 6], 0.8, WORM.jaw),
        spike([0, -3, 3], [0, -4.5, 6.5], 0.8, WORM.jaw),
      ],
    },
    { joint: 'handL', parent: 'head', offset: [2.6, 0, 4], meshes: [spike([0, 0, 0], [-0.8, 0, 5], 0.9, WORM.jaw)] },
    { joint: 'handR', parent: 'head', offset: [-2.6, 0, 4], meshes: [spike([0, 0, 0], [0.8, 0, 5], 0.9, WORM.jaw)] },
    { joint: 'ponytail', parent: 'root', offset: [0, -0.2, -6], meshes: wormSegment(4) },
    { joint: 'thighL', parent: 'ponytail', offset: [0, -0.3, -6], meshes: wormSegment(3.4) },
    { joint: 'shinL', parent: 'thighL', offset: [0, -0.3, -5.6], meshes: wormSegment(2.8) },
    { joint: 'footL', parent: 'shinL', offset: [0, -0.2, -5], meshes: [along(-1, -6, [2.2, 2], [0.3, 0.3], WORM.flesh), spike([0, 1.5, -2], [0, 4, -4], 0.6, WORM.plate)] },
  ],
  hipHeight: 4,
  referenceRadius: 0.3,
  poses: wormPoses(4),
};

/** EnemyDef ID → 非人形模型 */
export const CREATURE_MODELS: Record<string, FigureModel> = {
  'enemy.acid_beetle': ACID_BEETLE,
  'enemy.hatchling_spider': HATCHLING,
  'enemy.hook_claw': HOOK_CLAW,
  'enemy.molten_brute': MOLTEN_BRUTE,
  'enemy.poison_spitter': POISON_SPITTER,
  'enemy.frost_sporeling': FROST_SPORELING,
  'enemy.fire_crawler': FIRE_CRAWLER,
  'enemy.eye_floater': EYE_FLOATER,
  'enemy.brain_floater': BRAIN_FLOATER,
  'enemy.void_spore': VOID_SPORE,
  'enemy.egg_matron': EGG_MATRON,
  'enemy.soul_flower': SOUL_FLOWER,
  'enemy.burrower': BURROWER,
};
