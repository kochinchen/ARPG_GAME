/**
 * 女主角的構面體積：每個體積只由 skeleton.ts 的 joint 位置推導，掛在對應的 joint 上。
 * 構面分配（依附圖的密度參考）：頭、頭髮、胸廓、骨盆、大腿、肩甲、劍給較多面；腰帶與小配件只給幾個面。
 */
import {
  add, at, cross, dot, frame, hull, hullIn, len, lerp, loft, mirrorRing, mul, norm, poly, sub, Tris,
  type Frame, type Ring2, type Section, type V3,
} from './facets';
import { FLAPS, GRIP, HEAD, HEAD_SCALE, LIFT, LIMB_L, LIMB_R, NECK, PONY, SHIELD_C, SHIELD_N, SWORD_DIR, TOE_DOWN, type Limb } from './skeleton';

/** joint 名稱 → 該 joint 上的三角形 */
export type Volumes = Map<string, Tris>;

const UP: V3 = [0, 1, 0];
const FWD: V3 = [0, 0, 1];
const LEFT: V3 = [1, 0, 0];
/** 直立的 World 座標系：截面的 y 直接是高度 */
const upright = (z = 0): Frame => frame([0, 0, z], [0, 1, z], FWD, LEFT);

export function buildVolumes(): Volumes {
  const vols: Volumes = new Map();
  const T = (joint: string): Tris => {
    let t = vols.get(joint);
    if (!t) vols.set(joint, (t = new Tris()));
    return t;
  };

  torso(T);
  head(T('head'));
  hair(T);
  for (const l of [LIMB_L, LIMB_R]) {
    arm(T, l);
    leg(T, l);
  }
  belt(T('pelvis'));
  skirt(T('pelvis'));
  flaps(T);
  sword(T('sword'));
  shield(T('shield'));

  // 頭部（含頭髮、馬尾）以 HEAD 為中心縮放到 8 頭身；整隻抬高 LIFT（粗跟靴）
  for (const [joint, t] of vols) {
    const scaleHead = joint === 'head' || joint.startsWith('pony');
    for (const arr of t.byMat.values()) {
      for (let i = 0; i < arr.length; i += 3) {
        if (scaleHead) {
          arr[i] = HEAD[0] + (arr[i]! - HEAD[0]) * HEAD_SCALE;
          arr[i + 1] = HEAD[1] + (arr[i + 1]! - HEAD[1]) * HEAD_SCALE;
          arr[i + 2] = HEAD[2] + (arr[i + 2]! - HEAD[2]) * HEAD_SCALE;
        }
        arr[i + 1] = arr[i + 1]! + LIFT;
      }
    }
  }
  return vols;
}

// ───────────────────────── 人體截面 ─────────────────────────

/**
 * 人體的一圈截面：外側 / 內側半寬、前 / 後深度各自獨立（四個象限各是四分之一橢圓），
 * 肌肉起伏只長在該長的一側（例如小腿肚在後外側、三角肌在外側）。
 * 用在軀幹時 wo = wi（左右對稱）。x 正向 = 外側（右側肢體由 loft 的 mirror 翻過去），z 正向 = 正面。
 */
interface Prof {
  y: number;
  wo: number;
  wi: number;
  df: number;
  db: number;
  ox?: number;
  oz?: number;
}
const sym = (y: number, w: number, df: number, db: number, oz = 0): Prof => ({ y, wo: w, wi: w, df, db, oz });

/** 截面的頂點：n 為偶數時正前、正後、兩側都有頂點（中線是一條稜，左右兩面角度不同） */
function ring(p: Prof, n: number, inflate = 0, k?: (sinA: number, cosA: number) => number): Ring2 {
  const out: Ring2 = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const kk = k ? k(sn, c) : 1;
    out.push([(p.ox ?? 0) + c * ((c >= 0 ? p.wo : p.wi) + inflate) * kk, (p.oz ?? 0) + sn * ((sn >= 0 ? p.df : p.db) + inflate) * kk]);
  }
  return out;
}
/** 在輪廓表中內插任一高度的截面 */
function sample(ps: Prof[], y: number): Prof {
  if (y <= ps[0]!.y) return { ...ps[0]!, y };
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i]!, b = ps[i + 1]!;
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      const L = (u: number, v: number) => u + (v - u) * t;
      return { y, wo: L(a.wo, b.wo), wi: L(a.wi, b.wi), df: L(a.df, b.df), db: L(a.db, b.db), ox: L(a.ox ?? 0, b.ox ?? 0), oz: L(a.oz ?? 0, b.oz ?? 0) };
    }
  }
  return { ...ps[ps.length - 1]!, y };
}
/** 輪廓表從 y0 到 y1 的那一段（中間保留表裡每一個轉折點）→ loft 用的截面 */
function span(ps: Prof[], y0: number, y1: number, n: number, inflate = 0): Section[] {
  const ys = [y0, ...ps.map((p) => p.y).filter((y) => y > y0 + 1e-4 && y < y1 - 1e-4), y1];
  return ys.map((y) => ({ y, pts: ring(sample(ps, y), n, inflate) }));
}

// ───────────────────────── 軀幹 ─────────────────────────

/**
 * 軀幹輪廓（由下往上，y 是高度）：胯下 → 臀部最飽滿處（往後凸）→ 大轉子（最寬）→ 腰（最細，後腰內凹）
 * → 下肋 → 胸廓 → 上胸 / 肩胛 → 斜方肌往脖子收。骨盆、腰、胸廓三段共用同一份輪廓，接縫處連續。
 */
const TORSO: Prof[] = [
  sym(0.835, 0.07, 0.055, 0.06),
  sym(0.87, 0.135, 0.085, 0.102, -0.004),
  sym(0.91, 0.158, 0.094, 0.118, -0.004),
  sym(0.95, 0.168, 0.1, 0.108),
  sym(1.0, 0.156, 0.097, 0.094),
  sym(1.05, 0.132, 0.089, 0.08, 0.002),
  sym(1.1, 0.112, 0.083, 0.07, 0.006),
  sym(1.14, 0.118, 0.086, 0.076, 0.005),
  sym(1.18, 0.13, 0.093, 0.086, 0.002),
  sym(1.225, 0.142, 0.1, 0.095),
  sym(1.28, 0.15, 0.101, 0.1),
  sym(1.33, 0.156, 0.094, 0.098, -0.004),
  sym(1.375, 0.152, 0.08, 0.088, -0.01),
  sym(1.41, 0.12, 0.062, 0.074, -0.015),
  sym(1.445, 0.06, 0.045, 0.05, -0.018),
];
const TORSO_N = 24;

/**
 * 胸部是胸廓表面本身的隆起，不是另外貼上去的體積：正面的頂點依位置往前推，
 * 中心在第 4～5 肋（y ≈ 1.262）、離中線 6.8 cm；上半坡度平緩（往鎖骨慢慢收），下半較陡（胸下的轉折），
 * 中線附近幾乎不推（乳溝）。周圍的面因此一路連續到鎖骨、腋下與胸下。
 */
