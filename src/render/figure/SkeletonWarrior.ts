import type { FigureModel, Joint, PartDef, Pose, PoseSet } from './FigureModel';
import { bar as facetBar, knob as facetKnob, tone } from './Facets';
import { apply, box, jointRotation, lowSphere, placeMesh, prism, type Mesh, type V3 } from './Poly3D';
import { makeStance, mergeAngles, flatFeet, type Angles } from './Stance';

/**
 * 骷髏戰士：暗黑奇幻、多切面（faceted low-poly）的骷髏，右手鏽劍、左手小圓盾。
 *
 * - 每塊骨頭由多個平面組成（五～六角柱骨幹 + 關節頭），各面顏色在骨色的亮、中、暗階之間交錯，
 *   再由繪製時的光線（畫面左上）決定明暗，放大可看到切面，縮小仍看得出頭骨、胸腔、盾、劍。
 * - 下顎是獨立關節（idle 微張、攻擊張大、受傷時頭往後甩）；腰布也是獨立關節（會擺動）。
 * - 姿勢：膝蓋微彎、骨盆下沉、上身前傾、左肩在前右肩在後、頭略低、左腳在前右腳在後。
 * - 攻擊分七段：預備 → 引拍 → 重心前移 → 揮出 → 命中 → 收勢 → 收回（骨盆 → 胸腔 → 肩 → 肘 → 腕 → 劍）。
 *
 * 模型座標：Y 向上、Z 為前方、+X 為角色的左手邊（-X 右手拿劍）。
 */

// ─────────────────────────── 顏色 ───────────────────────────

const BONE_HI = 0xe5d7b7;
const BONE_MID = 0xbdaf91;
const BONE_SHADOW = 0x827762;
const BONE_DEEP = 0x514a3e;
const VOID = 0x17110d;
/** 骨面：亮、中之間交錯（暗面由光線產生） */
const BONE = [BONE_HI, 0xd8caa9, BONE_MID, 0xe0d2b2, 0xcdbf9e] as const;
/** 關節頭、骨頭接觸處：稍暗 */
const JOINT = [BONE_MID, 0xa39578, BONE_SHADOW] as const;
const WOOD = [0x4a3327, 0x563c2e, 0x40291f] as const;
const METAL_DARK = [0x70685e, 0x7c7468, 0x645d54] as const;
const METAL_LIGHT = [0xa29a89, 0xb2aa98, 0x938b7c] as const;
const BLADE = [0x8e8676, 0x7c7466, 0x9c9483, 0x857d6e] as const;
const RUST = 0x6e4a30;
const LEATHER = [0x3a2618, 0x2e1e14] as const;
const CLOTH_BROWN = [0x3d2a1e, 0x33231a] as const;
const CLOTH_RED = [0x5a1e1a, 0x4a1814] as const;
const CLOTH_GREY = [0x2c2a28, 0x353230] as const;

// ─────────────────────────── 小工具 ───────────────────────────

const bar = facetBar;
const knob = (r: number, c: V3, seed = 0, scale: V3 = [1, 1, 1]): Mesh => facetKnob(r, c, JOINT, seed, scale);

/** 長骨骨幹：沿 -Y 的多角柱（每面一個色階） */
const shaft = (y0: number, y1: number, r0: number, r1: number, seed: number, sides = 5, offset: V3 = [0, 0, 0]): Mesh =>
  tone(prism(sides, y0, y1, [r0, r0 * 0.88], [r1, r1 * 0.88], BONE_HI, offset, 0.3 + seed * 0.4), BONE, seed);

// ─────────────────────────── 頭骨 ───────────────────────────

