// 難度模擬（npm run balance）：無畫面讓機器人玩家打每一層，量死亡率、瞬間傷害、站樁倒下時間，
// 對照 tests/balance/targets.json 產生 release/設計文件/難度報告.html。
//
//   npm run balance                                   全部樓層 × 3 流派 × 3 種機器人 × 2 個種子
//   npm run balance -- --floors=1-9 --builds=melee    只跑一部分
//   npm run balance -- --seeds=4 --jobs=6             更多種子 / 同時跑幾個
//   npm run balance -- --report                       不重跑，用上一次的結果重新產生報告
//
// 存檔法（用設計者真實的角色：持續打寶的裝備、熔核、飛昇都在存檔裡）：
//   把遊戲暫停選單「匯出存檔」的檔案放進 release/難度模擬/存檔/，然後
//   npm run balance -- --saves                        每份存檔打「存檔所在樓層 −1 ～ +3」
//   npm run balance -- --saves --range=-2,5 --seeds=4
//   報告：release/設計文件/難度報告-存檔.html
//
// 預設角色（50 級、全紫裝、鑲滿黃核）：看到第幾層開始卡關
//   npm run balance -- --preset                       三流派 × 1～35 層；報告：release/設計文件/難度報告-預設.html
//
// 深層魔王（31～35 層挑戰，每層都有 Boss）：第 31～35 層依序用 60 / 62 / 64 / 66 / 68 級，紫裝 2 孔與橘裝 1 孔各一組，鑲滿黃核
//   npm run balance -- --boss                         報告：release/設計文件/難度報告-魔王.html
//
// 原始結果在 release/難度模擬/results.jsonl（存檔法為 results-存檔.jsonl，每行一筆）。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReport } from './balance-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'release', '難度模擬');
const savesDir = join(outDir, '存檔');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

function parseFloors(spec) {
  return spec.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number);
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}

const useSaves = args.saves !== undefined;
const useBoss = args.boss !== undefined;
const usePreset = args.preset !== undefined;
const mode = useSaves ? 'save' : useBoss ? 'boss' : usePreset ? 'preset' : 'snapshot';
const suffix = { save: '-存檔', boss: '-魔王', preset: '-預設', snapshot: '' }[mode];
const PRESET = { level: 50, itemLevel: 50, rarity: 'epic' };
const BUILD_NAMES = { melee: '近戰', ranged: '弓箭', magic: '法術' };
const BOSS_LEVELS = { 31: 60, 32: 62, 33: 64, 34: 66, 35: 68 };
const GEAR_NAMES = { epic: '紫裝 2 孔', legendary: '橘裝 1 孔' };
const resultsPath = join(outDir, `results${suffix}.jsonl`);
const reportPath = join(root, 'release', '設計文件', `難度報告${suffix}.html`);
const LAST_FLOOR = 35;
const personas = (args.personas ?? 'normal,rusher,idle').split(',');
const seeds = Number(args.seeds ?? (useSaves ? 3 : 2));
const shards = Number(args.jobs ?? Math.max(1, cpus().length - 2));
const seedOf = (floor, s) => 1000 + floor * 17 + s * 7919;

/** 存檔法的角色：每份存檔一個「流派」，打存檔所在樓層附近的幾層 */
function saveCharacters() {
  const dir = args.saves === 'true' ? savesDir : resolve(args.saves);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    throw new Error(`把匯出的存檔（.json）放進 ${dir} 再執行`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) throw new Error(`${dir} 裡沒有存檔（.json）`);
  const [below, above] = (args.range ?? '-1,3').split(',').map(Number);
  return files.map((file) => {
    const path = join(dir, file);
    const save = JSON.parse(JSON.parse(readFileSync(path, 'utf8')).payload);
    const current = save.floor.current;
    const label = `${file.replace(/\.json$/, '')}（Lv ${save.character.level}・存在第 ${current} 層）`;
    const floors = [];
    for (let f = Math.max(1, current + below); f <= Math.min(LAST_FLOOR, current + above); f++) floors.push(f);
    return { build: `save:${file}`, save: path, label, floors };
  });
}

if (args.report !== 'true') {
  mkdirSync(outDir, { recursive: true });
  const builds = (args.builds ?? 'melee,ranged,magic').split(',');
  const characters = useSaves
    ? saveCharacters()
    : useBoss
      ? builds.flatMap((build) =>
          ['epic', 'legendary'].flatMap((rarity) =>
            Object.entries(BOSS_LEVELS).map(([floor, level]) => ({
              build,
              key: `${build}@${rarity}`,
              label: `${BUILD_NAMES[build]}・${GEAR_NAMES[rarity]}`,
              preset: { level, itemLevel: level, rarity },
              floors: [Number(floor)],
            })),
          ),
        )
      : builds.map((build) => ({ build, floors: parseFloors(args.floors ?? `1-${LAST_FLOOR}`), ...(usePreset ? { preset: PRESET } : {}) }));
  const jobs = [];
  for (const c of characters)
    for (const floor of c.floors)
      for (const persona of personas)
        for (let s = 0; s < seeds; s++) jobs.push({ floor, build: c.build, persona, seed: seedOf(floor, s), ...(c.save ? { save: c.save, label: c.label } : {}), ...(c.preset ? { preset: c.preset } : {}), ...(c.key ? { key: c.key, label: c.label } : {}) });
  // 深的樓層跑比較久：輪流分配時先排深層，各個程序的工作量比較平均
  jobs.sort((a, b) => b.floor - a.floor || (a.persona === 'idle') - (b.persona === 'idle'));
  const jobsPath = join(outDir, 'jobs.json');
  writeFileSync(jobsPath, JSON.stringify(jobs));
  if (existsSync(resultsPath)) rmSync(resultsPath);
  console.log(`難度模擬：${jobs.length} 場，${shards} 個程序同時跑…`);
  const started = Date.now();
  const timer = setInterval(() => {
    const done = existsSync(resultsPath) ? readFileSync(resultsPath, 'utf8').split('\n').filter(Boolean).length : 0;
    console.log(`  ${done} / ${jobs.length}（${Math.round((Date.now() - started) / 1000)} 秒）`);
  }, 30_000);
  const runs = Array.from({ length: Math.min(shards, jobs.length) }, (_, shard) =>
    new Promise((ok, fail) => {
      const child = spawn('npx', ['vitest', 'run', '-c', 'vitest.balance.config.ts', 'tests/balance/shard.balance.ts'], {
        cwd: root,
        env: { ...process.env, BALANCE_JOBS: jobsPath, BALANCE_SHARD: String(shard), BALANCE_SHARDS: String(shards), BALANCE_OUT: resultsPath },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`第 ${shard} 個程序失敗（${code}）`))));
    }),
  );
  try {
    await Promise.all(runs);
  } finally {
    clearInterval(timer);
  }
  console.log(`完成，用了 ${Math.round((Date.now() - started) / 1000)} 秒`);
}

const results = readFileSync(resultsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const targets = JSON.parse(readFileSync(join(root, 'tests', 'balance', 'targets.json'), 'utf8'));
mkdirSync(dirname(reportPath), { recursive: true });
const { html, summary } = renderReport(results, targets, { seeds, date: new Date().toISOString().slice(0, 10), mode });
writeFileSync(reportPath, html);
console.log(summary);
console.log(`報告：${reportPath}`);
