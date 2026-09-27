import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { DamagePipeline } from '../../../src/game/combat/DamagePipeline';
import { StatusEffectSystem } from '../../../src/game/combat/StatusEffectSystem';
import type { GameEvents } from '../../../src/game/GameEvents';
import { createWorld, DT, makeActor, noBaseRegen, run } from '../helpers';

/** 裝備詞綴的新屬性：元素抗性、閃避、荊棘 */
const balance = DataRegistry.load(gameData).balance;

function setup(seed = 1) {
  const events = new EventBus<GameEvents>();
  const pipeline = new DamagePipeline(balance, new Rng(seed), events, new StatusEffectSystem(events));
  return { events, pipeline };
}

describe('裝備的防禦屬性', () => {
  it('元素抗性降低對應元素的傷害，上限 75%；不影響物理', () => {
    const { pipeline } = setup();
    const source = makeActor({ faction: 'enemy', stats: { critChance: 0 } });
    const target = makeActor({ stats: { fireResist: 0.3, coldResist: 2 } });
    expect(pipeline.apply({ source, target, min: 100, max: 100, element: 'fire' })!.amount).toBe(70);
    expect(pipeline.apply({ source, target, min: 100, max: 100, element: 'cold' })!.amount).toBe(25);
    expect(pipeline.apply({ source, target, min: 20, max: 20, element: 'physical' })!.amount).toBe(20);
  });

  it('閃避：完全躲開攻擊（上限 50%），持續傷害不能閃避', () => {
    const { pipeline, events } = setup(3);
    const dodged = vi.fn();
    events.on('AttackDodged', dodged);
    const source = makeActor({ faction: 'enemy', stats: { critChance: 0 } });
    const target = makeActor({ stats: { maxHp: 1e6, dodgeChance: 0.9 } });
    let misses = 0;
    for (let i = 0; i < 1000; i++) if (pipeline.apply({ source, target, min: 1, max: 1, element: 'physical' })!.amount === 0) misses++;
    expect(misses / 1000).toBeGreaterThan(0.45);
    expect(misses / 1000).toBeLessThan(0.55);
    expect(dodged).toHaveBeenCalledTimes(misses);
    for (let i = 0; i < 50; i++) expect(pipeline.apply({ source, target, min: 1, max: 1, element: 'fire', isDot: true })!.amount).toBe(1);
  });

  it('荊棘：被近身攻擊時對攻擊者造成固定傷害；遠處攻擊不會', () => {
    const { pipeline } = setup();
    const near = makeActor({ faction: 'enemy', position: vec2(0.5, 0), stats: { critChance: 0 } });
    const far = makeActor({ faction: 'enemy', position: vec2(8, 0), stats: { critChance: 0 } });
    const target = makeActor({ stats: { thorns: 7, critChance: 0 } });
    pipeline.apply({ source: near, target, min: 5, max: 5, element: 'physical' });
    pipeline.apply({ source: far, target, min: 5, max: 5, element: 'physical' });
    expect(near.hp).toBe(93);
    expect(far.hp).toBe(100);
  });
});

describe('裝備的攻擊與輔助屬性（整合）', () => {
  it('元素附加傷害：每次命中額外造成一段該元素的傷害', () => {
    const { world, commands, events } = createWorld();
    const dummy = world.actors.find((a) => a.defId === 'enemy.training_dummy' && a.position.x === 8.5)!;
    world.player.stats.addModifier({ stat: 'coldDamagePct', kind: 'flat', value: 0.5, source: 'test' });
    const hits: { element: string; amount: number }[] = [];
    events.on('ActorDamaged', (e) => {
      if (e.targetId === dummy.id) hits.push({ element: e.element, amount: e.amount });
    });
    commands.push({ type: 'PrimaryAction', worldPos: dummy.position, targetId: dummy.id, held: false }, { type: 'PrimaryRelease' });
    run(world, 3);
    const physical = hits.find((h) => h.element === 'physical');
    const cold = hits.find((h) => h.element === 'cold');
    expect(physical).toBeDefined();
    expect(cold).toBeDefined();
  });

  it('藥水效果提高回復量', () => {
    const { world, commands, data } = createWorld();
    const potion = data.potions.get(data.balance.player.potionId);
    world.player.stats.addModifier({ stat: 'potionEffect', kind: 'flat', value: 0.5, source: 'test' });
    noBaseRegen(world.player);
    world.player.hp = 1;
    commands.push({ type: 'UsePotion' });
    world.update(DT);
    expect(world.player.hp).toBeCloseTo(1 + world.player.maxHp * potion.hpPct * 1.5);
  });
});

describe('主倍率算進角色的武器傷害', () => {
  it('穿上鐵製長劍 +213%（基礎 6–13）：武器傷害增加 19–41', () => {
    const { world } = createWorld();
    world.equipment.unequip('weapon');
    const min = world.player.stats.get('damageMin');
    const max = world.player.stats.get('damageMax');
    world.equipment.equip({ uid: 'ls', baseId: 'weapon.iron_longsword', rarity: 'legendary', itemLevel: 12, quality: 2.13, affixes: [] });
    expect(world.player.stats.get('damageMin') - min).toBe(19);
    expect(world.player.stats.get('damageMax') - max).toBe(41);
  });
});
