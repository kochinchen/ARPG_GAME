import { describe, expect, it } from 'vitest';
import { StatBlock } from '../../src/game/stats/StatBlock';

describe('StatBlock', () => {
  it('沒有 Modifier 時回傳基礎值；未設定的屬性為 0', () => {
    const stats = new StatBlock({ maxHp: 100 });
    expect(stats.get('maxHp')).toBe(100);
    expect(stats.get('defense')).toBe(0);
  });

  it('計算順序：(base + flat) × (1 + Σincreased) × Π(1 + more)', () => {
    const stats = new StatBlock({ damageMin: 10 });
    stats.addModifier({ stat: 'damageMin', kind: 'flat', value: 10, source: 'a' });
    stats.addModifier({ stat: 'damageMin', kind: 'increased', value: 0.2, source: 'b' });
    stats.addModifier({ stat: 'damageMin', kind: 'increased', value: 0.3, source: 'c' });
    stats.addModifier({ stat: 'damageMin', kind: 'more', value: 0.1, source: 'd' });
    stats.addModifier({ stat: 'damageMin', kind: 'more', value: 0.1, source: 'e' });
    // (10 + 10) × 1.5 × 1.1 × 1.1
    expect(stats.get('damageMin')).toBeCloseTo(36.3);
  });

  it('Modifier 只影響指定的屬性', () => {
    const stats = new StatBlock({ maxHp: 100, defense: 5 });
    stats.addModifier({ stat: 'defense', kind: 'flat', value: 10, source: 'armor' });
    expect(stats.get('maxHp')).toBe(100);
    expect(stats.get('defense')).toBe(15);
  });

  it('removeBySource 移除該來源全部 Modifier，數值回到原值', () => {
    const stats = new StatBlock({ maxHp: 100, defense: 5 });
    stats.get('maxHp');
    stats.addModifier({ stat: 'maxHp', kind: 'flat', value: 20, source: 'item:1' });
    stats.addModifier({ stat: 'defense', kind: 'increased', value: 1, source: 'item:1' });
    stats.addModifier({ stat: 'maxHp', kind: 'flat', value: 5, source: 'item:2' });
    expect(stats.get('maxHp')).toBe(125);
    stats.removeBySource('item:1');
    expect(stats.get('maxHp')).toBe(105);
    expect(stats.get('defense')).toBe(5);
  });

  it('setBase 會更新快取', () => {
    const stats = new StatBlock({ maxHp: 100 });
    expect(stats.get('maxHp')).toBe(100);
    stats.setBase('maxHp', 150);
    expect(stats.get('maxHp')).toBe(150);
  });
});
