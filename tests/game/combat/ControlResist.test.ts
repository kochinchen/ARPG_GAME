import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { StatId } from '../../../src/data/schema/common';
import type { GameCommand } from '../../../src/game/Commands';
import { NO_MODS } from '../../../src/game/combo/StepMods';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { KnockbackEffect } from '../../../src/game/skills/effects/KnockbackEffect';
import type { EffectContext, EffectServices } from '../../../src/game/skills/effects/IEffect';

const data = DataRegistry.load(gameData);
const newWorld = () => new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: 3 });
const give = (world: GameWorld, stat: StatId, value: number) => world.player.stats.addModifier({ stat, kind: 'flat', value, source: 'test' });
const status = (world: GameWorld, kind: string) => world.player.statuses.find((s) => s.kind === kind)!;

/** 從玩家左邊 1 格處擊退玩家，回傳被推了多遠 */
function knockback(world: GameWorld, tiles: number): number {
  const player = world.player;
  const before = { ...player.position };
  const ctx = {
    caster: player,
    skill: data.skills.get('melee.quake_slash'),
    rank: 1,
    target: player,
    origin: vec2(player.position.x - 1, player.position.y),
    direction: vec2(1, 0),
    services: { statuses: world.statuses, nav: world.nav } as unknown as EffectServices,
    mods: NO_MODS,
    run: () => {},
  } satisfies EffectContext;
  new KnockbackEffect().apply({ type: 'knockback', distance: tiles }, ctx);
  return distance(before, player.position);
}

describe('控制抗性', () => {
  it('緩速抗性：緩速效果按比例變弱', () => {
    const world = newWorld();
    give(world, 'slowResist', 0.5);
    world.statuses.apply(world.player, 'slow', 2, 0.4, null);
    expect(status(world, 'slow').magnitude).toBeCloseTo(0.2);
    expect(world.player.stats.get('moveSpeed')).toBeCloseTo(data.balance.player.moveSpeed * 0.8);
  });

  it('暈眩時間減少：暈眩時間按比例縮短', () => {
    const world = newWorld();
    give(world, 'stunResist', 0.5);
    world.statuses.apply(world.player, 'stun', 0.8, 0, null);
    expect(status(world, 'stun').remaining).toBeCloseTo(0.4);
  });

  it('上限 75%：堆超過上限也只減 75%', () => {
    const world = newWorld();
    give(world, 'slowResist', 2);
    give(world, 'stunResist', 2);
    world.statuses.apply(world.player, 'slow', 2, 0.4, null);
    world.statuses.apply(world.player, 'stun', 0.8, 0, null);
    expect(status(world, 'slow').magnitude).toBeCloseTo(0.1);
    expect(status(world, 'stun').remaining).toBeCloseTo(0.2);
  });

  it('擊退抗性：擊退距離按比例縮短', () => {
    const base = knockback(newWorld(), 1);
    expect(base).toBeGreaterThan(0.5);
    const world = newWorld();
    give(world, 'knockbackResist', 0.5);
    expect(knockback(world, 1)).toBeCloseTo(base * 0.5, 1);
  });

  it('詞綴：三種控制抗性都有一般詞綴與強屬性', () => {
    for (const stat of ['slowResist', 'knockbackResist', 'stunResist']) {
      const kinds = data.affixes.all.filter((a) => a.stat === stat).map((a) => a.kind);
      expect(kinds).toContain('item');
      expect(kinds).toContain('strong');
    }
  });
});
