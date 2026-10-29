import { facetize, knob, subdivide, tone } from './Facets';
import type { FigureModel, Pose } from './FigureModel';
import { box, prism, type Mesh, type V3 } from './Poly3D';

/**
 * 往上的樓梯（多面體）：四階石階往後升高，每一階由三塊鑿過的石塊拼成，兩側是石砌的扶牆，
 * 頂端的平台上有兩根短石柱，中間浮著一支金色箭頭（往上）。
 *
 * 模型座標：Y 向上、Z 為樓梯正面（最低的一階），往 −Z 升高。
 */
const STONE = [0xb89a68, 0x8e744c];
const STONE_DARK = [0x7a6446, 0x5a4832];
const ARROW = [0xf2e2b8, 0xd8b870];

/** 階數、每階的高與深、寬度 */
const STEPS = 4;
const RISE = 6;
const RUN = 6;
const WIDTH = 30;

/** 鑿過的石塊：加密一次、頂點略為起伏，再切成小三角面 */
const stone = (mesh: Mesh, colors: readonly number[], seed: number): Mesh => facetize(tone(subdivide(mesh, 1, 0.05, seed), colors, seed), 0.08, seed);

function stairsParts(): Mesh[] {
  const meshes: Mesh[] = [];
  const front = (STEPS * RUN) / 2;
  for (let i = 0; i < STEPS; i++) {
    const top = (i + 1) * RISE;
    const z = front - RUN * (i + 0.5);
    // 一階三塊石頭，寬度錯開（看得出石縫）
    const widths = i % 2 ? [9, 12, 9] : [11, 9, 10];
    let x = -WIDTH / 2;
    widths.forEach((w, k) => {
      meshes.push(stone(box(w - 0.4, top - 0.2, RUN - 0.3, STONE[0]!, [x + w / 2, top / 2, z]), STONE, i * 10 + k));
      x += w;
    });
    // 兩側的扶牆（比階面高一點）
    for (const s of [-1, 1]) meshes.push(stone(box(3, top + 2.5, RUN, STONE_DARK[0]!, [s * (WIDTH / 2 + 1.5), (top + 2.5) / 2, z]), STONE_DARK, 50 + i * 2 + (s > 0 ? 1 : 0)));
  }
  // 頂端平台與兩根短石柱（柱頭是圓石）
  const back = front - STEPS * RUN;
  const landing = STEPS * RISE;
  meshes.push(stone(box(WIDTH + 6, landing + 1, 6, STONE_DARK[0]!, [0, (landing + 1) / 2, back - 3]), STONE_DARK, 70));
  for (const s of [-1, 1]) {
    const c: V3 = [s * (WIDTH / 2 + 1), 0, back - 3];
    meshes.push(facetize(tone(subdivide(prism(6, landing, landing + 11, [2.6, 2.6], [2.2, 2.2], STONE[0]!, c), 1, 0.04, 80), STONE, 80), 0.08, 80));
    meshes.push(knob(2.8, [c[0], landing + 12.5, c[2]], STONE, 82 + s));
  }
  // 金色箭頭（往上）：箭桿 + 四角錐
  const arrowAt: V3 = [0, 0, back - 1];
  meshes.push(facetize(tone(prism(4, landing + 4, landing + 10, [1.4, 1.4], [1.4, 1.4], ARROW[0]!, arrowAt), ARROW, 90), 0.06, 90));
  meshes.push(facetize(tone(prism(4, landing + 10, landing + 17, [4.2, 4.2], [0.05, 0.05], ARROW[0]!, arrowAt), ARROW, 91), 0.06, 91));
  return meshes;
}

const REST: Pose = { rootY: 0, angles: {} };

export const STAIRS: FigureModel = {
  hipHeight: 0,
  referenceRadius: 0.5,
  parts: [{ joint: 'root', parent: null, offset: [0, 0, 0], meshes: stairsParts() }],
  poses: { ready: () => REST, run: () => REST, attackWindup: REST, attackStrike: REST, castWindup: REST, castRelease: REST, hit: REST, dead: REST },
};
