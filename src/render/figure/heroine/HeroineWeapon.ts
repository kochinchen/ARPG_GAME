import { detail, tone } from '../Facets';
import { apply, box, jointRotation, lowSphere, placeMesh, prism, type Mesh, type V3 } from '../Poly3D';
import { BLADE, GOLD, LEATHER_DARK } from './HeroinePalette';

/**
 * 單手長劍（weapon 關節，掛在右手）：柄頭、纏皮握把、護手（兩端上翹）、
 * 菱形斷面的劍身（四個面：亮 / 中 / 暗 / 中，形成楔形）、邊緣亮面、劍尖。
 * 劍沿 -Y 建出後轉到握把方向，再依 SWORD_CANT 往下斜（待機時劍尖朝前下）。
 */

export const SWORD_CANT = 0.8;
const BLADE_LEN = 20;
const TIP = 3.4;

function swordMeshes(): Mesh[] {
  const blade = prism(4, -2.4, -BLADE_LEN, [0.3, 1.35], [0.26, 1.15], BLADE[0], [0, 0, 0], 0);
  // 四個側面依序：亮、中、暗、中（兩個端面用中間色）
  const sides = [BLADE[0], BLADE[1], BLADE[2], BLADE[3], BLADE[1], BLADE[1]];
  blade.faces.forEach((f, i) => (f.color = sides[i] ?? BLADE[1]));
  const tip = prism(4, -BLADE_LEN, -BLADE_LEN - TIP, [0.26, 1.15], [0.03, 0.05], BLADE[0], [0, 0, 0], 0);
  tip.faces.forEach((f, i) => (f.color = sides[i] ?? BLADE[1]));
  return [
    tone(lowSphere(1, GOLD[0], [0, 3.4, 0], 6, 3), GOLD),
    tone(prism(6, 2.7, -1.3, [0.6, 0.6], [0.62, 0.62], LEATHER_DARK[0]), LEATHER_DARK),
    tone(box(1, 1.1, 6.2, GOLD[0], [0, -1.8, 0]), GOLD, 1),
    blade,
    tip,
    ...detail(1, [
      tone(placeMesh(box(0.8, 1.6, 0.8, GOLD[1]), [0.5, 0, 0], [0, -1.4, 3.3]), GOLD, 2),
      tone(placeMesh(box(0.8, 1.6, 0.8, GOLD[1]), [-0.5, 0, 0], [0, -1.4, -3.3]), GOLD, 3),
      ...[1.8, 0.2].map((y) => tone(prism(6, y + 0.25, y - 0.25, [0.72, 0.72], [0.72, 0.72], GOLD[2]), GOLD)),
    ]),
    // 邊緣亮面（放大時才看得到）
    ...detail(2, [box(0.12, BLADE_LEN - 3, 0.25, 0xf6f8fb, [0, -BLADE_LEN / 2 - 1.5, 1.2]), box(0.12, BLADE_LEN - 3, 0.25, 0xf6f8fb, [0, -BLADE_LEN / 2 - 1.5, -1.2])]),
  ];
}

const ROT: V3 = [SWORD_CANT - Math.PI / 2, 0, 0];

export function heroineSword(): Mesh[] {
  return swordMeshes().map((m) => {
    const placed = placeMesh(m, ROT, [0, 0, 0]);
    if (m.lod) placed.lod = m.lod;
    return placed;
  });
}

/** 劍尖在 weapon 關節座標中的位置（裝備光芒的拖尾） */
export const SWORD_TIP: V3 = apply(jointRotation(ROT), [0, -BLADE_LEN - TIP, 0]);
