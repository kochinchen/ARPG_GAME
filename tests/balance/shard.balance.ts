import { appendFileSync, readFileSync } from 'node:fs';
import { it } from 'vitest';
import type { GameWorld } from '../../src/game/GameWorld';
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
  /**
   * 假設測試：主角的防禦乘上 defense、移動速度最高到 maxMoveSpeed；
   * 怪物追趕時的加速改成 sprint（balance.enemyTactics.pace.sprint）、主角在 sprintDistance 格外就加速；
   * noChill：怪物完全不吃緩速與冰凍（看控場佔多少）；monsterHp：一般怪（不含精英、首領、魔王）的生命乘上這個倍率；
   * damage：主角造成的所有傷害乘上這個倍率；coldResist：一般怪的冰抗加上這個值；
   * comboOrder：連段按鍵的優先順序（0 = Q、1 = W…），用來看「換一組連段打」的結果
   */
  whatIf?: { defense?: number; maxMoveSpeed?: number; sprint?: number; sprintDistance?: number; noChill?: boolean; monsterHp?: number; damage?: number; coldResist?: number; comboOrder?: number[] };
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
    const base = save?.build ?? BUILDS.find((b) => b.id === job.build)!;
    const build = job.whatIf?.comboOrder ? { ...base, comboOrder: job.whatIf.comboOrder } : base;
    const start = performance.now();
    const whatIf = job.whatIf;
    const tweak = whatIf
      ? (world: GameWorld) => {
          const stats = world.player.stats;
          if (whatIf.defense !== undefined) stats.addModifier({ stat: 'defense', kind: 'more', value: whatIf.defense - 1, source: 'whatIf' });
          if (whatIf.maxMoveSpeed !== undefined && stats.get('moveSpeed') > whatIf.maxMoveSpeed) stats.addModifier({ stat: 'moveSpeed', kind: 'more', value: whatIf.maxMoveSpeed / stats.get('moveSpeed') - 1, source: 'whatIf' });
          // 傷害是乘上（1 + damageBonus）：要讓總傷害變成 damage 倍，就把加成改成 damage ×（1 + 原本的加成）− 1
          if (whatIf.damage !== undefined) stats.addModifier({ stat: 'damageBonus', kind: 'flat', value: (whatIf.damage - 1) * (1 + stats.get('damageBonus')), source: 'whatIf' });
          if (whatIf.noChill) {
            const statuses = world.statuses;
            const apply = statuses.apply.bind(statuses);
            statuses.apply = (target, kind, ...rest) => {
              if ((kind === 'slow' || kind === 'freeze') && target.faction === 'enemy') return;
              apply(target, kind, ...rest);
            };
          }
          if (whatIf.coldResist !== undefined) {
            for (const a of world.actors) {
              if (a.faction !== 'enemy' || a.isBoss || a.miniBoss || a.elite || a.device || a.name.startsWith('首領')) continue;
              a.stats.addModifier({ stat: 'coldResist', kind: 'flat', value: whatIf.coldResist, source: 'whatIf' });
            }
          }
          if (whatIf.monsterHp !== undefined) {
            for (const a of world.actors) {
              if (a.faction !== 'enemy' || a.isBoss || a.miniBoss || a.elite || a.device || a.name.startsWith('首領')) continue;
              a.stats.addModifier({ stat: 'maxHp', kind: 'more', value: whatIf.monsterHp - 1, source: 'whatIf' });
              a.hp = a.maxHp;
            }
          }
        }
      : undefined;
    // 怪物的追趕加速是全域平衡數值：這一場跑完就改回來
    const pace = data.balance.enemyTactics.pace as { sprint: number; sprintDistance: number };
    const original = { ...pace };
    if (whatIf?.sprint !== undefined) pace.sprint = whatIf.sprint;
    if (whatIf?.sprintDistance !== undefined) pace.sprintDistance = whatIf.sprintDistance;
    const result = runFloor({ floor: job.floor, build, persona: job.persona, seed: job.seed, ...(save ? { save } : {}), ...(job.preset ? { preset: job.preset } : {}), ...(tweak ? { tweak } : {}) });
    Object.assign(pace, original);
    appendFileSync(out, `${JSON.stringify({ ...result, build: job.key ?? job.build, label: job.label, cpu: (performance.now() - start) / 1000 })}\n`);
  });
});
