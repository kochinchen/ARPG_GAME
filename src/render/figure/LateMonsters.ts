import { mass, organic, plate, shell, spineRow, teeth } from './Beasts';
import { along, arthropod, bugPoses, seg, spike, wormPoses } from './Creatures';
import type { FigureModel, PartDef, PoseSet } from './FigureModel';
import { boneLimb, humanoid, monsterPoses, pelvis, plus, ribcage, skull, type Angles } from './MonsterParts';
import { lowSphere, normalize, placeMesh, prism, type Mesh, type V3 } from './Poly3D';
import { glowEyes, iceCluster } from './Variants';

/**
 * 23～35 樓的新怪物（多面體模型，與 Beasts.ts 相同的生物化做法：錯開的團塊 + 表面甲片 / 符文 / 鎖鏈）。
 * 破碎要塞：要塞魔像、鎖鏈獄卒 ｜ 深淵通道：晶刺織網蛛、深淵影魔、虛空吞噬者 ｜ 深淵神殿：深淵祭司、小惡魔、墮落聖殿騎士。
 * 人形怪用 MonsterParts 的人形骨架與姿勢；蜘蛛用節肢骨架、吞噬者用蠕蟲骨架（Creatures.ts）。
 * 每隻再依特性疊加自己的動作（animate）：魔像待機時石砲對準前方、獄卒的燈籠晃動、影魔的斗篷飄動、
 * 祭司背後的符文圈旋轉、小惡魔拍翅膀、聖殿騎士的碎光環浮動；翅膀 / 符文圈 / 光環 / 斗篷掛在自己的關節上。
 * 模型座標：Y 向上、Z 為前方、+X 為角色的左手邊（-X 右手拿武器）。
 */

// ─────────────────────────── 共用零件 ───────────────────────────

/** 從 a 到 b 的一串鎖鏈：環節交錯（一個扁在 X、一個扁在 Z） */
function chainLinks(a: V3, b: V3, n: number, r: number, color: number): Mesh[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    return lowSphere(r, color, p, 6, 3, i % 2 ? [0.45, 1, 1] : [1, 1, 0.45]);
  });
}

/** 環狀排列（例如光環、符文圈）：繞著中心 c、在 XY 平面上（往前傾 tilt），從角度 a0 到 a1 放 n 個零件 */
function ring(n: number, c: V3, r: number, a0: number, a1: number, tilt: number, make: (p: V3, a: number, i: number) => Mesh[]): Mesh[] {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / Math.max(1, n - 1);
    const y = Math.sin(a) * r;
    return make([c[0] + Math.cos(a) * r, c[1] + y * Math.cos(tilt), c[2] - y * Math.sin(tilt)], a, i);
  }).flat();
}

/**
 * 在原本的姿勢上疊加這隻怪物的特色動作：ready(t) / run(p) 回傳要加上的角度與骨盆高度變化。
 * 攻擊、受傷、倒地不變（掛在額外關節上的零件在這些姿勢回到原位）。
 */
function animate(base: PoseSet, extra: { ready?: (t: number) => [Angles, number?]; run?: (p: number) => [Angles, number?] }): PoseSet {
  const add = (pose: ReturnType<PoseSet['ready']>, [angles, dy = 0]: [Angles, number?]) => ({ ...plus(pose, angles, pose.rootY + dy), ...(pose.rootZ !== undefined ? { rootZ: pose.rootZ } : {}) });
  return {
    ...base,
    ready: extra.ready ? (t) => add(base.ready(t), extra.ready!(t)) : base.ready,
    run: extra.run ? (p) => add(base.run(p), extra.run!(p)) : base.run,
  };
}

/** 在模型上加掛額外的關節（翅膀、符文圈、光環、斗篷下擺） */
const withParts = (model: FigureModel, extra: PartDef[]): FigureModel => ({ ...model, parts: [...model.parts, ...extra] });

// ═══════════════════════════ 要塞魔像 ═══════════════════════════

const G = { stone: 0x5a6070, light: 0x6e7686, dark: 0x3c424e, deep: 0x2a2e36, rune: 0x7ab4ff, hot: 0xc8e4ff, moss: 0x4a5a3a };
/** 石砲手臂：粗砲管、三道鐵箍、砲口透出藍光 */
const cannon = (): Mesh[] => [
  mass(G.light, [0, -1, 0], [4.8, 4.4, 4.8], 0.16, 10, 6),
  organic(prism(14, -2, -14, [4.4, 4.4], [4, 4], G.dark), 0.25, 31),
  ...[-4.4, -8.6, -12.4].map((y) => organic(prism(14, y, y - 1.4, [4.8, 4.8], [4.8, 4.8], G.deep), 0.15, 32)),
  ...[0, 1, 2, 3, 4, 5].map((i) => plate([Math.cos(i * 1.05 + 0.4) * 4.3, -6.6, Math.sin(i * 1.05 + 0.4) * 4.3], [Math.cos(i * 1.05 + 0.4), 0, Math.sin(i * 1.05 + 0.4)], 3, 0.6, 0.3, G.rune)),
  // 砲口：一圈石齒、發光的砲膛
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => spike([Math.cos(i * 0.9) * 4, -14, Math.sin(i * 0.9) * 4], [Math.cos(i * 0.9) * 4.8, -16.4, Math.sin(i * 0.9) * 4.8], 0.7, i % 2 ? G.stone : G.light)),
  lowSphere(3, G.hot, [0, -14, 0], 10, 5, [1, 0.45, 1]),
  lowSphere(1.8, 0xffffff, [0, -14.6, 0], 7, 4, [1, 0.4, 1]),
];
/** 魔像的上臂：肩上一顆大岩塊（上面長苔）+ 粗壯的手臂團塊 + 符文環 */
const golemArm = (side: 1 | -1): Mesh[] => [
  mass(G.light, [side * 1.4, 1.6, 0], [5.8, 5.2, 5.4], 0.18, 10, 7),
  ...shell([side * 1.4, 1.6, 0], [5.8, 5.2, 5.4], 2, 3, [G.stone, G.dark, G.light], 2.6, { from: -0.5, to: 0.5, arc: 0.7, thick: 0.9, rough: 0.35 }),
  plate([side * 1.8, 6.6, -0.6], [0, 1, 0], 3.6, 3, 0.6, G.moss, 0.3),
  mass(G.stone, [0, -5.5, 0], [3.8, 6, 3.8], 0.12, 9, 6),
  ...[0, 1, 2].map((i) => plate([Math.cos(i * 2.1) * 3.6, -5, Math.sin(i * 2.1) * 3.6], [Math.cos(i * 2.1), 0, Math.sin(i * 2.1)], 0.6, 2.4, 0.3, G.rune)),
];
const RAMPART_GOLEM: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    shoulderX: 11,
    root: [
      mass(G.dark, [0, -0.5, 0], [7.6, 5, 5.6], 0.15, 10, 6),
      ...shell([0, -0.5, 0], [7.6, 5, 5.6], 2, 4, [G.light, G.stone, G.dark], 3, { from: -0.6, to: 0.6, arc: 0.95, thick: 1.2, rough: 0.4 }),
      plate([0, 0, 5.6], [0, 0, 1], 1.2, 3.2, 0.3, G.rune),
    ],
    torso: [
      // 胸口的大石塊、腹部、一層層石甲；正面的符文裂縫與發光的核心
      mass(G.stone, [0, 9.5, 0.4], [10, 8, 7], 0.14, 12, 8),
      mass(G.dark, [0, 2.5, 0.4], [7.6, 4.2, 5.6], 0.12, 10, 6),
      ...shell([0, 10, 0], [10, 8, 7], 4, 5, [G.light, G.stone, G.dark], 4.2, { thick: 1.8, rough: 0.6, arc: 0.95 }),
      ...([[-3.4, 12, -0.3], [3, 7.4, 0.3], [-1.6, 5.4, 0.5], [4.2, 12.8, -0.4], [0.4, 14.8, 0]] as const).map(([x, y, rot]) =>
        plate([x, y, 7.1], [rot, 0, 1], 0.55, 3.4, 0.3, G.rune),
      ),
      mass(G.hot, [0, 10, 6.6], [2, 2, 1], 0.05, 8, 5),
      ...ring(8, [0, 10, 6.9], 3, 0, Math.PI * 1.75, 0, (p) => [plate(p, [0, 0, 1], 0.9, 0.9, 0.3, G.rune)]),
      // 背上的苔與突出的碎石
      ...spineRow([[-3, 15, 3], [-6, 12.6, 3.4], [-6, 7, 2.6]], 1.5, [G.dark, G.stone], 0.5),
      plate([3.4, 15.4, -3.4], [0.3, 1, -0.5], 4, 3.4, 0.6, G.moss, 0.3),
      plate([-4, 13.6, -4.6], [-0.4, 0.6, -0.8], 3, 3, 0.6, G.moss, 0.3),
    ],
    neck: [mass(G.deep, [0, 1.4, 0], [3.6, 2.2, 3.2], 0.1, 8, 4)],
    head: [
      // 縮在肩膀之間的小頭：厚額甲、發光的眼縫、兩塊角狀碎石
      mass(G.stone, [0, 4, 0.8], [4.2, 3.8, 4.2], 0.15, 10, 6),
      plate([0, 6.4, 1.6], [0, 1, 0.5], 6.4, 4, 1.4, G.light, 0.4),
      plate([0, 4.2, 4.9], [0, 0, 1], 0.8, 4.6, 0.3, G.hot),
      mass(G.dark, [0, 1.4, 2.6], [3, 1.6, 2.4], 0.12, 8, 5),
      spike([2.8, 6.4, 0], [5, 9.6, -1.6], 1.3, G.dark),
      spike([-2.8, 6.4, 0], [-5, 9.4, -1.2], 1.2, G.stone),
    ],
    upperArmL: golemArm(1),
    upperArm: golemArm(-1),
    forearmL: [mass(G.stone, [0, -4.5, 0.2], [4.2, 6, 4.2], 0.12, 9, 6), ...shell([0, -4.5, 0.2], [4.2, 6, 4.2], 2, 3, [G.light, G.dark], 2.6, { arc: 0.8, thick: 1, rough: 0.3 })],
    forearm: cannon(),
    handL: [
      mass(G.dark, [0, -2.6, 0.6], [4, 3.6, 4.2], 0.15, 9, 6),
      ...[-1.8, -0.6, 0.6, 1.8].map((x) => mass(G.stone, [x, -5.2, 2], [1.1, 1.6, 1.3], 0.12, 6, 4)),
    ],
    handR: [lowSphere(1.6, G.hot, [0, -4, 0], 7, 4)],
    thigh: [mass(G.stone, [0, -6, 0], [4.8, 7.6, 4.8], 0.12, 10, 6), plate([0, -5, 4.6], [0, 0, 1], 3.4, 5, 1.2, G.light, 0.3), plate([0, -7, 4.9], [0, 0, 1], 0.5, 3, 0.3, G.rune)],
    shin: [mass(G.light, [0, 0, 1], [3.6, 3.4, 3.4], 0.16, 8, 5), mass(G.stone, [0, -6.4, 0.3], [4.2, 7, 4.4], 0.12, 10, 6)],
    foot: [mass(G.dark, [0, -1.6, 1.6], [4.6, 2.2, 5.8], 0.12, 9, 5), ...[-2, 0, 2].map((x) => mass(G.stone, [x, -2, 6.4], [1.4, 1.4, 1.6], 0.12, 6, 4))],
  }),
  // 待機時石砲對準前方、胸口隨符文的光緩緩起伏；走路時把石砲扛在肩上（swagger）
  poses: animate(monsterPoses({ attack: 'slam', gait: 'swagger' }), {
    ready: (t) => [{ upperArmR: [-0.95, 0, 0.05], forearmR: [0.4, 0, 0], torso: [Math.sin(t * 1.2) * 0.03, Math.sin(t * 0.5) * 0.06, 0], head: [0, Math.sin(t * 0.4) * 0.2, 0] }],
  }),
  gaitRate: 0.6,
};

