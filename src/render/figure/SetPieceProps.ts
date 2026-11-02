import { bar, facetize, knob, subdivide, tone } from './Facets';
import type { FigureModel, Pose } from './FigureModel';
import { MONSTER_MODELS } from './Monsters';
import { box, type Mesh, type V3 } from './Poly3D';

/**
 * 小說固定場景的擺設（只有畫面，不影響碰撞）：data/setPieces.ts 的每個場景放哪些東西。
 *
 * 模型座標：Y 向上、Z 為正面（離開後牆的方向）；約 40 單位 = 1 Tile。
 * 擺放位置：u 沿牆（0～1）、v 從後牆到前方（0～1）。
 */
const REST: Pose = { rootY: 0, angles: {} };

/** 只有一個關節的靜態模型 */
function prop(meshes: Mesh[]): FigureModel {
  return {
    hipHeight: 0,
    referenceRadius: 0.5,
    parts: [{ joint: 'root', parent: null, offset: [0, 0, 0], meshes }],
    poses: { ready: () => REST, run: () => REST, attackWindup: REST, attackStrike: REST, castWindup: REST, castRelease: REST, dead: REST, hit: REST },
  };
}

const WOOD = [0x6e4c2c, 0x523820];
const WOOD_DARK = [0x4a3320, 0x362414];
const CLOTH = [0x5c5448, 0x46402f];
const PAPER = [0xd8c8a0, 0xb8a880];
const CHALK = [0xfffaf0, 0xf0e8d8];
const SKIN = [0xd8c2a4, 0xb49c80];
const COPPER = [0xd08848, 0xa06430];

const solid = (mesh: Mesh, colors: readonly number[], seed: number, bump = 0.05): Mesh => facetize(tone(subdivide(mesh, 1, bump, seed), colors, seed), bump, seed);

/** 長桌：桌面加四條腿 */
function tableMeshes(length: number, depth: number, height: number, seed: number, extras: Mesh[] = []): Mesh[] {
  const legs: V3[] = [
    [-length / 2 + 4, height / 2 - 1, -depth / 2 + 4],
    [length / 2 - 4, height / 2 - 1, -depth / 2 + 4],
    [-length / 2 + 4, height / 2 - 1, depth / 2 - 4],
    [length / 2 - 4, height / 2 - 1, depth / 2 - 4],
  ];
  return [solid(box(length, 3, depth, WOOD[0]!, [0, height, 0]), WOOD, seed), ...legs.map((c, i) => solid(box(4, height - 2, 4, WOOD_DARK[0]!, c), WOOD_DARK, seed + i + 1)), ...extras];
}

const bowl = (x: number, z: number, y: number, seed: number) => knob(4.2, [x, y, z], [0x8a7a64, 0x6a5c48], seed, [1, 0.5, 1]);

/** 第 2 層的長桌：一家六口的空碗 */
const SUPPER_TABLE = prop(tableMeshes(112, 38, 26, 11, [-40, -14, 14, 40].flatMap((x, i) => [bowl(x, -10, 29, 20 + i), bowl(x, 10, 29, 30 + i)])));

const STOOL = prop([solid(box(16, 2.5, 16, WOOD[0]!, [0, 16, 0]), WOOD, 3), solid(box(11, 15, 11, WOOD_DARK[0]!, [0, 7.5, 0]), WOOD_DARK, 4)]);

/** 床單繃得很緊的窄床 */
const BED = prop([
  solid(box(44, 12, 96, WOOD_DARK[0]!, [0, 7, 0]), WOOD_DARK, 5),
  solid(box(40, 4, 92, CLOTH[0]!, [0, 15, 0]), CLOTH, 6, 0.02),
  solid(box(30, 4, 14, PAPER[0]!, [0, 19, -36]), PAPER, 7, 0.02),
]);

/** 小桌：紙、墨水瓶和壓紙的小石頭 */
const DESK = prop(
  tableMeshes(58, 34, 28, 41, [
    tone(box(24, 0.8, 17, PAPER[0]!, [-4, 31.8, 2]), PAPER, 42),
    knob(3, [-4, 34, 2], [0x6a6660, 0x4e4a46], 43),
    tone(box(5, 7, 5, 0x20242c, [18, 34.5, -6]), [0x20242c, 0x161a20], 44),
    bar([12, 32, 8], [22, 37, 2], 1, 1, [0xe8e0d0, 0xc8c0b0], 45),
  ]),
);

