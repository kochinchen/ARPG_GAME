import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { xpToNext } from '../../../src/game/progression/ExperienceSystem';
import { scaleForFloor } from '../../../src/game/world/DifficultyScaler';
import { BUILDS, setupCharacter } from '../sim/character';
import { data, makeWorld, xpTable } from '../sim/run';

/**
 * 除錯用：各層的怪物倍率、不同經驗倍率下到每一層的等級，以及快照角色的生命 / 攻擊成長（OUT=輸出檔）。
 * 用來比較「怪物每層成長多少」和「主角每層成長多少」。XPSCALES=1,0.5,0.4；FLOORS 指定要建角色的樓層。
 */
it('floorgrowth', () => {
  const last = data.balance.endgame.lastFloor;
  const scales = (process.env.XPSCALES ?? '1,0.5,0.4,0.3').split(',').map(Number);
  const floors = (process.env.FLOORS ?? '1,5,10,15,20,25,30,35').split(',').map(Number);
  const table = xpTable();
  const need = (level: number) => xpToNext(level, data.balance);
  const levelAt = (floor: number, scale: number) => {
    let left = table.slice(1, floor).reduce((s, v) => s + v, 0) * 0.85 * scale;
    let l = 1;
    while (l < data.balance.maxLevel && left >= need(l)) left -= need(l++);
    return l;
  };
  const lines: string[] = [];

  lines.push('■ 現況的怪物倍率（第 1 層 = 1）與相鄰樓層的成長率');
  lines.push('樓層\t生命\t魔王生命\t傷害\t防禦\t經驗\t生命比上一層\t傷害比上一層');
  for (let f = 1; f <= last; f++) {
    const s = scaleForFloor(f, data.balance.difficulty);
    const p = f > 1 ? scaleForFloor(f - 1, data.balance.difficulty) : s;
    lines.push(`${f}\t${s.hp.toFixed(1)}\t${s.bossHp.toFixed(1)}\t${s.damage.toFixed(2)}\t${s.defense.toFixed(1)}\t${s.xp.toFixed(2)}\t${f > 1 ? `×${(s.hp / p.hp).toFixed(3)}` : ''}\t${f > 1 ? `×${(s.damage / p.damage).toFixed(3)}` : ''}`);
  }

  lines.push('', '■ 到每一層時的等級（每層殺 85%）');
  lines.push(`樓層\t${scales.map((s) => `經驗 ×${s}`).join('\t')}`);
  for (let f = 1; f <= last; f++) lines.push(`${f}\t${scales.map((s) => levelAt(f, s)).join('\t')}`);

  lines.push('', '■ 快照角色（藍黃為主的裝備、沒有熔核）的成長');
  lines.push('流派\t經驗倍率\t樓層\t等級\t最大生命\t防禦\t武器平均\t法術強度');
  for (const build of BUILDS) {
    for (const scale of scales.slice(0, 2)) {
      for (const floor of floors) {
        const { world } = makeWorld(floor, 1);
        setupCharacter(world, data, floor, build, table.map((x) => x * scale));
        const st = world.player.stats;
        lines.push(`${build.label}\t×${scale}\t${floor}\t${world.progress.level}\t${Math.round(st.get('maxHp'))}\t${Math.round(st.get('defense'))}\t${Math.round((st.get('damageMin') + st.get('damageMax')) / 2)}\t${Math.round(st.get('spellPower'))}`);
      }
    }
  }
  writeFileSync(process.env.OUT!, lines.join('\n'));
});