// ═══════════════════════════ 鎖鏈獄卒 ═══════════════════════════

const W = { bone: 0xb8a888, iron: 0x4a4642, ironDark: 0x2e2c2a, rust: 0x7a4a2a, leather: 0x3e2a1c, leatherDark: 0x2a1c12, chain: 0x6a6460, glow: 0xffc060, eye: 0xff8a30 };
/** 鐵鉤：木柄 + 往前彎的鉤子 */
const hook = (): Mesh[] => [
  prism(8, 2, -9, [0.7, 0.7], [0.7, 0.7], W.leather),
  prism(8, -8.4, -9.4, [1, 1], [1, 1], W.ironDark),
  seg([0, -9, 0], [0, -13, 0.6], 0.6, 0.55, W.iron, 6),
  seg([0, -13, 0.6], [0, -15, 2.6], 0.55, 0.45, W.iron, 6),
  seg([0, -15, 2.6], [0, -14.2, 4.6], 0.45, 0.35, W.iron, 6),
  spike([0, -14.2, 4.6], [0, -12, 5.2], 0.35, W.rust),
];
/** 燈籠：提鏈、上蓋、四根框條、發光的火 */
const lantern = (): Mesh[] => [
  ...chainLinks([0, -1, 0], [0, -4.6, 0], 3, 0.45, W.chain),
  prism(8, -4.6, -5.8, [0.6, 0.6], [2.2, 2.2], W.ironDark),
  ...[0, 1, 2, 3].map((i) => seg([Math.cos(i * 1.57 + 0.78) * 2, -5.8, Math.sin(i * 1.57 + 0.78) * 2], [Math.cos(i * 1.57 + 0.78) * 2, -10, Math.sin(i * 1.57 + 0.78) * 2], 0.25, 0.25, W.iron, 4)),
  lowSphere(1.5, W.glow, [0, -8, 0], 8, 5, [1, 1.3, 1]),
  prism(8, -10, -10.8, [2.3, 2.3], [1.8, 1.8], W.ironDark),
];
/** 鐵手銬：手腕的鐵環 + 垂下的斷鏈 */
const manacle = (): Mesh[] => [prism(10, -6.6, -8.4, [1.6, 1.6], [1.6, 1.6], W.ironDark), ...chainLinks([0.6, -8, 1], [1.4, -14, 2.6], 6, 0.6, W.chain)];
const CHAIN_WARDEN: FigureModel = {
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    root: [
      ...pelvis(),
      // 皮圍裙（前面長、後面短）、腰上的鎖鏈與鑰匙串
      prism(10, 0.4, 2.6, [4.8, 4], [5, 4.1], W.leather),
      ...[-2.2, 0, 2.2].map((x, i) => plate([x, -4.6 - (i % 2) * 1.4, 4.4], [0, -0.1, 1], 10 + (i % 2) * 2.4, 2.4, 0.4, i % 2 ? W.leatherDark : W.leather, 0.15)),
      ...[-1.6, 1.6].map((x) => plate([x, -2.6, -4.2], [0, -0.1, -1], 6, 2.8, 0.4, W.leatherDark, 0.15)),
      ...chainLinks([4.6, 1.4, 2.6], [-4.6, 0.6, 3.4], 9, 0.75, W.chain),
      ...chainLinks([-4.6, 0.6, 3.4], [-5, -5, 2.8], 5, 0.75, W.chain),
      ...[0, 1, 2].map((i) => box3(0.4, 2.2, 0.3, W.rust, [-5 + i * 0.5, -6.4, 2.8])),
    ],
    torso: [
      ...ribcage(W.bone),
      // 斜背的皮帶、胸前交叉的鎖鏈、鐵項圈、左肩一片鏽甲
      placeMesh(prism(4, -9, 9, [0.7, 0.35], [0.7, 0.35], W.leather), [0, 0, 0.75], [0, 8.6, 3.4]),
      ...chainLinks([6, 15, 3.4], [-5, 4, 4], 11, 0.85, W.chain),
      ...chainLinks([-6, 15, -3.6], [5, 5, -4], 11, 0.85, W.chain),
      organic(prism(12, 14.6, 16.4, [4.6, 4], [4.4, 3.8], W.ironDark), 0.15),
      ...[0, 1, 2, 3].map((i) => spike([Math.cos(i * 1.57) * 4.4, 16, Math.sin(i * 1.57) * 3.8], [Math.cos(i * 1.57) * 6, 16.6, Math.sin(i * 1.57) * 5.2], 0.4, W.iron)),
      ...shell([5.4, 14, 0], [3.4, 2.6, 3.6], 2, 2, [W.iron, W.rust], 2.6, { arc: 0.7, thick: 0.6, rough: 0.25 }),
    ],
    head: [
      ...skull(W.bone),
      ...glowEyes(2, 6, 5.5, 0.75, W.eye),
      // 鐵籠面罩：上下兩道鐵環 + 八根鐵條 + 頂上的提環
      prism(12, 1.6, 2.6, [5.8, 6], [5.8, 6], W.ironDark),
      prism(12, 10.6, 11.6, [5.4, 5.6], [5, 5.2], W.ironDark),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        return seg([Math.cos(a) * 5.8, 2.2, Math.sin(a) * 6], [Math.cos(a) * 5.3, 11, Math.sin(a) * 5.5], 0.32, 0.32, i % 3 ? W.iron : W.rust, 4);
      }),
      seg([0, 11.4, -2.4], [0, 13.4, 0], 0.4, 0.4, W.iron, 4),
      seg([0, 13.4, 0], [0, 11.4, 2.4], 0.4, 0.4, W.iron, 4),
    ],
    forearmL: [...boneLimb(9, 1, W.bone), ...manacle()],
    forearm: [...boneLimb(9, 1, W.bone), ...manacle()],
    handL: lantern(),
    handR: hook(),
    shin: [...boneLimb(12.5, 1.15, W.bone), prism(10, -9.6, -11.4, [1.8, 1.8], [1.8, 1.8], W.ironDark), ...chainLinks([0.8, -11, 1.2], [3, -12, 3.6], 3, 0.45, W.chain)],
    foot: [mass(W.leatherDark, [0, -1.2, 1.4], [1.9, 1.2, 3.2], 0.1, 8, 4)],
  }),
  // 燈籠一直晃（走路時隨步伐大幅擺動）、頭左右張望；鐵鉤垂在身側輕晃
  poses: animate(monsterPoses({ attack: 'chop', gait: 'stalk' }), {
    ready: (t) => [{ handL: [Math.sin(t * 1.6) * 0.22, 0, Math.cos(t * 1.3) * 0.14], head: [0, Math.sin(t * 0.6) * 0.35, Math.sin(t * 0.6) * 0.05], handR: [Math.sin(t * 1.1) * 0.08, 0, 0] }],
    run: (p) => [{ handL: [0.4 * Math.sin(p - 0.9), 0, 0.18 * Math.cos(p)], handR: [0.15 * Math.sin(p - 1.2), 0, 0] }],
  }),
  gaitRate: 0.9,
};
/** 小方塊（鑰匙）：用 prism 做 4 邊的柱 */
function box3(w: number, h: number, d: number, color: number, c: V3): Mesh {
  return prism(4, c[1] + h / 2, c[1] - h / 2, [w, d], [w, d], color, [c[0], 0, c[2]]);
}

