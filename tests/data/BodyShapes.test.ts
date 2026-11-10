import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import { figureScale, skinVerts, solveJoints, type FigureModel } from '../../src/render/figure/FigureModel';
import { MONSTER_MODELS } from '../../src/render/figure/Monsters';
import { apply, type V3 } from '../../src/render/figure/Poly3D';

/**
 * 身體的地面範圍（設計者 2026-11-10）：每隻怪物的模型（待機姿勢）從正上方投影到地面，
 * 細長的尖角、尾巴尖、武器去掉，取外圍的凸多邊形（最多 12 個點）。結果存在 src/data/bodyShapes.json，
 * 換模型後執行 `UPDATE_BODY_SHAPES=1 npx vitest run tests/data/BodyShapes.test.ts` 重新產生。
 */
const FILE = new URL('../../src/data/bodyShapes.json', import.meta.url).pathname;
/** 模型的 1 單位在地上是幾格（PolyFigure 的 SCALE ÷ 一格在畫面上的寬度） */
const UNIT = 0.95 / Math.hypot(32, 32);
const MAX_POINTS = 12;

type P2 = [number, number];

/** 模型的所有三角形投影到地面（[右手邊, 前方] 格） */
function groundTriangles(m: FigureModel, k: number): [P2, P2, P2][] {
  const w = solveJoints(m.parts, m.hipHeight, m.poses.ready(0));
  const out: [P2, P2, P2][] = [];
  const g = (v: V3): P2 => [v[0] * k, v[2] * k];
  if (m.skin) {
    const verts = skinVerts(m.skin, w);
    for (const f of m.skin.faces) out.push([g(verts[f.idx[0]]!), g(verts[f.idx[1]]!), g(verts[f.idx[2]]!)]);
  }
  for (const part of m.parts) {
    const frame = w.get(part.joint);
    if (!frame) continue;
    for (const mesh of part.meshes) {
      const verts = mesh.verts.map((v) => {
        const q = apply(frame.m, v);
        return g([frame.p[0] + q[0], frame.p[1] + q[1], frame.p[2] + q[2]]);
      });
      for (const f of mesh.faces) for (let i = 1; i < f.idx.length - 1; i++) out.push([verts[f.idx[0]!]!, verts[f.idx[i]!]!, verts[f.idx[i + 1]!]!]);
    }
  }
  return out;
}

