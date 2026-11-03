/**
 * 工具頁打包成單一 HTML（npm run package:sim），file:// 直接開啟，不需要伺服器：
 * 魔王模擬器 → release/魔王模擬器.html；敵方範圍圖 → release/設計文件/敵方範圍圖.html
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineHtml } from './inline-html.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'release', '.build-sim');
const PAGES = [
  ['boss-sim.html', join(root, 'release', '魔王模擬器.html')],
  ['area-chart.html', join(root, 'release', '設計文件', '敵方範圍圖.html')],
];

for (const [page, out] of PAGES) {
  execFileSync('npx', ['vite', 'build', '-c', 'scripts/vite.boss-sim.config.ts', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit', env: { ...process.env, TOOL_PAGE: page } });
  const html = inlineHtml(readFileSync(join(build, page), 'utf8'), build);
  if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('仍有未內嵌的檔案');
  writeFileSync(out, html);
  rmSync(build, { recursive: true, force: true });
  console.log(`完成：${out}（${(statSync(out).size / 1024 / 1024).toFixed(1)} MB）`);
}