// ═══════════════════════════ 墮落聖殿騎士 ═══════════════════════════

const T = { steel: 0x2c2a30, mid: 0x45424c, edge: 0x1c1a20, gold: 0xc8a24a, goldDark: 0x8a6a2a, cloth: 0x4a1018, clothDark: 0x2e0a10, halo: 0xffe08a, iron: 0x3a3a40 };
/** 塔盾：高大的盾面、金色滾邊、中央的十字紋與盾心 */
const towerShield = (): Mesh[] => [
  plate([2.6, -4, 2.2], [1, 0, 0.25], 17, 10, 1.2, T.steel, 0.15),
  plate([3.4, -4, 2.4], [1, 0, 0.25], 15, 8.4, 0.4, T.mid, 0.1),
  ...[4.4, -12.4].map((y) => plate([3.5, y, 2.4], [1, 0, 0.25], 0.8, 10, 0.5, T.gold)),
  ...[-2.6, 7.2].map((z) => plate([3.5, -4, z], [1, 0, 0.25], 17, 0.8, 0.5, T.gold)),
  plate([3.9, -4, 2.4], [1, 0, 0.25], 11, 1.2, 0.4, T.goldDark),
  plate([3.9, -1.6, 2.4], [1, 0, 0.25], 1.2, 6, 0.4, T.goldDark),
  lowSphere(1.4, T.gold, [4.3, -1.6, 2.4], 8, 4, [0.6, 1, 1]),
];
/** 連枷：握柄、四節鎖鏈、帶刺的鐵球 */
const flail = (): Mesh[] => {
  const ball: V3 = [0, -15.6, 2.4];
  return [
    prism(8, 2, -6.5, [0.75, 0.75], [0.7, 0.7], T.clothDark),
    prism(8, -6.5, -7.6, [1.1, 1.1], [1, 1], T.gold),
    ...chainLinks([0, -7.6, 0], [0, -13.2, 1.6], 5, 0.5, T.iron),
    mass(T.iron, ball, [2.2, 2.2, 2.2], 0.08, 10, 6),
    ...Array.from({ length: 10 }, (_, i) => {
      const d = normalize([Math.cos(i * 2.4) * Math.sqrt(1 - ((i + 0.5) / 5 - 1) ** 2), (i + 0.5) / 5 - 1, Math.sin(i * 2.4) * Math.sqrt(1 - ((i + 0.5) / 5 - 1) ** 2)]);
      return spike([ball[0] + d[0] * 1.8, ball[1] + d[1] * 1.8, ball[2] + d[2] * 1.8], [ball[0] + d[0] * 3.8, ball[1] + d[1] * 3.8, ball[2] + d[2] * 3.8], 0.5, T.mid);
    }),
  ];
};
/** 肩甲：三層往下疊、金色滾邊 */
const templarPauldron = (side: 1 | -1): Mesh[] => [
  mass(T.steel, [side * 1.2, 1.6, 0], [4.8, 3.6, 4.6], 0.04, 12, 6),
  ...shell([side * 1.2, 1.6, 0], [4.8, 3.6, 4.6], 3, 3, [T.mid, T.steel, T.mid], 2.8, { from: -0.6, to: 0.6, arc: 0.8, thick: 0.6, rough: 0.05 }),
  plate([side * 4.8, -0.6, 0], [side, -0.3, 0], 0.7, 8, 0.4, T.gold),
  mass(T.mid, [0, -5, 0], [2.7, 5.4, 2.7], 0.04, 10, 5),
];
const templarForearm: Mesh[] = [lowSphere(2.6, T.steel, [0, 0, 0.4], 10, 5, [1, 1, 1.15]), organic(prism(12, -1, -8.6, [2.4, 2.4], [2.8, 2.8], T.mid), 0.05), prism(12, -7.4, -8.6, [2.9, 2.9], [3, 3], T.gold)];
const gauntletT = (): Mesh[] => [mass(T.steel, [0, -1.8, 0.2], [2.1, 2, 2], 0.05, 9, 5), ...[-1.1, 0, 1.1].map((x) => mass(T.mid, [x, -3.8, 1], [0.6, 1.2, 0.7], 0.05, 6, 3))];
/** 碎裂的光環（掛在頭後方自己的關節上）：一圈只剩一半，旁邊漂著兩塊碎片 */
const brokenHalo = (): Mesh[] => [
  ...ring(11, [0, 0, 0], 6.4, Math.PI * 0.05, Math.PI * 1.15, 0.5, (p, a) => [seg(p, [p[0] + Math.sin(a) * 1.5, p[1] - Math.cos(a) * 1.2, p[2]], 0.45, 0.45, T.halo, 5), lowSphere(0.35, 0xffffff, p, 5, 3)]),
  seg([-6.8, -3.6, -2.2], [-7.6, -5.2, -2.4], 0.45, 0.45, T.halo, 5),
  seg([-4.4, -6.6, -1.8], [-3, -7.4, -2], 0.45, 0.45, T.halo, 5),
];
const FALLEN_TEMPLAR = withParts({
  hipHeight: 29,
  referenceRadius: 0.3,
  parts: humanoid({
    shoulderX: 8.6,
    root: [
      mass(T.steel, [0, 0.6, 0], [6.8, 3.6, 5.2], 0.05, 12, 6),
      prism(12, 2, 3.2, [6.9, 5.3], [7, 5.4], T.gold),
      // 四片腿裙、前後的深紅罩袍（下緣破成幾條）
      ...[[0, 5.3, 0.2], [0, -5.3, -0.2]].map(([x, z, r]) => placeMesh(prism(4, 0, -7, [6.2, 0.6], [6.6, 0.6], T.mid, [0, 0, 0], Math.PI / 4), [r!, 0, 0], [x!, -1, z!])),
      ...[1, -1].map((x) => placeMesh(prism(4, 0, -6.4, [0.6, 5.4], [0.6, 5.8], T.mid, [0, 0, 0], Math.PI / 4), [0, 0, -0.2 * x], [x * 6.8, -1, 0])),
      ...[-1.4, 0, 1.4].map((x, i) => plate([x, -6 - (i % 2) * 1.6, 6.2], [0, -0.15, 1], 11 + (i % 2) * 2.6, 1.5, 0.3, i % 2 ? T.clothDark : T.cloth, 0.12)),
      ...[-1.6, 0, 1.6].map((x, i) => plate([x, -5.6 - (i % 2) * 1.2, -6.2], [0, -0.15, -1], 10 + (i % 2) * 2, 1.7, 0.3, i % 2 ? T.cloth : T.clothDark, 0.12)),
    ],
    torso: [
      // 黑金胸甲：三層腹甲、往上變寬的胸板、金色十字紋與滾邊、護頸
      ...[0, 2.4, 4.8].map((y, i) => organic(prism(14, y, y + 2.6, [6.8 + i * 0.4, 5 + i * 0.2], [7.1 + i * 0.4, 5.2 + i * 0.2], i % 2 ? T.mid : T.steel), 0.04, 41 + i)),
      mass(T.steel, [0, 10.4, 0.4], [8.8, 5.6, 5.8], 0.04, 14, 8),
      plate([0, 10.6, 6], [0, 0, 1], 8, 1.4, 0.4, T.gold),
      plate([0, 12, 6], [0, 0, 1], 1.4, 6, 0.4, T.gold),
      ...[1, -1].map((x) => plate([x * 8.4, 9.6, 0], [x, 0, 0], 8, 0.6, 0.4, T.goldDark)),
      prism(12, 14.6, 17, [5.4, 4.6], [4, 3.6], T.mid),
      // 背後垂下的深紅披風（下緣破碎）
      ...[-4, -1.4, 1.4, 4].map((x, i) => plate([x, 4 - (i % 2) * 2, -6.4], [0, 0.1, -1], 22 + (i % 2) * 3, 2.8, 0.4, i % 2 ? T.clothDark : T.cloth, 0.2)),
    ],
    neck: [prism(10, -0.5, 3.5, [3.6, 3.4], [3, 2.8], T.mid)],
    head: [
      // 大頭盔：圓頂、十字視縫、金色鑲邊與頂冠
      organic(prism(14, 0, 8.8, [4.8, 5], [5, 5.1], T.steel), 0.04, 51),
      lowSphere(5.05, T.steel, [0, 8.8, 0], 14, 6, [1, 0.72, 1.02], (c) => c[1] > 0.1),
      plate([0, 5.6, 5.1], [0, 0, 1], 0.8, 6.4, 0.3, 0x0c0a0e),
      plate([0, 4.4, 5.1], [0, 0, 1], 4, 0.8, 0.3, 0x0c0a0e),
      ...[1.4, 9.2].map((y) => prism(14, y, y + 0.8, [5.1, 5.2], [5.1, 5.2], T.gold)),
      plate([0, 11.4, -0.6], [1, 0, 0], 3, 7, 0.8, T.gold, 0.1),
    ],
    upperArmL: templarPauldron(1),
    upperArm: templarPauldron(-1),
    forearmL: templarForearm,
    forearm: templarForearm,
    handL: [...gauntletT(), ...towerShield()],
    handR: [...gauntletT(), ...flail()],
    thigh: [mass(T.steel, [0, -6, 0], [3.2, 6.8, 3.2], 0.04, 12, 6), prism(12, -4, -5, [3.3, 3.3], [3.2, 3.2], T.gold)],
    shin: [
      lowSphere(2.9, T.mid, [0, 0, 0.5], 10, 5, [1, 1, 1.15]),
      placeMesh(prism(3, 0, 1, [2.2, 2.2], [0.3, 0.3], T.gold, [0, 0, 0], 0), [-Math.PI / 2, 0, 0], [0, 0, 2.6]),
      organic(prism(12, -1.4, -12.5, [2.8, 3], [2.4, 2.6], T.steel), 0.04, 52),
    ],
    foot: [mass(T.steel, [0, -1.4, 1.4], [2.4, 1.6, 3.8], 0.04, 10, 5), plate([0, -0.8, 4.6], [0, 0.6, 1], 3, 1.6, 0.4, T.mid)],
  }),
  // 碎光環在頭後上下浮動、微微傾斜；待機時連枷的鐵球輕晃
  poses: animate(monsterPoses({ attack: 'chop', gait: 'march' }), {
    ready: (t) => [{ scarfA: [Math.sin(t * 1.4) * 0.08, Math.sin(t * 0.7) * 0.15, Math.sin(t * 0.9) * 0.1], handR: [Math.sin(t * 1.5) * 0.12, 0, Math.cos(t * 1.2) * 0.06] }],
    run: (p) => [{ scarfA: [Math.sin(p * 2) * 0.1, 0, Math.sin(p) * 0.12] }],
  }),
  gaitRate: 0.75,
}, [{ joint: 'scarfA', parent: 'head', offset: [0, 11.6, -3.4], meshes: brokenHalo() }]);

