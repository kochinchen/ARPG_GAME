import { appendFileSync } from 'node:fs';
import { it } from 'vitest';
import { BUILDS } from './sim/character';
import { runFloor } from './sim/run';

it('smoke', () => {
  const out = process.env.SMOKE_OUT ?? 'smoke.log';
  const floors = (process.env.SMOKE_FLOORS ?? '3').split(',').map(Number);
  const personas = (process.env.SMOKE_PERSONAS ?? 'normal').split(',') as ('rusher' | 'normal' | 'idle')[];
  for (const floor of floors) {
    for (const persona of personas) {
      const start = performance.now();
      const r = runFloor({ floor, build: BUILDS[Number(process.env.SMOKE_BUILD ?? 0)]!, persona, seed: 7 });
      appendFileSync(out, `${JSON.stringify(r)} ${((performance.now() - start) / 1000).toFixed(1)}s\n`);
    }
  }
}, 3_600_000);