/** 頭骨（不含下顎）：拉長的後腦、前突的額頭與眉骨、深眼窩、三角鼻腔、明顯的顴骨、上排牙；左右略不對稱 */
function skeletonHead(): Mesh[] {
  return [
    // skullTop：後腦往後拉長
    tone(lowSphere(4.3, BONE_HI, [0, 5.3, -0.9], 8, 5, [0.93, 0.92, 1.18]), BONE, 1),
    // skullLeftPlane / skullRightPlane：太陽穴的平面
    tone(placeMesh(box(0.8, 3.4, 4.8, BONE_MID), [0, 0, 0.12], [3.7, 4.7, -0.6]), JOINT, 2),
    tone(placeMesh(box(0.8, 3.2, 4.6, BONE_MID), [0, 0, -0.1], [-3.65, 4.8, -0.5]), JOINT, 3),
    // 額頭前突（上緣往後斜）
    tone(lowSphere(3.3, BONE_HI, [0, 6.9, 2.1], 8, 4, [1, 0.72, 0.7]), BONE, 4),
    // 眉骨：左右各一段，高度不同
    bar([0.2, 6, 4.5], [3.4, 6.2, 3.1], 1.3, 1.1, BONE, 5),
    bar([-0.2, 5.9, 4.5], [-3.3, 5.8, 3.2], 1.3, 1.1, BONE, 6),
    // 眼窩（左邊略大）
    box(2, 2.2, 1.4, VOID, [1.75, 4.5, 3.8]),
    box(1.8, 2, 1.4, VOID, [-1.7, 4.55, 3.8]),
    tone(box(1.1, 2, 1.2, BONE_HI, [0, 4.7, 4.3]), BONE, 10),
    box(3, 0.6, 0.9, BONE_DEEP, [1.7, 3.3, 4.2]),
    box(2.7, 0.6, 0.9, BONE_DEEP, [-1.6, 3.35, 4.2]),
    // 顴骨（左邊略低）
    bar([1.3, 3.1, 4.4], [3.7, 3.4, 1.4], 1.4, 1.3, BONE, 7),
    bar([-1.3, 3.3, 4.4], [-3.6, 3.7, 1.5], 1.4, 1.3, BONE, 8),
    // 上顎與鼻腔（三角形、尖端朝上）
    tone(prism(6, 1.3, 3.2, [2.5, 1.9], [2.6, 2], BONE_HI, [0, 0, 2.7]), BONE, 9),
    placeMesh(prism(3, 0, 1, [0.9, 0.9], [0.75, 0.75], VOID, [0, 0, 0], -Math.PI / 2), [Math.PI / 2, 0, 0], [0, 3.6, 3.9]),
    // 上排牙（右邊缺一顆）
    ...[-1.9, -0.4, 0.4, 1.2, 1.9].map((x, i) => box(0.7, 1, 0.6, i % 2 ? BONE_MID : BONE_HI, [x, 1.1, 4.6 - Math.abs(x) * 0.35])),
    // 裂痕
    bar([1.1, 9, 0.8], [2.5, 7.9, 2.6], 0.35, 0.3, [BONE_DEEP]),
  ];
}

/** 下顎（jaw 關節：在耳下的鉸鏈，往 +X 轉 = 張嘴） */
function skeletonJaw(): Mesh[] {
  return [
    bar([2.4, 0.4, 0], [2.1, -1.5, 2.1], 1, 1.3, BONE, 1),
    bar([-2.4, 0.4, 0], [-2.1, -1.5, 2.1], 1, 1.3, BONE, 2),
    bar([2.1, -1.5, 2.1], [0.8, -1.7, 3.9], 1.1, 1.2, BONE, 3),
    bar([-2.1, -1.5, 2.1], [-0.8, -1.7, 3.9], 1.1, 1.2, BONE, 4),
    tone(box(2.2, 1.5, 1.2, BONE_HI, [0, -1.6, 4.1]), BONE, 5),
    ...[-1.5, -0.5, 0.5, 1.5].map((x, i) => box(0.65, 0.9, 0.55, i % 2 ? BONE_HI : BONE_MID, [x, -0.6, 4 - Math.abs(x) * 0.4])),
  ];
}

/** 頸椎：兩節 */
const skeletonNeck = (): Mesh[] => [0.6, 1.9, 3.2].map((y, i) => tone(box(1.8 - i * 0.1, 1.1, 1.8, BONE_MID, [0, y, i * 0.2]), JOINT, i));

// ─────────────────────────── 胸腔 ───────────────────────────

/** 肋骨一層：[y、側面半寬、前端半寬、前端 z、是否接到胸骨] */
const RIBS: [number, number, number, number, boolean][] = [
  [5.4, 5.1, 2.8, 3, false],
  [7.4, 5.9, 2.4, 3.6, false],
  [9.4, 6.2, 2, 3.9, true],
  [11.3, 5.9, 1.6, 3.9, true],
  [13.1, 5, 1.2, 3.6, true],
];

