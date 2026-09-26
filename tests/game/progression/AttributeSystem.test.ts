import { describe, expect, it } from 'vitest';
import { createWorld, run } from '../helpers';

describe('屬性點（AttributeSystem）', () => {
  it('每升一級得到 3 點；Lv1 沒有屬性點', () => {
    const { world, data } = createWorld();
    expect(world.progress.attributePoints).toBe(0);
    world.experience.grantLevel();
    world.experience.grantLevel();
    expect(world.progress.attributePoints).toBe(2 * data.balance.attributes.pointsPerLevel);
    expect(data.balance.attributes.pointsPerLevel).toBe(3);
  });

  it('攻擊 / 生命 / 魔力 / 防禦 / 暴擊各自加到對應屬性', () => {
    const { world, commands } = createWorld();
    for (let i = 0; i < 5; i++) world.experience.grantLevel();
    const s = world.player.stats;
    const before = {
      min: s.get('damageMin'),
      max: s.get('damageMax'),
      spell: s.get('spellPower'),
      bonus: s.get('damageBonus'),
      hp: world.player.maxHp,
      mp: world.player.maxMana,
      def: s.get('defense'),
      crit: s.get('critChance'),
    };
    for (const attribute of ['attack', 'vitality', 'mana', 'defense', 'crit']) commands.push({ type: 'AllocateAttribute', attribute, count: 3 });
    run(world, 1 / 60);
    expect(world.progress.attributePoints).toBe(0);
    // 攻擊：基礎攻擊（武器最小 / 最大值、法術強度）各 +0.3，近戰另外 +0.5%；不再加全部傷害 %
    expect(s.get('damageMin')).toBeCloseTo(before.min + 0.9);
    expect(s.get('damageMax')).toBeCloseTo(before.max + 0.9);
    expect(s.get('spellPower')).toBeCloseTo(before.spell + 0.9);
    expect(s.get('damageBonus')).toBeCloseTo(before.bonus);
    expect(s.get('meleeDamageBonus')).toBeCloseTo(0.015);
    expect(world.player.maxMana).toBeCloseTo(before.mp + 12);
    expect(world.player.maxHp).toBeCloseTo(before.hp + 15);
    expect(s.get('defense')).toBeCloseTo(before.def + 6);
    expect(s.get('critChance')).toBeCloseTo(before.crit + 0.015);
  });

  it('加生命時目前 HP 一起增加', () => {
    const { world } = createWorld();
    world.experience.grantLevel();
    world.player.hp = 50;
    world.attributes.allocate('vitality', 2);
    expect(world.player.hp).toBe(60);
  });

  it('點數不足時加到用完為止；未知屬性、沒有點數時不動', () => {
    const { world } = createWorld();
    world.experience.grantLevel();
    expect(world.attributes.allocate('attack', 5)).toBe(3);
    expect(world.attributes.points('attack')).toBe(3);
    expect(world.attributes.allocate('attack', 1)).toBe(0);
    expect(world.attributes.check('attack')).toEqual({ ok: false, reason: 'noPoints' });
    expect(world.attributes.check('luck')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('暴擊有上限 80 點（+40%）', () => {
    const { world } = createWorld();
    for (let i = 0; i < 30; i++) world.experience.grantLevel();
    expect(world.attributes.allocate('crit', 100)).toBe(80);
    expect(world.attributes.check('crit')).toEqual({ ok: false, reason: 'maxPoints' });
    expect(world.progress.attributePoints).toBe(90 - 80);
  });

  it('倒地時不能分配（所有操作都不接受）', () => {
    const { world, commands } = createWorld();
    world.experience.grantLevel();
    world.player.alive = false;
    commands.push({ type: 'AllocateAttribute', attribute: 'attack', count: 1 });
    run(world, 1 / 60);
    expect(world.attributes.points('attack')).toBe(0);
  });
});
