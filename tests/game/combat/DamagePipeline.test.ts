import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { gameData } from '../../../src/data';
import { DamagePipeline, defenseMitigation } from '../../../src/game/combat/DamagePipeline';
import type { GameEvents } from '../../../src/game/GameEvents';
import { makeActor } from '../helpers';

const balance = DataRegistry.load(gameData).balance;
const K = balance.combat.defenseConstant;
const CRIT = balance.combat.critMultiplier;

function setup(seed = 1) {
  const events = new EventBus<GameEvents>();
  const pipeline = new DamagePipeline(balance, new Rng(seed), events);
  return { events, pipeline };
}

describe('defenseMitigation', () => {
  it('防禦 = K 時減傷 50%；無防禦不減傷；永遠小於 100%', () => {
    expect(defenseMitigation(K, K)).toBeCloseTo(0.5);
    expect(defenseMitigation(0, K)).toBe(0);
    expect(defenseMitigation(1e9, K)).toBeLessThan(1);
  });
});

describe('DamagePipeline', () => {
  it('無防禦、無暴擊時造成基礎傷害並扣血', () => {
    const { pipeline } = setup();
    const source = makeActor({ stats: { critChance: 0 } });
    const target = makeActor({ faction: 'enemy' });
    const result = pipeline.apply({ source, target, min: 10, max: 10, element: 'physical' });
    expect(result).toEqual({ amount: 10, isCrit: false, killed: false });
    expect(target.hp).toBe(90);
    expect(target.lastDamagedBy).toBe(source.id);
  });

  it('物理傷害套用防禦減傷', () => {
    const { pipeline } = setup();
    const target = makeActor({ faction: 'enemy', stats: { defense: K } });
    expect(pipeline.apply({ source: null, target, min: 20, max: 20, element: 'physical' })?.amount).toBe(10);
  });

  it('元素傷害不受防禦影響', () => {
    const { pipeline } = setup();
    const target = makeActor({ faction: 'enemy', stats: { defense: K } });
    expect(pipeline.apply({ source: null, target, min: 20, max: 20, element: 'fire' })?.amount).toBe(20);
  });

  it('暴擊時乘上暴擊倍率', () => {
    const { pipeline } = setup();
    const source = makeActor({ stats: { critChance: 1 } });
    const target = makeActor({ faction: 'enemy' });
    const result = pipeline.apply({ source, target, min: 10, max: 10, element: 'physical' });
    expect(result?.isCrit).toBe(true);
    expect(result?.amount).toBe(Math.round(10 * CRIT));
  });

  it('canCrit: false 時不會暴擊', () => {
    const { pipeline } = setup();
    const source = makeActor({ stats: { critChance: 1 } });
    const target = makeActor({ faction: 'enemy' });
    expect(pipeline.apply({ source, target, min: 10, max: 10, element: 'poison', canCrit: false })?.isCrit).toBe(false);
  });

  it('有傷害時至少造成 1 點；0 傷害不扣血也不發事件', () => {
    const { pipeline, events } = setup();
    const handler = vi.fn();
    events.on('ActorDamaged', handler);
    const tank = makeActor({ faction: 'enemy', stats: { defense: 1e6 } });
    expect(pipeline.apply({ source: null, target: tank, min: 1, max: 1, element: 'physical' })?.amount).toBe(1);
    handler.mockClear();
    const target = makeActor({ faction: 'enemy' });
    expect(pipeline.apply({ source: null, target, min: 0, max: 0, element: 'physical' })?.amount).toBe(0);
    expect(target.hp).toBe(100);
    expect(handler).not.toHaveBeenCalled();
  });

  it('HP 不會低於 0，並回報 killed', () => {
    const { pipeline } = setup();
    const target = makeActor({ faction: 'enemy', stats: { maxHp: 5 } });
    expect(pipeline.apply({ source: null, target, min: 50, max: 50, element: 'physical' })?.killed).toBe(true);
    expect(target.hp).toBe(0);
  });

  it('已死亡的目標不受傷害', () => {
    const { pipeline } = setup();
    const target = makeActor({ faction: 'enemy' });
    target.alive = false;
    expect(pipeline.apply({ source: null, target, min: 10, max: 10, element: 'physical' })).toBeNull();
  });

  it('發出 ActorDamaged 事件', () => {
    const { pipeline, events } = setup();
    const handler = vi.fn();
    events.on('ActorDamaged', handler);
    const source = makeActor({ stats: { critChance: 0 } });
    const target = makeActor({ faction: 'enemy' });
    pipeline.apply({ source, target, min: 7, max: 7, element: 'physical' });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: target.id, sourceId: source.id, amount: 7, isCrit: false }),
    );
  });

  it('同一個 seed 產生相同的傷害序列', () => {
    const roll = (seed: number) => {
      const { pipeline } = setup(seed);
      const source = makeActor({ stats: { critChance: 0.3 } });
      return Array.from({ length: 20 }, () => {
        const target = makeActor({ faction: 'enemy', stats: { maxHp: 1000 } });
        return pipeline.apply({ source, target, min: 3, max: 12, element: 'physical' })?.amount;
      });
    };
    expect(roll(42)).toEqual(roll(42));
    expect(roll(42)).not.toEqual(roll(43));
  });
});
