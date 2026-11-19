import { describe, expect, it, vi } from 'vitest';
import type { SkillCategory } from '../../../src/data/schema/skill';
import type { GameCommand } from '../../../src/game/Commands';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { xpGapMultiplier, xpToNext } from '../../../src/game/progression/ExperienceSystem';
import { createWorld, createWorldWithMap, enemiesOf, run } from '../helpers';

function setup() {
  const ctx = createWorld();
  const send = (...commands: GameCommand[]) => {
    ctx.commands.push(...commands);
    ctx.world.update(1 / 60);
  };
  const skillAt = (c: SkillCategory, tier: number, b: 'A' | 'B' | 'C') => ctx.world.skillTree.index.at(c, tier, b)!.id;
  return { ...ctx, send, skillAt };
}

describe('經驗與升級（M6）', () => {
  it('玩家擊殺怪物獲得經驗', () => {
    const { world, events, data } = createWorldWithMap(
      ['########', '#S.....#', '########'],
      [{ enemyId: 'enemy.skeleton', at: [4.5, 1.5] }],
    );
    const onXp = vi.fn();
    events.on('XpGained', onXp);
    const skeleton = enemiesOf(world)[0]!;
    skeleton.hp = 1;
    skeleton.lastDamagedBy = world.player.id;
    skeleton.hp = 0;
    run(world, 0.1);
    expect(onXp).toHaveBeenCalledWith({ amount: data.enemies.get('enemy.skeleton').xp });
    expect(world.progress.xp).toBe(data.enemies.get('enemy.skeleton').xp);
  });

  it('非玩家擊殺（例如環境傷害）不給經驗', () => {
    const { world } = createWorldWithMap(['########', '#S.....#', '########'], [{ enemyId: 'enemy.skeleton', at: [4.5, 1.5] }]);
    enemiesOf(world)[0]!.hp = 0;
    run(world, 0.1);
    expect(world.progress.xp).toBe(0);
  });

  it('經驗足夠時升級（可一次連升多級），給技能點並成長屬性', () => {
    const { world, data, events } = setup();
    const onLevel = vi.fn();
    events.on('PlayerLeveledUp', onLevel);
    const points = world.progress.skillPoints;
    const hp = world.player.stats.getBase('maxHp');
    world.experience.addXp(xpToNext(1, data.balance) + xpToNext(2, data.balance) + 5);
    expect(world.progress.level).toBe(3);
    expect(world.progress.xp).toBe(5);
    expect(world.progress.skillPoints).toBe(points + 2 * data.balance.skillPointsPerLevel);
    expect(world.player.stats.getBase('maxHp')).toBe(hp + 2 * (data.balance.statsPerLevel.maxHp ?? 0));
    expect(onLevel).toHaveBeenCalledTimes(2);
  });

  it('F9（DebugLevelUp）直接升一級', () => {
    const { world, send } = setup();
    send({ type: 'DebugLevelUp' });
    expect(world.progress.level).toBe(2);
    expect(world.progress.xp).toBe(0);
  });
});

describe('技能樹操作（M6）', () => {
  it('新角色：起始技能 Lv1、起始技能點', () => {
    const { world, data } = setup();
    for (const id of data.balance.player.startingSkills) expect(world.player.skillRanks.get(id)).toBe(1);
    expect(world.progress.skillPoints).toBe(data.balance.player.startingSkillPoints);
  });

  it('學習新技能扣 1 點', () => {
    const { world, send, skillAt } = setup();
    const id = skillAt('ranged', 1, 'A');
    send({ type: 'LearnSkill', skillId: id });
    expect(world.player.skillRanks.get(id)).toBe(1);
    expect(world.progress.skillPoints).toBe(1);
  });

  it('技能可以升到 Lv5，不可超過', () => {
    const { world, send } = setup();
    world.progress.skillPoints = 10;
    for (let i = 0; i < 6; i++) send({ type: 'LearnSkill', skillId: 'melee.heavy_slash' });
    expect(world.player.skillRanks.get('melee.heavy_slash')).toBe(5);
    expect(world.progress.skillPoints).toBe(6);
  });

  it('不符合規則時不學習、不扣點', () => {
    const { world, send, skillAt } = setup();
    const id = skillAt('melee', 2, 'B');
    send({ type: 'LearnSkill', skillId: id });
    expect(world.player.skillRanks.get(id)).toBeUndefined();
    expect(world.progress.skillPoints).toBe(2);
  });

  it('完整流程：學到 T4 → Mastery → 升級得到開通次數 → 開通其他類 T4', () => {
    const { world, send, skillAt, events } = setup();
    const onMastery = vi.fn();
    events.on('MasteryAchieved', onMastery);
    for (let i = 0; i < 23; i++) send({ type: 'DebugLevelUp' });
    expect(world.progress.level).toBe(24);
    expect(world.progress.t4Charges).toBe(0);

    for (let tier = 2; tier <= 4; tier++) send({ type: 'LearnSkill', skillId: skillAt('melee', tier, 'A') });
    expect(world.skillTree.mastery).toBe(true);
    expect(onMastery).toHaveBeenCalledWith({ category: 'melee' });

    // Mastery 後其他類別 T3 不需前置
    send({ type: 'LearnSkill', skillId: skillAt('ranged', 3, 'A') });
    expect(world.player.skillRanks.get(skillAt('ranged', 3, 'A'))).toBe(1);
    // 其他類別 T4 未開通
    send({ type: 'LearnSkill', skillId: skillAt('ranged', 4, 'A') });
    expect(world.player.skillRanks.get(skillAt('ranged', 4, 'A'))).toBeUndefined();

    send({ type: 'UnlockT4', category: 'ranged' });
    expect(world.progress.t4Unlocked.has('ranged')).toBe(false);

    send({ type: 'DebugLevelUp' }, { type: 'DebugLevelUp' });
    expect(world.progress.t4Charges).toBe(2);
    send({ type: 'UnlockT4', category: 'ranged' });
    expect(world.progress.t4Unlocked.has('ranged')).toBe(true);
    expect(world.progress.t4Charges).toBe(1);

    send({ type: 'LearnSkill', skillId: skillAt('ranged', 4, 'A') });
    expect(world.player.skillRanks.get(skillAt('ranged', 4, 'A'))).toBe(1);
  });

  it('左鍵只能指定已學會的主動技能', () => {
    const { world, send, skillAt } = setup();
    // 預設左鍵是免費送的重砍（玩家沒有普通攻擊）
    expect(world.loadout.left).toBe('melee.heavy_slash');
    send({ type: 'AssignLeft', skillId: skillAt('ranged', 1, 'A') });
    expect(world.loadout.left).toBe('melee.heavy_slash');
    send({ type: 'AssignLeft', skillId: 'basic.attack' });
    expect(world.loadout.left).toBe('melee.heavy_slash');
    send({ type: 'AssignLeft', skillId: 'magic.fireball' });
    expect(world.loadout.left).toBe('magic.fireball');
  });
});

