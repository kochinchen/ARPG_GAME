import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { encodeSave } from '../../../src/save/Envelope';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { BUILDS, setupCharacter } from '../sim/character';
import { data, makeWorld, xpTable } from '../sim/run';

/** 除錯用：做一份假的存檔（快照角色，存在第 F 層）測試存檔法，OUT=輸出路徑 */
it('make save', () => {
  const floor = Number(process.env.F ?? 6);
  const { world } = makeWorld(floor, 4242);
  setupCharacter(world, data, floor, BUILDS[0]!, xpTable());
  writeFileSync(process.env.OUT!, encodeSave(SaveMapper.capture(world, new Date().toISOString()), new Date()));
});
