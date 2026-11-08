import { describe, expect, it } from 'vitest';
import { add, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { ProjectileEffectDef } from '../../../src/data/schema/effects';
import { NO_MODS } from '../../../src/game/combo/StepMods';
import { createWorldWithMap, enemiesOf, run } from '../helpers';

/** 飛斧重甲的迴旋斧（設計者 2026-11-08）：沿直線飛出去、飛到最遠或撞牆後飛回手上，來回都會擊中 */
const data = DataRegistry.load(gameData);
const ROOM = [
  '##################',
  '#S...............#',
  '#................#',
  '##################',
];

function throwAxe(spawns: { enemyId: string; at: [number, number] }[], range: number) {
  const ctx = createWorldWithMap(ROOM, spawns);
  const w = ctx.world;
  for (const e of enemiesOf(w)) {
    e.stats.setBase('maxHp', 1e6);
    e.hp = 1e6;
  }
  const skill = data.skills.get('enemy.axe_throw');
  const def = skill.effects[0] as ProjectileEffectDef;
  expect(def.returns).toBe(true);
  const start = add(w.player.position, vec2(0.5, 0));
  w.projectiles.push({
    id: 999,
    caster: w.player,
    skill,
    rank: 1,
    position: start,
    prevPosition: start,
    direction: vec2(1, 0),
    speed: def.speed,
    radius: def.radius,
    remaining: range,
    pierceLeft: 0,
    hitIds: new Set(),
    onHit: def.onHit,
    alive: true,
    mods: NO_MODS,
    returns: true,
    traveled: 0,
  });
  return w;
}

describe('迴旋的投射物', () => {
  it('去程、回程各擊中一次，不因擊中而消失，最後回到發射者手上', () => {
    const w = throwAxe([{ enemyId: 'enemy.training_dummy', at: [4.5, 1.5] }], 6.5);
    const dummy = enemiesOf(w)[0]!;
    let hits = 0;
    let last = dummy.hp;
    let farthest = 0;
    run(w, 3, () => {
      if (dummy.hp < last) hits++;
      last = dummy.hp;
      for (const p of w.projectiles) farthest = Math.max(farthest, p.position.x);
    });
    expect(hits).toBe(2);
    expect(farthest).toBeGreaterThan(8);
    expect(w.projectiles).toHaveLength(0);
  });

  it('去程撞牆就掉頭飛回來', () => {
    const w = throwAxe([], 40);
    let farthest = 0;
    let ticks = 0;
    run(w, 6, () => {
      for (const p of w.projectiles) farthest = Math.max(farthest, p.position.x);
      if (w.projectiles.length > 0) ticks++;
    });
    expect(farthest).toBeGreaterThan(15);
    expect(farthest).toBeLessThan(17.2);
    expect(w.projectiles).toHaveLength(0);
    // 來回約 2 × 15 格 ÷ 8 格/秒 ≈ 3.8 秒
    expect(ticks * (1 / 60)).toBeLessThan(4.5);
  });
});