const BUST = { x: 0.068, y: 1.278, sx: 0.046, up: 0.064, down: 0.032, lift: 0.066 };
function bustLift(x: number, y: number): number {
  const dx = (Math.abs(x) - BUST.x) / BUST.sx;
  const dy = (y - BUST.y) / (y > BUST.y ? BUST.up : BUST.down);
  return BUST.lift * Math.exp(-(dx * dx + dy * dy));
}
/** 胸口附近多放幾圈截面，隆起才有足夠的面 */
const BUST_YS = [1.205, 1.225, 1.242, 1.258, 1.272, 1.286, 1.3, 1.315, 1.33, 1.348];

function torsoRing(y: number, inflate = 0): Ring2 {
  const p = sample(TORSO, y);
  return ring(p, TORSO_N, inflate).map(([x, z]) => {
    const t = Math.max(0, (z - (p.oz ?? 0)) / (p.df + inflate));
    const l = bustLift(x, y) * Math.pow(t, 1.5);
    return [x + Math.sign(x) * l * 0.22, z + l];
  });
}
function torsoSecs(y0: number, y1: number, inflate = 0): Section[] {
  const ys = [...new Set([y0, ...[...TORSO.map((p) => p.y), ...BUST_YS].filter((y) => y > y0 + 1e-4 && y < y1 - 1e-4), y1])].sort((u, v) => u - v);
  return ys.map((y) => ({ y, pts: torsoRing(y, inflate) }));
}
/** 軀幹表面上某一點的前後位置（含胸部隆起；給肩帶、扣環貼著身體用） */
function torsoZ(y: number, x: number, front: boolean): number {
  const p = sample(TORSO, y);
  const r = Math.sqrt(Math.max(0, 1 - (x / p.wo) ** 2));
  return (p.oz ?? 0) + (front ? p.df * r + bustLift(x, y) * Math.pow(r, 1.5) : -p.db * r);
}
/** 往下一段的接縫：先放一圈略縮的截面藏在下一段裡，動起來也不會露縫 */
const tuck = (y: number, below: number): Section => ({ y: y - below, pts: torsoRing(y, -0.004) });

/**
 * 上衣（依設定稿）：白色罩杯在正面、兩側與背後是皮革；胸下一條皮帶；上胸、乳溝與肚子露出。
 * 衣服與身體是同一張表面，邊界就是面的分界，所以連續、沒有接縫。
 */
function topMat(c: V3): string {
  const [x, y, z] = c;
  const ax = Math.abs(x);
  // 上胸一條橫過胸口的皮帶（接到兩側與肩帶）
  if (z > 0 && y > 1.334 && y < 1.352 && ax > 0.03) return 'leather';
  if (y < 1.236 || y > 1.345) return 'skin';
  if (z > 0.02 && ax < 0.104) {
    if (ax < 0.013 && y > 1.27) return 'skin'; // 乳溝
    return y > 1.333 && ax < 0.05 ? 'skin' : 'white';
  }
  if (z > -0.02) return 'leather'; // 兩側
  // 背後：露背，兩條交叉的皮帶
  if (ax > 0.1) return 'leather';
  return Math.abs(ax - (0.1 - (y - 1.236) * 0.8)) < 0.017 ? 'leather' : 'skin';
}

function torso(T: (j: string) => Tris): void {
  const U = upright();
  // 骨盆（短褲）
  loft(T('pelvis'), U, span(TORSO, 0.835, 1.05, TORSO_N), { mats: ['shorts'], start: { apex: [0, 0.815, -0.004] }, end: 'flat' });

  // 腰：露出的肚子
  loft(T('waist'), U, [tuck(1.05, 0.018), ...torsoSecs(1.05, 1.14)], { mats: ['skin'], start: 'flat', end: 'flat' });
  // 肚臍的小陰影面
  const navZ = torsoZ(1.105, 0, true);
  hullIn(T('waist'), 'skinShade', U, [[-0.006, 1.105, navZ], [0.006, 1.105, navZ], [0, 1.113, navZ], [0, 1.097, navZ], [0, 1.105, navZ - 0.005]]);

  // 胸廓（含胸部隆起）＋ 上衣
  loft(T('chest'), U, [tuck(1.14, 0.018), ...torsoSecs(1.14, 1.445)], { mats: ['skin'], matAt: topMat, start: 'flat', end: 'flat' });

  // 胸下皮帶：順著身體多一層厚度，正面一個扣環
  loft(T('chest'), U, torsoSecs(1.212, 1.238, 0.007), { mats: ['leather'], start: 'flat', end: 'flat' });
  const bz = torsoZ(1.225, 0, true) + 0.007;
  hullIn(T('chest'), 'bronze', U, [
    [-0.017, 1.21, bz], [0.017, 1.21, bz], [-0.017, 1.24, bz], [0.017, 1.24, bz],
    [-0.013, 1.214, bz + 0.008], [0.013, 1.214, bz + 0.008], [-0.013, 1.236, bz + 0.008], [0.013, 1.236, bz + 0.008],
  ]);

  // 立領（皮革）：圍著脖子根部，前面開一個 V 口
  const collar = frame([0, 1.395, NECK[2]], [0, 1.5, NECK[2]], FWD, LEFT);
  loft(T('chest'), collar, [
    { y: 0, pts: ring({ y: 0, wo: 0.064, wi: 0.064, df: 0.06, db: 0.066 }, 16) },
    { y: 0.035, pts: ring({ y: 0, wo: 0.056, wi: 0.056, df: 0.056, db: 0.062, oz: 0.002 }, 16) },
    { y: 0.075, pts: ring({ y: 0, wo: 0.06, wi: 0.06, df: 0.06, db: 0.066, oz: 0.004 }, 16) },
  ], { mats: ['leather'], matAt: (c) => (c[2] > NECK[2] + 0.03 && Math.abs(c[0]) < 0.026 ? null : 'leather'), start: 'open', end: 'open' });

  // 肩帶：從胸前越過肩膀到背後，貼著身體表面
  for (const s of [1, -1]) {
    const pts: V3[] = [
      [0.118 * s, 1.33, torsoZ(1.33, 0.118, true) + 0.006],
      [0.126 * s, 1.405, 0.012],
      [0.12 * s, 1.4, -0.055],
      [0.1 * s, 1.3, torsoZ(1.3, 0.1, false) - 0.006],
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const out = norm([a[0], 0.6, a[2]]);
      loft(T('chest'), frame(a, b, out, [0, 0, 1]), [
        { y: -0.004, pts: [[0.015, 0], [0.015, 0.009], [-0.015, 0.009], [-0.015, 0]] },
        { y: len(sub(b, a)) + 0.004, pts: [[0.015, 0], [0.015, 0.009], [-0.015, 0.009], [-0.015, 0]] },
      ], { mats: ['leatherDark'], start: 'flat', end: 'flat' });
    }
  }

  // 脖子：前面是兩條胸鎖乳突肌形成的斜面，後面較平
  const NECK_P: Prof[] = [
    { y: 0, wo: 0.047, wi: 0.047, df: 0.046, db: 0.05 },
    { y: 0.07, wo: 0.041, wi: 0.041, df: 0.042, db: 0.044, oz: 0.004 },
    { y: 0.14, wo: 0.042, wi: 0.042, df: 0.043, db: 0.046, oz: 0.008 },
  ];
  loft(T('neck'), frame([0, 1.39, NECK[2]], [0, 1.53, NECK[2]], FWD, LEFT), span(NECK_P, 0, 0.14, 10), { mats: ['skin'] });
}

