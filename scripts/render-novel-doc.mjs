/**
 * 重新產生小說《井誌》（node scripts/render-novel-doc.mjs）：
 * 中文正文在 scripts/novel/*.md，英文正文在 scripts/novel/en/（檔名相同的前兩碼），頁面樣式在 scripts/novel-doc.template.html；
 * `::lore.f1`、`::note.p08`、`::soul.f5#0`、`::panel.f1-1` 由 src/data 的遊戲文字與過場圖填入，不重打一次。
 * 69 頁與 12 幅過場各必須剛好出現一次，中英文的章節與引用順序必須相同，不符就報錯。
 * 預設輸出完整 HTML → release/設計文件/井誌小說.html；加 --fragment <檔案> 另外輸出線上頁面（Artifact）用的內容。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (name) => JSON.parse(readFileSync(join(root, 'src/data', name), 'utf8'));
const lore = data('lore.json');
const notebook = data('notebook.json');
const souls = data('souls.json');
const cutscenes = data('cutscenes.json');
const labels = JSON.parse(readFileSync(join(root, 'scripts/novel/en/labels.json'), 'utf8'));

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
/** 同一段文字的中英文版本，由頁面的語言切換決定顯示哪一個 */
const both = (zh, en) => `<span class="l-zh">${zh}</span><span class="l-en" lang="en">${en}</span>`;

// 頁碼與遊戲的《井誌》相同（src/data/book.ts）：依樓層排序，同一層依魂魄 → 遺物 → 筆記
const pages = new Map();
const ordered = [
  ...souls.flatMap((s) => s.lines.map((line, i) => ({ id: `soul.${s.id.split('.')[1]}#${i}`, source: s.id, kind: 'soul', order: 0, floor: s.floor, label: s.name, smoke: s.smoke, line }))),
  ...lore.map((l) => ({ id: l.id, source: l.id, kind: 'lore', order: 1, floor: l.floor, label: l.object, line: l })),
  ...notebook.map((n) => ({ id: n.id, source: 'note', kind: 'note', order: 2, floor: n.floor, label: '挑戰者的筆記', line: n })),
];
ordered.sort((a, b) => a.floor - b.floor || a.order - b.order).forEach((p, i) => pages.set(p.id, { ...p, number: i + 1 }));

const panels = new Map(cutscenes.flatMap((c) => c.panels.map((p) => [p.image, p])));
const used = new Set();

function pageHtml(id, floor) {
  const page = pages.get(id);
  if (!page) throw new Error(`沒有這一頁：${id}`);
  if (used.has(id)) throw new Error(`重複引用：${id}`);
  if (floor !== null && floor !== page.floor) throw new Error(`${id} 屬於第 ${page.floor} 層，卻放在第 ${floor} 層`);
  const labelEn = labels[page.source];
  if (!labelEn) throw new Error(`labels.json 缺少：${page.source}`);
  used.add(id);
  const smoke = page.smoke ? ` smoke-${page.smoke}` : '';
  return (
    `<aside class="page ${page.kind}${smoke}"><p class="tag"><span>${both(esc(page.label), esc(labelEn))}</span><span>P.${String(page.number).padStart(2, '0')}</span></p>` +
    `<p class="en" lang="en">${esc(page.line.en)}</p><p class="zh">${esc(page.line.zh)}</p></aside>`
  );
}

function panelHtml(image) {
  const panel = panels.get(image);
  if (!panel) throw new Error(`沒有這幅過場：${image}`);
  if (used.has(image)) throw new Error(`重複引用：${image}`);
  used.add(image);
  const src = readFileSync(join(root, 'src/ui/cutscene/media', `${image}.jpg`)).toString('base64');
  const lines = panel.lines.map((l) => `<p class="en" lang="en">${esc(l.en)}</p><p class="zh">${esc(l.zh)}</p>`).join('');
  return (
    `<figure class="panel"><div class="frame"><img src="data:image/jpeg;base64,${src}" alt="${esc(panel.title)}" width="1280" height="853" loading="lazy"></div>` +
    `<figcaption><p class="title" lang="en">${esc(panel.title)}</p>${lines}</figcaption></figure>`
  );
}

/** 「第二十三層」→ 23；序章、終章的章名不是樓層，不檢查 */
function cnFloor(title) {
  const m = /^第(.+)層$/.exec(title);
  if (!m) return null;
  const d = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const [tens, ones] = m[1].includes('十') ? m[1].split('十') : ['', m[1]];
  return (m[1].includes('十') ? (tens ? d[tens] : 1) * 10 : 0) + (ones ? d[ones] : 0);
}