/** 胸腔：腰椎、胸椎與棘突、五層前寬後窄的肋骨（往前下斜）、胸骨、鎖骨、肩胛骨 */
function skeletonRibCage(): Mesh[] {
  const ribs = RIBS.flatMap(([y, w, f, zf], level) =>
    ([1, -1] as const).flatMap((s) => {
      const back: V3 = [1.1 * s, y + 0.3, -3];
      const sideBack: V3 = [w * 0.86 * s, y, -1.9];
      const sideFront: V3 = [w * s, y - 0.5, 1];
      const front: V3 = [f * s, y - 1.2, zf];
      const seed = level * 2 + (s === 1 ? 0 : 1);
      return [bar(back, sideBack, 0.95, 0.9, BONE, seed), bar(sideBack, sideFront, 0.95, 0.9, BONE, seed + 1), bar(sideFront, front, 0.9, 0.85, BONE, seed + 2)];
    }),
  );
  return [
    // 腰椎（中間夾著暗色椎間盤）
    ...[0.6, 2, 3.4].flatMap((y, i) => [tone(box(2.2, 1, 2, BONE_MID, [0, y, -1.8 - i * 0.3]), JOINT, i), box(1.8, 0.4, 1.6, BONE_DEEP, [0, y + 0.7, -1.8 - i * 0.3])]),
    // 胸椎與往後下斜的棘突
    shaft(4, 16, 1.3, 1.15, 1, 6, [0, 0, -3.1]),
    ...[5, 6.8, 8.6, 10.4, 12.2, 14].map((y, i) => bar([0, y + 0.4, -3.6], [0, y - 0.4, -4.9], 0.8, 0.7, JOINT, i)),
    ...ribs,
    // 胸骨（上窄下寬、前傾）
    tone(placeMesh(prism(4, 0, 6.8, [1.4, 0.6], [1, 0.55], BONE_HI, [0, 0, 0], 0), [-0.12, 0, 0], [0, 8, 3.9]), BONE, 3),
    tone(box(2.8, 1.8, 1.1, BONE_HI, [0, 15.4, 3.2]), BONE, 4),
    // 鎖骨
    bar([1, 15.5, 3.3], [6.4, 15.8, 0], 1, 0.9, BONE, 5),
    bar([-1, 15.5, 3.3], [-6.4, 15.7, 0], 1, 0.9, BONE, 6),
    // 肩胛骨（背後、尖端朝下的三角板 + 肩胛棘）
    ...([1, -1] as const).flatMap((s) => [
      tone(placeMesh(prism(3, 0, 0.6, [3.2, 3.2], [3, 3], BONE_MID, [0, 0, 0], Math.PI / 2), [-Math.PI / 2, 0.3 * s, 0], [3.5 * s, 12, -4]), JOINT, s === 1 ? 1 : 2),
      bar([1.6 * s, 13.4, -4.6], [5.8 * s, 14.4, -2.8], 0.8, 0.8, BONE, s === 1 ? 7 : 8),
    ]),
  ];
}

// ─────────────────────────── 骨盆與腰布 ───────────────────────────

/** 骨盆：薦骨、左右髂骨翼、恥骨與坐骨、髖臼，外加一條破皮帶 */
function skeletonPelvis(): Mesh[] {
  return [
    tone(placeMesh(prism(4, -2.8, 2.2, [1.2, 0.6], [1.9, 0.8], BONE_MID, [0, 0, 0], 0), [-0.35, 0, 0], [0, 0.8, -2.3]), JOINT, 1),
    ...([1, -1] as const).flatMap((s) => [
      tone(placeMesh(prism(5, 0, 4.2, [1.6, 0.7], [3.2, 0.9], BONE_HI), [0.05, 0.55 * s, -0.4 * s], [2.2 * s, -0.2, -0.4]), BONE, s === 1 ? 2 : 3),
      bar([2.8 * s, -0.6, 1.2], [0.9 * s, -1.8, 2.3], 0.9, 0.9, BONE, s === 1 ? 4 : 5),
      bar([2.6 * s, -1.2, -0.4], [1.6 * s, -2.8, -0.6], 0.9, 0.9, JOINT, s === 1 ? 6 : 7),
      tone(lowSphere(1.2, BONE_DEEP, [3 * s, -0.5, 0.4], 5, 3), [BONE_DEEP, BONE_SHADOW]),
    ]),
    bar([1.2, -1.8, 2.3], [-1.2, -1.8, 2.3], 0.9, 1, BONE, 8),
    // 皮帶與暗紅色的結
    tone(prism(9, 1.6, 2.7, [4.9, 3.8], [5, 3.9], LEATHER[0]), LEATHER),
    tone(box(1.8, 1.8, 1, CLOTH_RED[0], [2.6, 1.9, 3.6]), CLOTH_RED),
  ];
}