// ───────────────────────── 頭 ─────────────────────────

/**
 * 頭的截面（右半邊，從正前方到正後方，左半邊鏡像）：每圈 12 個頂點。
 * 正前方中線是一個頂點，左右臉是兩個不同角度的面；依設定稿：下巴窄而尖（V 形臉）、下顎角明顯、
 * 顴骨高、眼窩略凹、眉骨突出。各點依序是：中線、鼻側、臉頰前、顴骨、側面、後側、後中線。
 */
const headRing = (half: [number, number][]): Ring2 => mirrorRing(half);
const HEAD_SECS: Section[] = [
  { y: 1.488, pts: headRing([[0, 0.066], [0.008, 0.064], [0.015, 0.058], [0.02, 0.045], [0.022, 0.02], [0.018, -0.006], [0, -0.012]]) }, // 下巴尖
  { y: 1.503, pts: headRing([[0, 0.075], [0.012, 0.073], [0.024, 0.065], [0.035, 0.046], [0.04, 0.016], [0.037, -0.024], [0, -0.04]]) }, // 下巴
  { y: 1.52, pts: headRing([[0, 0.082], [0.015, 0.08], [0.031, 0.071], [0.046, 0.05], [0.055, 0.012], [0.056, -0.036], [0, -0.062]]) }, // 嘴、下顎角
  { y: 1.545, pts: headRing([[0, 0.088], [0.017, 0.086], [0.037, 0.078], [0.056, 0.056], [0.068, 0.016], [0.071, -0.046], [0, -0.085]]) }, // 鼻底
  { y: 1.575, pts: headRing([[0, 0.089], [0.018, 0.086], [0.041, 0.08], [0.065, 0.058], [0.077, 0.017], [0.078, -0.052], [0, -0.095]]) }, // 臉頰
  { y: 1.6, pts: headRing([[0, 0.088], [0.019, 0.083], [0.043, 0.079], [0.067, 0.058], [0.079, 0.018], [0.079, -0.056], [0, -0.1]]) }, // 眼、顴骨
  { y: 1.63, pts: headRing([[0, 0.09], [0.02, 0.089], [0.044, 0.084], [0.066, 0.057], [0.078, 0.015], [0.078, -0.061], [0, -0.104]]) }, // 眉骨
  { y: 1.668, pts: headRing([[0, 0.08], [0.022, 0.078], [0.044, 0.07], [0.062, 0.046], [0.072, 0.01], [0.072, -0.061], [0, -0.1]]) }, // 額頭
  { y: 1.708, pts: headRing([[0, 0.048], [0.016, 0.046], [0.03, 0.04], [0.042, 0.025], [0.05, 0], [0.05, -0.048], [0, -0.072]]) }, // 頭頂
];
/** 臉面在某一圈、某個 x 的前方位置（沿著那一圈的右半邊折線內插） */
function faceZ(sec: Section, x: number): { z: number; slope: number } {
  const pts = sec.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    if (b[0] >= x && a[0] <= x && b[0] > a[0]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      return { z: a[1] + (b[1] - a[1]) * t, slope: (b[1] - a[1]) / (b[0] - a[0]) };
    }
  }
  return { z: pts[0]![1], slope: 0 };
}

function head(t: Tris): void {
  const H = upright(HEAD[2]);
  loft(t, H, HEAD_SECS, { mats: ['skin'], start: 'flat', end: { apex: [0, 1.73, -0.012] } });

  // 比例依頭部參考表：眼睛在頭高的一半；鼻子長（鼻底到眼睛約是下巴到眼睛的一半）；嘴在鼻底與下巴之間偏上
  // 鼻子：從眉間一路到鼻尖的窄鼻樑、鼻尖、左右鼻翼、鼻底
  hullIn(t, 'skin', H, [
    [0, 1.624, 0.0895], [0.007, 1.6, 0.087], [-0.007, 1.6, 0.087], [0, 1.551, 0.109],
    [0.01, 1.549, 0.1], [-0.01, 1.549, 0.1], [0.015, 1.544, 0.089], [-0.015, 1.544, 0.089], [0, 1.542, 0.099],
  ]);
  for (const s of [1, -1]) hullIn(t, 'skinShade', H, [[0.004, 1.5425, 0.1], [0.011, 1.5435, 0.095], [0.008, 1.5418, 0.0975]], s);
  // 耳朵：頭髮往後梳，耳朵露出；上緣在眉骨、下緣在鼻底
  for (const s of [1, -1]) {
    hullIn(t, 'skin', H, [[0.074, 1.543, -0.012], [0.074, 1.618, -0.016], [0.092, 1.61, -0.032], [0.09, 1.552, -0.03], [0.074, 1.58, -0.044], [0.087, 1.585, -0.012]], s);
    hullIn(t, 'skinShade', H, [[0.09, 1.598, -0.022], [0.09, 1.565, -0.022], [0.093, 1.582, -0.028]], s);
  }
  // 嘴：上唇較深、下唇較亮，中間一條閉合的嘴線，嘴角略往下
  hullIn(t, 'lipDark', H, [[0.018, 1.5165, 0.078], [-0.018, 1.5165, 0.078], [0, 1.5212, 0.086], [0.007, 1.5205, 0.084], [-0.007, 1.5205, 0.084], [0, 1.5172, 0.0865], [0, 1.518, 0.08]]);
  hullIn(t, 'lip', H, [[0.015, 1.5155, 0.079], [-0.015, 1.5155, 0.079], [0, 1.5095, 0.0855], [0.006, 1.5105, 0.083], [-0.006, 1.5105, 0.083], [0, 1.5162, 0.0862], [0, 1.513, 0.079]]);

  // 眼睛：眼窩陰影、眼白、虹膜、瞳孔、上眼皮（粗的深色線）、反光；眉毛粗、眉頭壓低靠近眼睛（銳利的表情）
  const eyeSec = HEAD_SECS[5]!;
  for (const s of [1, -1]) {
    const ex = 0.035;
    const { z: ez, slope } = faceZ(eyeSec, ex);
    const tan = norm([s, 0, slope]);
    const nrm = norm(cross(UP, tan)) as V3;
    const n = dot(nrm, FWD) < 0 ? mul(nrm, -1) : nrm;
    const c: V3 = at(H, ex * s, 1.6, ez);
    /** u：往太陽穴為正；v：往上為正 */
    const P = (u: number, v: number, out: number): V3 => add(add(add(c, mul(tan, u * s)), mul(UP, v)), mul(n, out));
    const EYE = 1.15;
    const flat = (mat: string, pts: [number, number][], out: number) => {
      const inside = add(c, mul(n, -0.02));
      const q = pts.map(([u, v]) => P(u * EYE, v * EYE, out));
      for (let i = 1; i < q.length - 1; i++) t.tri(mat, q[0]!, q[i]!, q[i + 1]!, inside);
    };
    const hex = (cu: number, cv: number, r: number): [number, number][] => Array.from({ length: 6 }, (_, i) => [cu + Math.cos((i / 6) * Math.PI * 2) * r, cv + Math.sin((i / 6) * Math.PI * 2) * r]);
    flat('skinShade', [[-0.021, 0.0], [-0.013, 0.011], [0.01, 0.0125], [0.025, 0.006], [0.015, -0.008], [-0.012, -0.0085]], 0.0006);
    flat('eyeWhite', [[-0.0165, -0.001], [-0.008, 0.0058], [0.006, 0.0068], [0.0175, 0.003], [0.008, -0.0045], [-0.008, -0.0048]], 0.0012);
    flat('iris', hex(0.0005, 0.0008, 0.0058), 0.0018);
    flat('eye', hex(0.0005, 0.0008, 0.0026), 0.0022);
    flat('eye', [[-0.0172, -0.0008], [-0.008, 0.0062], [0.007, 0.0072], [0.0182, 0.0032], [0.0188, 0.0058], [0.007, 0.0096], [-0.008, 0.0088], [-0.0175, 0.0012]], 0.0026);
    flat('eyeWhite', [[0.0022, 0.0028], [0.0036, 0.0033], [0.0028, 0.0018]], 0.0028);
    // 眉毛：眉頭在眼頭上方、壓低；眉峰在外側 2/3；往眉尾收尖
    hull(t, 'hairDark', [
      P(-0.021, 0.0115, 0.002), P(-0.02, 0.019, 0.003), P(0.007, 0.0225, 0.004), P(0.027, 0.0165, 0.002),
      P(0.007, 0.0158, 0.003), P(-0.006, 0.0145, 0.005), P(-0.021, 0.0115, -0.002), P(0.027, 0.0165, -0.002),
    ]);
  }
}

