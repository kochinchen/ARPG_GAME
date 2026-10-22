import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { EffectDef } from '../../src/data/schema/effects';
import { EnemyFactory } from '../../src/game/enemies/EnemyFactory';

/** 怪物的天生抗性：有特殊屬性的怪物，對自己的屬性有對應的抗性 */
const data = DataRegistry.load(gameData);

/** 一個技能（含子效果）造成的元素傷害 */
function elementsOf(effects: readonly EffectDef[], out = new Set<string>()): Set<string> {
  for (const e of effects) {
    if (e.type === 'damage' && e.element !== 'physical') out.add(e.element);
    for (const key of ['effects', 'onHit', 'onPath'] as const) {
      const nested = (e as Record<string, unknown>)[key];
      if (Array.isArray(nested)) elementsOf(nested as EffectDef[], out);
    }
  }
  return out;
}

describe('怪物的天生抗性', () => {
  it('一般怪物的攻擊帶有哪種元素，就有那種元素的抗性（至少 10%）', () => {
    for (const enemy of data.enemies.all.filter((e) => !e.boss)) {
      const elements = new Set(enemy.skills.flatMap((id) => [...elementsOf(data.skills.get(id).effects)]));
      for (const el of elements) expect(enemy.resist[el as keyof typeof enemy.resist] ?? 0, `${enemy.name}：${el}`).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('一般怪物的天生抗性不超過魔王最高天生抗性的 70%', () => {
    const values = (e: (typeof data.enemies.all)[number]) => Object.values(e.resist) as number[];
    const bossMax = Math.max(...data.enemies.all.filter((e) => e.boss).flatMap(values));
    for (const enemy of data.enemies.all.filter((e) => !e.boss)) {
      for (const v of values(enemy)) expect(v, enemy.name).toBeLessThanOrEqual(bossMax * 0.7 + 1e-9);
    }
  });

  it('生成時套用到抗性屬性：冰霜骷髏冰寒 20%、其他元素 0', () => {
    const actor = new EnemyFactory().create(data.enemies.get('enemy.frost_skeleton'), 1, vec2(0, 0));
    expect(actor.stats.get('coldResist')).toBeCloseTo(0.2);
    expect(actor.stats.get('fireResist')).toBe(0);
  });
});
