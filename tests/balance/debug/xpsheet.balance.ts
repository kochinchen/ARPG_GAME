import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { xpToNext } from '../../../src/game/progression/ExperienceSystem';
import { data, makeWorld } from '../sim/run';

/**
 * 除錯用：每一層的經驗表（OUT=輸出檔）。
 * 全清一次的經驗、其中魔王 / 首領 / 精英各佔多少、照正常進度（每層殺 85%）走到這一層的等級、
 * 以那個等級全清一次可以升幾級，以及「停在這一層重複刷」各等級每清一次升幾級。
 */
it('xpsheet', () => {
  const last = data.balance.endgame.lastFloor;
  const need = (level: number) => xpToNext(level, data.balance);
  /** 從 level 開始拿到 xp 之後的等級（含小數） */
  const after = (level: number, xp: number) => {
    let l = level;
    let left = xp;
    while (l < data.balance.maxLevel && left >= need(l)) left -= need(l++);
    return l >= data.balance.maxLevel ? l : l + left / need(l);
  };
  const lines = ['樓層\t全清經驗\t魔王\t首領\t精英\t一般怪\t正常進度的等級\t全清一次升幾級\t一隻一般怪佔一級的'];
  let level = 1;
  const floors: { floor: number; total: number; boss: number }[] = [];
  for (let floor = 1; floor <= last; floor++) {
    const { world } = makeWorld(floor, 1);
    const foes = world.actors.filter((a) => a.faction === 'enemy');
    const sum = (list: typeof foes) => list.reduce((s, a) => s + a.xpReward, 0);
    const boss = foes.filter((a) => a.isBoss || a.miniBoss);
    const champion = foes.filter((a) => !a.isBoss && !a.miniBoss && a.name.startsWith('首領'));
    const elite = foes.filter((a) => a.elite && !a.isBoss && !a.miniBoss && !a.name.startsWith('首領'));
    const normal = foes.filter((a) => !boss.includes(a) && !champion.includes(a) && !elite.includes(a));
    const total = sum(foes);
    floors.push({ floor, total, boss: sum(boss) });
    const whole = Math.floor(level);
    lines.push(`${floor}\t${total}\t${sum(boss)}\t${sum(champion)}\t${sum(elite)}\t${sum(normal)}（${normal.length} 隻）\t${level.toFixed(1)}\t${(after(level, total) - level).toFixed(2)}\t${((sum(normal) / Math.max(1, normal.length) / need(whole)) * 100).toFixed(2)}%`);
    level = after(level, total * 0.85);
  }
  lines.push('', '停在同一層重複全清：每清一次升幾級（列 = 樓層，欄 = 目前等級）', `樓層\t${[30, 40, 50, 60, 69].map((l) => `Lv${l}`).join('\t')}\t從正常等級刷到滿級要清幾次`);
  let normalLevel = 1;
  for (const f of floors) {
    const start = Math.floor(normalLevel);
    let l = normalLevel;
    let clears = 0;
    while (l < data.balance.maxLevel && clears < 999) {
      l = after(l, f.total);
      clears++;
    }
    if (f.floor % 5 === 0 || f.floor === 27) lines.push(`${f.floor}（正常 Lv${start}）\t${[30, 40, 50, 60, 69].map((lv) => (f.total / need(lv)).toFixed(2)).join('\t')}\t${clears}`);
    normalLevel = after(normalLevel, f.total * 0.85);
  }
  writeFileSync(process.env.OUT!, lines.join('\n'));
});
