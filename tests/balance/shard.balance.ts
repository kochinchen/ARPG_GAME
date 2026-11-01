import { appendFileSync, readFileSync } from 'node:fs';
import { it } from 'vitest';
import type { Persona } from './sim/bot';
import { BUILDS, type Preset } from './sim/character';
import { loadSave, type LoadedSave } from './sim/fromSave';
import { data, runFloor } from './sim/run';

/** scripts/balance.mjs 平行開好幾個這個：每個只跑工作清單中分到的那幾筆，結果一行一筆 JSON */
interface Job {
  floor: number;
  /** 快照法的流派 id；存檔法為 save:<路徑> */
  build: string;
  persona: Persona;
  seed: number;
  /** 存檔法：存檔的路徑 */
  save?: string;
  /** 預設角色（固定等級、全紫或全橘、鑲滿黃核） */
  preset?: Preset;
  /** 報告分組用的 id（同一流派不同裝備時分開；沒有時用 build） */
  key?: string;
  /** 報告上顯示的名稱 */
  label?: string;
}

it('balance shard', () => {
  const jobs = JSON.parse(readFileSync(process.env.BALANCE_JOBS!, 'utf8')) as Job[];
  const shard = Number(process.env.BALANCE_SHARD);
  const shards = Number(process.env.BALANCE_SHARDS);
  const out = process.env.BALANCE_OUT!;
  const saves = new Map<string, LoadedSave>();
  jobs.forEach((job, i) => {
    if (i % shards !== shard) return;
    let save: LoadedSave | undefined;
    if (job.save) {
      save = saves.get(job.save) ?? loadSave(job.save, data);
      saves.set(job.save, save);
    }
    const build = save?.build ?? BUILDS.find((b) => b.id === job.build)!;
    const start = performance.now();
    const result = runFloor({ floor: job.floor, build, persona: job.persona, seed: job.seed, ...(save ? { save } : {}), ...(job.preset ? { preset: job.preset } : {}) });
    appendFileSync(out, `${JSON.stringify({ ...result, build: job.key ?? job.build, label: job.label, cpu: (performance.now() - start) / 1000 })}\n`);
  });
});