/** 把一個語言的原稿解析成 卷 → 章 → 段落與引用 */
function parse(dir, files) {
  const parts = [];
  for (const file of files) {
    for (const raw of readFileSync(join(dir, file), 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const chapter = parts.at(-1)?.chapters.at(-1);
      if (line.startsWith('# ')) parts.push({ title: line.slice(2), sub: '', chapters: [] });
      else if (line.startsWith('## ')) parts.at(-1).chapters.push({ title: line.slice(3), blocks: [[]] });
      else if (line.startsWith('::')) chapter.blocks.push(line.slice(2), []);
      else if (chapter) chapter.blocks.at(-1).push(line);
      else parts.at(-1).sub = line;
    }
  }
  return parts;
}

const dirZh = join(root, 'scripts/novel');
const dirEn = join(dirZh, 'en');
const zh = parse(dirZh, readdirSync(dirZh).filter((f) => f.endsWith('.md')).sort());
const en = parse(dirEn, readdirSync(dirEn).filter((f) => f.endsWith('.md')).sort());

// 結尾的簽名：草書字形存成向量，離線也看得到（SIL OFL 字型的外框）
const signature = JSON.parse(readFileSync(join(root, 'scripts/novel-signature.json'), 'utf8'));

const body = [];
const toc = [];
let chapterCount = 0;
let wordsZh = 0;
let wordsEn = 0;
if (zh.length !== en.length) throw new Error(`卷數不同：中文 ${zh.length}，英文 ${en.length}`);
zh.forEach((part, p) => {
  const partEn = en[p];
  if (part.chapters.length !== partEn.chapters.length) throw new Error(`${part.title} 章數不同`);
  const tocEntry = [];
  body.push(`<div class="part"><h2 class="part-title">${both(esc(part.title), esc(partEn.title))}</h2>`);
  if (part.sub) body.push(`<p class="part-sub">${both(esc(part.sub), esc(partEn.sub))}</p>`);
  part.chapters.forEach((chapter, c) => {
    const chapterEn = partEn.chapters[c];
    const id = `c${++chapterCount}`;
    const floor = cnFloor(chapter.title);
    tocEntry.push(`<a href="#${id}">${both(esc(chapter.title.replace(/^第(.+)層$/, '$1')), esc(chapterEn.title.replace(/^Floor /, '')))}</a>`);
    body.push(`<section class="chapter" id="${id}"><h3>${both(esc(chapter.title), esc(chapterEn.title))}</h3>`);
    const refsZh = chapter.blocks.filter((b) => typeof b === 'string').join();
    const refsEn = chapterEn.blocks.filter((b) => typeof b === 'string').join();
    if (refsZh !== refsEn) throw new Error(`${chapter.title} 的引用順序不同：\n中 ${refsZh}\n英 ${refsEn}`);
    chapter.blocks.forEach((block, b) => {
      if (typeof block === 'string') {
        if (block === 'blank') {
          body.push(`<div class="sign"><div class="sign-name l-zh">${signature.zh}</div><div class="sign-name l-en">${signature.en}</div><p class="blank"></p></div>`);
        }
        else if (block.startsWith('panel.')) body.push(panelHtml(block.slice(6)));
        else body.push(pageHtml(block, floor));
        return;
      }
      const blockEn = chapterEn.blocks[b];
      wordsZh += [...block.join('').replace(/\s/g, '')].length;
      wordsEn += blockEn.join(' ').split(/\s+/).filter(Boolean).length;
      if (block.length) body.push(`<div class="l-zh">${block.map((l) => `<p>${inline(l)}</p>`).join('')}</div>`);
      if (blockEn.length) body.push(`<div class="l-en" lang="en">${blockEn.map((l) => `<p>${inline(l)}</p>`).join('')}</div>`);
    });
    body.push('</section>');
  });
  body.push('</div>');
  toc.push(`<li><span class="toc-part">${both(esc(part.title), esc(partEn.title))}</span><span class="toc-links">${tocEntry.join('')}</span></li>`);
});

const missing = [...pages.keys(), ...panels.keys()].filter((id) => !used.has(id));
if (missing.length) throw new Error(`還沒引用：${missing.join('、')}`);
if (chapterCount !== 40) throw new Error(`應該有 40 章，現在是 ${chapterCount} 章`);

const page = readFileSync(join(root, 'scripts/novel-doc.template.html'), 'utf8')
  .replace('{{TOC}}', () => toc.join('\n'))
  .replace('{{BODY}}', () => body.join('\n'));

const out = join(root, 'release', '設計文件', '井誌小說.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body style="margin:0">\n${page}</body>\n</html>\n`);
console.log(out);
console.log(`${chapterCount} 章；中文正文 ${wordsZh} 字；英文正文 ${wordsEn} 字；引用 ${pages.size} 頁、${panels.size} 幅過場`);

const fragmentAt = process.argv.indexOf('--fragment');
if (fragmentAt >= 0) {
  writeFileSync(process.argv[fragmentAt + 1], page);
  console.log(process.argv[fragmentAt + 1]);
}