// ═══════════════════════════ 晶刺織網蛛 ═══════════════════════════

const S = { shell: 0x2a2238, plate: 0x3c3050, crystal: 0xb070ff, light: 0xe0b8ff, glow: 0x8a4ae0, leg: 0x241c30, joint: 0x3c3050, eye: 0xff60d0, fang: 0xd8c8f0 };
const CRYSTAL = [S.crystal, S.light] as const;
const CRYSTAL_WEAVER: FigureModel = {
  parts: arthropod({
    hip: 7,
    body: [
      mass(S.shell, [0, 0, 1], [4.8, 3.4, 5], 0.08, 12, 7),
      ...shell([0, 0.2, 1], [4.6, 3.3, 4.8], 2, 3, [S.plate, S.shell], 2.6, { from: -0.5, to: 0.5, arc: 0.7, thick: 0.6, rough: 0.15 }),
      ...iceCluster([0, 3, 0], [0, 1, -0.4], 3, 0.55, CRYSTAL),
    ],
    head: [
      mass(S.plate, [0, 0, 1.4], [3.1, 2.4, 2.8], 0.08, 10, 6),
      // 八隻眼：前排兩大、兩側與上方的小眼
      ...glowEyes(0.9, 0.9, 3.9, 0.55, S.eye),
      ...glowEyes(1.9, 0.6, 3.4, 0.4, S.eye),
      ...glowEyes(1.2, 1.9, 3.1, 0.35, S.eye),
      ...glowEyes(2.4, 1.4, 2.4, 0.3, S.eye),
    ],
    headAt: [0, 0.4, 5.4],
    abdomen: [
      mass(S.shell, [0, 2, -7], [6.6, 5.6, 8], 0.08, 14, 9),
      ...shell([0, 2.2, -7], [6.4, 5.4, 7.8], 5, 6, [S.plate, S.shell, S.plate], 2.6, { thick: 0.7, rough: 0.2, arc: 0.9 }),
      // 腹部側面一條條發光的紋路
      ...[-4, -7, -10].flatMap((z) => [1, -1].map((x) => plate([x * 6.2, 1.6, z], [x, 0.2, 0], 0.5, 2.4, 0.3, S.glow))),
      // 背上的水晶簇與腹下的光
      ...([[0, 7.6, -5, 0, 1, 0.2, 5.4], [3.4, 6.6, -8, 0.5, 1, -0.2, 4.4], [-3.6, 6.4, -6.4, -0.5, 1, 0, 4.6], [1.6, 6, -12, 0.2, 0.8, -0.6, 3.8], [-2, 7.2, -9.6, -0.2, 1, -0.3, 4.2], [4.6, 3.6, -4, 0.9, 0.6, 0.2, 3.4]] as const).flatMap(
        ([x, y, z, dx, dy, dz, len]) => iceCluster([x, y, z], normalize([dx, dy, dz]), len, 0.7, CRYSTAL),
      ),
      mass(S.glow, [0, -2.2, -7], [4, 1.6, 5.6], 0.06, 10, 5),
      ...[-0.8, 0.8].map((x) => spike([x, 0.6, -14.6], [x * 1.4, -0.4, -16.6], 0.5, S.light)),
    ],
    abdomenAt: [0, 0.6, -1.6],
    legs: 8,
    legZ: [3, 1.5, 0, -1.5],
    bodyHalfWidth: 3.6,
    span: 12.5,
    knee: 7.5,
    legR: 0.9,
    legColor: S.leg,
    jointColor: S.crystal,
    // 三節的腳：大腿上有甲片、膝蓋長出小水晶、小腿有剛毛、腳尖是水晶
    legMesh: (knee, foot, side) => {
      const mid: V3 = [knee[0] + (foot[0] - knee[0]) * 0.45, knee[1] + (foot[1] - knee[1]) * 0.45 + 1.2, knee[2] + (foot[2] - knee[2]) * 0.45];
      return [
        organic(seg([0, 0, 0], knee, 1.05, 0.85, S.leg, 8), 0.06),
        plate([knee[0] * 0.5, knee[1] * 0.5 + 0.8, knee[2] * 0.5], [side * 0.3, 1, 0], 1.2, 3, 0.35, S.plate),
        mass(S.plate, knee, [1.1, 1.1, 1.1], 0.1, 7, 4),
        ...iceCluster(knee, normalize([side * 0.4, 1, 0]), 2, 0.35, CRYSTAL),
        seg(knee, mid, 0.85, 0.65, S.leg, 8),
        lowSphere(0.7, S.joint, mid, 6, 3),
        seg(mid, foot, 0.65, 0.22, S.leg, 7),
        spike([mid[0] + (foot[0] - mid[0]) * 0.4, mid[1] + (foot[1] - mid[1]) * 0.4, mid[2]], [mid[0] + (foot[0] - mid[0]) * 0.4 + side * 0.8, mid[1] + (foot[1] - mid[1]) * 0.4 + 1, mid[2]], 0.18, S.leg),
        spike(foot, [foot[0], foot[1] - 0.8, foot[2]], 0.3, S.light),
      ];
    },
    // 水晶毒牙
    pincer: (side) => [seg([0, 0, 0], [-side * 0.6, -1.4, 1.6], 0.7, 0.5, S.plate, 6), spike([-side * 0.6, -1.4, 1.6], [-side * 0.4, -3, 2.2], 0.5, S.fang)],
    pincerAt: [1, -0.8, 3.6],
  }),
  hipHeight: 7,
  referenceRadius: 0.38,
  // 頭不時抽動張望、腹部像呼吸一樣起伏；走路是快速的碎步（gaitRate）
  poses: animate(bugPoses({ legs: 8, hip: 7 }), {
    ready: (t) => [{ head: [Math.sin(t * 5) * 0.04, Math.sin(t * 0.9) * 0.25 + (Math.sin(t * 3.7) > 0.9 ? 0.15 : 0), 0], ponytail: [Math.sin(t * 1.6) * 0.06, 0, 0] }],
  }),
  gaitRate: 1.4,
};

// ═══════════════════════════ 深淵影魔 ═══════════════════════════