/** 掛在拉高的牆上的短木劍 */
const WOODEN_SWORD = prop([
  bar([0, 26, 1.5], [0, 50, 1.5], 4, 1.8, [0x9a7448, 0x7a5a34], 51),
  bar([-7, 26, 1.5], [7, 26, 1.5], 2.8, 2.2, WOOD, 52),
  bar([0, 26, 1.5], [0, 17, 1.5], 2.8, 2.6, WOOD, 53),
]);

/** 粉筆字的筆畫：每個字母在 4 × 6 的格子裡，一串折線 */
const GLYPHS: Record<string, readonly (readonly [number, number])[][]> = {
  A: [[[0, 0], [2, 6], [4, 0]], [[1, 2.5], [3, 2.5]]],
  C: [[[4, 5.5], [2, 6], [0, 4.5], [0, 1.5], [2, 0], [4, 0.5]]],
  D: [[[0, 0], [0, 6], [2.5, 5.5], [4, 3], [2.5, 0.5], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5.5], [2, 6], [0, 4.5], [0, 1.5], [2, 0], [4, 1], [4, 3], [2.5, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 2.5], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [[[2, 0], [0, 1.5], [0, 4.5], [2, 6], [4, 4.5], [4, 1.5], [2, 0]]],
  P: [[[0, 0], [0, 6], [3, 6], [4, 4.5], [3, 3], [0, 3]]],
  S: [[[4, 5.5], [2, 6], [0, 4.5], [1, 3.2], [3, 2.8], [4, 1.5], [2, 0], [0, 0.5]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1.5], [2, 0], [4, 1.5], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 3.5], [3, 0], [4, 6]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
};

/** 第 4 層牆上的粉筆字（lore.f4 的內容），三行；拿粉筆的人手會抖 */
const CHALK_WRITING = (() => {
  const LINES = ['COUNT THE STEPS GOING DOWN', 'COUNT THEM AGAIN COMING UP', 'THEY WILL NOT MATCH'];
  const SCALE = 1.25;
  const ADVANCE = 6.6;
  const strokes: Mesh[] = [];
  let seed = 61;
  LINES.forEach((line, row) => {
    const baseline = 42 - row * 11;
    const start = (-line.length * ADVANCE) / 2;
    [...line].forEach((letter, i) => {
      const glyph = GLYPHS[letter];
      if (!glyph) return;
      const x0 = start + i * ADVANCE;
      const wobble = ((seed * 7) % 5) * 0.12 - 0.24;
      for (const stroke of glyph) {
        for (let k = 1; k < stroke.length; k++) {
          const a = stroke[k - 1]!;
          const b = stroke[k]!;
          strokes.push(bar([x0 + a[0] * SCALE, baseline + a[1] * SCALE + wobble, 1.2], [x0 + b[0] * SCALE, baseline + b[1] * SCALE + wobble, 1.2], 0.9, 0.5, CHALK, seed++));
        }
      }
    });
  });
  return prop(strokes);
})();

/** 一隻從牆裡伸出來的手；stump：缺小指尾節、戴銅戒指（南方人） */
function handMeshes(x: number, y: number, reach: number, spread: number, seed: number, stump = false): Mesh[] {
  const wrist: V3 = [x, y - 2, reach * 0.55];
  const palm: V3 = [x + spread * 0.3, y, reach];
  const meshes: Mesh[] = [bar([x, y - 5, 0], wrist, 5.5, 5, SKIN, seed), bar(wrist, palm, 6.5, 3.5, SKIN, seed + 1)];
  const fingers = [-1.5, -0.5, 0.5, 1.5];
  fingers.forEach((f, i) => {
    const tipLength = stump && i === 3 ? 2 : 6 + ((seed + i) % 3);
    const tip: V3 = [palm[0] + f * 2.6 + spread * 0.2, y + 3 + ((seed + i) % 2), reach + tipLength];
    meshes.push(bar(palm, tip, 1.5, 1.5, SKIN, seed + 2 + i));
  });
  meshes.push(bar(palm, [palm[0] - 7, y + 2, reach + 2], 1.9, 1.9, SKIN, seed + 7));
  if (stump) meshes.push(bar([palm[0] + 0.5 * 2.6, y + 1.8, reach + 2], [palm[0] + 0.5 * 2.6 + 0.3, y + 2, reach + 3.2], 2.6, 2.6, COPPER, seed + 8));
  return meshes;
}

/** 第 19 層的手牆：20 Tile 寬，一整面牆的手；靠近地面有一隻較新的（小指缺一截、戴銅戒指） */
const HAND_WALL = (() => {
  const meshes: Mesh[] = [];
  const half = 400;
  let seed = 101;
  for (let x = -half + 10; x < half; x += 13) {
    for (const row of [0, 1, 2, 3]) {
      const n = (seed * 2654435761) >>> 0;
      if (row === 3 && n % 3 === 0) {
        seed += 9;
        continue;
      }
      const jitterX = (n % 9) - 4;
      const y = 12 + row * 15 + ((n >> 4) % 5);
      const reach = 5 + ((n >> 8) % 12);
      const spread = ((n >> 12) % 9) - 4;
      meshes.push(...handMeshes(x + jitterX, y, reach, spread, seed));
      seed += 9;
    }
  }
  meshes.push(...handMeshes(half * 0.64, 6, 28, 2, 901, true));
  return prop(meshes);
})();

/** 圍著長桌坐著的死人（看向門口）：有骷髏也有爛到一半的 */
const SITTING: Pose = {
  rootY: -9,
  angles: {
    thighL: [-1.45, 0, 0.08],
    thighR: [-1.45, 0, -0.08],
    shinL: [1.45, 0, 0],
    shinR: [1.45, 0, 0],
    upperArmL: [-0.6, 0, 0.1],
    upperArmR: [-0.6, 0, -0.1],
    forearmL: [-0.5, 0, 0],
    forearmR: [-0.5, 0, 0],
  },
};

export interface SetPieceProp {
  model: FigureModel;
  u: number;
  v: number;
  pose?: Pose;
  /** 額外的朝向：forward = 朝前方（預設）、side = 轉 90 度 */
  turn?: 'forward' | 'side';
  scale?: number;
}

const DEAD = (u: number, v: number, kind: string, scale = 1): SetPieceProp[] => [
  { model: STOOL, u, v },
  { model: MONSTER_MODELS[kind]!, u, v, pose: SITTING, scale },
];

/** 第 18 層靠牆坐著的女屍（lore.mavis）：矮小的骨頭，身上是改小過還是太大的盔甲，少一條小腿，膝蓋綁著繩子，手攏著布袋 */
const ARMOR = [0x6f7278, 0x55585e];
const LEATHER = [0x6a4a2a, 0x4e3620];
const ROPE = [0xb09a68, 0x8c784e];
const GOLD = [0xc8a858, 0xa08440];
const BONE = [0xd8ceb4, 0xb4a88c];

/** 圓和八道光：騎士團的紋章 */
const crest = (y: number, z: number): Mesh[] => [
  knob(1.6, [0, y, z], GOLD, 71, [1, 1, 0.4]),
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return bar([Math.cos(a) * 1.8, y + Math.sin(a) * 1.8, z], [Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, z], 0.5, 0.5, GOLD, 72 + i);
  }),
];

