import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { ComboResolver } from '../../../src/game/combo/ComboResolver';
import { ComboSkillIndex } from '../../../src/game/combo/ComboSkillIndex';
import { combatCategory } from '../../../src/game/skills/skillCategory';
import { data } from '../sim/run';

/**
 * 除錯用：外系招式（劍斧弓的魔法、法杖的近戰）出現在哪些成立的 Combo 裡（OUT=輸出檔）。
 * 評估「Combo 成立時外系招式依等級吃武器傷害 / 法術強度」會影響多少排列。
 * 法杖假設放寬成可以用近戰（目前不行）。
 */
it('crosscombo', () => {
  const index = new ComboSkillIndex(data.skills);
  const resolver = new ComboResolver(data.comboRules, index, data.balance.combo.nearNearFarBonus);
  const skills = data.skills.all.filter((s) => s.tree && index.get(s.id) && combatCategory(s));
  const weapons = [
    { name: '劍 / 斧', allowed: ['melee', 'magic', 'utility'], foreign: 'magic' },
    { name: '弓', allowed: ['ranged', 'magic', 'utility'], foreign: 'magic' },
    { name: '法杖（假設可用近戰）', allowed: ['magic', 'utility', 'melee'], foreign: 'melee' },
  ];
  const lines: string[] = [];
  for (const w of weapons) {
    const pool = skills.filter((s) => w.allowed.includes(combatCategory(s)!));
    const isForeign = (id: string) => combatCategory(data.skills.get(id)) === w.foreign;
    const byRule = new Map<string, { name: string; none: number; last: number; early: number; many: number; sample: string[] }>();
    let total = 0;
    const split = { two: 0, three: 0 };
    for (const a of pool) for (const b of pool) for (const c of pool) {
      const r = resolver.resolve([a.id, b.id, c.id], () => 5);
      if (r.status !== 'combo') continue;
      total++;
      const row = byRule.get(r.rule.id) ?? { name: r.rule.name, none: 0, last: 0, early: 0, many: 0, sample: [] };
      byRule.set(r.rule.id, row);
      const flags = r.steps.map(isForeign);
      const count = flags.filter(Boolean).length;
      const names = () => r.steps.map((id) => data.skills.get(id).name).join('→');
      if (count === 0) row.none++;
      else if (count >= 2) {
        row.many++;
        if (count === 2) split.two++;
        else split.three++;
        if (row.sample.length < 2) row.sample.push(`[多] ${names()}`);
      } else if (flags[2]) {
        row.last++;
        if (row.sample.filter((s) => s.startsWith('[尾]')).length < 2) row.sample.push(`[尾] ${names()}`);
      } else {
        row.early++;
        if (row.sample.filter((s) => s.startsWith('[前]')).length < 1) row.sample.push(`[前] ${names()}`);
      }
    }
    lines.push(`■ ${w.name}：可用技能 ${pool.length} 個（外系 ${pool.filter((s) => isForeign(s.id)).length} 個），成立的 Combo 排列 ${total} 組`);
    lines.push('規則\t沒有外系\t一招外系在第三招\t一招外系在前兩招\t兩招以上外系\t例子');
    const sum = { none: 0, last: 0, early: 0, many: 0 };
    for (const [, row] of [...byRule].sort((x, y) => y[1].last + y[1].early + y[1].many - (x[1].last + x[1].early + x[1].many))) {
      sum.none += row.none;
      sum.last += row.last;
      sum.early += row.early;
      sum.many += row.many;
      lines.push(`${row.name}\t${row.none}\t${row.last}\t${row.early}\t${row.many}\t${row.sample.join('；')}`);
    }
    lines.push(`合計\t${sum.none}\t${sum.last}\t${sum.early}\t${sum.many}（兩招 ${split.two}、三招 ${split.three}）`, '');
  }
  writeFileSync(process.env.OUT!, lines.join('\n'));
});
