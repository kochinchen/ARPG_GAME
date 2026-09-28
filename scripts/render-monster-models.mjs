/**
 * 產生「怪物與樓層」設計文件的模型圖：每隻怪物與女主角依遊戲比例並排，四個方向、待機姿勢，輸出成 SVG。
 * 投影、背面剔除、深度排序、光線與遊戲內的 PolyFigure 相同（不經過 PixiJS）。
 *
 *   npm run docs:models        → release/設計文件/models/*.svg 與 manifest.js
 *   node scripts/render-monster-models.mjs <輸出資料夾>
 *
 * 模型有改動時重新執行，頁面（release/設計文件/怪物與樓層.html）會讀取新的 manifest.js，不用改頁面。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, 'release', '設計文件', 'models'));

// 用 Vite 載入 TypeScript 原始碼（不啟動 HTTP 伺服器）
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { enemies } = await vite.ssrLoadModule('/src/data/enemies.ts');
  const { solveJoints } = await vite.ssrLoadModule('/src/render/figure/FigureModel.ts');
  const { HEROINE } = await vite.ssrLoadModule('/src/render/figure/Heroine.ts');
  const { MONSTER_MODELS } = await vite.ssrLoadModule('/src/render/figure/Monsters.ts');
  const { apply, dot, faceNormal, normalize } = await vite.ssrLoadModule('/src/render/figure/Poly3D.ts');

  const VIEW = normalize([1, 0.82, 1]);
  const LIGHT = normalize([0.15, 1.2, 1.1]);
  const RIM = [255, 168, 110];
  /** 四個方向（World 面向 → 模型轉身角度）：正面、右前、側面、背面 */
  const DIRS = { front: Math.atan2(1, 1), frontright: Math.atan2(1, 0), side: Math.atan2(1, -1), back: Math.atan2(-1, -1) };
  /** 女主角的碰撞半徑（影子的基準） */
  const HERO_RADIUS = 0.3;
  const SKIP = new Set(['enemy.training_dummy']);

  const shade = (c, k) => [16, 8, 0].map((s) => Math.max(0, Math.min(255, Math.round(((c >> s) & 0xff) * k))));
  const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

  /** 畫一個模型的所有可見面（畫面座標；scale = 模型單位 → 畫面） */
  function faces(model, yaw, scale) {
    const world = solveJoints(model.parts, model.hipHeight, model.poses.ready(0), yaw);
    const soft = model.softLight ?? false;
    const rim = model.rimLight ?? 0;
    const out = [];
    for (const part of model.parts) {
      const { m, p } = world.get(part.joint);
      for (const mesh of part.meshes) {
        const verts = mesh.verts.map((v) => {
          const r = apply(m, v);
          return [p[0] + r[0], p[1] + r[1], p[2] + r[2]];
        });
        for (const f of mesh.faces) {
          const n = normalize(faceNormal(verts, f.idx));
          const fv = dot(n, VIEW);
          if (fv <= 0) continue;
          let depth = 0;
          const pts = [];
          for (const i of f.idx) {
            const v = verts[i];
            depth += dot(v, VIEW);
            pts.push((v[0] - v[2]) * 0.707 * scale, ((v[0] + v[2]) * 0.354 - v[1] * 0.94) * scale);
          }
          const d = dot(n, LIGHT);
          const lit = soft ? Math.max(0, (d + 0.45) / 1.45) : Math.max(0, d);
          let rgb = shade(f.color, 0.5 + 0.62 * lit);
          if (rim > 0) {
            const k = rim * Math.max(0, 1 - fv * 2.2) * (1 - lit);
            rgb = rgb.map((c, i) => Math.min(255, c + Math.round(RIM[i] * k)));
          }
          out.push({ depth: depth / f.idx.length, color: hex(rgb), pts });
        }
      }
    }
    return out.sort((a, b) => a.depth - b.depth);
  }
  const xsOf = (list) => list.flatMap((f) => f.pts.filter((_, i) => i % 2 === 0));
  const ysOf = (list) => list.flatMap((f) => f.pts.filter((_, i) => i % 2 === 1));
  const path = (f, dx) => `<path d="M${f.pts.map((v, i) => (i % 2 === 0 ? v + dx : v).toFixed(1)).join(' ')}Z" fill="${f.color}"/>`;

  // 遊戲中的顯示大小 = 碰撞半徑 × 體型倍率（魔王的 size）÷ 模型設計半徑
  const radius = new Map(enemies.map((e) => [e.id, e.radius * (e.size ?? 1)]));
  mkdirSync(outDir, { recursive: true });
  const manifest = {};
  for (const [id, model] of Object.entries(MONSTER_MODELS)) {
    const r = radius.get(id);
    if (r === undefined || SKIP.has(id)) continue;
    const key = id.replace('enemy.', '');
    for (const [dir, yaw] of Object.entries(DIRS)) {
      const mon = faces(model, yaw, (r / model.referenceRadius) * (model.visualScale ?? 1) * 0.95);
      const hero = faces(HEROINE, yaw, 0.95);
      const mx = xsOf(mon);
      const hx = xsOf(hero);
      // 女主角放在怪物右側，中間留 10 的間距
      const dx = Math.max(...mx) - Math.min(...hx) + 10;
      const xs = [...mx, ...hx.map((v) => v + dx)];
      const ys = [...ysOf(mon), ...ysOf(hero)];
      const [x0, x1, y0, y1] = [Math.min(...xs) - 8, Math.max(...xs) + 8, Math.min(...ys) - 8, Math.max(...ys) + 14];
      const shadowR = (r / HERO_RADIUS) * 12 * (model.visualScale ?? 1);
      const shadows =
        `<ellipse cx="0" cy="0" rx="${shadowR.toFixed(1)}" ry="${(shadowR * 0.45).toFixed(1)}" fill="#000" fill-opacity=".35"/>` +
        `<ellipse cx="${(dx + (Math.max(...hx) + Math.min(...hx)) / 2).toFixed(1)}" cy="0" rx="12" ry="5" fill="#000" fill-opacity=".35"/>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}">${shadows}${mon.map((f) => path(f, 0)).join('')}${hero.map((f) => path(f, dx)).join('')}</svg>`;
      writeFileSync(join(outDir, `${key}-${dir}.svg`), svg);
      if (dir === 'front') {
        const monH = -Math.min(...ysOf(mon));
        const heroH = -Math.min(...ysOf(hero));
        manifest[key] = { ratio: +(monH / heroH).toFixed(2), height: +monH.toFixed(1), vb: {} };
      }
      manifest[key].vb[dir] = [Math.round(x1 - x0), Math.round(y1 - y0)];
    }
  }
  // 頁面用 <script src> 讀取（本機直接開啟 HTML 也能用）
  writeFileSync(join(outDir, 'manifest.js'), `window.MONSTER_MODELS = ${JSON.stringify(manifest)};\n`);
  console.log(`完成：${Object.keys(manifest).length} 隻怪物 × 4 個方向 → ${outDir}`);
} finally {
  await vite.close();
}