function convexHull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P2[]) => {
    const h: P2[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** 投影 → 格點（塗滿三角形、補內部的洞）→ 去掉細長的部分（侵蝕再膨脹）→ 凸多邊形 → 簡化成 MAX_POINTS 點 */
export function bodyShape(m: FigureModel, radius: number, collision: number): P2[] | null {
  const tris = groundTriangles(m, UNIT * figureScale(m, radius));
  if (tris.length === 0) return null;
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const t of tris) {
    for (const p of t) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
  }
  const cell = Math.max(0.03, Math.max(x1 - x0, y1 - y0) / 40);
  // 去掉寬度在約 0.25 格以下的細長部分（侵蝕 / 膨脹的格數）
  const thin = Math.max(2, Math.ceil(0.12 / cell));
  const W = Math.ceil((x1 - x0) / cell) + 3;
  const H = Math.ceil((y1 - y0) / cell) + 3;
  const at = (x: number, y: number) => [Math.floor((x - x0) / cell) + 1, Math.floor((y - y0) / cell) + 1] as const;
  const grid = new Uint8Array(W * H);
  for (const [a, b, c] of tris) {
    const [ax, ay] = at(Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]));
    const [bx, by] = at(Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (const p of [a, b, c]) {
      const [i, j] = at(p[0], p[1]);
      grid[j * W + i] = 1;
    }
    if (Math.abs(area) < 1e-12) continue;
    for (let j = ay; j <= by; j++) {
      for (let i = ax; i <= bx; i++) {
        const px = x0 + (i - 0.5) * cell;
        const py = y0 + (j - 0.5) * cell;
        const u = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const v = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        if (u >= 0 && v >= 0 && u + v <= 1) grid[j * W + i] = 1;
      }
    }
  }
  // 外面淹水，淹不到的格子是身體裡面
  const outside = new Uint8Array(W * H);
  const stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const n = stack.pop()!;
    const i = n % W;
    const j = (n - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const k = nj * W + ni;
      if (outside[k] || grid[k]) continue;
      outside[k] = 1;
      stack.push(k);
    }
  }
  const solid = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && !outside[j * W + i];
  // 侵蝕再膨脹：細長的尖角、尾巴尖、武器去掉
  let cur = (i: number, j: number) => solid(i, j);
  for (let step = 0; step < thin; step++) {
    const prev = cur;
    const next = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) next[j * W + i] = prev(i, j) && prev(i + 1, j) && prev(i - 1, j) && prev(i, j + 1) && prev(i, j - 1) ? 1 : 0;
    cur = (i, j) => i >= 0 && j >= 0 && i < W && j < H && next[j * W + i] === 1;
  }
  for (let step = 0; step < thin; step++) {
    const prev = cur;
    const next = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) next[j * W + i] = prev(i, j) || prev(i + 1, j) || prev(i - 1, j) || prev(i, j + 1) || prev(i, j - 1) ? 1 : 0;
    cur = (i, j) => i >= 0 && j >= 0 && i < W && j < H && next[j * W + i] === 1;
  }
  const corners: P2[] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!cur(i, j)) continue;
      const cx = x0 + (i - 1) * cell;
      const cy = y0 + (j - 1) * cell;
      corners.push([cx, cy], [cx + cell, cy], [cx, cy + cell], [cx + cell, cy + cell]);
    }
  }
  if (corners.length === 0) return null;
  // 至少包住原本的碰撞圓：模型比碰撞圓細的地方（骷髏的背後）不會比以前更容易貼近
  for (let i = 0; i < 16; i++) corners.push([Math.sin((i / 16) * Math.PI * 2) * collision, Math.cos((i / 16) * Math.PI * 2) * collision]);
  const hull = convexHull(corners);
  // 簡化：每次拿掉「拿掉後少掉的面積最小」的點
  const tri = (a: P2, b: P2, c: P2) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  while (hull.length > MAX_POINTS) {
    let best = 0;
    let bestArea = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const area = tri(hull[(i - 1 + hull.length) % hull.length]!, hull[i]!, hull[(i + 1) % hull.length]!);
      if (area < bestArea) [best, bestArea] = [i, area];
    }
    hull.splice(best, 1);
  }
  // 模型的 +X 是右手邊、+Z 是前方；[右手邊, 前方] 的平面裡維持逆時針
  return hull.map(([x, z]): P2 => [Math.round(x * 100) / 100 + 0, Math.round(z * 100) / 100 + 0]);
}

const data = DataRegistry.load(gameData);
const shapes = (): Record<string, P2[]> => {
  const out: Record<string, P2[]> = {};
  for (const e of data.enemies.all) {
    const m = MONSTER_MODELS[e.id];
    if (!m) continue;
    // 碰撞圓的上限同 EnemyFactory（一般怪 0.5、魔王 0.8）
    const shape = bodyShape(m, e.radius * e.size, Math.min(e.boss ? 0.8 : 0.5, e.radius * e.size));
    if (shape) out[e.id] = shape;
  }
  return out;
};

describe('身體的地面範圍', () => {
  const computed = shapes();
  if (process.env.UPDATE_BODY_SHAPES) writeFileSync(FILE, `${JSON.stringify(computed, null, 0).replace(/\],"/g, '],\n"')}\n`);

  it('和目前的模型一致（換模型後要重新產生）', () => {
    const saved = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, P2[]>;
    expect(Object.keys(saved).sort()).toEqual(Object.keys(computed).sort());
    for (const [id, shape] of Object.entries(computed)) expect(saved[id], id).toEqual(shape);
  });

  it('每個輪廓都是逆時針的凸多邊形，而且包住角色的中心', () => {
    for (const [id, shape] of Object.entries(computed)) {
      for (let i = 0; i < shape.length; i++) {
        const a = shape[i]!;
        const b = shape[(i + 1) % shape.length]!;
        // 中心 (0, 0) 在每條邊的左邊
        expect((b[0] - a[0]) * (0 - a[1]) - (b[1] - a[1]) * (0 - a[0]), id).toBeGreaterThan(-1e-9);
      }
    }
  });

  it('大型怪的身體比碰撞圓大得多：角甲巨獸的頭在中心前方 2 格以上', () => {
    const brute = computed['enemy.horned_brute']!;
    expect(Math.max(...brute.map((p) => p[1]))).toBeGreaterThan(2);
  });
});
