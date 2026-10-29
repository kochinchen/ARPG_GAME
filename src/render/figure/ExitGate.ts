import { facetize, knob, subdivide, tone } from './Facets';
import type { FigureModel, Pose } from './FigureModel';
import { box, lowSphere, prism, type Mesh, type V3 } from './Poly3D';

/**
 * 出口（多面體）：兩根石柱撐著拱頂的石門，底下一層石階。
 * 未開啟：門洞裡是一塊有鐵箍的暗色石板（ex_door）；開啟：石板消失，換成發光的傳送門（ex_portal）。
 * 用 phaseHidden 切換：setPhase(0) = 關、setPhase(1) = 開。
 *
 * 模型座標：Y 向上、Z 為門的正面。
 */
const STONE = [0x6e6878, 0x4e4858];
const STONE_DARK = [0x46404e, 0x34303c];
const IRON = [0x3a3c44, 0x2a2c32];
const RUNE = [0xb07cff, 0x8a5ad8];
const PORTAL = [0xc8a0ff, 0x9a6ae8];
const CORE = [0xf0e0ff, 0xd8c0ff];

const HALF = 15;
const PILLAR_H = 44;

const stone = (mesh: Mesh, colors: readonly number[], seed: number, rough = 0.05): Mesh => facetize(tone(subdivide(mesh, 1, rough, seed), colors, seed), 0.08, seed);

function frame(): Mesh[] {
  const meshes: Mesh[] = [
    // 底下的石階
    stone(box(HALF * 2 + 12, 2.4, 14, STONE_DARK[0]!, [0, 1.2, 0]), STONE_DARK, 1),
  ];
  for (const s of [-1, 1]) {
    const c: V3 = [s * HALF, 0, 0];
    // 石柱：柱座、柱身（八角）、柱頭
    meshes.push(stone(box(8, 4, 8, STONE_DARK[0]!, [c[0], 4.4, 0]), STONE_DARK, 10 + s));
    meshes.push(stone(prism(8, 6, PILLAR_H, [3.2, 3.2], [2.8, 2.8], STONE[0]!, c), STONE, 20 + s, 0.03));
    meshes.push(stone(box(8, 3, 8, STONE_DARK[0]!, [c[0], PILLAR_H + 1.5, 0]), STONE_DARK, 30 + s));
    // 柱身上的符文（開啟時也一樣亮著）
    meshes.push(facetize(tone(box(1.2, 10, 0.8, RUNE[0]!, [c[0], 26, 3]), RUNE, 40 + s), 0.1, 40 + s));
  }
  // 拱頂：五塊楔石排成弧形，中間的拱心石較高
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2;
    const x = t * (HALF - 1);
    const y = PILLAR_H + 4 + (1 - t * t) * 6;
    meshes.push(stone(box(i === 2 ? 7 : 6.4, i === 2 ? 8 : 6, 7, STONE[0]!, [x, y, 0]), STONE, 50 + i));
  }
  meshes.push(knob(2.2, [0, PILLAR_H + 11, 3.6], RUNE, 60));
  return meshes;
}

/** 關著的門：石板 + 三道鐵箍 + 鉚釘 */
function door(): Mesh[] {
  const h = PILLAR_H - 4;
  return [
    stone(box(HALF * 2 - 6, h, 2.4, STONE_DARK[0]!, [0, 2.4 + h / 2, 0]), STONE_DARK, 70, 0.03),
    ...[10, 22, 34].map((y, i) => facetize(tone(box(HALF * 2 - 5, 1.6, 1, IRON[0]!, [0, y, 1.5]), IRON, 72 + i), 0.08, 72 + i)),
    ...[-7, 7].map((x, i) => knob(1, [x, 22, 2.1], IRON, 76 + i)),
  ];
}

/** 開啟的傳送門：門洞裡一面橢圓的光，中間更亮 */
function portal(): Mesh[] {
  return [
    facetize(tone(subdivide(lowSphere(1, PORTAL[0]!, [0, 24, 0], 12, 7, [HALF - 3.5, 20, 1]), 1), PORTAL, 80), 0.05, 80),
    facetize(tone(lowSphere(1, CORE[0]!, [0, 22, 0.6], 10, 6, [7, 13, 0.8]), CORE, 81), 0.05, 81),
  ];
}

const REST: Pose = { rootY: 0, angles: {} };

export const EXIT_GATE: FigureModel = {
  hipHeight: 0,
  referenceRadius: 0.5,
  parts: [
    { joint: 'root', parent: null, offset: [0, 0, 0], meshes: frame() },
    { joint: 'ex_door', parent: 'root', offset: [0, 0, 0], meshes: door() },
    { joint: 'ex_portal', parent: 'root', offset: [0, 0, 0], meshes: portal() },
  ],
  phaseHidden: [['ex_portal'], ['ex_door']],
  poses: { ready: () => REST, run: () => REST, attackWindup: REST, attackStrike: REST, castWindup: REST, castRelease: REST, hit: REST, dead: REST },
};