const D = { void: 0x16101e, shadow: 0x2a2038, cloak: 0x221a30, cloakDark: 0x150f1d, glow: 0x9a5aff, eye: 0xd090ff, claw: 0xcfc0e8, horn: 0x3a2c4c, band: 0x3a2c4c };
/** 影魔的長爪：掌心、四根兩節的長指與爪尖、手背的骨刺 */
const shadeClaw = (): Mesh[] => [
  mass(D.shadow, [0, -1.6, 0.4], [1.9, 2.1, 1.7], 0.12, 9, 5),
  ...[-1.2, -0.4, 0.4, 1.2].flatMap((x, i) => {
    const k: V3 = [x * 1.2, -4.4, 1.4];
    const tip: V3 = [x * 1.4, -7.4 - (i === 1 || i === 2 ? 0.8 : 0), 3.2];
    return [seg([x, -2.8, 0.8], k, 0.42, 0.34, D.shadow, 6), lowSphere(0.4, D.band, k, 5, 3), seg(k, tip, 0.34, 0.26, D.shadow, 6), spike(tip, [tip[0] * 1.05, tip[1] - 2.6, tip[2] + 2], 0.28, D.claw)];
  }),
  spike([0, -0.6, -1.2], [0, 1.2, -3.4], 0.4, D.horn),
];
/** 手臂上纏繞的破布帶（幾道錯開的環） */
const wraps = (from: number, to: number, r: number, n: number): Mesh[] =>
  Array.from({ length: n }, (_, i) => {
    const y = from + ((to - from) * (i + 0.5)) / n;
    return organic(prism(8, y + 0.5, y - 0.5, [r, r], [r * 0.95, r * 0.95], i % 2 ? D.cloak : D.band), 0.15, 70 + i);
  });
/** 下半身的斗篷（掛在自己的關節上，會飄動）：外圈長布條、內圈短布條、往下飄散的黑煙 */
const shadeCloak = (): Mesh[] => [
  ...Array.from({ length: 13 }, (_, i) => {
    const a = (i / 13) * Math.PI * 2;
    const len = 15 + ((i * 7) % 5) * 2.2;
    return plate([Math.cos(a) * 4.8, -len / 2, Math.sin(a) * 4], [Math.cos(a), -0.15, Math.sin(a)], len, 2.6, 0.3, i % 2 ? D.cloak : D.cloakDark, 0.3);
  }),
  ...Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const len = 9 + ((i * 5) % 4) * 2;
    return plate([Math.cos(a) * 3.6, -len / 2 - 1, Math.sin(a) * 3], [Math.cos(a), -0.1, Math.sin(a)], len, 2.2, 0.3, i % 2 ? D.cloakDark : D.shadow, 0.25);
  }),
  ...Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + 0.3;
    const r = i % 2 ? 2.4 : 3.4;
    return spike([Math.cos(a) * r, -4 - (i % 3), Math.sin(a) * r * 0.85], [Math.cos(a) * (r + 1.2), -20 - (i % 4) * 1.8, Math.sin(a) * (r + 1)], 1 - (i % 2) * 0.3, D.void);
  }),
];
const SHADE_STALKER = withParts(
  {
    hipHeight: 29,
    referenceRadius: 0.3,
    parts: humanoid({
      // 沒有腳：骨盆以下是會飄動的斗篷（cloth 關節）
      root: [
        mass(D.void, [0, -1, 0], [5.4, 4, 4.2], 0.12, 10, 6),
        ...Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return plate([Math.cos(a) * 5.2, 0.4, Math.sin(a) * 4.3], [Math.cos(a), 0.3, Math.sin(a)], 3.2, 3, 0.4, i % 2 ? D.cloak : D.cloakDark, 0.2);
        }),
      ],
      torso: [
        mass(D.shadow, [0, 8, 0], [6, 8, 4.6], 0.12, 12, 8),
        mass(D.void, [0, 7, 1.6], [4.2, 5.6, 3.2], 0.1, 10, 6),
        // 胸口透出紫光的肋骨與胸骨、背上的骨刺、領口一圈尖刺、披在肩上的破斗篷
        ...[5, 7.4, 9.8, 12.2].flatMap((y, i) => [1, -1].map((x) => plate([x * 2.6, y, 4.3 - i * 0.1], [x * 0.35, 0, 1], 0.7, 3.6 - i * 0.2, 0.3, D.glow))),
        plate([0, 8.6, 4.6], [0, 0, 1], 8, 0.7, 0.3, D.eye),
        ...spineRow([[-3.4, 14, 3], [-4.2, 10.6, 3.4], [-4.2, 7, 2.8], [-3.6, 3.4, 2.2]], 0.8, [D.horn, D.shadow], 0.6),
        ...ring(6, [0, 15.4, -0.6], 4.6, Math.PI * 0.1, Math.PI * 0.9, Math.PI / 2, (p, a) => [spike(p, [p[0] * 1.4, p[1] + 2.4, p[2] - Math.sin(a) * 1.4], 0.45, D.horn)]),
        ...shell([0, 12, -0.4], [7, 5, 5.2], 3, 5, [D.cloak, D.cloakDark, D.cloak], 3.4, { from: -0.8, to: 0.4, arc: 0.95, thick: 0.4, rough: 0.4 }),
        ...[-4.6, -1.6, 1.6, 4.6].map((x, i) => plate([x, 2 - (i % 2) * 2, -5.4], [0, 0, -1], 14 + (i % 2) * 4, 3, 0.3, i % 2 ? D.cloakDark : D.cloak, 0.3)),
      ],
      neck: [seg([0, 0, 0], [0, 2.6, 0.6], 1.6, 1.4, D.void, 6)],
      head: [
        // 兜帽包住整個頭（帽緣一圈破布），正面是一片黑、兩大兩小發光的眼、一排發光的細牙；往後彎的長角
        organic(lowSphere(6.4, D.cloak, [0, 6, -0.6], 14, 8, [1.05, 1.15, 1.1], (c) => c[2] < 2.6 || c[1] > 3.6), 0.3),
        ...ring(7, [0, 6, 3.8], 4.8, Math.PI * 0.05, Math.PI * 0.95, 0, (p, a) => [plate(p, [Math.cos(a) * 0.6, Math.sin(a) * 0.6, 1], 1.4, 2, 0.3, D.cloakDark, 0.2)]),
        mass(D.void, [0, 5.4, 1.6], [4, 4.6, 3.4], 0.06, 10, 6),
        lowSphere(0.85, D.eye, [1.6, 6.4, 4.6], 6, 4, [1.4, 0.7, 1]),
        lowSphere(0.85, D.eye, [-1.6, 6.4, 4.6], 6, 4, [1.4, 0.7, 1]),
        ...glowEyes(2.4, 4.8, 4.2, 0.4, D.glow),
        ...[-1.2, -0.4, 0.4, 1.2].map((x) => spike([x, 3.2, 4.4], [x * 0.9, 2.2, 4.8], 0.22, D.glow)),
        ...[1, -1].flatMap((x) => [seg([x * 3.4, 9.6, -1], [x * 5.6, 13, -3.6], 0.9, 0.65, D.horn, 6), spike([x * 5.6, 13, -3.6], [x * 6, 13.6, -8], 0.65, D.horn), spike([x * 4.4, 11.2, -2.2], [x * 6.2, 11.6, -1.8], 0.3, D.horn)]),
        placeMesh(prism(6, 0, 7, [2.6, 2.6], [0.3, 0.3], D.cloak), [-1.7, 0, 0], [0, 10.6, -4.6]),
      ],
      upperArm: [seg([0, 0.6, 0], [0, -10, 0], 1.5, 1.1, D.shadow, 8), mass(D.cloak, [0, 0.4, 0], [2.6, 2.4, 2.6], 0.2, 8, 5), ...wraps(-3, -8, 1.45, 3)],
      forearm: [seg([0, 0, 0], [0, -9.4, 0.4], 1.1, 0.9, D.shadow, 8), ...[-2.6, -5.2].map((y) => plate([0, y, -1], [0, 0, -1], 2.6, 1.8, 0.3, D.cloak, 0.2)), ...wraps(-1, -6, 1.15, 3)],
      handL: shadeClaw(),
      handR: shadeClaw(),
      thigh: [],
      shin: [],
      foot: [],
    }),
    // 待機時上下飄浮、斗篷下擺像在水裡一樣緩緩擺動、雙爪抽動；移動時斗篷往後拖
    poses: animate(monsterPoses({ attack: 'claw', hunch: 0.35, gait: 'hover' }), {
      ready: (t) => [
        {
          cloth: [Math.sin(t * 1.3) * 0.12, Math.sin(t * 0.7) * 0.2, Math.sin(t * 1.1) * 0.1],
          handL: [Math.sin(t * 3.1) * 0.12, 0, 0],
          handR: [Math.sin(t * 2.7 + 1) * 0.12, 0, 0],
          head: [0, Math.sin(t * 0.8) * 0.25, Math.sin(t * 0.5) * 0.1],
        },
        Math.sin(t * 1.5) * 1.4 + 1,
      ],
      run: (p) => [{ cloth: [0.45 + Math.sin(p * 2) * 0.08, Math.sin(p) * 0.15, 0] }],
    }),
    gaitRate: 0.8,
  },
  [{ joint: 'cloth', parent: 'root', offset: [0, -2, 0], meshes: shadeCloak() }],
);