// ───────────────────────── 頭髮 ─────────────────────────

/** 一束頭髮：root → mid → tip 的錐形體積，截面是菱形（中間一條稜，兩側兩個亮度不同的面） */
function lock(t: Tris, mat: string, root: V3, mid: V3, tip: V3, w: number, th: number, outward: V3): void {
  const fr = frame(root, tip, outward, cross(outward, sub(tip, root)));
  const rel = (p: V3): [number, number, number] => [dot(sub(p, root), fr.s), dot(sub(p, root), fr.u), dot(sub(p, root), fr.f)];
  const [mx, my, mz] = rel(mid);
  const dia = (k: number, ox: number, oz: number): Ring2 => [[w * k + ox, oz], [ox, th * k + oz], [-w * k + ox, oz], [ox, -th * 0.5 * k + oz]];
  loft(t, fr, [
    { y: -0.01, pts: dia(0.85, 0, 0) },
    { y: my, pts: dia(1, mx, mz) },
  ].concat(my < len(sub(tip, root)) * 0.8 ? [{ y: (my + len(sub(tip, root))) / 2, pts: dia(0.55, mx * 0.6, mz * 0.6) }] : []), {
    mats: [mat],
    start: 'flat',
    end: { apex: [0, len(sub(tip, root)), 0] },
  });
}

/** 頭的中心，用來決定每束頭髮的「外側」 */
const HEAD_C: V3 = [0, 1.62, -0.01];
const outOf = (p: V3): V3 => norm(sub(p, HEAD_C));

function hair(T: (j: string) => Tris): void {
  const t = T('head');
  const H = upright(HEAD[2]);
  // 髮帽：前高後低的髮際線，往上收到頭頂
  const capRing = (yf: number, yb: number, w: number, df: number, db: number, n = 12): Ring2 =>
    Array.from({ length: n }, (_, i): [number, number, number] => {
      const p = (i / n) * Math.PI * 2;
      const c = Math.cos(p);
      return [Math.sin(p) * w, c * (c > 0 ? df : db), yb + (yf - yb) * Math.pow((1 + c) / 2, 0.45)];
    });
  loft(t, H, [
    { y: 0, pts: capRing(1.668, 1.545, 0.094, 0.097, 0.114) },
    { y: 0, pts: capRing(1.708, 1.64, 0.093, 0.083, 0.119) },
    { y: 0, pts: capRing(1.742, 1.72, 0.07, 0.054, 0.096) },
  ], { mats: ['hair'], start: 'open', end: { apex: [0, 1.772, -0.02] } });

  // 瀏海：斜撥向角色右邊
  const bangs: [V3, V3, V3, number][] = [
    // 從頭頂分線往她的左邊斜撥的大片瀏海，末端停在左眉尾旁（頭部參考表正面）
    [[-0.012, 1.748, 0.035], [0.026, 1.718, 0.082], [0.064, 1.655, 0.092], 0.036],
    [[0.02, 1.728, 0.062], [0.052, 1.69, 0.084], [0.08, 1.615, 0.07], 0.028],
    // 額前幾束短的，末端在眉毛上方
    [[-0.03, 1.728, 0.068], [-0.024, 1.69, 0.09], [-0.01, 1.65, 0.096], 0.02],
    [[-0.055, 1.712, 0.064], [-0.062, 1.68, 0.084], [-0.054, 1.645, 0.088], 0.018],
    [[-0.076, 1.69, 0.056], [-0.086, 1.64, 0.068], [-0.083, 1.58, 0.06], 0.018],
  ];
  bangs.forEach(([r, m, tip, w], i) => lock(t, i % 2 ? 'hairDark' : 'hair', r, m, tip, w, 0.013, outOf(r)));
  // 兩側框住臉、一路垂到鎖骨的長鬢髮（設定稿正面最明顯的輪廓）
  // 設定稿：她的右側有一束垂在臉旁，左側的耳朵露出、頭髮在耳後
  lock(t, 'hair', [-0.082, 1.672, 0.028], [-0.112, 1.56, 0.036], [-0.108, 1.38, 0.042], 0.026, 0.015, [-1, 0, 0.35]);
  for (const s of [1, -1]) {
    lock(t, 'hairDark', [0.084 * s, 1.645, -0.06], [0.112 * s, 1.52, -0.072], [0.11 * s, 1.37, -0.06], 0.028, 0.015, [s, 0, -0.3]);
    lock(t, 'hair', [0.075 * s, 1.655, -0.085], [0.095 * s, 1.54, -0.1], [0.088 * s, 1.42, -0.09], 0.024, 0.013, [s, 0, -0.6]);
  }
  // 後頸散髮
  for (const x of [-0.05, 0, 0.05]) lock(t, x ? 'hairDark' : 'hair', [x, 1.61, -0.105], [x * 1.2, 1.535, -0.118], [x, 1.465, -0.098], 0.024, 0.012, [x * 4, -0.1, -1]);

  // 髮束根部（綁帶）
  const tie = frame(PONY[0]!, PONY[1]!, [0, 0.3, -1], LEFT);
  loft(t, tie, [
    { y: -0.02, pts: poly(8, 0.03, 0.03) },
    { y: 0.022, pts: poly(8, 0.031, 0.031) },
  ], { mats: ['gold'], start: 'flat', end: 'flat' });

  // 馬尾（依頭部參考表）：髮圈綁在頭頂，頭髮從髮圈往上翹、再像扇子一樣往後往下散開成許多尖髮束。
  // 每一節是一根骨頭：中間一個細的核心，外面一圈髮束沿著馬尾的方向排列，越往下越往外散、末端長短不一
  const W = [0.04, 0.08, 0.105, 0.095];
  const D = [0.036, 0.065, 0.078, 0.068];
  const FAN = [0, 0.02, 0.045, 0.075];
  const COUNT = [4, 8, 9, 10];
  const rnd = (k: number) => Math.sin(k * 12.9898) * 0.5 + 0.5;
  for (let i = 0; i < PONY.length - 1; i++) {
    const a = PONY[i]!, b = PONY[i + 1]!;
    const L = len(sub(b, a));
    const fr = frame(a, b, [0, 0.4, -1], LEFT);
    const w0 = W[i]!, w1 = W[i + 1] ?? 0.05;
    const d0 = D[i]!, d1 = D[i + 1] ?? 0.04;
    const last = i === PONY.length - 2;
    const tp = T(`pony${i}`);
    loft(tp, fr, [
      { y: -0.05 * L - 0.015, pts: poly(7, w0 * 0.7, d0 * 0.7, { start: 90 / 7 }) },
      { y: 0.5 * L, pts: poly(7, (w0 + w1) * 0.42, (d0 + d1) * 0.42, { start: 90 / 7, oz: 0.006 }) },
      ...(last ? [] : [{ y: L + 0.025, pts: poly(7, w1 * 0.7, d1 * 0.7, { start: 90 / 7 }) }]),
    ], { mats: ['hairDark'], start: 'flat', end: last ? { apex: [0, L + 0.05, -0.01] } : 'flat' });
    const n = COUNT[i]!;
    for (let k = 0; k < n; k++) {
      const th = (k / n) * Math.PI * 2 + i * 0.37;
      const c = Math.cos(th), sn = Math.sin(th);
      const r = rnd(i * 31 + k);
      const extra = i === 0 ? 0.01 : last ? 0.03 + r * 0.1 : 0.02 + r * 0.05;
      const fan = FAN[i]! + (last ? r * 0.04 : 0);
      const root = at(fr, c * w0 * 0.6, 0.03 * L, sn * d0 * 0.6);
      const spread = i === 0 ? 0.6 : 0.8;
      const tip = at(fr, c * (w1 * spread + fan * 1.4), L + extra, sn * (d1 * spread + fan));
      const mid = at(fr, c * (w0 + w1) * 0.5, 0.5 * L, sn * (d0 + d1) * 0.5 + 0.004);
      const w = 0.038 + r * 0.016;
      lock(tp, (k + i) % 3 === 0 ? 'hairDark' : 'hair', root, mid, tip, w, 0.02, norm(add(mul(fr.s, c), mul(fr.f, sn))));
    }
  }
}

