import { describe, expect, it } from 'vitest';
import { DataRegistry, DataValidationError, type RawGameData } from '../../src/data/DataRegistry';
import { gameData } from '../../src/data';

const skill = (id: string) => ({
  id,
  name: id,
  targeting: 'enemy',
  cost: { mana: 0 },
  effects: [{ type: 'damage', element: 'physical', scaling: 'weapon' }],
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
    expect(bash.cost.mana).toBe(0);
    expect(bash.kind).toBe('active');
    expect(bash.tags).toEqual([]);
    expect(bash.castTime).toBe(0.3);
    expect(bash.effects[0]).toMatchObject({ multiplier: 1, hits: 1 });
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
      effects: [{ type: 'projectile', speed: 5, radius: 0.2, range: 5, onHit: [{ type: 'area', radius: 1, effects: [{ type: 'damage', element: 'plasma', scaling: 'weapon' }] }] }],
    };
    expect(expectProblems(withData({ skills: [nested] }))[0]).toContain('effects.0.onHit.0.effects.0.element');
  });

  it('未知的 Effect 類型、flat 傷害缺少 base 都會報錯', () => {
    const unknown = { ...skill('magic.a'), effects: [{ type: 'teleport' }] };
    const noBase = { ...skill('magic.b'), effects: [{ type: 'damage', element: 'fire', scaling: 'flat' }] };
    const problems = expectProblems(withData({ skills: [...gameData.skills, unknown, noBase] }));
    expect(problems.some((p) => p.includes("'magic.a'.effects.0"))).toBe(true);
    expect(problems.some((p) => p.includes("scaling 為 'flat' 時必須提供 base"))).toBe(true);
  });

  it('技能樹同一個位置不能有兩個技能', () => {
    const dup = {
      ...skill('melee.dup'),
      tree: { category: 'melee', tier: 1, branch: 'A' },
      combo: { range: 'Near', damage: ['Physical'], role: 'Starter' },
    };
    expect(expectProblems(withData({ skills: [...gameData.skills, dup] }))).toEqual([
      expect.stringContaining("技能樹位置 melee T1-A 重複：'melee.heavy_slash' 與 'melee.dup'"),
    ]);
  });

  it('技能樹 4 類 × 12 個位置都必須有技能；Support 為被動、其他為主動', () => {
    const data = DataRegistry.load(gameData);
    const tree = data.skills.all.filter((s) => s.tree);
    expect(tree).toHaveLength(48);
    expect(tree.filter((s) => s.tree!.category === 'support').every((s) => s.kind === 'passive')).toBe(true);
    expect(tree.filter((s) => s.tree!.category !== 'support').every((s) => s.kind === 'active')).toBe(true);

    const missing = gameData.skills.filter((s) => (s as { id: string }).id !== 'magic.storm_core');
    expect(expectProblems(withData({ skills: missing }))).toEqual([expect.stringContaining('技能樹位置 magic T4-C 沒有技能')]);
  });

  it('Support 類必須是被動技能', () => {
    const wrong = {
      ...skill('support.wrong'),
      tree: { category: 'support', tier: 1, branch: 'A' },
      combo: { range: 'Near', damage: ['Physical'], role: 'Starter' },
    };
    const skills = gameData.skills.filter((s) => (s as { id: string }).id !== 'support.vitality');
    expect(expectProblems(withData({ skills: [...skills, wrong] }))[0]).toContain('support 類技能必須是 passive');
  });

  it('起始技能配置必須是起始技能，且連段只能放主動技能', () => {
    const player = (gameData.balance as { player: Record<string, unknown> }).player;
    const noStart = { ...(gameData.balance as object), player: { ...player, startingSkills: ['basic.attack'] } };
    expect(expectProblems(withData({ balance: noStart })).some((p) => p.includes("'melee.heavy_slash' 不在 startingSkills 內"))).toBe(true);

    const passiveInCombo = {
      ...(gameData.balance as object),
      player: {
        ...player,
        startingSkills: ['basic.attack', 'support.vitality'],
        startingLoadout: { left: 'basic.attack', combos: [['support.vitality', null, null], [null, null, null], [null, null, null]], supports: [null, null, null] },
      },
    };
    expect(expectProblems(withData({ balance: passiveInCombo })).some((p) => p.includes("'support.vitality' 必須是 active 技能"))).toBe(true);
  });

  it('技能樹中的主動技能必須有 combo 標籤', () => {
    const skills = gameData.skills.map((s) =>
      (s as { id: string }).id === 'melee.quick_slash' ? { ...(s as object), combo: undefined } : s,
    );
    expect(expectProblems(withData({ skills }))[0]).toContain('必須有 combo 標籤');
  });

  it('combo 標籤與技能效果不一致時報錯（例如標了 Knockback 但沒有擊退）', () => {
    const skills = gameData.skills.map((s) => {
      const def = s as { id: string; combo?: Record<string, unknown> };
      if (def.id !== 'melee.heavy_slash') return s;
      return { ...def, combo: { ...def.combo, control: ['Knockback'], movement: ['Advance'], action: ['Heavy', 'MultiHit'] } };
    });
    const problems = expectProblems(withData({ skills }));
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("'melee.heavy_slash' 的 combo 標籤 Knockback 需要擊退效果"),
        expect.stringContaining('標籤 Advance 需要向前位移'),
        expect.stringContaining('標籤 MultiHit 需要至少 2 段命中'),
      ]),
    );
  });

  it('Combo Rule：Exact Combo 引用的技能必須存在，且排列不能不合理或三連同招', () => {
    const rule = (id: string, skills: string[]) => ({
      id,
      name: id,
      tier: 1,
      order: 9,
      match: { kind: 'exact', skills },
      modifiers: [{ type: 'damage', value: 0.1 }],
    });
    const problems = expectProblems(
      withData({
        comboRules: [
          ...gameData.comboRules,
          rule('combo.missing', ['melee.heavy_slash', 'magic.nope', 'magic.fireball']),
          rule('combo.jumpy', ['melee.heavy_slash', 'magic.fireball', 'melee.heavy_slash']),
          rule('combo.triple', ['magic.fireball', 'magic.fireball', 'magic.fireball']),
          rule('combo.passive', ['support.vitality', 'melee.heavy_slash', 'magic.fireball']),
        ],
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("不存在的 skill 'magic.nope'"),
        expect.stringContaining('Near→Far→Near 不合理'),
        expect.stringContaining('三個相同技能'),
        expect.stringContaining("'support.vitality' 必須是可放入連段的主動技能"),
      ]),
    );
  });

  it('Combo Rule：tier 1 只能是 Exact Combo', () => {
    const rule = { id: 'combo.bad_tier', name: 'x', tier: 1, order: 1, match: { kind: 'pattern', steps: [{}, {}, {}] }, modifiers: [{ type: 'damage', value: 0.1 }] };
    expect(expectProblems(withData({ comboRules: [...gameData.comboRules, rule] }))[0]).toContain('tier 1 只能是 Exact');
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