/** 破腰布（cloth 關節）：前方兩片（深棕、暗紅）、後方一片（黑灰），下緣撕裂成尖角 */
function drawCloth(): Mesh[] {
  const flap = (x: number, z: number, w: number, len: number, tip: number, colors: readonly number[], tilt: V3, seed: number): Mesh[] => [
    tone(placeMesh(prism(4, 0, -len, [w, 0.3], [w * 0.9, 0.3], colors[0]!), tilt, [x, 0, z]), colors, seed),
    tone(placeMesh(prism(4, -len, -len - tip, [w * 0.9, 0.3], [w * 0.25, 0.25], colors[0]!), [tilt[0] + 0.1, tilt[1], tilt[2] + 0.12], [x, 0, z]), colors, seed + 1),
  ];
  return [
    ...flap(1, 4.3, 1.9, 4.6, 3.4, CLOTH_BROWN, [0.06, 0, 0.05], 1),
    ...flap(-1.7, 4.1, 1.3, 3.4, 2.4, CLOTH_RED, [0.04, 0, -0.1], 2),
    ...flap(0.3, -4.1, 2.4, 5.2, 2.6, CLOTH_GREY, [-0.06, 0, 0], 3),
  ];
}

// ─────────────────────────── 手臂 ───────────────────────────

/** 上臂：肱骨頭、五角柱骨幹（正面 / 側面 / 陰影面）、三角肌粗隆、肘部兩個髁 */
const upperArm = (seed: number): Mesh[] => [
  knob(1.9, [0, 0.2, 0], seed),
  shaft(-0.8, -10.2, 1.3, 1.05, seed),
  bar([0, -2, 0.9], [0, -5.2, 0.8], 0.7, 0.6, BONE, seed + 1),
  knob(1.35, [0.8, -10.8, 0], seed + 1),
  knob(1.35, [-0.8, -10.8, 0], seed + 2),
];

/** 前臂：尺骨（後、含鷹嘴突）+ 橈骨（前）兩根並排，看起來較粗；腕部關節 */
const forearm = (seed: number): Mesh[] => [
  knob(1.45, [0, 0, -0.7], seed),
  shaft(-0.5, -9.6, 0.95, 0.7, seed, 5, [0, 0, -0.6]),
  shaft(-0.8, -9.6, 0.75, 1.05, seed + 1, 5, [0, 0, 0.65]),
  knob(1.3, [0, -9.9, 0], seed + 2, [1.25, 0.8, 1]),
];

/** 握拳的骨手：腕骨、四根彎曲的手指（包住握把）、拇指 */
const fist = (seed: number): Mesh[] => [
  tone(box(2.4, 1.6, 1.7, BONE_MID, [0, -1, 0]), JOINT, seed),
  ...[-0.8, 0, 0.8].map((x, i) => bar([x, -1.7, 0.6], [x * 1.05, -3.1, 1.2], 0.7, 0.8, BONE, seed + i)),
  bar([0.9, -1.4, 0.9], [0.5, -2.3, 1.9], 0.55, 0.55, BONE, seed + 5),
];

// ─────────────────────────── 武器與盾 ───────────────────────────

/** 劍的內建傾角（劍身相對手的方向）：待機時劍尖朝前下 */
const SWORD_CANT = 0.6;
const SWORD_GRIP: V3 = [0, -2.4, 0.3];
/** 沿 -Y 建出的劍：劍首、纏皮握把、護手（兩端上翹）、菱形斷面的鏽劍身（中間有鏽斑）、劍尖 */
function swordMeshes(): Mesh[] {
  return [
    tone(lowSphere(0.95, METAL_DARK[0], [0, 3.3, 0], 6, 4), METAL_DARK),
    tone(prism(6, 2.7, -1.3, [0.55, 0.55], [0.6, 0.6], LEATHER[0]), LEATHER),
    ...[1.6, 0].map((y) => tone(prism(6, y + 0.3, y - 0.3, [0.7, 0.7], [0.7, 0.7], METAL_DARK[0]), METAL_DARK)),
    tone(box(1, 1, 5.2, METAL_DARK[0], [0, -1.9, 0]), METAL_DARK),
    bar([0, -1.9, 2.5], [0, -1.2, 3.5], 0.8, 0.8, METAL_DARK),
    bar([0, -1.9, -2.5], [0, -1.2, -3.5], 0.8, 0.8, METAL_DARK),
    tone(prism(4, -2.4, -21.5, [0.34, 1.4], [0.3, 1.15], BLADE[0], [0, 0, 0], 0), BLADE, 1),
    tone(prism(4, -21.5, -25, [0.3, 1.15], [0.04, 0.05], BLADE[0], [0, 0, 0], 0), BLADE, 2),
    box(0.75, 3, 1.3, RUST, [0, -9, 0.3]),
    box(0.75, 1.6, 0.9, RUST, [0, -16, -0.5]),
  ];
}
/** 劍（handR）：握把穿過拳頭，劍身往前（再依 SWORD_CANT 往下斜） */
function drawSword(): Mesh[] {
  return swordMeshes().map((m) => placeMesh(m, [SWORD_CANT - Math.PI / 2, 0, 0], SWORD_GRIP));
}
const SWORD_TIP: V3 = (() => {
  const r = apply(jointRotation([SWORD_CANT - Math.PI / 2, 0, 0]), [0, -25, 0]);
  return [r[0] + SWORD_GRIP[0], r[1] + SWORD_GRIP[1], r[2] + SWORD_GRIP[2]];
})();

