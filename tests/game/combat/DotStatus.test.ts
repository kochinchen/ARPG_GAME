import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { DamagePipeline } from '../../../src/game/combat/DamagePipeline';
import { StatusEffectSystem } from '../../../src/game/combat/StatusEffectSystem';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameEvents } from '../../../src/game/GameEvents';
import { DT, makeActor } from '../helpers';

/** v0.4.0 新狀態：中毒、流血、弱化；所有持續傷害都不吸血 / 吸魔 */
const data = DataRegistry.load(gameData);

function setup(seed = 1) {
  const events = new EventBus<GameEvents>();
  const statuses = new StatusEffectSystem(events, data.balance.combat.maxControlResist);
  const pipeline = new DamagePipeline(data.balance, new Rng(seed), events, statuses);
  // 武器傷害固定 100、不暴擊，方便算總量（每跳取整數，數值太小誤差會很大）
  const caster = makeActor({ stats: { damageMin: 100, damageMax: 100, critChance: 0 } });
  const target = makeActor({ faction: 'enemy', stats: { maxHp: 1e6 } });
  target.hp = 1e6;
  const hits: { amount: number; element: string; isCrit: boolean }[] = [];
  events.on('ActorDamaged', (e) => {
    if (e.targetId === target.id) hits.push({ amount: e.amount, element: e.element, isCrit: e.isCrit });
  });
  const tick = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) statuses.update([caster, target], DT, pipeline);
  };
  return { statuses, pipeline, caster, target, hits, tick };
}

const total = (hits: { amount: number }[]) => hits.reduce((sum, h) => sum + h.amount, 0);
const countOf = (actor: Actor, kind: string) => actor.statuses.filter((s) => s.kind === kind).length;

describe('中毒', () => {
  it('總量 = 武器傷害 × 倍率，5 秒內每秒結算一次（共 5 跳），毒素元素', () => {
    const { statuses, caster, target, hits, tick } = setup();
    statuses.apply(target, 'poison', 5, 0.8, caster);
    tick(5.5);
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.element === 'poison' && !h.isCrit)).toBe(true);
    expect(total(hits)).toBe(80);
    expect(countOf(target, 'poison')).toBe(0);
  });

  it('吃「附加毒素傷害」；最多疊 3 層，第 4 層刷新最快到期的一層', () => {
    const { statuses, caster, target, hits, tick } = setup();
    caster.stats.setBase('poisonDamagePct', 0.5);
    statuses.apply(target, 'poison', 5, 1, caster);
    tick(5.5);
    expect(total(hits)).toBe(150);

    for (let i = 0; i < 4; i++) {
      statuses.apply(target, 'poison', 5, 1, caster);
      tick(0.5);
    }
    expect(countOf(target, 'poison')).toBe(3);
    // 第 4 次施加刷新最早的一層（剩 3.5 秒 → 5 秒，再過 0.5 秒為 4.5），另外兩層剩 3.5 / 4 秒
    const remaining = target.statuses.filter((s) => s.kind === 'poison').map((s) => s.remaining).sort();
    remaining.forEach((r, i) => expect(r).toBeCloseTo([3.5, 4, 4.5][i]!));
  });

  it('連續施放（滿層後一直刷新）時毒照樣每秒結算：3 層 × 每秒一跳', () => {
    const { statuses, caster, target, hits, tick } = setup();
    for (let i = 0; i < 50; i++) {
      statuses.apply(target, 'poison', 5, 1, caster);
      tick(0.1);
    }
    // 5 秒內 3 層各跳 4～5 次（每跳 20）
    expect(hits.length).toBeGreaterThanOrEqual(12);
    expect(total(hits)).toBeGreaterThanOrEqual(240);
  });

  it('不吃毒素抗性以外的減免：毒素抗性 50% 時減半', () => {
    const { statuses, caster, target, hits, tick } = setup();
    target.stats.setBase('poisonResist', 0.5);
    statuses.apply(target, 'poison', 5, 1, caster);
    tick(5.5);
    expect(total(hits)).toBe(50);
  });
});