// ───────────────────────── 手臂 ─────────────────────────

function arm(T: (j: string) => Tris, l: Limb): void {
  const m = l.side;
  const S = m === 1 ? 'L' : 'R';
  // 上臂：起點往肩膀內側延伸，跟肩膀重疊（不是邊對邊）；三角肌在外側鼓起、二頭肌在前面
  const ua = frame((l.shoulder), (l.elbow), FWD, LEFT);
  const uaL = len(sub(l.elbow, l.shoulder));
  const UPPER: Prof[] = [
    { y: -0.035, wo: 0.048, wi: 0.04, df: 0.05, db: 0.05 },
    { y: 0.03, wo: 0.055, wi: 0.042, df: 0.052, db: 0.05 },
    { y: 0.1, wo: 0.046, wi: 0.04, df: 0.046, db: 0.046 },
    { y: 0.16, wo: 0.041, wi: 0.039, df: 0.046, db: 0.043 },
    { y: 0.23, wo: 0.036, wi: 0.035, df: 0.038, db: 0.04 },
    { y: uaL + 0.01, wo: 0.033, wi: 0.032, df: 0.033, db: 0.036 },
  ];
  loft(T(`shoulder${S}`), ua, span(UPPER, -0.035, uaL + 0.01, 10), { mats: ['skin'], start: { bulge: 0.02 }, end: 'flat', mirror: m });

  // 肩甲：比肩膀多一層厚度的金屬圓甲（頂面、正面、側面、陰影面）＋下緣一圈甲片
  const sh = frame((l.shoulder), (l.elbow), FWD, LEFT);
  const ring = (n: number, y: number, w: number, d: number, ox: number, rot = 0): [number, number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i / n) * Math.PI * 2;
      return [ox + Math.cos(a) * w, y, Math.sin(a) * d];
    });
  hullIn(T(`shoulder${S}`), 'metal', sh, [
    ...ring(8, 0.058, 0.068, 0.072, 0.012),
    ...ring(6, -0.012, 0.064, 0.066, 0.014, 0.3),
    ...ring(3, -0.05, 0.03, 0.03, 0.006, 0.5),
  ], m);
  hullIn(T(`shoulder${S}`), 'metalDark', sh, [...ring(8, 0.055, 0.066, 0.066, 0.012, 0.2), ...ring(8, 0.098, 0.058, 0.058, 0.01, 0.2)], m);

  // 前臂 + 護腕（皮革一層，比手臂厚）：肘下方肱橈肌最寬，往手腕變扁
  const fa = frame((l.elbow), (l.wrist), FWD, LEFT);
  const faL = len(sub(l.wrist, l.elbow));
  const FORE: Prof[] = [
    { y: -0.025, wo: 0.036, wi: 0.035, df: 0.036, db: 0.036 },
    { y: 0.05, wo: 0.042, wi: 0.038, df: 0.038, db: 0.036 },
    { y: 0.12, wo: 0.036, wi: 0.034, df: 0.032, db: 0.03 },
    { y: faL + 0.01, wo: 0.027, wi: 0.025, df: 0.02, db: 0.02 },
  ];
  loft(T(`elbow${S}`), fa, span(FORE, -0.025, faL + 0.01, 10), { mats: ['skin'], start: 'flat', end: 'flat', mirror: m });
  loft(T(`elbow${S}`), fa, span(FORE, 0.075, faL - 0.01, 10, 0.007), { mats: ['leather'], start: 'flat', end: 'flat', mirror: m });
  // 手肘上方的皮帶
  loft(T(`shoulder${S}`), ua, span(UPPER, uaL - 0.055, uaL - 0.03, 10, 0.008), { mats: ['leatherDark'], start: 'flat', end: 'flat', mirror: m });
  // 護腕兩端的束帶
  for (const y of [0.085, faL - 0.03]) loft(T(`elbow${S}`), fa, span(FORE, y, y + 0.016, 10, 0.012), { mats: ['leatherDark'], start: 'flat', end: 'flat', mirror: m });
  // 手肘護片：往後尖
  hullIn(T(`elbow${S}`), 'leatherDark', fa, [...ring(5, -0.02, 0.04, 0.038, 0), ...ring(5, 0.03, 0.039, 0.037, 0), [0, 0.0, -0.055]], m);

  // 手：手背、手掌、彎曲的手指（簡化成一塊）＋ 拇指
  const hand = frame((l.wrist), add((l.wrist), sub((l.wrist), (l.elbow))), FWD, LEFT);
  const tw = T(`wrist${S}`);
  // 半指手套（皮革）包住手掌，手指露出
  hullIn(tw, 'leatherDark', hand, [
    [0.017, -0.006, 0.026], [0.017, -0.006, -0.024], [-0.015, -0.006, 0.026], [-0.015, -0.006, -0.024],
    [0.019, 0.07, 0.034], [0.019, 0.07, -0.03], [-0.014, 0.072, 0.034], [-0.014, 0.072, -0.03],
  ], m);
  hullIn(tw, 'skin', hand, [
    [0.014, 0.066, 0.03], [0.014, 0.066, -0.026], [-0.011, 0.068, 0.03], [-0.011, 0.068, -0.026],
    [-0.022, 0.1, 0.026], [-0.022, 0.1, -0.024], [-0.004, 0.106, 0.027], [-0.004, 0.106, -0.024],
  ], m);
  hullIn(tw, 'skin', hand, [[-0.012, 0.015, 0.018], [-0.03, 0.05, 0.034], [-0.024, 0.074, 0.03], [-0.01, 0.04, 0.03], [-0.016, 0.03, 0.006]], m);
}