/**
 * 小圓盾（handL）：盾背、金屬外環、錐面木盾面（十個切面）、內環、盾心凸釘、鉚釘。
 * 盾面朝外並往前轉 45°，不正對鏡頭。
 */
function drawShield(): Mesh[] {
  const place = (m: Mesh) => placeMesh(m, [0, -0.8, -Math.PI / 2], [1.9, -2.4, 0.5]);
  return [
    tone(prism(10, -0.8, 0, [5.2, 5.2], [5.3, 5.3], WOOD[2]), WOOD, 2),
    tone(prism(12, 0, 0.7, [5.7, 5.7], [5.5, 5.5], METAL_DARK[0]), METAL_DARK),
    tone(prism(10, 0.3, 1.5, [5, 5], [2.4, 2.4], WOOD[0]), WOOD),
    tone(prism(10, 1.4, 1.8, [2.4, 2.4], [1.9, 1.9], METAL_LIGHT[0]), METAL_LIGHT),
    tone(lowSphere(1.5, METAL_LIGHT[0], [0, 1.8, 0], 8, 3, [1, 0.8, 1]), METAL_LIGHT, 1),
    ...[0, 1, 2, 3, 4, 5].map((i) => box(0.6, 0.5, 0.6, METAL_LIGHT[0], [Math.cos(i * 1.047) * 5.1, 0.8, Math.sin(i * 1.047) * 5.1])),
    // 盾背的握把
    tone(box(4, 0.8, 1, LEATHER[0], [0, -1.1, 0]), LEATHER),
  ].map(place);
}

// ─────────────────────────── 腿 ───────────────────────────

/** 大腿：股骨頭、大轉子、六角柱骨幹、膝蓋的兩個髁與髕骨 */
const thigh = (s: 1 | -1, seed: number): Mesh[] => [
  knob(1.7, [-0.5 * s, 0.3, 0], seed),
  knob(1.3, [1.3 * s, -0.8, -0.2], seed + 1),
  shaft(-1, -11.6, 1.55, 1.25, seed, 6),
  knob(1.5, [0.8, -12.2, -0.1], seed + 2),
  knob(1.5, [-0.8, -12.2, -0.1], seed + 3),
  tone(box(1.8, 2.1, 0.8, BONE_HI, [0, -12, 1.5]), BONE, seed),
];

/** 小腿：脛骨平台、脛骨（前緣稜線）、外側細的腓骨、腳踝兩側的踝骨 */
const shin = (s: 1 | -1, seed: number): Mesh[] => [
  tone(prism(6, 0, -1.4, [1.9, 1.5], [1.45, 1.2], BONE_MID), JOINT, seed),
  shaft(-1.2, -11.2, 1.3, 0.95, seed, 5, [0, 0, 0.3]),
  bar([0, -1.6, 1.55], [0, -8.4, 1.15], 0.7, 0.6, BONE, seed + 1),
  shaft(-0.6, -11.4, 0.55, 0.5, seed + 2, 5, [1.15 * s, 0, -0.5]),
  knob(0.8, [1 * s, -11.8, 0], seed + 1),
  knob(0.8, [-0.8 * s, -11.6, 0.2], seed + 2),
];

/** 腳掌（較大、接地）：跟骨與距骨、腳跟、四根往前張開的蹠骨、腳趾 */
const foot = (seed: number): Mesh[] => [
  tone(box(2.4, 1.8, 3.2, BONE_MID, [0, -1.1, -0.2]), JOINT, seed),
  knob(1, [0, -1.5, -1.6], seed + 1),
  ...[-1, 0, 1].map((x, i) => bar([x * 0.8, -1.3, 1.2], [x * 1.25, -2, 6.1], 0.75, 0.75, BONE, seed + i)),
];