describe('流血', () => {
  it('總量 = 武器傷害 × 倍率，每秒一跳、物理；不疊層，重新命中刷新時間', () => {
    const { statuses, caster, target, hits, tick } = setup();
    statuses.apply(target, 'bleed', 5, 0.8, caster);
    tick(3);
    statuses.apply(target, 'bleed', 5, 0.8, caster);
    expect(countOf(target, 'bleed')).toBe(1);
    expect(target.statuses.find((s) => s.kind === 'bleed')!.remaining).toBeCloseTo(5);
    tick(6);
    expect(hits).toHaveLength(8);
    expect(hits.every((h) => h.element === 'physical')).toBe(true);
  });

  it('每跳可以暴擊；中毒與燃燒不會', () => {
    const { statuses, caster, target, hits, tick } = setup();
    caster.stats.setBase('critChance', 1);
    statuses.apply(target, 'bleed', 5, 1, caster);
    tick(5.5);
    expect(hits.length).toBe(5);
    expect(hits.every((h) => h.isCrit)).toBe(true);

    hits.length = 0;
    caster.stats.setBase('spellPower', 10);
    statuses.apply(target, 'poison', 5, 1, caster);
    statuses.apply(target, 'burn', 2, 1, caster);
    tick(5.5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.isCrit)).toBe(false);
  });
});

describe('弱化（從有效抗性直接相減，可以變成負數；設計者 2026-10-18）', () => {
  const hit = (pipeline: DamagePipeline, caster: Actor, target: Actor, element: 'fire' | 'physical' | 'poison') =>
    pipeline.apply({ source: caster, target, min: 100, max: 100, element, canCrit: false })!.amount;

  it('魔抗 50% − 20% = 30%、物抗 50% − 40% = 10%；毒素不受影響；過期後恢復', () => {
    const { statuses, pipeline, caster, target, tick } = setup();
    target.stats.setBase('fireResist', 0.5);
    target.stats.setBase('poisonResist', 0.5);
    target.stats.setBase('physicalResist', 0.5);
    expect(hit(pipeline, caster, target, 'fire')).toBe(50);
    statuses.apply(target, 'expose', 6, 0.2, caster, 0.4);
    expect(hit(pipeline, caster, target, 'fire')).toBe(70);
    expect(hit(pipeline, caster, target, 'physical')).toBe(90);
    expect(hit(pipeline, caster, target, 'poison')).toBe(50);
    // 屬性本身不變（只在計算傷害時相減）
    expect(target.stats.get('fireResist')).toBeCloseTo(0.5);
    tick(6.5);
    expect(hit(pipeline, caster, target, 'fire')).toBe(50);
  });

  it('抗性 0 的一般怪也有效：0 − 25% = 多受 25% 傷害；超過上限的抗性先以上限計算再相減', () => {
    const { statuses, pipeline, caster, target } = setup();
    statuses.apply(target, 'expose', 6, 0.25, caster, 0.15);
    expect(hit(pipeline, caster, target, 'fire')).toBe(125);
    expect(hit(pipeline, caster, target, 'physical')).toBe(115);
    target.stats.setBase('fireResist', 0.9);
    // 上限 75% − 25% = 50%
    expect(hit(pipeline, caster, target, 'fire')).toBe(50);
  });
});

describe('持續傷害不吸取（v0.4.0：中毒、流血、既有的燃燒）', () => {
  it('吸血 / 吸魔對持續傷害無效；直接命中照常吸取', () => {
    const { statuses, pipeline, caster, target, tick } = setup();
    caster.stats.setBase('lifeSteal', 0.5);
    caster.stats.setBase('manaSteal', 0.5);
    caster.stats.setBase('spellPower', 20);
    caster.stats.setBase('maxMana', 1000);
    caster.hp = 1;
    caster.mana = 0;
    statuses.apply(target, 'poison', 5, 2, caster);
    statuses.apply(target, 'bleed', 5, 2, caster);
    statuses.apply(target, 'burn', 3, 1, caster);
    tick(5.5);
    expect(target.hp).toBeLessThan(1e6);
    expect(caster.hp).toBe(1);
    expect(caster.mana).toBe(0);

    pipeline.apply({ source: caster, target, min: 100, max: 100, element: 'physical', canCrit: false });
    expect(caster.hp).toBeGreaterThan(1);
    expect(caster.mana).toBeGreaterThan(0);
  });
});
