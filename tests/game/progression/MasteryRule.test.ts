import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { SkillCategory } from '../../../src/data/schema/skill';
import {
  checkLearn,
  checkUnlockT4,
  isT4Open,
  masteryAchieved,
  SkillTreeIndex,
  type TreeState,
} from '../../../src/game/skills/MasteryRule';

const data = DataRegistry.load(gameData);
const index = new SkillTreeIndex(data.skills.all);
const rules = { maxSkillRank: data.balance.maxSkillRank, tierLevelReq: data.balance.tierLevelReq };
const node = (category: SkillCategory, tier: number, branch: 'A' | 'B' | 'C') => index.at(category, tier, branch)!;

function state(ranks: [SkillCategory, number, 'A' | 'B' | 'C', number][] = [], overrides: Partial<TreeState> = {}): TreeState {
  return {
    level: 99,
    skillPoints: 10,
    t4Charges: 0,
    t4Unlocked: new Set(),
    ranks: new Map(ranks.map(([c, t, b, r]) => [node(c, t, b).id, r])),
    ...overrides,
  };
}

/** 把某類別某路線從 T1 學到 T(upTo) */
const line = (category: SkillCategory, branch: 'A' | 'B' | 'C', upTo: number) =>
  Array.from({ length: upTo }, (_, i) => [category, i + 1, branch, 1] as [SkillCategory, number, 'A' | 'B' | 'C', number]);

const reason = (s: TreeState, c: SkillCategory, t: number, b: 'A' | 'B' | 'C') => {
  const r = checkLearn(s, rules, index, node(c, t, b));
  return r.ok ? 'ok' : r.reason;
};

describe('MasteryRule：Mastery 前', () => {
  it('每一類的 T1 都可以學', () => {
    for (const c of ['melee', 'ranged', 'magic', 'support'] as const) expect(reason(state(), c, 1, 'B')).toBe('ok');
  });

  it('T2-A 必須先學 T1-A；學了 T1-B 不算', () => {
    expect(reason(state(), 'melee', 2, 'A')).toBe('prerequisite');
    expect(reason(state(line('melee', 'B', 1)), 'melee', 2, 'A')).toBe('prerequisite');
    expect(reason(state(line('melee', 'A', 1)), 'melee', 2, 'A')).toBe('ok');
  });

  it('等級不足時不可學', () => {
    const s = state(line('melee', 'A', 1), { level: data.balance.tierLevelReq[1] - 1 });
    expect(reason(s, 'melee', 2, 'A')).toBe('level');
    expect(reason({ ...s, level: data.balance.tierLevelReq[1] }, 'melee', 2, 'A')).toBe('ok');
  });

  it('沒有技能點不可學；Lv5 後不能再升', () => {
    expect(reason(state([], { skillPoints: 0 }), 'melee', 1, 'A')).toBe('noPoints');
    expect(reason(state([['melee', 1, 'A', 5]]), 'melee', 1, 'A')).toBe('maxRank');
    expect(reason(state([['melee', 1, 'A', 4]]), 'melee', 1, 'A')).toBe('ok');
  });

  it('Mastery 前可以沿路線學到任何一類的 T4', () => {
    expect(masteryAchieved(state(line('magic', 'C', 3)), index)).toBe(false);
    expect(reason(state(line('magic', 'C', 3)), 'magic', 4, 'C')).toBe('ok');
  });
});

describe('MasteryRule：Mastery 後', () => {
  const mastered = line('melee', 'A', 4);

  it('學會任一類 T4 即達成 Mastery', () => {
    expect(masteryAchieved(state(mastered), index)).toBe(true);
  });

  it('其他類別的 T1～T3 不需前置即可學（仍需等級）', () => {
    expect(reason(state(mastered), 'ranged', 3, 'B')).toBe('ok');
    expect(reason(state(mastered), 'support', 2, 'C')).toBe('ok');
    expect(reason(state(mastered, { level: 5 }), 'ranged', 3, 'B')).toBe('level');
  });

  it('觸發 Mastery 的類別其他路線仍依正常前置', () => {
    expect(reason(state(mastered), 'melee', 2, 'B')).toBe('prerequisite');
  });

  it('其他類別的 T4 未開通時不可學（即使有 T3）', () => {
    const s = state([...mastered, ...line('ranged', 'A', 3)]);
    expect(isT4Open(s, index, 'ranged')).toBe(false);
    expect(reason(s, 'ranged', 4, 'A')).toBe('t4Locked');
  });

  it('觸發 Mastery 的類別 T4 維持開放（其他路線依前置）', () => {
    const s = state([...mastered, ...line('melee', 'B', 3)]);
    expect(reason(s, 'melee', 4, 'B')).toBe('ok');
  });
});

describe('MasteryRule：T4 開通', () => {
  const mastered = line('melee', 'A', 4);

  it('Mastery 前無法開通', () => {
    expect(checkUnlockT4(state([], { t4Charges: 3 }), index, 'ranged')).toEqual({ ok: false, reason: 'noMastery' });
  });

  it('開通次數為 0 時無法開通', () => {
    expect(checkUnlockT4(state(mastered), index, 'ranged')).toEqual({ ok: false, reason: 'noCharges' });
  });

  it('已開放的類別不能重複開通（含觸發 Mastery 的類別）', () => {
    const s = state(mastered, { t4Charges: 2, t4Unlocked: new Set(['ranged']) });
    expect(checkUnlockT4(s, index, 'ranged')).toEqual({ ok: false, reason: 'alreadyOpen' });
    expect(checkUnlockT4(s, index, 'melee')).toEqual({ ok: false, reason: 'alreadyOpen' });
    expect(checkUnlockT4(s, index, 'magic')).toEqual({ ok: true });
  });

  it('開通後，該類 T4 仍需同路線的 T3', () => {
    const s = state([...mastered, ...line('ranged', 'A', 3)], { t4Unlocked: new Set(['ranged']) });
    expect(reason(s, 'ranged', 4, 'A')).toBe('ok');
    expect(reason(s, 'ranged', 4, 'B')).toBe('prerequisite');
  });
});
