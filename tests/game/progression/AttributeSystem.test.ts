import { describe, expect, it } from 'vitest';
import { skillAttributePoints, skillGrantOf } from '../../../src/game/progression/AttributeSystem';
import { createWorld, run } from '../helpers';

/** 屬性 = 技能等級給的（設計者 2026-11-21）＋自己分配的自由點數（《井誌》等獎勵） */
describe('屬性點（AttributeSystem）', () => {
  it('升級不再給自由屬性點；每招每升一級給 3 點，分配表每一格加總都是 3', () => {
    const { world, data } = createWorld();
    world.experience.grantLevel();
    world.experience.grantLevel();
    expect(world.progress.attributePoints).toBe(0);
    const a = data.balance.attributes;
    expect([a.pointsPerLevel, a.skillPointsPerRank]).toEqual([0, 3]);
    const tree = data.skills.all.filter((s) => s.tree);
    expect(tree).toHaveLength(60);
    for (const skill of tree) expect(Object.values(skillGrantOf(skill, data)).reduce((x, y) => x + y, 0), skill.name).toBe(3);
    // 設計者確認的幾招：重砍 攻 2 生 1、火球 攻 2 魔 1、鐵壁 防 3、精密 暴 3
    const grant = (name: string) => skillGrantOf(tree.find((s) => s.name === name)!, data);
    expect(grant('重砍')).toEqual({ attack: 2, vitality: 1 });
    expect(grant('火球')).toEqual({ attack: 2, mana: 1 });
    expect(grant('鐵壁')).toEqual({ defense: 3 });
    expect(grant('精密')).toEqual({ crit: 3 });
  });

  it('新角色：起始的重砍、火球各 1 級就有屬性（攻 4、生 1、魔 1）；學技能、升級技能時屬性跟著加', () => {
    const { world, data } = createWorld();
    const attrs = world.attributes;
    expect(['attack', 'vitality', 'mana', 'defense', 'crit'].map((id) => attrs.fromSkills(id))).toEqual([4, 1, 1, 0, 0]);
    expect(world.player.stats.get('meleeDamageBonus')).toBeCloseTo(0.02);
    const hp = world.player.maxHp;
    const heavy = data.skills.all.find((s) => s.name === '重砍')!;
    world.progress.skillPoints = 5;
    world.skillTree.learn(heavy.id);
    expect(attrs.fromSkills('attack')).toBe(6);
    expect(attrs.fromSkills('vitality')).toBe(2);
    expect(world.player.maxHp).toBeCloseTo(hp + 5);
    expect(attrs.total('attack')).toBe(6);
    expect(attrs.points('attack')).toBe(0);
  });

  it('全部技能練滿的總和 = 60 招 × 5 級 × 3 點', () => {
    const { data } = createWorld();
    const all = skillAttributePoints(() => data.balance.maxSkillRank, data);
    expect(Object.values(all).reduce((x, y) => x + y, 0)).toBe(60 * 5 * 3);
    // 暴擊：全部給暴擊的招式練滿是 130 點；正常玩法到不了原本 80 點的上限
    expect(all.crit).toBe(130);
  });

  it('自由點數：攻擊 / 生命 / 魔力 / 防禦 / 暴擊各自加到對應屬性，和技能給的相加', () => {
    const { world, commands } = createWorld();
    world.progress.attributePoints = 15;
    const s = world.player.stats;
    const before = { min: s.get('damageMin'), max: s.get('damageMax'), spell: s.get('spellPower'), melee: s.get('meleeDamageBonus'), hp: world.player.maxHp, mp: world.player.maxMana, def: s.get('defense'), crit: s.get('critChance') };
    for (const attribute of ['attack', 'vitality', 'mana', 'defense', 'crit']) commands.push({ type: 'AllocateAttribute', attribute, count: 3 });
    run(world, 1 / 60);
    expect(world.progress.attributePoints).toBe(0);
    // 攻擊：基礎攻擊（武器最小 / 最大值、法術強度）各 +0.3，近戰另外 +0.5%
    expect(s.get('damageMin')).toBeCloseTo(before.min + 0.9);
    expect(s.get('damageMax')).toBeCloseTo(before.max + 0.9);
    expect(s.get('spellPower')).toBeCloseTo(before.spell + 0.9);
    expect(s.get('meleeDamageBonus')).toBeCloseTo(before.melee + 0.015);
    expect(world.player.maxMana).toBeCloseTo(before.mp + 12);
    expect(world.player.maxHp).toBeCloseTo(before.hp + 15);
    expect(s.get('defense')).toBeCloseTo(before.def + 6);
    expect(s.get('critChance')).toBeCloseTo(before.crit + 0.015);
    expect(world.attributes.points('attack')).toBe(3);
    expect(world.attributes.total('attack')).toBe(3 + world.attributes.fromSkills('attack'));
  });

  it('加生命時目前 HP 一起增加', () => {
    const { world } = createWorld();
    world.progress.attributePoints = 3;
    world.player.hp = 50;
    world.attributes.allocate('vitality', 2);
    expect(world.player.hp).toBe(60);
  });

  it('點數不足時加到用完為止；未知屬性、沒有點數時不動', () => {
    const { world } = createWorld();
    world.progress.attributePoints = 3;
    expect(world.attributes.allocate('attack', 5)).toBe(3);
    expect(world.attributes.points('attack')).toBe(3);
    expect(world.attributes.allocate('attack', 1)).toBe(0);
    expect(world.attributes.check('attack')).toEqual({ ok: false, reason: 'noPoints' });
    expect(world.attributes.check('luck')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('暴擊的上限解開了：自由點數可以全部加在暴擊', () => {
    const { world } = createWorld();
    world.progress.attributePoints = 100;
    expect(world.attributes.allocate('crit', 100)).toBe(100);
    expect(world.progress.attributePoints).toBe(0);
  });

  it('洗技能點：技能給的屬性收回，自己分配的自由點數不動；洗自由點數比洗技能貴', () => {
    const { world, commands, data } = createWorld();
    world.progress.attributePoints = 4;
    world.attributes.allocate('defense', 4);
    world.progress.skillPoints = 4;
    const heavy = data.skills.all.find((s) => s.name === '重砍')!;
    for (let i = 0; i < 4; i++) world.skillTree.learn(heavy.id);
    expect(world.attributes.fromSkills('attack')).toBe(12);
    world.wallet.gold = 1_000_000;
    commands.push({ type: 'Respec', kind: 'skills' });
    run(world, 1 / 60);
    // 重砍退回起始的 1 級（起始技能不會被洗掉）
    expect(world.attributes.fromSkills('attack')).toBe(4);
    expect(world.attributes.points('defense')).toBe(4);
    expect(world.player.stats.get('meleeDamageBonus')).toBeCloseTo(0.02);
    expect(world.respecCost('attributes')).toBeGreaterThan(world.respecCost('skills'));
  });

  it('倒地時不能分配（所有操作都不接受）', () => {
    const { world, commands } = createWorld();
    world.progress.attributePoints = 3;
    world.player.alive = false;
    commands.push({ type: 'AllocateAttribute', attribute: 'attack', count: 1 });
    run(world, 1 / 60);
    expect(world.attributes.points('attack')).toBe(0);
  });
});