const MAVIS_ADDED: Record<string, Mesh[]> = {
  root: [
    solid(box(13, 5, 9, LEATHER[0]!, [0, 0, 0]), LEATHER, 80),
    // 攏在手裡的布袋
    knob(2.8, [1, 3, 7.5], [0x7a6444, 0x5e4c32], 81, [1, 0.9, 0.9]),
  ],
  torso: [solid(box(15, 15, 10, ARMOR[0]!, [0, 8, -0.5]), ARMOR, 82, 0.1), ...crest(9, 5)],
  head: [knob(5.6, [0, 5.4, -1.4], [0x5a3c24, 0x46301c], 83, [1, 0.8, 1])],
  upperArmL: [knob(4.6, [0.6, -0.5, 0], ARMOR, 84, [1, 0.8, 1.1])],
  upperArmR: [knob(4.6, [-0.6, -0.5, 0], ARMOR, 85, [1, 0.8, 1.1])],
  handL: [knob(1.8, [0, -1, 0], BONE, 86)],
  handR: [knob(1.8, [0, -1, 0], BONE, 87)],
  // 自己綁的繩子：斷在膝蓋下面
  thighL: [bar([-2.6, -11.5, 0], [2.6, -11.5, 0], 3, 1.2, ROPE, 88), bar([-2.6, -9.8, 0.3], [2.6, -9.8, 0.3], 3, 1, ROPE, 89)],
};