// ───────────────────────── 腿 ─────────────────────────

function leg(T: (j: string) => Tris, l: Limb): void {
  const m = l.side;
  const S = m === 1 ? 'L' : 'R';
  // 大腿：從髖關節開始（往上伸進骨盆）；外側上方最寬，往膝蓋收，前面股四頭肌、後面膕旁肌
  const th = frame((l.hip), (l.knee), FWD, LEFT);
  const thL = len(sub(l.knee, l.hip));
  const THIGH: Prof[] = [
    { y: -0.07, wo: 0.086, wi: 0.072, df: 0.088, db: 0.09 },
    { y: 0.03, wo: 0.094, wi: 0.078, df: 0.092, db: 0.096 },
    { y: 0.12, wo: 0.088, wi: 0.075, df: 0.088, db: 0.085 },
    { y: 0.22, wo: 0.075, wi: 0.062, df: 0.078, db: 0.073, oz: 0.003 },
    { y: 0.32, wo: 0.057, wi: 0.049, df: 0.064, db: 0.058, oz: 0.002 },
    { y: thL - 0.03, wo: 0.048, wi: 0.045, df: 0.054, db: 0.05 },
    { y: thL + 0.012, wo: 0.047, wi: 0.047, df: 0.05, db: 0.05 },
  ];
  const thighSecs = span(THIGH, -0.07, thL + 0.012, 12);
  loft(T(`hip${S}`), th, thighSecs, { mats: thighSecs.slice(0, -1).map((s) => (s.y < 0.02 ? 'shorts' : 'skin')), start: 'flat', end: 'flat', mirror: m });
  // 短褲褲管反摺
  loft(T(`hip${S}`), th, span(THIGH, -0.01, 0.05, 12, 0.007), { mats: ['shorts'], start: 'flat', end: 'flat', mirror: m });

  // 膝蓋：獨立的 joint 體積 ＋ 外層護膝
  const sh = frame((l.knee), (l.ankle), FWD, LEFT);
  const tk = T(`knee${S}`);
  hullIn(tk, 'skin', sh, [[0.048, 0, 0], [-0.046, 0, 0], [0, 0, 0.05], [0, 0, -0.045], [0, -0.04, 0.02], [0, 0.04, 0.02], [0.032, 0.03, 0.03], [-0.032, 0.03, 0.03], [0.03, -0.03, -0.03], [-0.03, -0.03, -0.03]], m);
  // 護膝：設定稿裡很大的金屬尖甲，蓋住整個膝蓋，正面有一條往前凸的稜
  hullIn(tk, 'leather', sh, [[0.056, -0.06, 0.0], [-0.054, -0.06, 0.0], [0.06, 0.06, 0.0], [-0.058, 0.06, 0.0], [0, -0.07, 0.05], [0, 0.07, 0.05], [0.05, 0, 0.04], [-0.05, 0, 0.04]], m);
  hullIn(tk, 'metal', sh, [
    [0.066, -0.05, 0.012], [-0.064, -0.05, 0.012], [0.07, 0.03, 0.016], [-0.068, 0.03, 0.016],
    [0.04, 0.085, 0.03], [-0.04, 0.085, 0.03], [0, 0.1, 0.05], [0, -0.085, 0.06],
    [0.046, -0.02, 0.07], [-0.046, -0.02, 0.07], [0.04, 0.04, 0.075], [-0.04, 0.04, 0.075], [0, 0.0, 0.112],
    [0.082, 0.0, -0.01], [-0.08, 0.0, -0.01],
  ], m);

  // 小腿：脛骨正面、後外側的小腿肚（外側比內側高）、往腳踝收細
  const shL = len(sub(l.ankle, l.knee));
  const SHIN: Prof[] = [
    { y: -0.02, wo: 0.046, wi: 0.046, df: 0.05, db: 0.045 },
    { y: 0.06, wo: 0.048, wi: 0.046, df: 0.046, db: 0.056 },
    { y: 0.13, wo: 0.05, wi: 0.046, df: 0.044, db: 0.062 },
    { y: 0.22, wo: 0.042, wi: 0.042, df: 0.04, db: 0.05 },
    { y: 0.32, wo: 0.034, wi: 0.033, df: 0.036, db: 0.036 },
    { y: shL + 0.01, wo: 0.031, wi: 0.031, df: 0.033, db: 0.033 },
  ];
  loft(tk, sh, span(SHIN, -0.02, shL + 0.01, 12), { mats: ['skin'], start: 'flat', end: 'flat', mirror: m });
  // 靴筒（外層）：及膝長靴，上緣在護膝下方，順著小腿的形狀
  loft(tk, sh, [
    { y: 0.045, pts: ring(sample(SHIN, 0.045), 12, 0.022) },
    ...span(SHIN, 0.075, shL + 0.012, 12, 0.012),
  ], { mats: ['boot'], start: 'flat', end: 'flat', mirror: m });
  // 兩條綁帶，外側有扣環
  for (const y of [0.2, 0.33]) {
    loft(tk, sh, span(SHIN, y, y + 0.02, 12, 0.019), { mats: ['leatherDark'], start: 'flat', end: 'flat', mirror: m });
    const p = sample(SHIN, y + 0.01);
    const bx = p.wo + 0.021;
    hullIn(tk, 'gold', sh, [[bx, y - 0.002, -0.012], [bx, y + 0.022, -0.012], [bx, y - 0.002, 0.012], [bx, y + 0.022, 0.012], [bx + 0.006, y + 0.01, 0]], m);
  }

  // 靴子：腳尖下壓 TOE_DOWN（粗跟），腳尖略往外；腳背上兩片金屬甲片
  const A = (l.ankle);
  const yaw = (8 * Math.PI) / 180 * m;
  const ca = Math.cos(TOE_DOWN), sa = Math.sin(TOE_DOWN);
  const P = (x: number, y0: number, z0: number): V3 => {
    const y = y0 * ca - z0 * sa;
    const z = y0 * sa + z0 * ca;
    const xx = x * m;
    return [A[0] + xx * Math.cos(yaw) + z * Math.sin(yaw), A[1] + y, A[2] - xx * Math.sin(yaw) + z * Math.cos(yaw)];
  };
  /** 不跟著腳尖下壓的點（鞋跟要垂直立在地上） */
  const Q = (x: number, y: number, z: number): V3 => {
    const xx = x * m;
    return [A[0] + xx * Math.cos(yaw) + z * Math.sin(yaw), A[1] + y, A[2] - xx * Math.sin(yaw) + z * Math.cos(yaw)];
  };
  const ta = T(`ankle${S}`);
  hull(ta, 'boot', [
    P(0.047, 0.012, 0.036), P(-0.045, 0.012, 0.036), P(0.047, 0.012, -0.045), P(-0.045, 0.012, -0.045),
    P(0.038, -0.074, -0.064), P(-0.036, -0.074, -0.064), P(0.041, -0.03, -0.07), P(-0.039, -0.03, -0.07),
    P(0.046, -0.074, 0.13), P(-0.042, -0.074, 0.13), P(0.024, -0.074, 0.185), P(-0.022, -0.074, 0.185),
    P(0, -0.05, 0.198), P(0.032, -0.042, 0.17), P(-0.03, -0.042, 0.17),
    P(0.043, -0.026, 0.1), P(-0.041, -0.026, 0.1), P(0, -0.008, 0.1),
  ]);
  // 鞋底（前半）
  hull(ta, 'bootDark', [
    P(0.048, -0.07, 0.02), P(-0.044, -0.07, 0.02), P(0.048, -0.07, 0.135), P(-0.044, -0.07, 0.135), P(0.024, -0.07, 0.192), P(-0.022, -0.07, 0.192),
    P(0.046, -0.086, 0.03), P(-0.042, -0.086, 0.03), P(0.046, -0.086, 0.13), P(-0.042, -0.086, 0.13), P(0.022, -0.086, 0.185), P(-0.02, -0.086, 0.185),
  ]);
  // 粗跟：從地面垂直頂到腳跟底
  const ground = -A[1] - LIFT;
  hull(ta, 'bootDark', [
    P(0.038, -0.07, -0.066), P(-0.036, -0.07, -0.066), P(0.036, -0.07, -0.012), P(-0.034, -0.07, -0.012),
    Q(0.034, ground, -0.07), Q(-0.032, ground, -0.07), Q(0.03, ground, -0.022), Q(-0.028, ground, -0.022),
  ]);
  // 腳背的金屬甲片（兩片，前片疊在後片上）
  for (const [z0, z1, h] of [[0.02, 0.085, 0.022], [0.075, 0.14, 0.012]] as const) {
    hull(ta, 'metal', [
      P(0.05, -0.034 + h * 0.3, z0), P(-0.048, -0.034 + h * 0.3, z0), P(0.05, -0.05, z1), P(-0.048, -0.05, z1),
      P(0, 0.002 + h, z0 + 0.01), P(0, -0.016 + h * 0.5, z1), P(0.03, -0.004 + h * 0.6, (z0 + z1) / 2), P(-0.028, -0.004 + h * 0.6, (z0 + z1) / 2),
    ]);
  }
  // 腳踝外側的護片
  hull(ta, 'metal', [P(0.05, 0.03, -0.03), P(0.05, 0.03, 0.03), P(0.05, -0.04, -0.035), P(0.05, -0.04, 0.035), P(0.064, -0.005, 0)]);
}

