import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { SkillFilter } from '../../../src/data/schema/legendary';
import { ComboSkillIndex } from '../../../src/game/combo/ComboSkillIndex';
import { combatCategory } from '../../../src/game/skills/skillCategory';

/** 每條傳奇 / 神話效果的技能條件，至少要有一個玩家技能符合（否則效果永遠不會發動） */
const data = DataRegistry.load(gameData);
const index = new ComboSkillIndex(data.skills);
const playerSkills = data.skills.all.filter((s) => s.tree);

function matchesSome(f: SkillFilter): boolean {
  return playerSkills.some((skill) => {
    const p = index.get(skill.id);
    if (f.skills && !f.skills.includes(skill.id)) return false;
    if (f.tags && !(p && f.tags.some((t) => p.tags.has(t)))) return false;
    if (f.ranges && !(p && f.ranges.includes(p.range))) return false;
    if (f.roles && !(p && f.roles.includes(p.role))) return false;
    if (f.elements && !(p && f.elements.some((el) => p.elementTags.includes(el)))) return false;
    if (f.categories && !f.categories.includes(combatCategory(skill)!)) return false;
    return true;
  });
}

describe('傳奇 / 神話效果的條件都能成立', () => {
  for (const def of data.legendaries.all) {
    it(`${def.name}（${def.id}）`, () => {
      for (const line of def.lines) {
        if (line.type !== 'effect') continue;
        for (const m of line.mechanics) {
          if (m.type === 'conditional') continue;
          if (m.type === 'trigger' && (m.on === 'hurt' || m.on === 'dodge' || m.on === 'block' || m.on === 'comboDiscovered')) continue;
          expect(matchesSome(m.when), `${line.text}`).toBe(true);
          if (m.type === 'trigger')
            for (const a of m.actions) if (a.type === 'arm') expect(matchesSome(a.when), `${line.text}（預備）`).toBe(true);
        }
      }
    });
  }
});