// ─────────────────────────── 組裝 ───────────────────────────

const HIP = 27;

const PARTS: PartDef[] = [
  { joint: 'root', parent: null, offset: [0, 0, 0], meshes: skeletonPelvis() },
  { joint: 'cloth', parent: 'root', offset: [0, 1.8, 0], meshes: drawCloth() },
  { joint: 'torso', parent: 'root', offset: [0, 3.2, -0.4], meshes: skeletonRibCage() },
  { joint: 'neck', parent: 'torso', offset: [0, 16.2, -1.4], meshes: skeletonNeck() },
  { joint: 'head', parent: 'neck', offset: [0, 3.6, 0.5], meshes: skeletonHead() },
  { joint: 'jaw', parent: 'head', offset: [0, 2.4, 0.4], meshes: skeletonJaw() },
  { joint: 'upperArmL', parent: 'torso', offset: [7, 15, -0.6], meshes: upperArm(1) },
  { joint: 'forearmL', parent: 'upperArmL', offset: [0, -11, 0], meshes: forearm(2) },
  { joint: 'handL', parent: 'forearmL', offset: [0, -10, 0], meshes: [...fist(3), ...drawShield()] },
  { joint: 'upperArmR', parent: 'torso', offset: [-7, 15, -0.6], meshes: upperArm(4) },
  { joint: 'forearmR', parent: 'upperArmR', offset: [0, -11, 0], meshes: forearm(5) },
  { joint: 'handR', parent: 'forearmR', offset: [0, -10, 0], meshes: [...fist(6), ...drawSword()] },
  { joint: 'thighL', parent: 'root', offset: [3.1, -0.6, 0.4], meshes: thigh(1, 1) },
  { joint: 'shinL', parent: 'thighL', offset: [0, -12.5, 0], meshes: shin(1, 2) },
  { joint: 'footL', parent: 'shinL', offset: [0, -12, 0], meshes: foot(3) },
  { joint: 'thighR', parent: 'root', offset: [-3.1, -0.6, 0.4], meshes: thigh(-1, 4) },
  { joint: 'shinR', parent: 'thighR', offset: [0, -12.5, 0], meshes: shin(-1, 5) },
  { joint: 'footR', parent: 'shinR', offset: [0, -12, 0], meshes: foot(6) },
];

// ─────────────────────────── 姿勢 ───────────────────────────

/** 在 base 上加角度（rootZ 為重心前移） */
function add(base: Pose, extra: Angles, rootZ = base.rootZ ?? 0): Pose {
  const angles: Angles = { ...base.angles };
  for (const [j, v] of Object.entries(extra) as [Joint, V3][]) {
    const b = angles[j] ?? [0, 0, 0];
    angles[j] = [b[0] + v[0], b[1] + v[1], b[2] + v[2]];
  }
  return { rootY: base.rootY, rootZ, angles };
}
const { ground, planted } = makeStance(PARTS, HIP);

/**
 * 戰鬥站姿：骨盆下沉前傾、左肩在前右肩在後（胸腔扭轉）、右肩略低、頭略低；
 * 左腳在前（膝彎約 19°、腳尖外開 10°）、右腳在後（較直、腳尖朝側面），重心在後腳。
 * 右手：上臂微往後、肘自然彎、手腕往下壓，劍尖朝前下約 40°；左手持盾在身前。
 */
