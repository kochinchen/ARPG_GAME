import { describe, expect, it } from 'vitest';
import { DataRegistry, DataValidationError, type RawGameData } from '../../src/data/DataRegistry';
import { gameData } from '../../src/data';

const skill = (id: string) => ({
  id,
  name: id,
  category: 'melee',
  tier: 1,
  branch: 'A',
  targeting: 'enemy',
  cost: { mana: 0 },
  range: 1.2,
  effects: [{ type: 'damage' }],
});

const withData = (patch: Partial<RawGameData>): RawGameData => ({ ...gameData, ...patch });

function expectProblems(raw: RawGameData): string[] {
  try {
    DataRegistry.load(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(DataValidationError);
    return (error as DataValidationError).problems;
  }
  throw new Error('expected DataValidationError');
}

describe('DataRegistry', () => {
  it('目前的遊戲資料可以通過驗證', () => {
    const data = DataRegistry.load(gameData);
    expect(data.balance.maxSkillRank).toBe(5);
    expect(data.potions.get('potion.rejuvenation').hpPct).toBeGreaterThan(0);
  });

  it('套用 Schema 預設值', () => {
    const data = DataRegistry.load(withData({ skills: [skill('melee.bash')] }));
    const bash = data.skills.get('melee.bash');
    expect(bash.cooldown).toBe(0);
    expect(bash.cost.perRank).toBe(0);
    expect(bash.tags).toEqual([]);
  });

  it('ID 重複時報錯', () => {
    const problems = expectProblems(withData({ skills: [skill('melee.bash'), skill('melee.bash')] }));
    expect(problems.some((p) => p.includes('重複'))).toBe(true);
  });

  it('欄位錯誤時指出位置', () => {
    const problems = expectProblems(withData({ skills: [{ ...skill('melee.bash'), tier: 5 }] }));
    expect(problems[0]).toContain("skill[0] 'melee.bash'.tier");
  });

  it('引用不存在的 ID 時報錯', () => {
    const enemy = {
      id: 'skeleton',
      name: 'Skeleton',
      hp: 20,
      damage: [1, 3],
      defense: 0,
      moveSpeed: 2,
      attackRange: 1,
      detectRange: 8,
      ai: 'melee',
      skills: ['enemy.claw'],
      lootTable: 'loot.basic',
      xp: 10,
    };
    const problems = expectProblems(withData({ enemies: [enemy] }));
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("不存在的 skill 'enemy.claw'"),
        expect.stringContaining("不存在的 lootTable 'loot.basic'"),
      ]),
    );
  });

  it('查詢不存在的 ID 丟錯', () => {
    const data = DataRegistry.load(gameData);
    expect(() => data.skills.get('nope')).toThrow('skill not found: nope');
  });
});
