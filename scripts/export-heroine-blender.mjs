/**
 * 把女主角 3D 構面模型（src/tools/heroine3d/）連骨架交給 Blender，存成可編輯的 .blend 與 Three.js 用的 .glb。
 *
 *   npm run art:heroine        → art/heroine/heroine.blend、art/heroine/heroine.glb
 *
 * 注意：會覆蓋 art/heroine/heroine.blend 與 heroine.glb（在 Blender 改過的版本會不見）；
 * 輸出前若檔案已存在，會先備份成 *.bak-時間。
 * Blender 路徑可用環境變數 BLENDER 指定（預設 /Applications/Blender.app/Contents/MacOS/Blender）。
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'art', 'heroine');
const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';

const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let data;
try {
  const { JOINTS } = await vite.ssrLoadModule('/src/tools/heroine3d/skeleton.ts');
  const { buildVolumes } = await vite.ssrLoadModule('/src/tools/heroine3d/volumes.ts');
  const { PALETTE } = await vite.ssrLoadModule('/src/tools/heroine3d/palette.ts');
  const parts = [];
  for (const [joint, tris] of buildVolumes()) for (const [mat, pos] of tris.byMat) parts.push({ joint, mat, pos });
  data = { joints: JOINTS, parts, palette: PALETTE };
} finally {
  await vite.close();
}

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
for (const f of ['heroine.blend', 'heroine.glb']) {
  const p = join(outDir, f);
  if (existsSync(p)) copyFileSync(p, `${p}.bak-${stamp}`);
}
const json = join(tmpdir(), `heroine-${process.pid}.json`);
writeFileSync(json, JSON.stringify(data));
execFileSync(blender, ['--background', '--factory-startup', '--python', join(root, 'scripts', 'heroine_blender.py'), '--', json, outDir], {
  stdio: 'inherit',
});
console.log(`已輸出 ${join(outDir, 'heroine.blend')} 與 heroine.glb`);
