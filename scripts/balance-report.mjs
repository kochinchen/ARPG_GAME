// 難度報告頁（scripts/balance.mjs 呼叫）：把模擬結果對照目標，輸出單一 HTML（不需外部程式庫）。

const BUILD_LABELS = { melee: '近戰（劍盾）', ranged: '弓箭', magic: '法術（法杖）' };
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v * 100)}%`);
const sec = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v.toFixed(1)} 秒`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function quantile(values, q) {
  const v = values.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const i = (v.length - 1) * q;
  const lo = Math.floor(i);
  return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo);
}
const median = (v) => quantile(v, 0.5);
const rate = (runs) => (runs.length ? runs.filter((r) => r.deaths > 0).length / runs.length : null);

/** 數值在 [lo, hi] 內 = ok；超出 = no；沒有資料 = 空 */
function band(value, [lo, hi]) {
  if (value === null) return '';
  return value >= lo - 1e-9 && value <= hi + 1e-9 ? 'ok' : 'no';
}
const atMost = (value, max) => (value === null || max === null ? '' : value <= max + 1e-9 ? 'ok' : 'no');
const atLeast = (value, min) => (value === null || min === null ? '' : value >= min - 1e-9 ? 'ok' : 'no');
const rangeText = ([lo, hi]) => (lo === 0 ? `≤ ${pct(hi)}` : hi >= 1 ? `≥ ${pct(lo)}` : `${pct(lo)}–${pct(hi)}`);

function stats(runs) {
  const normal = runs.filter((r) => r.persona === 'normal');
  const rusher = runs.filter((r) => r.persona === 'rusher');
  const idle = runs.filter((r) => r.persona === 'idle');
  const fighters = [...normal, ...rusher];
  const idleTtd = idle.map((r) => r.timeToDie ?? 60);
  return {
    normalDeath: rate(normal),
    rusherDeath: rate(rusher),
    normalTimeout: normal.length ? normal.filter((r) => r.timedOut).length / normal.length : null,
    burst1s: quantile(normal.map((r) => r.burst1s), 0.9),
    burst1sMax: quantile(fighters.map((r) => r.burst1s), 1),
    bossBurst: quantile(fighters.filter((r) => r.bossFloor).map((r) => r.bossBurst1s), 0.9),
    burst5s: median(normal.map((r) => r.burst5s)),
    timeToDie: idle.length ? median(idleTtd) : null,
    clearTime: median(normal.filter((r) => r.cleared).map((r) => r.time)),
    potions: median(normal.filter((r) => r.cleared).map((r) => r.potions)),
    minHp: median(normal.filter((r) => r.deaths === 0).map((r) => r.minHpPct)),
    nearDeaths: normal.reduce((s, r) => s + r.nearDeaths, 0),
    level: median(runs.map((r) => r.level)),
    n: { normal: normal.length, rusher: rusher.length, idle: idle.length },
  };
}

/** 折線圖（樓層 → 數值）：多條線 + 目標帶 */
function lineChart({ title, series, max, bands = [], yFormat = pct, floors }) {
  const W = 760;
  const H = 220;
  const L = 44;
  const R = 12;
  const T = 14;
  const B = 28;
  const x = (f) => L + ((f - floors[0]) / Math.max(1, floors[floors.length - 1] - floors[0])) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, max) / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const bandRects = bands
    .map((b) => `<rect x="${x(b.from) - 4}" y="${y(b.hi)}" width="${x(b.to) - x(b.from) + 8}" height="${Math.max(1, y(b.lo) - y(b.hi))}" class="band"/>`)
    .join('');
  const lines = series
    .map((s) => {
      const pts = s.points.filter((p) => p.v !== null);
      if (pts.length === 0) return '';
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.f).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
      const dots = pts.map((p) => `<circle cx="${x(p.f).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.6" class="${s.cls}"><title>第 ${p.f} 層：${yFormat(p.v)}</title></circle>`).join('');
      return `<path d="${d}" class="line ${s.cls}"/>${dots}`;
    })
    .join('');
  const grid = ticks
    .map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 4}" class="axis" text-anchor="end">${yFormat(t)}</text>`)
    .join('');
  const xt = floors
    .filter((f) => f === floors[0] || f % 5 === 0)
    .map((f) => `<text x="${x(f)}" y="${H - 8}" class="axis" text-anchor="middle">${f}</text>`)
    .join('');
  const legend = series.map((s) => `<span class="key"><i class="${s.cls}"></i>${esc(s.label)}</span>`).join('');
  return `<figure class="chart"><figcaption>${esc(title)}<span class="legend">${legend}${bands.length ? '<span class="key"><i class="bandkey"></i>目標範圍</span>' : ''}</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${bandRects}${lines}${xt}</svg></figure>`;
}

