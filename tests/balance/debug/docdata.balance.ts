import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { elementResistFor, scaleForFloor } from '../../../src/game/world/DifficultyScaler';
import { data } from '../sim/run';

/**
 * 除錯用：輸出設計文件「怪物與樓層」內嵌資料裡跟樓層倍率有關的部分（OUT=輸出檔，JSON）。
 * 改到 balance.difficulty / xpLevelGap 後，用它更新 release/設計文件/怪物與樓層.html 的 D.scaling 與 D.balance。
 */
it('docdata', () => {
  const last = data.balance.endgame.lastFloor;
  const scaling = Array.from({ length: last }, (_, i) => {
    const s = scaleForFloor(i + 1, data.balance.difficulty);
    return { hp: s.hp, bossHp: s.bossHp, damage: s.damage, skillArea: s.skillArea, defense: s.defense, xp: s.xp, density: s.density };
  });
  const elementResist = Array.from({ length: last }, (_, i) => elementResistFor(i + 1, data.balance.difficulty.elementResist));
  writeFileSync(process.env.OUT!, JSON.stringify({ xpLevelGap: data.balance.xpLevelGap, difficulty: data.balance.difficulty, scaling, elementResist }));
});
