import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { DataRegistry } from '../../src/data/DataRegistry';
import type { EffectDef, ZoneEffectDef } from '../../src/data/schema/effects';
import { zoneTier } from '../../src/render/views/fx/ZoneTier';

const data = DataRegistry.load(gameData);
const zoneOf = (id: string): ZoneEffectDef => {
  const find = (effects: readonly EffectDef[]): ZoneEffectDef | null => {
    for (const e of effects) {
      if (e.type === 'zone') return e;
      const inner = (e as { effects?: EffectDef[]; onHit?: EffectDef[] }).effects ?? (e as { onHit?: EffectDef[] }).onHit;
      const nested = inner ? find(inner) : null;
      if (nested) return nested;
    }
    return null;
  };
  return find(data.skills.get(id).effects)!;
};

describe('地面持續範圍的殺傷力三階', () => {
  it.each([
    ['enemy.ember_wheel_trail', 1],
    ['enemy.venom_trail', 1],
    ['enemy.frost_whirl', 1],
    ['enemy.ember_lunge', 2],
    ['enemy.venom_toss', 2],
    ['magic.firewall', 3],
    ['enemy.behemoth_firewall', 3],
  ] as const)('%s 是 %i 階', (id, tier) => {
    expect(zoneTier(zoneOf(id))).toBe(tier);
  });

  it('可以手動指定階級', () => {
    expect(zoneTier({ ...zoneOf('enemy.venom_trail'), fxTier: 3 })).toBe(3);
  });
});
