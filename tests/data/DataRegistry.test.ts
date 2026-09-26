import { describe, expect, it } from 'vitest';
import { DataRegistry, DataValidationError, type RawGameData } from '../../src/data/DataRegistry';
import { gameData } from '../../src/data';

const skill = (id: string) => ({
  id,
  name: id,
  tree: { category: 'melee', tier: 1, branch: 'A' },
  targeting: 'enemy',
  cost: { mana: 0 },
  effects: [{ type: 'damage', element: 'physical', source: 'weapon' }],
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
    const data = DataRegistry.load(withData({ skills: [...gameData.skills, skill('melee.test')] }));
    const bash = data.skills.get('melee.test');
    expect(bash.cooldown).toBe(0);
    expect(bash.cost.perRank).toBe(0);
    expect(bash.tags).toEqual([]);
    expect(bash.castTime).toBe(0.3);
    expect(bash.effects[0]).toMatchObject({ multiplier: 1, perRankPct: 0 });
  });

  it('ID 重複時報錯', () => {
    const problems = expectProblems(withData({ skills: [skill('melee.bash'), skill('melee.bash')] }));
    expect(problems.some((p) => p.includes('重複'))).toBe(true);
  });

  it('欄位錯誤時指出位置', () => {
    const problems = expectProblems(
      withData({ skills: [{ ...skill('melee.bash'), tree: { category: 'melee', tier: 5, branch: 'A' } }] }),
    );
    expect(problems[0]).toContain("skill[0] 'melee.bash'.tree.tier");
  });

  it('驗證巢狀的 Effect 格式', () => {
    const nested = {
      ...skill('magic.test'),
      effects: [{ type: 'projectile', speed: 5, radius: 0.2, range: 5, onHit: [{ type: 'area', radius: 1, effects: [{ type: 'damage', element: 'plasma', source: 'weapon' }] }] }],
    };
    expect(expectProblems(withData({ skills: [nested] }))[0]).toContain('effects.0.onHit.0.effects.0.element');
  });

  it('未知的 Effect 類型、flat 傷害缺少 base 都會報錯', () => {
    const unknown = { ...skill('magic.a'), effects: [{ type: 'teleport' }] };
    const noBase = { ...skill('magic.b'), effects: [{ type: 'damage', element: 'fire', source: 'flat' }] };
    const problems = expectProblems(withData({ skills: [unknown, noBase] }));
    expect(problems.some((p) => p.includes("skill[0] 'magic.a'.effects.0"))).toBe(true);
    expect(problems.some((p) => p.includes("source 為 'flat' 時必須提供 base"))).toBe(true);
  });

  it('有 AI 的怪物至少要有一個技能', () => {
    const enemy = {
      id: 'enemy.mute', name: 'x', hp: 1, damage: [1, 1], defense: 0, moveSpeed: 1,
      attackRange: 1, detectRange: 5, ai: 'melee', xp: 0,
    };
    expect(expectProblems(withData({ enemies: [...gameData.enemies, enemy] }))[0]).toContain('至少需要一個技能');
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

describe('MapDef 驗證', () => {
  const load = (rows: string[]) => DataRegistry.load(withData({ maps: [{ id: 'map.bad', rows }] }));

  it('每列長度必須一致', () => {
    expect(() => load(['#S#', '##'])).toThrow('長度');
  });

  it('出生點必須剛好一個', () => {
    expect(() => load(['#..#'])).toThrow("出生點 'S'");
    expect(() => load(['#SS#'])).toThrow("出生點 'S'");
  });

  it('不允許未定義的字元', () => {
    expect(() => load(['#SX#'])).toThrow("不合法的字元 'X'");
  });
});

describe('MapDef spawns 驗證', () => {
  const load = (spawns: { enemyId: string; at: [number, number] }[]) =>
    DataRegistry.load(withData({ maps: [{ id: 'map.spawns', rows: ['#####', '#S..#', '#####'], spawns }] }));

  it('擺放位置必須在地板上', () => {
    expect(() => load([{ enemyId: 'enemy.training_dummy', at: [0.5, 0.5] }])).toThrow('不在地板上');
  });

  it('怪物 ID 必須存在', () => {
    expect(() => load([{ enemyId: 'enemy.nope', at: [2.5, 1.5] }])).toThrow("不存在的 enemy 'enemy.nope'");
  });

  it('合法的擺放可以載入', () => {
    expect(load([{ enemyId: 'enemy.training_dummy', at: [2.5, 1.5] }]).maps.get('map.spawns').spawns).toHaveLength(1);
  });
});

describe('物品與寶箱資料驗證（M5）', () => {
  it('寶箱的掉落表必須存在', () => {
    const map = { id: 'map.chest', rows: ['#####', '#S..#', '#####'], chests: [{ at: [2.5, 1.5], lootTable: 'loot.nope' }] };
    expect(expectProblems(withData({ maps: [...gameData.maps, map] }))).toEqual([
      expect.stringContaining("不存在的 lootTable 'loot.nope'"),
    ]);
  });

  it('寶箱位置必須在地板上', () => {
    const map = { id: 'map.chest', rows: ['#####', '#S..#', '#####'], chests: [{ at: [0.5, 0.5], lootTable: 'loot.chest' }] };
    expect(expectProblems(withData({ maps: [...gameData.maps, map] }))).toEqual([expect.stringContaining('不在地板上')]);
  });

  it('物品屬性與詞綴只能使用已定義的屬性名稱', () => {
    const badItem = { id: 'weapon.bad', name: 'x', slot: 'weapon', levelReq: 1, baseStats: { luck: 5 } };
    const badAffix = { id: 'affix.bad', name: 'x', kind: 'item', stat: 'luck', value: [1, 2], minItemLevel: 1, weight: 1 };
    const problems = expectProblems(withData({ items: [...gameData.items, badItem], affixes: [...gameData.affixes, badAffix] }));
    expect(problems.some((p) => p.includes("item[8] 'weapon.bad'.baseStats"))).toBe(true);
    expect(problems.some((p) => p.includes("'affix.bad'.stat"))).toBe(true);
  });
});