const STANCE_ANGLES: Angles = flatFeet({
  root: [0.1, -0.15, 0],
  torso: [0.16, -0.12, 0.05],
  neck: [-0.12, 0.1, 0],
  head: [-0.18, 0.12, -0.05],
  jaw: [0.14, 0, 0],
  cloth: [0.04, 0, 0],
  upperArmR: [0.2, 0, -0.18],
  forearmR: [-0.75, 0, 0],
  handR: [0.35, 0.3, 0],
  upperArmL: [-0.55, 0, 0.25],
  forearmL: [-0.95, 0, 0],
  handL: [0.2, 0, 0],
  thighL: [-0.5, 0, 0.1],
  shinL: [0.33, 0, 0],
  footL: [0, 0.17, -0.1],
  thighR: [0.2, 0, -0.12],
  shinR: [0.1, 0, 0],
  footR: [0, -0.45, 0.12],
});
const STANCE = planted(STANCE_ANGLES);
const stance = (extra: Angles, rootZ = 0): Pose => planted(mergeAngles(STANCE_ANGLES, extra), rootZ);
// 攻擊七段（前四段在前搖期間、命中與收勢在命中後，最後收回待機）
/** 1 預備：膝蓋再彎、身體微縮、嘴微張 */
const ANTICIPATION = stance({ root: [0.04, 0.05, 0], torso: [0.08, 0.1, 0], thighL: [-0.12, 0, 0], shinL: [0.22, 0, 0], thighR: [-0.08, 0, 0], shinR: [0.22, 0, 0], jaw: [0.08, 0, 0], handR: [0.1, 0, 0] });
/** 2 引拍：骨盆與胸腔往右後轉、右肩往後、肘彎曲、劍舉到頭後；盾往前；重心在後腳 */
const WINDUP = stance(
  {
    root: [-0.02, -0.15, 0],
    torso: [-0.2, -0.5, 0.08],
    head: [-0.05, 0.4, 0],
    jaw: [0.22, 0, 0],
    upperArmR: [-2.75, 0, -0.3],
    forearmR: [-0.6, 0, 0],
    handR: [-0.2, 0, 0],
    upperArmL: [-0.3, 0, -0.05],
    forearmL: [0.15, 0, 0],
    thighL: [-0.08, 0, 0],
    shinL: [-0.1, 0, 0],
    thighR: [-0.05, 0, 0],
    shinR: [0.25, 0, 0],
  },
  -1.4,
);
/** 3 重心前移：後腳蹬地（腳跟離地）、前膝彎、骨盆往前，手臂仍在後面蓄力 */
const SHIFT = stance(
  {
    root: [0.1, -0.1, 0],
    torso: [0.02, -0.45, 0.06],
    head: [0.05, 0.35, 0],
    jaw: [0.28, 0, 0],
    upperArmR: [-2.85, 0, -0.35],
    forearmR: [-0.7, 0, 0],
    handR: [-0.25, 0, 0],
    upperArmL: [-0.35, 0, -0.05],
    forearmL: [0.1, 0, 0],
    thighL: [-0.2, 0, 0],
    shinL: [0.35, 0, 0],
    thighR: [0.3, 0, 0],
    shinR: [0.1, 0, 0],
    footR: [0.35, 0, 0],
  },
  1.6,
);
/** 4 揮出：骨盆先轉、胸腔跟上、肩帶動上臂往前下，肘與手腕還落後 */
const SWING = stance(
  {
    root: [0.06, 0.15, 0],
    torso: [0.1, 0.3, -0.02],
    head: [0.12, -0.15, 0],
    jaw: [0.4, 0, 0],
    upperArmR: [-2.05, 0, -0.05],
    forearmR: [-0.9, 0, 0],
    handR: [-0.45, 0, 0],
    upperArmL: [0.05, 0, 0.1],
    forearmL: [0.25, 0, 0],
    thighL: [-0.3, 0, 0],
    shinL: [0.45, 0, 0],
    thighR: [0.45, 0, 0],
    shinR: [0.1, 0, 0],
    footR: [0.45, 0, 0],
  },
  3,
);
/** 5 命中：胸腔轉到底、手臂伸直、手腕最後甩下，劍尖朝前下；嘴張最大 */
const IMPACT = stance(
  {
    root: [0.1, 0.25, 0],
    torso: [0.16, 0.5, -0.05],
    head: [0.2, -0.3, 0],
    jaw: [0.5, 0, 0],
    upperArmR: [-1.2, 0, 0.1],
    forearmR: [0.45, 0, 0],
    handR: [-0.1, 0, 0],
    upperArmL: [0.2, 0, 0.15],
    forearmL: [0.35, 0, 0],
    thighL: [-0.35, 0, 0],
    shinL: [0.5, 0, 0],
    thighR: [0.5, 0, 0],
    shinR: [0.15, 0, 0],
    footR: [0.45, 0, 0],
  },
  3.6,
);
/** 6 收勢：劍繼續往左下掃過身前，胸腔再多轉一點 */
const FOLLOW = stance(
  {
    root: [0.08, 0.3, 0],
    torso: [0.14, 0.72, -0.05],
    head: [0.15, -0.45, 0],
    jaw: [0.35, 0, 0],
    upperArmR: [-0.75, 0, 0.55],
    forearmR: [0.35, 0, 0],
    handR: [0.45, 0, 0],
    upperArmL: [0.35, 0, 0.3],
    forearmL: [0.45, 0, 0],
    thighL: [-0.3, 0, 0],
    shinL: [0.45, 0, 0],
    thighR: [0.4, 0, 0],
    shinR: [0.15, 0, 0],
    footR: [0.3, 0, 0],
  },
  3.2,
);

