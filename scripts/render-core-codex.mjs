/**
 * 裝備圖鑑的「熔核」頁（npm run docs:cores → release/設計文件/裝備圖鑑.html 就地更新）：
 * 用遊戲的資料與融合判定算出核種表、孔數、核階核色、費用與範例，並同步飛昇費用與光芒門檻（G.balance）。
 * 熔核資料（data/cores.ts、balance.sockets / fusion / shop.ascend / gearAura）改動後執行。
 * 頁面片段：scripts/core-codex/section.html（HTML）、scripts/core-codex/script.js（繪製）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'release', '設計文件', '裝備圖鑑.html');
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { gameData } = await vite.ssrLoadModule('/src/data/index.ts');
  const { DataRegistry } = await vite.ssrLoadModule('/src/data/DataRegistry.ts');
  const { coreRangeText } = await vite.ssrLoadModule('/src/game/items/CoreDescriber.ts');
  const { coreLineValue } = await vite.ssrLoadModule('/src/game/items/CoreStats.ts');
  const { previewFusion } = await vite.ssrLoadModule('/src/game/items/FusionResolver.ts');
  const { CORE_SLOTS } = await vite.ssrLoadModule('/src/data/schema/core.ts');
  const data = DataRegistry.load(gameData);
  const b = data.balance;
  const t1 = (line) => coreRangeText(line, [coreLineValue(line, { tier: 1, power: 1 }, 0, b), coreLineValue(line, { tier: 1, power: 1 }, 1, b)], null)
    .replace('元素傷害', '附加元素傷害（核上的元素）').replace('元素抗性', '該元素抗性');
  const lineText = (line) => t1(line) + (line.minRarity ? '（紫以上）' : '') + (line.t5Value ? `（T5：+${line.t5Value[0]}～${line.t5Value[1]} 格）` : '');
  const types = data.cores.types.all.map((t) => ({
    id: t.id, name: t.name, enabled: t.enabled, family: t.family,
    source: t.weapon ? { sword: '劍', axe: '斧', bow: '弓', staff: '法杖' }[t.weapon] : (t.sourceSlots ?? []).map((x) => ({ armor: '盔甲', shield: '盾牌', boots: '鞋子', gloves: '手套', helmet: '頭盔' })[x] ?? x).join('、'),
    slots: Object.fromEntries(CORE_SLOTS.map((s) => [s, (t.slots[s] ?? []).map(lineText)])),
  }));
  const shared = data.cores.shared.map(lineText);
  // 範例（SPEC §2.4 與融合範例 #1～#5）
  const baseOf = (w) => data.items.all.find((i) => i.weaponType === w).id;
  const slotBase = (s) => data.items.all.find((i) => i.slot === s).id;
  const W = (w, rarity, lv, legendaryId, affixes = []) => ({ uid: `${w}${lv}${rarity}`, baseId: baseOf(w), rarity, itemLevel: lv, affixes, ...(legendaryId ? { legendaryId } : {}) });
  const J = (slot, rarity) => ({ uid: `${slot}${rarity}`, baseId: slotBase(slot), rarity, itemLevel: 10, affixes: [] });
  const examples = [
    ['短劍（白 2）＋手斧（白 3）', [W('sword', 'normal', 2), W('axe', 'normal', 3)], []],
    ['四把弓（白 5、藍 8、黃 9、藍 13）', [W('bow', 'normal', 5), W('bow', 'magic', 8), W('bow', 'rare', 9), W('bow', 'magic', 13)], []],
    ['裂山（橘斧 18）＋鐵斧（黃 17）＋月刃斧（藍 19）', [W('axe', 'legendary', 18, 'legendary.mountain_splitter'), W('axe', 'rare', 17), W('axe', 'magic', 19)], []],
    ['騎士長劍（黃 12）＋月刃斧（藍 12）＋裂山（橘 18）＋短杖（白 1）＋黃戒指', [W('sword', 'rare', 12), W('axe', 'magic', 12), W('axe', 'legendary', 18, 'legendary.mountain_splitter'), W('staff', 'normal', 1)], [J('ring', 'rare')]],
    ['天穹裂弦（紅弓 30）＋焚星（橘杖 28）＋寒月（橘劍 29）＋水晶杖（黃 30，火焰詞綴）＋紫戒指＋橘護身符', [W('bow', 'mythic', 30, 'mythic.sky_rending_string'), W('staff', 'legendary', 28, 'legendary.star_burner'), W('sword', 'legendary', 29, 'legendary.cold_moon'), W('staff', 'rare', 30, undefined, [{ id: 'affix.burning', rolls: [0.08] }])], [J('ring', 'epic'), J('amulet', 'legendary')]],
    ['四件鞋子（黃 20）', [0, 1, 2, 3].map((i) => ({ uid: `b${i}`, baseId: slotBase('boots'), rarity: 'rare', itemLevel: 20, affixes: [] })), []],
    ['兩把長弓（藍 25）＋兩件手套（黃 25）', [W('bow', 'magic', 25), W('bow', 'magic', 25), { uid: 'g1', baseId: slotBase('gloves'), rarity: 'rare', itemLevel: 25, affixes: [] }, { uid: 'g2', baseId: slotBase('gloves'), rarity: 'rare', itemLevel: 25, affixes: [] }], []],
  ].map(([label, inputs, jewelry]) => {
    const pv = previewFusion(inputs, jewelry, data);
    return {
      label,
      core: (pv.mixed ? `混核（${pv.types.map((t) => data.cores.types.get(t).name.replace('核', '')).join('＋')}）` : data.cores.types.get(pv.types[0]).name) + (pv.element ? `（${{ fire: '火', cold: '冰', lightning: '雷' }[pv.element]}）` : ''),
      types: pv.types, tier: pv.tier, rarity: pv.rarity, element: pv.element, lines: pv.lineCount, pure: pv.pure,
      brand: pv.brand.candidates.length ? Math.round(pv.brand.chance * 100) : 0,
      gold: pv.cost.gold, essence: pv.cost.essence,
      essenceText: Object.entries(pv.cost.materials).map(([id, n]) => `${id === 'weaponEssence' ? '武器' : '防具'} ${n}`).join('＋'),
    };
  });
  const CORES = {
    types, shared, examples,
    sockets: b.sockets, fusion: b.fusion,
    rarityPower: b.affixPower.rarity,
  };

  let html = readFileSync(file, 'utf8');
  // 1. G：飛昇費用與光芒門檻跟著遊戲資料
  const gLine = html.split('\n').find((l) => l.startsWith('const G = '));
  const G = JSON.parse(gLine.slice(10).replace(/;\s*$/, ''));
  G.balance.shop.ascend = b.shop.ascend;
  G.balance.gearAura = b.gearAura;
  html = html.replace(gLine, `const G = ${JSON.stringify(G)};`);
  // 2. 光芒表：六個門檻（熔核核階加開的兩階）
  html = html.replace(`names = ['無光', '微弱', '中等', '強', '高階'];`, `names = ['無光', '微弱', '中等', '強', '高階', '核光 I', '核光 II'];`);
  html = html.replace(`const ex = ['8 件白（0 分）、5 件藍（5 分）', '8 件藍（8 分）', '8 件黃（16 分）', '5 件紫（20 分）', '8 件紫（32 分）、2 紅 + 1 橘（31 分）'][i];`,
    `const ex = ['8 件白（0 分）、5 件藍（5 分）', '8 件藍（8 分）', '8 件黃（16 分）', '5 件紫（20 分）', '8 件紫（32 分）、2 紅 + 1 橘（31 分）', '8 件紫＋6 顆 T3 熔核（50 分）', '8 件紫＋10 顆 T5 熔核（82 分）'][i];`);
  html = html.replace(`<p class="small">身上每件裝備依稀有度給分，加總後決定光芒強度，顏色用身上最高的稀有度。只穿一件傳奇不會整個人發光。</p>`,
    `<p class="small">身上每件裝備依稀有度給分，再加上全身熔核的核階（T1 = 1 … T5 = 5），加總後決定光芒強度；顏色用身上最高的稀有度，腳下外圈的核光取全身最多的核種。只穿一件傳奇不會整個人發光。</p>`);
  html = html.replace(`<p class="small muted">精華：武器用武器精華，其他部位用防具精華。第 5 階起另需飛昇碎片`, `<p class="small muted">v0.5.0 起金幣與精華是原本的 2 倍（鑲好熔核的裝備是長期投資；飛昇後孔與熔核保留）。精華：武器用武器精華，其他部位用防具精華。第 5 階起另需飛昇碎片`);
  // 熔核頁的樣式（只加一次）
  if (!html.includes('/* 熔核（v0.5.0） */')) {
    // 插進頁面自己的樣式表（<title> 之後的那一個；第一行是本機版的外框）
    const styleEnd = html.indexOf('</style>', html.indexOf('<title>'));
    html = html.slice(0, styleEnd) + `/* 熔核（v0.5.0） */
.gem-row { display: grid; gap: 6px; margin: 4px 0 14px; }
.gem-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.gem-label { width: 8.5em; font-size: 13px; color: var(--muted); }
.gem-cell { display: grid; justify-items: center; font-size: 11px; color: var(--muted); }
#coreTable td.small, #exampleTable td.small { white-space: normal; min-width: 9em; }
.core-name { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.core-name small { color: var(--muted); font-weight: 400; }
ul.rules { margin: 0; padding-left: 1.2em; display: grid; gap: 4px; }
` + html.slice(styleEnd);
  }
  // 3. 目錄與熔核頁
  // 目錄：重複執行時不要再加一次（清掉舊的再加一個）
  html = html.replaceAll(`<a href="#cores">熔核（鑲嵌與融合）</a>`, '');
  html = html.replace(`<a href="#economy">賣價、拆解、飛昇、光芒</a></nav>`, `<a href="#cores">熔核（鑲嵌與融合）</a><a href="#economy">賣價、拆解、飛昇、光芒</a></nav>`);
  const section = readFileSync(join(root, 'scripts', 'core-codex', 'section.html'), 'utf8');
  if (html.includes('<section id="cores">')) html = html.replace(/<section id="cores">[\s\S]*?<\/section>\n\n/, '');
  html = html.replace(`  <section id="economy">`, `${section}\n  <section id="economy">`);
  const script = readFileSync(join(root, 'scripts', 'core-codex', 'script.js'), 'utf8').replace('__CORES__', JSON.stringify(CORES));
  if (html.includes('// ── 熔核（v0.5.0）')) html = html.replace(/<script>\n\/\/ ── 熔核（v0\.5\.0）[\s\S]*?<\/script>\n/, '');
  html = html.replace(`</body></html>`, `<script>\n${script}</script>\n</body></html>`);
  writeFileSync(file, html);
  console.log('裝備圖鑑（熔核頁）：', examples.map((e) => `${e.core} T${e.tier} ${e.rarity} ${e.gold}/${e.essence} brand ${e.brand}%`).join(' | '));
} finally {
  await vite.close();
}