// ───────────────────────── 腰帶 ─────────────────────────

function belt(t: Tris): void {
  const U = upright();
  // 主腰帶（紅褐色）＋ 八角形大扣環
  loft(t, U, span(TORSO, 1.025, 1.075, TORSO_N, 0.012), { mats: ['beltRed'], start: 'flat', end: 'flat' });
  const bz = torsoZ(1.05, 0, true) + 0.012;
  const oct8 = (r: number, z: number): [number, number, number][] =>
    Array.from({ length: 8 }, (_, i) => {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      return [Math.cos(a) * r, 1.05 + Math.sin(a) * r, z];
    });
  hullIn(t, 'gold', U, [...oct8(0.028, bz - 0.002), ...oct8(0.024, bz + 0.01)]);
  hullIn(t, 'beltRed', U, [...oct8(0.014, bz + 0.004), ...oct8(0.012, bz + 0.012)]);
  // 第二條斜掛的腰帶（掛在短裙外面）：左高右低
  const slant = (w: number, d: number, y: number): Ring2 =>
    poly(12, w, d).map(([x, z]) => [x, z, y + (x / w) * 0.03]);
  loft(t, U, [
    { y: 0, pts: slant(0.19, 0.14, 0.945) },
    { y: 0, pts: slant(0.186, 0.136, 0.972) },
  ], { mats: ['leatherDark'], start: 'flat', end: 'flat' });
  // 腰包
  const pouch = (c: V3, ang: number) => {
    const r: V3 = [Math.sin(ang), 0, Math.cos(ang)];
    const tg: V3 = [Math.cos(ang), 0, -Math.sin(ang)];
    const P = (a: number, y: number, b: number): V3 => add(add(add(c, mul(tg, a)), [0, y, 0]), mul(r, b));
    hull(t, 'leather', [P(-0.03, 0.03, 0), P(0.03, 0.03, 0), P(-0.03, -0.035, 0), P(0.03, -0.035, 0), P(-0.028, 0.026, 0.032), P(0.028, 0.026, 0.032), P(-0.026, -0.032, 0.03), P(0.026, -0.032, 0.03), P(0, -0.04, 0.02)]);
    hull(t, 'leatherDark', [P(-0.032, 0.034, 0.0), P(0.032, 0.034, 0.0), P(-0.031, 0.03, 0.036), P(0.031, 0.03, 0.036), P(-0.028, 0.006, 0.037), P(0.028, 0.006, 0.037), P(0, 0.0, 0.04)]);
  };
  pouch([0.16, 0.955, 0.098], 0.95);
  pouch([-0.19, 0.932, -0.04], -1.8);
}

// ───────────────────────── 短裙 ─────────────────────────

/** 深藍短裙：從腰帶往外擴，下襬是鋸齒狀的破邊 */
function skirt(t: Tris): void {
  const U = upright();
  const n = TORSO_N;
  const hem = sample(TORSO, 0.93);
  const flare = (y: number, inflate: number, jag: number): Ring2 =>
    ring(hem, n, inflate).map(([x, z], i) => [x, z, y + (i % 2 ? jag : -jag) + (z < 0 ? -0.012 : 0)]);
  loft(t, U, [
    { y: 1.03, pts: torsoRing(1.03, 0.004) },
    { y: 0, pts: flare(0.94, 0.016, 0) },
    { y: 0, pts: flare(0.855, 0.045, 0.022) },
  ], { mats: ['shorts'], start: 'flat', end: 'open' });
}

