/**
 * 設計文件放上 GitHub Pages（npm run docs:pages）：
 * 把 release/設計文件/ 的本機版複製到 docs/design/（檔名改成英文，網址比較乾淨），並產生目錄頁。
 * 改完本機版設計文件後執行，再 commit / push。
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'release', '設計文件');
const out = join(root, 'docs', 'design');

const PAGES = [
  { from: '怪物與樓層.html', to: 'monsters.html', title: '怪物與樓層', text: '怪物屬性、樓層難度成長、精英怪、極限挑戰與魔王；可切換到模型圖。' },
  { from: '裝備圖鑑.html', to: 'items.html', title: '裝備圖鑑', text: '六種稀有度、掉落機率、裝備基底、詞綴、傳奇與神話裝備。' },
  { from: '角色成長模擬.html', to: 'growth.html', title: '角色成長模擬', text: '成長表、屬性點與技能點模擬器、三段 Combo 測試。' },
  { from: '組合技圖鑑.html', to: 'combos.html', title: '組合技圖鑑', text: 'Q / W / E 連段的組合技規則、所有會觸發的排列與連段試算。' },
  { from: '開發歷程.html', to: 'history.html', title: '開發歷程', text: '開發方法與時間軸。' },
];
const ASSETS = ['sim.js', 'models'];

for (const name of [...PAGES.map((p) => p.from), ...ASSETS]) {
  if (!existsSync(join(src, name))) throw new Error(`找不到 release/設計文件/${name}`);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const p of PAGES) cpSync(join(src, p.from), join(out, p.to));
for (const a of ASSETS) cpSync(join(src, a), join(out, a), { recursive: true, filter: (f) => !f.endsWith('.DS_Store') });

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>地牢冒險 設計文件</title>
<style>
:root { --bg: #FDFDFD; --ink: #0E2442; --ink-2: #2C4E82; --muted: #7d6547; --line: #ECECEB; --accent: #D78212; color-scheme: light; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #0b1c33; --ink: #eef2f7; --ink-2: #a5d5e7; --muted: #c9b18f; --line: #213a5c; --accent: #EFA23A; color-scheme: dark; }
}
:root[data-theme="dark"] { --bg: #0b1c33; --ink: #eef2f7; --ink-2: #a5d5e7; --muted: #c9b18f; --line: #213a5c; --accent: #EFA23A; color-scheme: dark; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.7 "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif; }
.wrap { max-width: 760px; margin: 0 auto; padding: 48px 16px 72px; display: grid; gap: 24px; }
.eyebrow { font-size: 13px; letter-spacing: .14em; color: var(--muted); }
h1 { margin: 0; font-size: clamp(28px, 6vw, 40px); }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
a.card { display: grid; gap: 2px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 10px; color: inherit; text-decoration: none; }
a.card:hover, a.card:focus-visible { border-color: var(--accent); outline: none; }
a.card b { color: var(--ink-2); font-size: 18px; }
a.card span { color: var(--muted); font-size: 14px; }
.play { color: var(--accent); font-weight: 700; }
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">地牢冒險 Dungeon Adventure · 設計文件</div>
  <h1>設計文件</h1>
  <p><a class="play" href="../">▶ 開始遊玩</a></p>
  <ul>
${PAGES.map((p) => `    <li><a class="card" href="${p.to}"><b>${esc(p.title)}</b><span>${esc(p.text)}</span></a></li>`).join('\n')}
  </ul>
</div>
</body>
</html>
`,
);
console.log(`設計文件 → ${out}（${PAGES.length} 頁 + 目錄）`);