// ═══════════════════════════ 虛空吞噬者 ═══════════════════════════

const M = { hide: 0x2a1e38, belly: 0x44305a, plate: 0x3a2c50, plateDark: 0x22182e, glow: 0xb45aff, tooth: 0xe8dcf4, maw: 0x0e0814, crystal: 0x9a5ae0, lip: 0x5a2a4a };
/** 吞噬者的一節：錯開的身體、淺色腹部、發光的環節縫、背甲與水晶 */
const mawSegment = (r: number, i: number): Mesh[] => [
  mass(M.hide, [0, 0, 0], [r, r * 0.9, 3.9], 0.07, 12, 7),
  mass(M.belly, [0, -r * 0.5, 0], [r * 0.78, r * 0.48, 3.4], 0.06, 9, 5),
  organic(along(2.6, 3.4, [r * 1.04, r * 0.94], [r * 1.02, r * 0.92], M.glow, [0, 0, 0], 12), r * 0.04),
  ...shell([0, 0, 0], [r * 0.95, r * 0.88, 3.4], 2, 3, [M.plate, M.plateDark], r * 0.5, { from: -0.55, to: 0.45, arc: 0.75, thick: r * 0.12 }),
  ...iceCluster([i % 2 ? r * 0.3 : -r * 0.3, r * 0.85, -0.6], [i % 2 ? 0.3 : -0.3, 1, -0.3], r * 0.7, r * 0.14, [M.crystal, M.glow]),
];
/** 大顎：兩節、內側一排鋸齒 */
const mawMandible = (side: 1 | -1): Mesh[] => [
  seg([0, 0, 0], [-side * 0.4, 0, 3.4], 1.2, 0.9, M.plate, 6),
  seg([-side * 0.4, 0, 3.4], [-side * 1.4, 0, 6.6], 0.9, 0.5, M.plate, 6),
  spike([-side * 1.4, 0, 6.6], [-side * 2.4, 0, 8.6], 0.5, M.tooth),
  ...[1.8, 3.6, 5.2].map((z) => spike([-side * 0.6, 0, z], [-side * 1.8, 0, z + 0.5], 0.3, M.tooth)),
];
const VOID_MAW: FigureModel = {
  parts: [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: mawSegment(4.6, 0) },
    { joint: 'torso', parent: 'root', offset: [0, 0.4, 6.2], meshes: mawSegment(4.5, 1) },
    { joint: 'neck', parent: 'torso', offset: [0, 0.5, 6], meshes: mawSegment(4.3, 2) },
    {
      joint: 'head',
      parent: 'neck',
      offset: [0, 0.5, 5.8],
      meshes: [
        mass(M.hide, [0, 0.4, 1.6], [4.8, 4.4, 4.6], 0.07, 12, 7),
        ...shell([0, 0.4, 1.2], [4.7, 4.3, 4.4], 2, 4, [M.plateDark, M.plate], 2.6, { from: -0.6, to: 0.2, arc: 0.8, thick: 0.7 }),
        // 圓形巨口：肉質的唇、深不見底的喉嚨、三圈往內的牙
        organic(along(4.6, 6.2, [4.4, 4.2], [4, 3.8], M.lip, [0, 0.4, 0], 16), 0.25),
        lowSphere(3.2, M.maw, [0, 0.4, 5.8], 12, 5, [1, 1, 0.4]),
        ...[3.6, 2.6, 1.6].flatMap((rr, k) =>
          Array.from({ length: 12 - k * 2 }, (_, i) => {
            const a = (i / (12 - k * 2)) * Math.PI * 2 + k * 0.3;
            return spike([Math.cos(a) * rr, 0.4 + Math.sin(a) * rr, 6 - k * 0.4], [Math.cos(a) * rr * 0.4, 0.4 + Math.sin(a) * rr * 0.4, 7 - k * 0.3], 0.4 - k * 0.06, M.tooth);
          }),
        ),
        // 頭頂一圈水晶冠、六隻小眼
        ...ring(6, [0, 4.6, 1.2], 3.4, Math.PI * 0.1, Math.PI * 0.9, 1.4, (p, a) => iceCluster(p, normalize([Math.cos(a) * 0.6, 1, -0.4]), 3.6, 0.55, [M.crystal, M.glow])),
        ...[1, -1].flatMap((x) => [lowSphere(0.6, M.glow, [x * 3.4, 2.6, 4], 6, 4), lowSphere(0.5, M.glow, [x * 4.2, 1.2, 3.2], 6, 4), lowSphere(0.4, M.glow, [x * 4.4, -0.4, 2.6], 6, 4)]),
      ],
    },
    { joint: 'handL', parent: 'head', offset: [3.4, -0.6, 4.6], meshes: mawMandible(1) },
    { joint: 'handR', parent: 'head', offset: [-3.4, -0.6, 4.6], meshes: mawMandible(-1) },
    { joint: 'ponytail', parent: 'root', offset: [0, -0.2, -6.2], meshes: mawSegment(4.3, 3) },
    { joint: 'thighL', parent: 'ponytail', offset: [0, -0.3, -6], meshes: mawSegment(3.7, 4) },
    { joint: 'shinL', parent: 'thighL', offset: [0, -0.3, -5.6], meshes: mawSegment(3, 5) },
    {
      joint: 'footL',
      parent: 'shinL',
      offset: [0, -0.2, -5],
      meshes: [
        organic(along(-1, -7, [2.6, 2.3], [0.3, 0.3], M.hide, [0, 0, 0], 10), 0.12),
        ...shell([0, 0, -2.6], [2.2, 1.9, 3], 2, 2, [M.plate, M.plateDark], 1.5, { from: -0.4, to: 0.5, arc: 0.6, thick: 0.4 }),
        ...iceCluster([0, 1.6, -2.4], [0, 1, -0.6], 3, 0.5, [M.crystal, M.glow]),
      ],
    },
  ],
  hipHeight: 4.6,
  referenceRadius: 0.3,
  // 巨大而緩慢：待機時頭抬高左右擺、大顎慢慢開合，像在嗅聞獵物
  poses: animate(wormPoses(4.6), {
    ready: (t) => [{ neck: [-0.12 + Math.sin(t * 0.7) * 0.06, Math.sin(t * 0.5) * 0.2, 0], head: [-0.1, Math.sin(t * 0.5 + 0.6) * 0.15, 0], handL: [0, 0.2 + Math.sin(t * 1.4) * 0.25, 0], handR: [0, -0.2 - Math.sin(t * 1.4) * 0.25, 0] }],
  }),
  gaitRate: 0.7,
};

// ═══════════════════════════ 深淵祭司 ═══════════════════════════

