/**
 * 重新產生設計文件的「故事與世界觀」頁（node scripts/render-story-doc.mjs）：
 * 頁面內容在 scripts/story-doc.template.html，遺物、筆記與魂魄的文字來自 src/data/lore.json、notebook.json、souls.json，插圖是遊戲的過場影片圖。
 * 預設輸出完整 HTML → release/設計文件/故事與世界觀.html；
 * 加 --fragment <檔案> 另外輸出線上頁面（Artifact）用的內容（沒有 doctype，發布時會自動包上）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lore = JSON.parse(readFileSync(join(root, 'src/data/lore.json'), 'utf8'));
const notebook = JSON.parse(readFileSync(join(root, 'src/data/notebook.json'), 'utf8'));
const souls = JSON.parse(readFileSync(join(root, 'src/data/souls.json'), 'utf8'));

const RINGS = [
  { from: 1, to: 4, name: '遺棄地窖', note: '地面村莊的地窖' },
  { from: 5, to: 9, name: '古老墓穴', note: '第六環' },
  { from: 10, to: 14, name: '地下聖堂', note: '第五環' },
  { from: 15, to: 19, name: '熔岩礦坑', note: '第四環' },
  { from: 20, to: 24, name: '破碎要塞', note: '第三環' },
  { from: 25, to: 29, name: '深淵通道', note: '第二環' },
  { from: 30, to: 34, name: '深淵神殿', note: '第一環' },
];

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const relics = RINGS.map((ring) => {
  const items = lore
    .filter((l) => l.floor >= ring.from && l.floor <= ring.to)
    .map(
      (l) =>
        `<div class="relic"><span class="where">${l.floor} 層</span><span class="name">${esc(l.object)}</span>` +
        `<span class="text"><span class="en">${esc(l.en)}</span><span class="zh">${esc(l.zh)}</span></span></div>`,
    )
    .join('\n');
  const floors = ring.from === ring.to ? `${ring.from} 層` : `${ring.from}～${ring.to} 層`;
  return `<details><summary>${ring.name}<small>${floors} · ${ring.note}</small></summary>\n${items}\n</details>`;
}).join('\n');

const noteRows = [...notebook]
  .sort((a, b) => a.floor - b.floor)
  .map((n) => `<tr><td class="num">${n.floor} 層</td><td><span class="en">${esc(n.en)}</span><span class="zh">${esc(n.zh)}</span></td></tr>`)
  .join('\n');

const soulRows = souls
  .map((s) => `<tr><td class="num">${s.floor}</td><td>${esc(s.name)}</td><td>${s.lines.map((l) => `<span class="en">${esc(l.en)}</span><span class="zh">${esc(l.zh)}</span>`).join('')}</td></tr>`)
  .join('\n');

const image = (name, caption) => {
  const data = readFileSync(join(root, 'src/ui/cutscene/media', `${name}.jpg`)).toString('base64');
  return `<figure><div class="frame"><img src="data:image/jpeg;base64,${data}" alt="${esc(caption)}" width="1280" height="853"></div><figcaption>${esc(caption)}</figcaption></figure>`;
};

const body = readFileSync(join(root, 'scripts/story-doc.template.html'), 'utf8')
  .replace('{{LORE_COUNT}}', String(lore.length))
  .replace('{{BOOK_TOTAL}}', String(lore.length + notebook.length + souls.reduce((n, s) => n + s.lines.length, 0)))
  .replace('{{LORE}}', () => relics)
  .replace('{{SOULS}}', () => soulRows)
  .replace('{{NOTES}}', () => noteRows)
  .replace('{{IMAGE_F31}}', () => image('f31-1', '第 31 層前導：魔王只是一隻手，底下佈滿眼睛的巨物握著艾希琳的盾與劍'))
  .replace('{{IMAGE_F35}}', () => image('f35-1', '終章第一頁：艾希琳與梅芙手牽手升向井口的光'));

const out = join(root, 'release', '設計文件', '故事與世界觀.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body style="margin:0">\n${body}</body>\n</html>\n`);
console.log(out);

const fragmentAt = process.argv.indexOf('--fragment');
if (fragmentAt >= 0) {
  writeFileSync(process.argv[fragmentAt + 1], body);
  console.log(process.argv[fragmentAt + 1]);
}