/** 受傷：頭猛然往後甩、下顎張開、上身後仰、雙手往外甩 */
const HIT = stance({ torso: [-0.35, 0.1, 0.1], neck: [-0.3, 0, 0], head: [-0.6, -0.2, 0.1], jaw: [0.45, 0, 0], upperArmR: [0.35, 0, -0.35], upperArmL: [0.35, 0, 0.35], forearmL: [0.35, 0, 0], handR: [-0.3, 0, 0] }, -1.2);

const DEAD: Pose = {
  rootY: -22.5,
  angles: {
    root: [1.45, 0.3, 0.1],
    torso: [0.1, 0, 0],
    head: [0.4, 0.5, 0.3],
    jaw: [0.6, 0, 0],
    cloth: [-0.6, 0, 0],
    thighL: [-0.9, 0, 0.3],
    thighR: [-0.5, 0, -0.3],
    shinL: [1.1, 0, 0],
    shinR: [0.6, 0, 0],
    upperArmL: [-1.2, 0, 1],
    upperArmR: [-0.6, 0, -1.2],
  },
};

const skeletonPoses: PoseSet = {
  /** 待機：呼吸般的胸腔起伏、頭輕晃、劍尖微動、盾稍微落後、下顎輕顫、腰布擺動 */
  ready: (t) => {
    const breath = Math.sin(t * 2);
    return add(
      STANCE,
      {
        torso: [breath * 0.025, Math.sin(t * 0.9) * 0.03, 0],
        neck: [-breath * 0.02, 0, 0],
        head: [Math.sin(t * 0.8 + 1) * 0.04, Math.sin(t * 0.7) * 0.14, 0],
        jaw: [Math.max(0, Math.sin(t * 1.7)) * 0.08, 0, 0],
        handR: [Math.sin(t * 2 - 0.6) * 0.05, 0, Math.sin(t * 1.3) * 0.03],
        forearmL: [Math.sin(t * 2 - 0.4) * 0.04, 0, 0],
        cloth: [Math.sin(t * 1.6) * 0.06, 0, Math.sin(t * 1.1) * 0.05],
      },
      0,
    );
  },
  /**
   * 走路：前後腳相差半個週期；骨盆轉動、肩膀反向轉、頭維持朝前；
   * 劍（慣性）與盾落後一點相位；腰布往後飄。
   */
  run: (p) => {
    const s = Math.sin(p);
    const hipYaw = -0.2 * s;
    const shoulderYaw = 0.3 * s;
    return ground(
      add(
        { rootY: 0, angles: {} },
        flatFeet({
          root: [0.12, -0.1 + hipYaw, 0],
          torso: [0.22, -0.1 + shoulderYaw, 0.04],
          neck: [-0.14, -(hipYaw + shoulderYaw) * 0.8 + 0.1, 0],
          head: [-0.2, 0.1, 0],
          jaw: [0.14 + Math.sin(p * 2) * 0.05, 0, 0],
          cloth: [0.18 + Math.sin(p * 2 - 0.5) * 0.12, 0, Math.sin(p - 0.5) * 0.08],
          thighL: [-0.2 - 0.42 * s, 0, 0.08],
          shinL: [0.25 + 0.8 * Math.max(0, Math.cos(p)), 0, 0],
          footL: [0, 0.1, -0.08],
          thighR: [-0.2 + 0.42 * s, 0, -0.08],
          shinR: [0.25 + 0.8 * Math.max(0, -Math.cos(p)), 0, 0],
          footR: [0, -0.15, 0.08],
          upperArmR: [0.15 - 0.3 * s, 0, -0.18],
          forearmR: [-0.75, 0, 0],
          handR: [0.35 + Math.sin(p - 0.6) * 0.2, 0.3, 0],
          upperArmL: [-0.55 + 0.15 * s, 0, 0.25],
          forearmL: [-0.95 + Math.sin(p - 0.4) * 0.15, 0, 0],
          handL: [0.2, 0, 0],
        }),
        0,
      ),
    );
  },
  attackWindup: WINDUP,
  attackStrike: IMPACT,
  castWindup: WINDUP,
  castRelease: IMPACT,
  hit: HIT,
  dead: DEAD,
  attackChain: { windup: [ANTICIPATION, WINDUP, SHIFT, SWING], strike: [IMPACT, FOLLOW] },
};

export const SKELETON_WARRIOR: FigureModel = {
  hipHeight: HIP,
  referenceRadius: 0.32,
  parts: PARTS,
  poses: skeletonPoses,
  weaponTip: SWORD_TIP,
  dynamicShadow: true,
};
