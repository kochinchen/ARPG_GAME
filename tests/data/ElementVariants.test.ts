import { describe, expect, it } from 'vitest';
import { enemies } from '../../src/data/enemies';
import { skills } from '../../src/data/skills';

/** 赤焰 / 紫電骷髏、凍骨 / 猛毒弓手（設計者 2026-11-07）：普通攻擊另外附加 20% 該屬性的傷害 */
const VARIANTS = [
  ['enemy.flame_skeleton', 'enemy.flame_strike', 'fire'],
  ['enemy.storm_skeleton', 'enemy.storm_slash', 'lightning'],
  ['enemy.frost_archer', 'enemy.frost_arrow', 'cold'],
  ['enemy.venom_archer', 'enemy.venom_arrow', 'poison'],
] as const;

describe('屬性版本的骷髏與弓手', () => {
  it.each(VARIANTS)('%s 的攻擊是武器傷害 + 20% 的屬性傷害', (enemyId, skillId, element) => {
    const enemy = enemies.find((e) => e.id === enemyId)!;
    expect(enemy.skills).toEqual([skillId]);
    const skill = skills.find((s) => s.id === skillId)!;
    const all = skill.effects ?? [];
    const effects = (all[0]!.type === 'projectile' ? (all[0] as { onHit: unknown[] }).onHit : all) as { type: string; element: string; multiplier?: number }[];
    const damage = effects.filter((e) => e.type === 'damage');
    expect(damage.map((d) => [d.element, d.multiplier ?? 1])).toEqual([
      ['physical', 1],
      [element, 0.2],
    ]);
  });

  it('都會出現：是樓層裡某種怪的特化型', () => {
    const pool = new Set(enemies.flatMap((e) => (e.variants ?? []).map((v) => v.enemyId)));
    for (const [enemyId] of VARIANTS) expect(pool.has(enemyId), enemyId).toBe(true);
  });
});