const P = { robe: 0x5a1420, robeDark: 0x3a0c14, black: 0x1a1014, gold: 0xb08a3a, skin: 0x8a2a2a, skinDark: 0x5a1a1a, horn: 0x2a1e1a, eye: 0xffd040, rune: 0xff6a3a, bone: 0xd8cbb0, fang: 0xf0e4cc };
/** 骷髏權杖：杖身、金箍、頂端的骷髏（眼窩發光）與兩根尖刺 */
const scepter = (): Mesh[] => [
  lowSphere(1.6, P.skinDark, [0, -1.4, 0], 8, 4),
  organic(prism(8, 15, -20, [0.7, 0.7], [0.7, 0.7], P.black), 0.08),
  ...[13.6, 5, -6, -18].map((y) => prism(8, y, y + 1.4, [1.2, 1.2], [1.2, 1.2], P.gold)),
  mass(P.bone, [0, 17.6, 0.2], [2, 2.2, 2.2], 0.08, 10, 6),
  mass(P.bone, [0, 16, 1.2], [1.4, 0.8, 1.2], 0.06, 7, 4),
  ...glowEyes(0.7, 17.8, 2, 0.45, P.rune),
  spike([1.2, 18.6, -0.6], [3, 22.6, -1.6], 0.5, P.horn),
  spike([-1.2, 18.6, -0.6], [-3, 22.6, -1.6], 0.5, P.horn),
  spike([0, 19.4, -0.8], [0, 23.4, -2.4], 0.45, P.horn),
];
/** 爪手：掌 + 四根細長的爪 */
const priestHand = (): Mesh[] => [
  mass(P.skin, [0, -1.6, 0.3], [1.6, 1.8, 1.3], 0.1, 8, 5),
  ...[-0.9, -0.3, 0.3, 0.9].flatMap((x) => [seg([x, -2.8, 0.6], [x * 1.2, -5, 1.2], 0.35, 0.28, P.skin, 5), spike([x * 1.2, -5, 1.2], [x * 1.2, -6.8, 2], 0.28, P.horn)]),
];
/** 背後的符文圈（掛在自己的關節上，會慢慢旋轉）：外圈 11 片符文 + 光點、內圈 8 片小符文 */
const runeHalo = (): Mesh[] => [
  ...ring(12, [0, 0, 0], 8, 0, Math.PI * 2 * (11 / 12), 0, (p, a, i) => [plate(p, [0, 0, -1], 2.2, 1.4, 0.3, P.rune), ...(i % 2 ? [] : [lowSphere(0.5, P.eye, [p[0] * 0.86, p[1] * 0.86, 0], 5, 3)]), seg(p, [Math.cos(a + 0.26) * 8, Math.sin(a + 0.26) * 8, 0], 0.15, 0.15, P.gold, 4)]),
  ...ring(8, [0, 0, 0.4], 5, 0.2, 0.2 + Math.PI * 2 * (7 / 8), 0, (p) => [plate(p, [0, 0, -1], 1.2, 1.2, 0.3, P.eye)]),
  lowSphere(1, P.rune, [0, 0, 0.6], 7, 4),
];
const ABYSS_PRIEST = withParts(
  {
    hipHeight: 29,
    referenceRadius: 0.3,
    parts: humanoid({
      root: [
        // 長袍（外袍 + 前方的黑色內襯與符文）、下擺破成一條條、金色滾邊；腰帶上掛著小骷髏
        organic(prism(16, 4, -25.6, [5.8, 4.6], [10, 8.4], P.robe), 0.25, 61),
        plate([0, -11, 7.4], [0, -0.16, 1], 26, 4.6, 0.4, P.black, 0.1),
        ...[-6, -12, -18].map((y) => plate([0, y, 7.9 - (y + 6) * 0.04], [0, -0.16, 1], 2.2, 2.2, 0.3, P.rune)),
        ...Array.from({ length: 20 }, (_, i) => {
          const a = (i / 20) * Math.PI * 2;
          return plate([Math.cos(a) * 9.6, -26.6 - (i % 3) * 0.8, Math.sin(a) * 8], [Math.cos(a), -0.2, Math.sin(a)], 3 + (i % 3) * 1.6, 2.6, 0.3, i % 2 ? P.robeDark : P.robe, 0.2);
        }),
        prism(16, -25.6, -26.4, [10, 8.4], [10.1, 8.5], P.gold),
        organic(prism(14, 2.2, 4.4, [5.9, 4.7], [6, 4.8], P.black), 0.1),
        ...[-3.6, 0, 3.6].flatMap((x, i) => [mass(P.bone, [x, 0.6 - (i % 2), 4.9], [0.9, 1, 0.8], 0.08, 7, 4), ...glowEyes(0.3, 0.8 - (i % 2), 5.6, 0.18, P.rune).map((m) => ({ ...m, verts: m.verts.map(([vx, vy, vz]) => [vx + x, vy, vz] as V3) }))]),
      ],
      torso: [
        organic(prism(14, 0, 15, [5.8, 4.6], [7.6, 5], P.robe), 0.15, 62),
        // 披肩（一層層往下疊）、肩上的骨刺、胸前的金鏈與符文墜飾
        ...shell([0, 13.4, 0], [8.2, 4.6, 5.6], 3, 6, [P.robeDark, P.black, P.robeDark], 3.2, { from: -0.8, to: 0.8, arc: 0.95, thick: 0.6, rough: 0.2 }),
        ...[1, -1].flatMap((x) => [0, 1, 2].map((i) => spike([x * (6.6 - i * 1.2), 15.6 - i * 0.4, -0.6 - i * 0.8], [x * (8.2 - i), 19.6 - i * 0.8, -1.6 - i * 1.2], 0.55 - i * 0.1, P.horn))),
        ...chainLinks([5, 13, 4.6], [0, 7.4, 5.4], 6, 0.5, P.gold),
        ...chainLinks([-5, 13, 4.6], [0, 7.4, 5.4], 6, 0.5, P.gold),
        mass(P.gold, [0, 6.8, 5.4], [1.6, 1.8, 0.6], 0.05, 8, 5),
        mass(P.rune, [0, 6.8, 5.8], [1, 1.2, 0.5], 0.05, 8, 5),
      ],
      head: [
        // 惡魔的臉：拉長的頭、厚眉骨、發光的眼、露出的獠牙；彎曲的長角與金色角冠
        mass(P.skin, [0, 6, 0.6], [4.2, 5, 4.4], 0.08, 12, 8),
        plate([0, 8.2, 4], [0, 0.4, 1], 1.6, 6.6, 1, P.skinDark, 0.2),
        ...[1, -1].map((x) => mass(P.skinDark, [x * 2.8, 4.6, 3], [1.2, 1.4, 1.2], 0.1, 7, 4)),
        lowSphere(0.85, P.eye, [1.7, 7, 4.5], 6, 4, [1.3, 0.7, 1]),
        lowSphere(0.85, P.eye, [-1.7, 7, 4.5], 6, 4, [1.3, 0.7, 1]),
        mass(P.skinDark, [0, 2.6, 2.6], [3, 1.6, 2.4], 0.08, 8, 5),
        ...teeth(3.8, 4.6, 2, 1.2, 3.4, 2, 0, 1.2, P.fang),
        ...[1, -1].flatMap((x) => [
          seg([x * 3.2, 9.6, -0.4], [x * 5.6, 12.6, -2.4], 1.1, 0.85, P.horn, 8),
          ...[0.35, 0.7].map((t) => prism(8, 0, 0.5, [1.15 - t * 0.3, 1.15 - t * 0.3], [1.1 - t * 0.3, 1.1 - t * 0.3], P.gold, [x * (3.2 + 2.4 * t), 9.6 + 3 * t, -0.4 - 2 * t])),
          seg([x * 5.6, 12.6, -2.4], [x * 6.4, 16.4, -2], 0.85, 0.55, P.horn, 8),
          spike([x * 6.4, 16.4, -2], [x * 5.6, 18.8, 0], 0.55, P.horn),
          spike([x * 3.6, 3.4, 1], [x * 5.4, 2.6, -1.4], 0.45, P.skinDark),
        ]),
        prism(12, 10.4, 11.4, [3.8, 3.8], [3.6, 3.6], P.gold),
        ...[0, 1, 2, 3, 4].map((i) => spike([Math.cos(Math.PI * (0.2 + i * 0.15)) * 3.4, 11.2, Math.sin(Math.PI * (0.2 + i * 0.15)) * 3.4], [Math.cos(Math.PI * (0.2 + i * 0.15)) * 3.6, 14.4 - Math.abs(i - 2) * 0.8, Math.sin(Math.PI * (0.2 + i * 0.15)) * 3.6], 0.45, P.gold)),
        lowSphere(0.6, P.rune, [0, 11, 3.6], 6, 4),
      ],
      upperArm: [organic(prism(12, 0, -10, [2.4, 2.4], [2.9, 2.9], P.robe), 0.15), prism(12, -4.6, -5.4, [2.7, 2.7], [2.75, 2.75], P.gold)],
      forearm: [
        organic(prism(12, 0, -8, [2.9, 2.9], [3.8, 3.8], P.robe), 0.2),
        prism(12, -8, -9, [3.8, 3.8], [3.9, 3.9], P.gold),
        ...[-3, -5.6].map((y) => plate([0, y, 3.4], [0, 0, 1], 1.4, 1.4, 0.3, P.rune)),
      ],
      handL: [...priestHand(), ...scepter()],
      handR: priestHand(),
      // 腿藏在長袍裡，只露出蹄
      thigh: [],
      shin: [],
      foot: [mass(P.horn, [0, -1.4, 2.2], [1.6, 1.2, 2.2], 0.1, 8, 4)],
    }),
    // 背後的符文圈不停旋轉、空著的右手像在引導法術一樣緩緩畫圈；滑行時符文圈轉得更快
    poses: animate(monsterPoses({ attack: 'chop', cast: 'staff', gait: 'glide' }), {
      ready: (t) => [{ scarfB: [0, 0, t * 0.5], upperArmR: [-0.25 + Math.sin(t * 1.2) * 0.1, 0, -0.15], forearmR: [-0.35 + Math.cos(t * 1.2) * 0.12, 0, 0], handR: [-0.4, 0, 0], head: [0.05, Math.sin(t * 0.6) * 0.2, 0] }],
      run: (p) => [{ scarfB: [0, 0, p * 0.4] }],
    }),
    gaitRate: 0.8,
  },
  [{ joint: 'scarfB', parent: 'torso', offset: [0, 13, -7], meshes: runeHalo() }],
);

// ═══════════════════════════ 小惡魔 ═══════════════════════════

const I = { skin: 0xb0302a, dark: 0x6a1a16, belly: 0xd8704a, horn: 0x2a1a14, wing: 0x5a1418, wingBone: 0x2a0e0c, eye: 0xffe040, claw: 0xe8dcc8, inner: 0xe08a6a };
/**
 * 蝙蝠翼（座標以翼根為原點，掛在自己的關節上才能拍動）：上臂骨往外上方、三根指骨往下，
 * 指骨之間是翼膜（兩層薄片）。
 */