export function renderReport(results, targets, { seeds, date, mode = 'snapshot' }) {
  const labelOf = (b) => BUILD_LABELS[b] ?? results.find((r) => r.build === b)?.label ?? b;
  const floors = [...new Set(results.map((r) => r.floor))].sort((a, b) => a - b);
  const builds = [...new Set(results.map((r) => r.build))];
  const byFloor = new Map(floors.map((f) => [f, results.filter((r) => r.floor === f)]));
  const isBoss = (f) => byFloor.get(f).some((r) => r.bossFloor);
  const issues = [];

  // 區段總表（死亡率只算一般樓層；魔王層另外一列）
  const tierRows = targets.tiers
    .map((t) => {
      const inTier = floors.filter((f) => f >= t.floors[0] && f <= t.floors[1]);
      if (inTier.length === 0) return '';
      const normalFloors = inTier.filter((f) => !isBoss(f));
      const s = stats(normalFloors.flatMap((f) => byFloor.get(f)));
      const all = stats(inTier.flatMap((f) => byFloor.get(f)));
      const c = {
        normal: band(s.normalDeath, t.normalDeath),
        rusher: band(s.rusherDeath, t.rusherDeath),
        burst: atMost(all.burst1s, t.burst1s),
        ttd: atLeast(all.timeToDie, t.timeToDie),
      };
      if (c.normal === 'no') issues.push(`${t.label}：正常型死亡率 ${pct(s.normalDeath)}，目標 ${rangeText(t.normalDeath)}`);
      if (c.rusher === 'no') issues.push(`${t.label}：莽撞型死亡率 ${pct(s.rusherDeath)}，目標 ${rangeText(t.rusherDeath)}`);
      if (c.burst === 'no') issues.push(`${t.label}：一秒內最大受傷（九成場次）${pct(all.burst1s)}，上限 ${pct(t.burst1s)}`);
      if (c.ttd === 'no') issues.push(`${t.label}：站著不動 ${sec(all.timeToDie)} 就倒下，目標 ≥ ${t.timeToDie} 秒`);
      const cell = (cls, value, target) => `<td class="${cls}"><b>${value}</b><small>目標 ${target}</small></td>`;
      return `<tr><th>${esc(t.label)}<small>Lv ${all.level ?? '—'}</small></th>
${normalFloors.length ? cell(c.normal, pct(s.normalDeath), rangeText(t.normalDeath)) : '<td>—</td>'}
${normalFloors.length ? cell(c.rusher, pct(s.rusherDeath), rangeText(t.rusherDeath)) : '<td>—</td>'}
${cell(c.burst, pct(all.burst1s), `≤ ${pct(t.burst1s)}`)}
${cell(c.ttd, sec(all.timeToDie), `≥ ${t.timeToDie} 秒`)}
<td>${pct(all.burst5s)}</td><td>${sec(all.clearTime)}</td><td>${all.potions ?? '—'}</td><td>${pct(all.minHp)}</td><td>${pct(all.normalTimeout)}</td></tr>`;
    })
    .join('');

  // 各區段的主要傷害來源（正常型 + 莽撞型）與最後一擊
  const sourceRows = targets.tiers
    .map((t) => {
      const runs = results.filter((r) => r.floor >= t.floors[0] && r.floor <= t.floors[1] && r.persona !== 'idle' && r.damageBy);
      if (runs.length === 0) return '';
      const total = new Map();
      for (const r of runs) for (const [k, v] of Object.entries(r.damageBy)) total.set(k, (total.get(k) ?? 0) + v);
      const sum = [...total.values()].reduce((a, b) => a + b, 0) || 1;
      const top = [...total].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${esc(k)} <small class="inline">${pct(v / sum)}</small>`);
      const killers = new Map();
      for (const r of runs) if (r.killer) killers.set(r.killer, (killers.get(r.killer) ?? 0) + 1);
      const topKillers = [...killers].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${esc(k)} <small class="inline">${n} 次</small>`);
      return `<tr><th>${esc(t.label)}</th><td class="list">${top.join('<br>')}</td><td class="list">${topKillers.join('<br>') || '—'}</td></tr>`;
    })
    .join('');

  const bossFloors = floors.filter(isBoss);
  const boss = stats(bossFloors.flatMap((f) => byFloor.get(f)));
  const bossCls = band(boss.normalDeath, targets.bossFloor.normalDeath);
  if (bossCls === 'no') issues.push(`魔王層：正常型死亡率 ${pct(boss.normalDeath)}，目標 ${rangeText(targets.bossFloor.normalDeath)}`);

  // 流派差異：各流派一般樓層的正常型死亡率與清層時間
  const buildRows = builds
    .map((b) => {
      const s = stats(results.filter((r) => r.build === b && !r.bossFloor));
      return `<tr><th>${esc(labelOf(b))}</th><td>${pct(s.normalDeath)}</td><td>${pct(s.rusherDeath)}</td><td>${sec(s.clearTime)}</td><td>${pct(s.burst1s)}</td><td>${sec(s.timeToDie)}</td></tr>`;
    })
    .join('');

  // 每層明細
  const floorRows = floors
    .map((f) => {
      const runs = byFloor.get(f);
      const s = stats(runs);
      const perBuild = builds
        .map((b) => {
          const bs = stats(runs.filter((r) => r.build === b));
          return `<td>${pct(bs.normalDeath)} / ${pct(bs.rusherDeath)}</td>`;
        })
        .join('');
      return `<tr${isBoss(f) ? ' class="boss"' : ''}><th>${f}${isBoss(f) ? ' <span class="tag">魔王</span>' : ''}</th><td>${s.level ?? '—'}</td>${perBuild}<td>${pct(s.burst1s)}</td><td>${pct(s.bossBurst)}</td><td>${sec(s.timeToDie)}</td><td>${sec(s.clearTime)}</td><td>${s.potions ?? '—'}</td><td>${pct(s.minHp)}</td></tr>`;
    })
    .join('');

  const perFloor = (fn) => floors.map((f) => ({ f, v: fn(stats(byFloor.get(f))) }));
  const tierBands = (key) => targets.tiers.map((t) => ({ from: t.floors[0], to: t.floors[1], lo: t[key][0], hi: Math.min(1, t[key][1]) }));
  const deathChart = lineChart({
    title: '每層死亡率（過關前至少死一次）',
    floors,
    max: 1,
    series: [
      { label: '正常型', cls: 's1', points: perFloor((s) => s.normalDeath) },
      { label: '莽撞型', cls: 's2', points: perFloor((s) => s.rusherDeath) },
    ],
    bands: tierBands('rusherDeath'),
  });
  const burstChart = lineChart({
    title: '一秒內最大受傷（正常型，九成場次低於）',
    floors,
    max: 1,
    series: [
      { label: '一般怪群', cls: 's1', points: perFloor((s) => s.burst1s) },
      { label: '五秒內受傷（中位數）', cls: 's3', points: perFloor((s) => s.burst5s) },
    ],
    bands: targets.tiers.map((t) => ({ from: t.floors[0], to: t.floors[1], lo: 0, hi: t.burst1s })),
  });
  const ttdMax = Math.max(12, ...floors.map((f) => stats(byFloor.get(f)).timeToDie ?? 0));
  const ttdChart = lineChart({
    title: '站著不動到倒下（秒，中位數）',
    floors,
    max: ttdMax,
    yFormat: (v) => `${Math.round(v)}`,
    series: [{ label: '站樁', cls: 's1', points: perFloor((s) => s.timeToDie) }],
    bands: targets.tiers.map((t) => ({ from: t.floors[0], to: t.floors[1], lo: t.timeToDie, hi: ttdMax })),
  });

  const total = results.length;
  const summary = issues.length ? `超出目標 ${issues.length} 項：\n- ${issues.join('\n- ')}` : '全部在目標內';
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>難度報告</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;900&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root {
  --bg: #FDFDFD; --surface: #f6f4ef; --ink: #0E2442; --ink-2: #2C4E82; --muted: #7d6547;
  --line: #ECECEB; --line-2: #d9d4c9; --ok: #2f7a4d; --no: #9a4b3c; --ok-bg: #e7f2ea; --no-bg: #f7e6e1;
  --s1: #2C4E82; --s2: #D78212; --s3: #5A9DBB; --band: rgba(239, 194, 98, 0.22);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0b1c33; --surface: #10243f; --ink: #eef2f7; --ink-2: #a5d5e7; --muted: #c9b18f;
    --line: #213a5c; --line-2: #2d4a70; --ok: #7fd19b; --no: #f0a08c; --ok-bg: #133a2a; --no-bg: #3d2020;
    --s1: #A5D5E7; --s2: #EFA23A; --s3: #5A9DBB; --band: rgba(239, 194, 98, 0.16);
  }
}
:root[data-theme="dark"] {
  --bg: #0b1c33; --surface: #10243f; --ink: #eef2f7; --ink-2: #a5d5e7; --muted: #c9b18f;
  --line: #213a5c; --line-2: #2d4a70; --ok: #7fd19b; --no: #f0a08c; --ok-bg: #133a2a; --no-bg: #3d2020;
  --s1: #A5D5E7; --s2: #EFA23A; --s3: #5A9DBB; --band: rgba(239, 194, 98, 0.16);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 'Noto Sans TC', system-ui, sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font: 900 30px/1.2 'Noto Serif TC', serif; margin: 0 0 6px; }
h2 { font: 600 20px/1.3 'Noto Serif TC', serif; margin: 40px 0 10px; }
.meta { color: var(--muted); margin: 0 0 20px; }
.note { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; }
.note li { margin: 2px 0; }
.issues { border-left: 4px solid var(--no); }
.issues.clear { border-left-color: var(--ok); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { border-bottom: 1px solid var(--line); padding: 7px 10px; text-align: right; white-space: nowrap; vertical-align: top; }
thead th { color: var(--muted); font-weight: 500; font-size: 13px; border-bottom: 1px solid var(--line-2); }
tbody th { text-align: left; font-weight: 500; }
th small, td small { display: block; color: var(--muted); font-size: 11.5px; font-weight: 400; }
td.ok { background: var(--ok-bg); } td.ok b { color: var(--ok); }
td.no { background: var(--no-bg); } td.no b { color: var(--no); }
tr.boss th { color: var(--s2); }
.tag { font-size: 11px; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; }
.chart { margin: 18px 0; }
.chart figcaption { font-weight: 500; display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
.legend { display: inline-flex; flex-wrap: wrap; gap: 12px; font-weight: 400; font-size: 13px; color: var(--muted); }
.key i { display: inline-block; width: 12px; height: 3px; margin-right: 5px; vertical-align: middle; }
.key i.s1 { background: var(--s1); } .key i.s2 { background: var(--s2); } .key i.s3 { background: var(--s3); }
.key i.bandkey { background: var(--band); height: 10px; }
svg { width: 100%; height: auto; display: block; }
.grid { stroke: var(--line); } .axis { fill: var(--muted); font-size: 11px; }
.band { fill: var(--band); }
.line { fill: none; stroke-width: 2; } .line.s1 { stroke: var(--s1); } .line.s2 { stroke: var(--s2); } .line.s3 { stroke: var(--s3); }
circle.s1 { fill: var(--s1); } circle.s2 { fill: var(--s2); } circle.s3 { fill: var(--s3); }
td.list { text-align: left; white-space: normal; }
small.inline { display: inline; color: var(--muted); }
code { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
</style>
</head>
<body><main>
<h1>難度報告${mode === 'save' ? '（存檔角色）' : mode === 'preset' ? '（預設角色：50 級全紫鑲滿黃核）' : mode === 'boss' ? '（31～35 層魔王：60～68 級，紫 / 橘裝鑲滿黃核）' : ''}</h1>
<p class="meta">${esc(date)} · ${total} 場模擬（每個樓層 × 流派 × 機器人 ${seeds} 個種子）· <code>npm run balance</code></p>

<div class="note issues${issues.length ? '' : ' clear'}">
<b>${issues.length ? `超出目標 ${issues.length} 項` : '全部在目標內'}</b>
${issues.length ? `<ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
</div>

<h2>各區段</h2>
<div class="scroll"><table>
<thead><tr><th>區段</th><th>正常型死亡率</th><th>莽撞型死亡率</th><th>一秒內最大受傷</th><th>站著不動到倒下</th><th>五秒內受傷</th><th>清層時間</th><th>喝水</th><th>最低血量</th><th>逾時</th></tr></thead>
<tbody>${tierRows}
<tr class="boss"><th>魔王層<small>${bossFloors.join('、') || '—'}</small></th><td class="${bossCls}"><b>${pct(boss.normalDeath)}</b><small>目標 ${rangeText(targets.bossFloor.normalDeath)}</small></td><td>${pct(boss.rusherDeath)}</td><td>${pct(boss.bossBurst)}<small>魔王一秒內</small></td><td>—</td><td>${pct(boss.burst5s)}</td><td>${sec(boss.clearTime)}</td><td>${boss.potions ?? '—'}</td><td>${pct(boss.minHp)}</td><td>${pct(boss.normalTimeout)}</td></tr>
</tbody></table></div>
<p class="meta">死亡率只算一般樓層，魔王層另外列。一秒內最大受傷：一般怪群在任一秒內打掉的血量佔最大生命，取九成場次低於的值。清層時間、喝水、最低血量都是正常型的中位數；逾時 = 10 分鐘內沒打開出口。</p>

${deathChart}
${burstChart}
${ttdChart}

<h2>主要傷害來源</h2>
<div class="scroll"><table>
<thead><tr><th>區段</th><th>受到的傷害（佔全部）</th><th>最後一擊</th></tr></thead>
<tbody>${sourceRows}</tbody></table></div>
<p class="meta">正常型與莽撞型合計。招式是怪物當下正在施放的招式；沒有施放時記為普通攻擊的元素（physical 等）。</p>

<h2>流派比較（一般樓層）</h2>
<div class="scroll"><table>
<thead><tr><th>流派</th><th>正常型死亡率</th><th>莽撞型死亡率</th><th>清層時間</th><th>一秒內最大受傷</th><th>站著不動到倒下</th></tr></thead>
<tbody>${buildRows}</tbody></table></div>

<h2>每層明細</h2>
<div class="scroll"><table>
<thead><tr><th>樓層</th><th>等級</th>${builds.map((b) => `<th>${esc(labelOf(b))}<small>正常 / 莽撞死亡率</small></th>`).join('')}<th>一秒內受傷</th><th>魔王一秒內</th><th>站樁倒下</th><th>清層時間</th><th>喝水</th><th>最低血量</th></tr></thead>
<tbody>${floorRows}</tbody></table></div>

<h2>模擬的假設</h2>
<div class="note"><ul>
${mode === 'boss' ? `<li>只測 31～35 層（挑戰層，每層都有 Boss）：第 31～35 層依序用 60 / 62 / 64 / 66 / 68 級；裝備分兩組——每個部位紫裝（2 孔）或橘裝（傳奇，1 孔），物品等級 = 角色等級，可鑲的部位鑲滿 T5 黃核（同一件同核種），沒有飛昇。技能、屬性點、按鍵配置的分配方式與快照角色相同。</li>` : mode === 'preset' ? `<li>角色用「預設角色」（設計者 2026-10-30）：50 級，每個部位一件物品等級 50 的紫裝，可鑲的部位鑿滿 2 孔並鑲滿黃核（T5、同一件裝備同核種），沒有飛昇與傳奇；每一層都用同一個角色。技能、屬性點、按鍵配置的分配方式與快照角色相同。</li>` : mode === 'save' ? `<li>角色用設計者匯出的存檔（等級、技能、屬性、裝備、熔核、飛昇、按鍵配置都照存檔），每份存檔打它所在樓層附近的幾層；開打前生命魔力回滿、藥水帶滿。同一份存檔的地圖固定（由存檔的世界種子決定），不同種子只換戰鬥與怪物 AI 的亂數。只有存檔涵蓋到的樓層才有數字。</li>` : `<li>角色用「快照」：第 N 層的等級 = 第 1～N−1 層擊殺 85% 怪物的經驗；每個部位一件物品等級 N 的藍 / 黃 / 紫（4 : 5 : 1）；沒有傳奇、熔核、飛昇。</li>
<li>技能只學自己這一系（先每招一級再往上加），能開 T4 就開；屬性點依流派比例分配。左鍵是該系的基本攻擊，連段依階級由高到低排。</li>`}
<li>正常型：血剩 45% 喝水；看到大招前搖 0.3 秒後才反應，有 20% 沒躲掉；遠程流派會跟近戰怪拉開距離；血少又被圍時後退。</li>
<li>莽撞型：直衝最近的怪、一直打，血剩 20% 才喝水，不躲。站樁：走到怪旁邊後完全不動。</li>
<li>死第一次就停，所以死亡率 = 這一層「過關前至少死一次」的比例。</li>
<li>機器人不是人：畫面是否看得懂、預警是否明顯量不出來，仍需實際遊玩確認。</li>
</ul></div>
</main></body></html>`;
  return { html, summary };
}
