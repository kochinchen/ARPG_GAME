import { describe, expect, it } from 'vitest';
import { refine } from '../../src/render/figure/Facets';
import { box, dot, faceNormal, lowSphere, placeMesh, prism, stretchMeshes, type Mesh, type V3 } from '../../src/render/figure/Poly3D';
import { tierLook } from '../../src/render/figure/weapons/WeaponLooks';
import { armorSpec, heroineOutfit } from '../../src/render/figure/gear/ArmorLooks';

const center = (m: Mesh): V3 => m.verts.reduce<V3>((s, v) => [s[0] + v[0] / m.verts.length, s[1] + v[1] / m.verts.length, s[2] + v[2] / m.verts.length], [0, 0, 0]);
/** 朝內的面（法線與「面中心 − 網格中心」反向）的數量 */
function inward(m: Mesh, c: V3): number {
  return m.faces.filter((f) => {
    const fc = f.idx.reduce<V3>((s, i) => [s[0] + m.verts[i]![0] / f.idx.length, s[1] + m.verts[i]![1] / f.idx.length, s[2] + m.verts[i]![2] / f.idx.length], [0, 0, 0]);
    return dot(faceNormal(m.verts, f.idx), [fc[0] - c[0], fc[1] - c[1], fc[2] - c[2]]) <= 0;
  }).length;
}

describe('加密成小三角面（refine）', () => {
  it('四邊形、三角形、多邊形切開後每個小三角形仍然朝外', () => {
    for (const m of [box(4, 4, 4, 0xffffff), lowSphere(3, 0xffffff, [0, 0, 0], 8, 5), prism(9, 0, 6, [3, 3], [2, 2], 0xffffff)]) {
      const r = refine(m, { size: 0.7, bump: 0.05 });
      expect(r.faces.length).toBeGreaterThan(m.faces.length);
      expect(inward(r, center(m))).toBe(0);
    }
  });

  it('帶著加密前的網格（沒有放大時畫）；移動、縮放時一起移動', () => {
    const m = box(4, 4, 4, 0xffffff);
    const r = refine(m, { size: 1 });
    expect(r.coarse).toBe(m);
    const placed = placeMesh(r, [0, 0, 0], [10, 0, 0]);
    expect(placed.coarse!.verts[0]![0]).toBeCloseTo(m.verts[0]![0] + 10);
    const [stretched] = stretchMeshes([r], [1, 2, 1]);
    expect(stretched!.coarse!.verts[0]![1]).toBeCloseTo(m.verts[0]![1] * 2);
  });

  it('太小或太細長、面內沒有點可以起伏的面不切', () => {
    const thin = box(0.5, 8, 0.5, 0xffffff);
    expect(refine(thin, { size: 1 }).faces.length).toBe(12);
  });

  it('武器與防具：遠距離的粗網格維持原本的面數，放大時是小三角面', () => {
    const tris = (ms: readonly Mesh[]) => ms.reduce((s, m) => s + m.faces.length, 0);
    const sword = tierLook('sword', 4).meshes;
    expect(tris(sword.map((m) => m.coarse ?? m))).toBeLessThan(400);
    expect(tris(sword)).toBeGreaterThan(tris(sword.map((m) => m.coarse ?? m)) * 3);
    const outfit = heroineOutfit({ helmet: armorSpec('helmet', 8, 'normal', []), armor: armorSpec('armor', 8, 'normal', []), boots: armorSpec('boots', 8, 'normal', []) });
    const parts = [...outfit.values()].flat();
    expect(parts.every((m) => m.coarse || m.faces.length < 40)).toBe(true);
  });
});