describe('等級差經驗遞減（balance.xpLevelGap）', () => {
  const { data } = createWorld();
  const rate = (level: number, floor: number) => xpGapMultiplier(level, floor, data.balance);

  it('怪物等級 = 樓層 × 1.5：高出 5 級以內全額，之後每級少 15%，最低 5%', () => {
    // 第 20 層的怪物等級 30
    expect(rate(28, 20)).toBe(1);
    expect(rate(35, 20)).toBe(1);
    expect(rate(36, 20)).toBeCloseTo(0.85);
    expect(rate(38, 20)).toBeCloseTo(0.55);
    expect(rate(41, 20)).toBeCloseTo(0.1);
    expect(rate(42, 20)).toBe(0.05);
    expect(rate(70, 20)).toBe(0.05);
    // 奇數樓層的怪物等級有半級：第 25 層是 37.5
    expect(rate(42, 25)).toBe(1);
    expect(rate(43, 25)).toBeCloseTo(0.925);
  });

  it('正常進度（每層約升 1.5 級）不會被打折；不在樓層裡也不打折', () => {
    // 每層只打一次、殺 85% 的等級（怪物經驗減半後）：第 10 層 Lv14、第 20 層 Lv29、第 30 層 Lv45、第 35 層 Lv55
    for (const [floor, level] of [[1, 1], [2, 4], [5, 8], [10, 14], [20, 29], [25, 36], [30, 45], [35, 55]] as const) expect(rate(level, floor)).toBe(1);
    expect(rate(70, 0)).toBe(1);
  });

  it('等級遠高於樓層時，擊殺怪物只拿到打折後的經驗（整數、至少 1）', () => {
    const events = new EventBus<GameEvents>();
    const world = new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events, seed: 7 });
    while (world.progress.level < 20) world.experience.addXp(xpToNext(world.progress.level, data.balance));
    expect(world.experience.killXpMultiplier).toBe(0.05);
    const onXp = vi.fn();
    events.on('XpGained', onXp);
    const foe = enemiesOf(world).find((a) => a.xpReward >= 20)!;
    foe.lastDamagedBy = world.player.id;
    foe.hp = 0;
    run(world, 0.1);
    expect(onXp).toHaveBeenCalledWith({ amount: Math.max(1, Math.round(foe.xpReward * 0.05)) });
  });

  it('等級在範圍內時拿全額', () => {
    const events = new EventBus<GameEvents>();
    const world = new GameWorld({ data, floor: 3, commands: new CommandQueue<GameCommand>(), events, seed: 7 });
    while (world.progress.level < 9) world.experience.addXp(xpToNext(world.progress.level, data.balance));
    expect(world.experience.killXpMultiplier).toBe(1);
    const onXp = vi.fn();
    events.on('XpGained', onXp);
    const foe = enemiesOf(world)[0]!;
    foe.lastDamagedBy = world.player.id;
    foe.hp = 0;
    run(world, 0.1);
    expect(onXp).toHaveBeenCalledWith({ amount: foe.xpReward });
  });
});

describe('開發用指令', () => {
  it('DebugSpawnChests：在玩家周圍的地板上生成寶箱，彼此不重疊且可以開啟', () => {
    const { world, send } = setup();
    const before = world.chests.length;
    send({ type: 'DebugSpawnChests', count: 3 });
    const spawned = world.chests.slice(before);
    expect(spawned).toHaveLength(3);
    for (const chest of spawned) {
      expect(world.nav.isClearAt(chest.position, 0.4)).toBe(true);
      expect(Math.hypot(chest.position.x - world.player.position.x, chest.position.y - world.player.position.y)).toBeLessThan(5);
    }
    for (let i = 0; i < spawned.length; i++) {
      for (let j = i + 1; j < spawned.length; j++) {
        const a = spawned[i]!.position;
        const b = spawned[j]!.position;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(0.9);
      }
    }
    send({ type: 'PrimaryAction', worldPos: spawned[0]!.position, targetId: null, interactId: spawned[0]!.id, held: false });
    for (let i = 0; i < 180; i++) world.update(1 / 60);
    expect(spawned[0]!.opened).toBe(true);
  });
});
