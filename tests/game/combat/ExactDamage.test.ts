import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { gameData } from '../../../src/data';
import { DamagePipeline } from '../../../src/game/combat/DamagePipeline';
import { StatusEffectSystem } from '../../../src/game/combat/StatusEffectSystem';
import type { GameEvents } from '../../../src/game/GameEvents';
import { makeActor } from '../helpers';

const balance = DataRegistry.load(gameData).balance;
const K = balance.combat.defenseConstant;

function setup(seed = 1) {
  const events = new EventBus<GameEvents>();
  const statuses = new StatusEffectSystem(events, balance.combat.maxControlResist);
  const pipeline = new DamagePipeline(balance, new Rng(seed), events, statuses);
  return { events, pipeline, statuses };
}
/** 什麼加成都有的來源：傷害加成 +100%、必定暴擊、暴擊傷害 +100% */
const strongSource = () => makeActor({ stats: { damageBonus: 1, critChance: 1, critDamageBonus: 1 } });
/** 什麼減傷都有的目標：防禦、火 / 電抗性 50%、減傷 30% */
const toughTarget = () => makeActor({ faction: 'enemy', stats: { maxHp: 1000, defense: K, fireResist: 0.5, lightningResist: 0.5, damageReduction: 0.3 } });

/** 固定值傷害：裝備的「該擊 X% 傷害」——觸發的那一擊已經算過加成、暴擊與減傷，不再算第二次（設計者 2026-11-21） */
describe('固定值傷害（DamageRequest.exact）', () => {
  it('不乘來源的傷害加成與目標的標記、不暴擊、不被防禦 / 抗性 / 減傷打折', () => {
    const { pipeline, statuses } = setup();
    const source = strongSource();
    const target = toughTarget();
    statuses.apply(target, 'marked', 5, 0.5, null);
    expect(pipeline.apply({ source, target, min: 20, max: 20, element: 'physical', exact: true })).toEqual({ amount: 20, isCrit: false, killed: false });
    expect(pipeline.apply({ source, target, min: 20, max: 20, element: 'lightning', exact: true })).toEqual({ amount: 20, isCrit: false, killed: false });
    expect(target.hp).toBe(960);
  });

  it('對照：同樣的數字不設 exact，會乘加成、標記、暴擊，再被抗性與減傷打折', () => {
    const { pipeline, statuses } = setup();
    const target = toughTarget();
    statuses.apply(target, 'marked', 5, 0.5, null);
    // 20 × 2（傷害加成）× 1.5（標記）× (暴擊 1.5 + 1) × 0.5（抗性）× 0.7（減傷）
    const expected = Math.round(20 * 2 * 1.5 * (balance.combat.critMultiplier + 1) * 0.5 * 0.7);
    expect(pipeline.apply({ source: strongSource(), target, min: 20, max: 20, element: 'lightning' })).toEqual({ amount: expected, isCrit: true, killed: false });
  });

  it('站在城垛後面的目標不再打折（那一擊已經折過）', () => {
    const { pipeline } = setup();
    const target = makeActor({ faction: 'enemy' });
    target.cover = 0.5;
    expect(pipeline.apply({ source: null, target, min: 20, max: 20, element: 'fire', exact: true })?.amount).toBe(20);
    expect(pipeline.apply({ source: null, target, min: 20, max: 20, element: 'fire' })?.amount).toBe(10);
  });

  it('防禦姿態照常擋下，也照常吸血', () => {
    const { pipeline, statuses } = setup();
    const source = makeActor({ stats: { lifeSteal: 0.1 } });
    source.hp = 50;
    const target = makeActor({ faction: 'enemy' });
    statuses.apply(target, 'guard', 5, 0.5, null);
    expect(pipeline.apply({ source, target, min: 20, max: 20, element: 'physical', exact: true })?.amount).toBe(10);
    expect(source.hp).toBeCloseTo(51);
    expect(target.hasStatus('guard')).toBe(false);
  });
});