function impWing(side: 1 | -1): Mesh[] {
  const elbow: V3 = [side * 7.6, 8, -2.8];
  const tips: V3[] = [
    [side * 15.6, 10, -3.8],
    [side * 14.6, 0, -4.4],
    [side * 8.6, -7, -3.6],
  ];
  const membrane = (a: V3, b: V3, c: V3, color: number): Mesh => {
    const center: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    return plate(center, [side * 0.25, 0, -1], Math.max(Math.abs(a[1] - b[1]), Math.abs(b[1] - c[1])) * 0.75, Math.max(Math.abs(a[0] - b[0]), Math.abs(b[0] - c[0])) * 0.75, 0.2, color, 0.3);
  };
  return [
    seg([0, 0, 0], elbow, 0.75, 0.55, I.wingBone, 6),
    lowSphere(0.7, I.wingBone, elbow, 6, 3),
    spike(elbow, [elbow[0] + side * 0.6, elbow[1] + 2, elbow[2]], 0.4, I.horn),
    ...tips.flatMap((t) => {
      const mid: V3 = [(elbow[0] + t[0]) / 2, (elbow[1] + t[1]) / 2 + 0.6, (elbow[2] + t[2]) / 2];
      return [seg(elbow, mid, 0.45, 0.35, I.wingBone, 5), seg(mid, t, 0.35, 0.18, I.wingBone, 5), spike(t, [t[0] + side * 0.6, t[1] - 1.2, t[2]], 0.25, I.horn)];
    }),
    membrane([0, 0, 0], elbow, tips[2]!, I.dark),
    membrane(elbow, tips[0]!, tips[1]!, I.wing),
    membrane(elbow, tips[1]!, tips[2]!, I.dark),
    membrane([side * 4, 2, -1.6], tips[1]!, tips[2]!, I.wing),
  ];
}
const impClaw = (): Mesh[] => [
  mass(I.skin, [0, -1.4, 0.3], [1.5, 1.6, 1.3], 0.1, 8, 5),
  ...[-0.8, -0.27, 0.27, 0.8].flatMap((x) => [seg([x, -2.4, 0.6], [x * 1.2, -3.8, 1.2], 0.3, 0.26, I.skin, 5), spike([x * 1.2, -3.8, 1.2], [x * 1.3, -5.4, 2.2], 0.26, I.claw)]),
];
const IMP = withParts(
  {
    hipHeight: 29,
    referenceRadius: 0.4,
    parts: humanoid({
      root: [
        mass(I.skin, [0, 0, 0], [4.6, 3.6, 3.6], 0.1, 10, 6),
        mass(I.dark, [0, -1.4, 0.6], [3.6, 2.4, 3.2], 0.1, 8, 5),
        // 細長的尾巴（背上一排小刺），末端是箭頭
        seg([0, 0, -3], [0, -4, -8], 1, 0.8, I.skin, 7),
        seg([0, -4, -8], [0, -10, -11], 0.8, 0.6, I.skin, 7),
        seg([0, -10, -11], [0, -15, -10], 0.6, 0.4, I.dark, 7),
        ...([[0, -2, -5.8], [0, -6.6, -9.4], [0, -12, -11]] as const).map(([x, y, z]) => spike([x, y + 0.6, z], [x, y + 1.8, z - 1], 0.3, I.horn)),
        placeMesh(prism(3, 0, 3, [1.8, 0.4], [0.1, 0.1], I.horn, [0, 0, 0], 0), [-2.6, 0, 0], [0, -15, -10]),
      ],
      torso: [
        mass(I.skin, [0, 7, 0.3], [5.4, 7, 4], 0.1, 12, 8),
        mass(I.belly, [0, 5, 2.4], [3.8, 5, 2.2], 0.08, 10, 6),
        ...[1, -1].map((x) => mass(I.skin, [x * 2.4, 11, 2.6], [2.4, 2, 1.6], 0.08, 8, 5)),
        ...[3, 5.4, 7.8, 10.2, 12.6].map((y) => mass(I.dark, [0, y, -3.6], [1.2, 1, 1], 0.1, 6, 4)),
        ...[1, -1].map((x) => spike([x * 5, 14, 0], [x * 7.4, 16.4, -1], 0.6, I.horn)),
      ],
      neck: [seg([0, 0, 0], [0, 2.8, 0.6], 1.6, 1.4, I.skin, 7)],
      head: [
        // 大頭：尖耳（耳內較亮）、彎角、發光的眼、咧到耳邊的笑與尖牙、下巴的小刺
        mass(I.skin, [0, 6, 1], [5, 4.8, 4.6], 0.1, 12, 8),
        ...[1, -1].map((x) => mass(I.skin, [x * 3, 4.4, 3.4], [1.6, 1.4, 1.4], 0.08, 7, 4)),
        plate([0, 8, 4.6], [0, 0.5, 1], 1.4, 6.6, 0.8, I.dark, 0.15),
        lowSphere(1, I.eye, [1.9, 6.8, 4.9], 7, 4, [1.2, 0.8, 0.8]),
        lowSphere(1, I.eye, [-1.9, 6.8, 4.9], 7, 4, [1.2, 0.8, 0.8]),
        mass(I.dark, [0, 4.2, 5.4], [3.6, 0.7, 0.6], 0.05, 8, 4),
        ...[-1.8, -0.9, 0, 0.9, 1.8].map((x) => spike([x, 4.6, 5.6], [x, 3.6, 5.9], 0.3, I.claw)),
        ...[-1.2, 0, 1.2].map((x) => spike([x, 3.7, 5.5], [x, 4.4, 5.8], 0.25, I.claw)),
        mass(I.skin, [0, 5.6, 5.6], [0.8, 0.9, 0.9], 0.05, 6, 4),
        spike([0, 1.6, 3.6], [0, 0, 4.6], 0.5, I.dark),
        ...[1, -1].flatMap((x) => [
          spike([x * 4.4, 6.4, 0], [x * 8, 8.4, -1.4], 1.1, I.skin),
          plate([x * 5.6, 7, -0.2], [0.2, 0.1, 1], 1.2, 2.6, 0.2, I.inner),
          seg([x * 2.6, 9.8, 0.6], [x * 4, 12.4, -1.4], 0.9, 0.6, I.horn, 6),
          spike([x * 4, 12.4, -1.4], [x * 3.4, 13.4, -4.2], 0.6, I.horn),
        ]),
      ],
      upperArm: [mass(I.skin, [0, -4, 0], [1.7, 5.4, 1.7], 0.1, 8, 5), spike([0, -9, -1], [0, -9.6, -3], 0.4, I.horn)],
      forearm: [mass(I.skin, [0, -4, 0.2], [1.4, 5, 1.4], 0.1, 8, 5), prism(8, -7, -8, [1.3, 1.3], [1.3, 1.3], I.dark)],
      handL: impClaw(),
      handR: impClaw(),
      thigh: [mass(I.skin, [0, -5.6, 0], [2.4, 6.6, 2.6], 0.1, 9, 5), mass(I.dark, [0, -12, 0.6], [1.6, 1.4, 1.6], 0.1, 7, 4)],
      shin: [mass(I.dark, [0, -6, -0.4], [1.6, 6.6, 1.6], 0.1, 8, 5), spike([0, -4, -1.4], [0, -3, -3.4], 0.4, I.horn)],
      foot: [mass(I.dark, [0, -1.2, 1.2], [1.8, 1.2, 2.6], 0.1, 8, 4), ...[-0.9, 0, 0.9].map((x) => spike([x, -1.4, 3.4], [x * 1.2, -2, 5.2], 0.32, I.claw))],
    }),
    // 翅膀一直快速拍動、身體跟著一上一下地跳；跑起來拍得更快
    poses: animate(monsterPoses({ attack: 'claw', hunch: 0.25, gait: 'lope' }), {
      ready: (t) => {
        const f = Math.sin(t * 7);
        return [{ scarfA: [0, -0.25 * f, 0.4 * f], scarfB: [0, 0.25 * f, -0.4 * f], head: [0, Math.sin(t * 1.3) * 0.25, Math.sin(t * 2.1) * 0.1] }, Math.abs(Math.sin(t * 3.5)) * 1.6];
      },
      run: (p) => {
        const f = Math.sin(p * 2.5);
        return [{ scarfA: [0.2, -0.3 * f, 0.5 * f], scarfB: [0.2, 0.3 * f, -0.5 * f] }];
      },
    }),
    gaitRate: 1.25,
  },
  [
    { joint: 'scarfA', parent: 'torso', offset: [2.4, 13, -3.2], meshes: impWing(1) },
    { joint: 'scarfB', parent: 'torso', offset: [-2.4, 13, -3.2], meshes: impWing(-1) },
  ],
);

/** EnemyDef ID → 23～35 樓的新怪物 */
export const LATE_MODELS: Record<string, FigureModel> = {
  'enemy.rampart_golem': RAMPART_GOLEM,
  'enemy.chain_warden': CHAIN_WARDEN,
  'enemy.fallen_templar': FALLEN_TEMPLAR,
  'enemy.crystal_weaver': CRYSTAL_WEAVER,
  'enemy.shade_stalker': SHADE_STALKER,
  'enemy.void_maw': VOID_MAW,
  'enemy.abyss_priest': ABYSS_PRIEST,
  'enemy.imp': IMP,
};