const MAVIS_BODY: FigureModel = {
  ...MONSTER_MODELS['enemy.skeleton']!,
  parts: MONSTER_MODELS['enemy.skeleton']!.parts.map((part) => {
    // 拿掉骷髏兵的劍與盾、破布，還有那條不在了的小腿
    const gone = ['shinL', 'footL', 'handL', 'handR', 'cloth'].includes(part.joint);
    return { ...part, meshes: [...(gone ? [] : part.meshes), ...(MAVIS_ADDED[part.joint] ?? [])] };
  }),
};

const SEATED_AGAINST_WALL: Pose = {
  rootY: -21,
  angles: {
    torso: [-0.12, 0, 0],
    head: [0.42, 0.25, 0],
    thighL: [-1.42, 0, 0.22],
    thighR: [-1.38, 0, -0.14],
    shinR: [0.42, 0, 0],
    upperArmL: [0.28, 0, 0.12],
    forearmL: [-1.3, 0, -0.5],
    upperArmR: [0.34, 0, -0.14],
    forearmR: [-1.36, 0, 0.5],
  },
};

/** 掉在她手邊的骰子，朝上是六 */
const DIE = prop([
  solid(box(3, 3, 3, 0xe8e0cc, [0, 1.5, 0]), [0xe8e0cc, 0xd0c8b0], 91, 0),
  ...[-0.8, 0.8].flatMap((x) => [-0.8, 0, 0.8].map((z) => box(0.5, 0.15, 0.5, 0x2a2018, [x, 3.05, z]))),
]);

/** 屍體的擺設：u = 往旁邊幾 Tile、v = 往前幾 Tile（以她坐的位置為準） */
export const CORPSE_PROPS: readonly SetPieceProp[] = [
  { model: MAVIS_BODY, u: 0, v: 0, pose: SEATED_AGAINST_WALL, scale: 0.92 },
  { model: DIE, u: 0.42, v: 0.62 },
];

export const SET_PIECE_PROPS: Record<string, readonly SetPieceProp[]> = {
  'piece.dead_supper': [
    { model: SUPPER_TABLE, u: 0.5, v: 0.5 },
    ...DEAD(0.38, 0.36, 'enemy.ghoul'),
    ...DEAD(0.5, 0.36, 'enemy.skeleton'),
    ...DEAD(0.62, 0.36, 'enemy.ghoul', 0.72),
    ...DEAD(0.38, 0.66, 'enemy.skeleton'),
    ...DEAD(0.5, 0.66, 'enemy.ghoul'),
    ...DEAD(0.62, 0.66, 'enemy.skeleton', 0.72),
  ],
  'piece.chalk_wall': [{ model: CHALK_WRITING, u: 0.5, v: 0 }],
  'piece.captain_room': [
    { model: BED, u: 0.2, v: 0.28 },
    { model: DESK, u: 0.72, v: 0.22 },
    { model: STOOL, u: 0.72, v: 0.42 },
  ],
  'piece.hand_wall': [{ model: HAND_WALL, u: 0.5, v: 0 }],
  'piece.master_room': [
    { model: BED, u: 0.22, v: 0.34 },
    { model: DESK, u: 0.75, v: 0.26 },
    { model: WOODEN_SWORD, u: 0.5, v: 0 },
  ],
};
