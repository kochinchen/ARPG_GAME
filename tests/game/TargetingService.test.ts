import { describe, expect, it } from 'vitest';
import { vec2 } from '../../src/core/math/Vec2';
import { TargetingService } from '../../src/game/targeting/TargetingService';
import { makeActor } from './helpers';

describe('TargetingService', () => {
  const player = makeActor({ faction: 'player', position: vec2(0, 0) });
  const summon = makeActor({ faction: 'summon', position: vec2(1, 0) });
  const enemyNear = makeActor({ faction: 'enemy', position: vec2(3, 0), radius: 0.35 });
  const enemyFar = makeActor({ faction: 'enemy', position: vec2(3.5, 0), radius: 0.35 });
  const dead = makeActor({ faction: 'enemy', position: vec2(6, 0) });
  dead.alive = false;
  const targeting = new TargetingService([player, summon, enemyNear, enemyFar, dead]);

  it('player / summon 同陣營，與 enemy 敵對', () => {
    expect(targeting.isHostile('player', 'enemy')).toBe(true);
    expect(targeting.isHostile('summon', 'enemy')).toBe(true);
    expect(targeting.isHostile('player', 'summon')).toBe(false);
    expect(targeting.isHostile('enemy', 'enemy')).toBe(false);
  });

  it('getValidTarget 排除友軍、死亡與不存在的目標', () => {
    expect(targeting.getValidTarget(player, enemyNear.id)).toBe(enemyNear);
    expect(targeting.getValidTarget(player, summon.id)).toBeNull();
    expect(targeting.getValidTarget(player, dead.id)).toBeNull();
    expect(targeting.getValidTarget(player, 99999)).toBeNull();
  });

  it('pickAt 回傳最接近點選位置的敵人，超出容許範圍則為 null', () => {
    expect(targeting.pickAt(player, vec2(3.1, 0.1))).toBe(enemyNear);
    expect(targeting.pickAt(player, vec2(3.45, 0))).toBe(enemyFar);
    expect(targeting.pickAt(player, vec2(3, 2))).toBeNull();
    expect(targeting.pickAt(player, vec2(6, 0))).toBeNull();
    expect(targeting.pickAt(player, vec2(1, 0))).toBeNull();
  });
});