// ───────────────────────── 腰布 ─────────────────────────

function flaps(T: (j: string) => Tris): void {
  FLAPS.forEach((f, i) => {
    const a = (f.ang * Math.PI) / 180;
    const out: V3 = [Math.sin(a), 0, Math.cos(a)];
    const tan: V3 = [Math.cos(a), 0, -Math.sin(a)];
    const mat = Math.abs(f.ang) < 50 ? 'cloth' : 'clothDark';
    // 布片截面：正面三個面（左摺、中間、右摺），背面一條稜；有厚度不是薄片
    const sec = (w: number, th: number): Ring2 => [[w, -0.002], [w * 0.4, th], [-w * 0.4, th], [-w, -0.002], [0, -th * 0.4]];
    const widths = [f.w * 0.9, f.w, f.w * 1.04, f.w * 0.9];
    const bones = ['a', 'b', 'c'];
    for (let k = 0; k < 3; k++) {
      const p0 = f.pts[k]!, p1 = f.pts[k + 1]!;
      const L = len(sub(p1, p0));
      const fr = frame(p0, p1, out, tan);
      const last = k === 2;
      // 末端是不對稱的尖角（破布感）
      const tipX = ((i * 37) % 7) / 7 - 0.5;
      loft(T(`${f.id}${bones[k]}`), fr, [
        { y: -0.012, pts: sec(widths[k]!, 0.011) },
        { y: last ? L * 0.55 : L + 0.012, pts: sec(widths[k + 1]!, 0.011) },
      ], { mats: [mat], start: 'flat', end: last ? { apex: [tipX * f.w * 1.2, L, 0.002] } : 'flat' });
    }
  });
}

// ───────────────────────── 劍 ─────────────────────────

function sword(t: Tris): void {
  // 劍的座標系：u = 劍尖方向，s = 劍刃寬度方向，f = 劍身厚度方向
  // 劍刃上下是刃口、左右兩面是劍面（劍往前指時，劍面朝左右）
  const fr = frame(GRIP, add(GRIP, SWORD_DIR), [-1, 0, 0], UP);
  // 劍刃：中央平面 + 左右斜面（背面相同），楔形收到劍尖
  const blade = (w: number, th: number): Ring2 => [[w, 0], [0.36 * w, th], [-0.36 * w, th], [-w, 0], [-0.36 * w, -th], [0.36 * w, -th]];
  loft(t, fr, [
    { y: 0.066, pts: blade(0.031, 0.0088) },
    { y: 0.22, pts: blade(0.029, 0.0085) },
    { y: 0.76, pts: blade(0.025, 0.008) },
    { y: 0.86, pts: blade(0.02, 0.0068) },
  ], { mats: ['blade'], start: 'flat', end: { apex: [0, 0.96, 0] } });
  // 劍脊：兩面中央凸起的窄稜
  for (const s of [1, -1]) {
    loft(t, fr, [
      { y: 0.07, pts: [[0.007, 0.0086 * s], [0, 0.0106 * s], [-0.007, 0.0086 * s], [0, 0.0076 * s]] },
      { y: 0.62, pts: [[0.005, 0.0081 * s], [0, 0.0098 * s], [-0.005, 0.0081 * s], [0, 0.0072 * s]] },
    ], { mats: ['bladeDark'], start: 'flat', end: { apex: [0, 0.72, 0.008 * s] } });
  }
  // 護手
  hullIn(t, 'bronze', fr, [
    [0.024, 0.04, 0.017], [-0.024, 0.04, 0.017], [0.024, 0.04, -0.017], [-0.024, 0.04, -0.017],
    [0.024, 0.074, 0.017], [-0.024, 0.074, 0.017], [0.024, 0.074, -0.017], [-0.024, 0.074, -0.017],
    [0.088, 0.05, 0.011], [-0.088, 0.05, 0.011], [0.088, 0.05, -0.011], [-0.088, 0.05, -0.011],
    [0.088, 0.068, 0.011], [-0.088, 0.068, 0.011], [0.088, 0.068, -0.011], [-0.088, 0.068, -0.011],
    [0.104, 0.062, 0], [-0.104, 0.062, 0],
  ]);
  // 握把
  loft(t, fr, [
    { y: -0.072, pts: poly(6, 0.013, 0.013) },
    { y: 0.044, pts: poly(6, 0.015, 0.015) },
  ], { mats: ['leatherDark'], start: 'flat', end: 'flat' });
  // 劍柄尾端
  hullIn(t, 'bronze', fr, [
    [0.021, -0.088, 0], [-0.021, -0.088, 0], [0, -0.088, 0.021], [0, -0.088, -0.021],
    [0.014, -0.088, 0.014], [-0.014, -0.088, -0.014], [0.014, -0.088, -0.014], [-0.014, -0.088, 0.014],
    [0, -0.068, 0], [0, -0.112, 0],
  ]);
}

// ───────────────────────── 盾牌 ─────────────────────────

/**
 * 圓盾（綁在左前臂外側）：沿盾面法線排幾圈截面，做成中間微凸的穹頂。
 * 由外到內：背面皮革 → 金屬包邊 → 皮革盾面 → 紅色圓環 → 金屬盾心；包邊上一圈銅鉚釘。
 */
function shield(t: Tris): void {
  const fr = frame(SHIELD_C, add(SHIELD_C, SHIELD_N), UP, [0, 0, -1]);
  const n = 12;
  const disc = (r: number) => poly(n, r, r, { start: 90 / n });
  loft(t, fr, [
    { y: -0.014, pts: disc(0.255) },
    { y: -0.004, pts: disc(0.27) },
    { y: 0.008, pts: disc(0.27) },
    { y: 0.016, pts: disc(0.238) },
    { y: 0.03, pts: disc(0.17) },
    { y: 0.04, pts: disc(0.115) },
    { y: 0.046, pts: disc(0.072) },
  ], { mats: ['leatherDark', 'metal', 'metal', 'leather', 'cloth', 'leather'], start: 'flat', end: { apex: [0, 0.052, 0] } });
  // 盾心：凸起的金屬半球
  const boss: [number, number, number][] = [];
  for (const [y, r, k] of [[0.044, 0.06, 8], [0.07, 0.045, 8], [0.088, 0.02, 4]] as const) {
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + y * 20;
      boss.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
  }
  hullIn(t, 'metal', fr, boss);
  // 包邊的鉚釘
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const x = Math.cos(a) * 0.246, z = Math.sin(a) * 0.246;
    hullIn(t, 'bronze', fr, [[x - 0.01, 0.014, z], [x + 0.01, 0.014, z], [x, 0.014, z - 0.01], [x, 0.014, z + 0.01], [x, 0.024, z]]);
  }
}

