import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { createSim, tickSim } from '../../../src/tools/bossSim/SimWorld';

/** 鑽地突襲（設計者 2026-11-08）：主角離得遠時蟲鑽進地下，從主角腳下鑽出來；地上的印記最後會停住，走出去就躲得掉 */
const DT = 1 / 60;
const CASES: [string, string, number, number][] = [
  ['enemy.burrower', 'enemy.burrow_strike', 25, 1.3],
  ['enemy.void_maw', 'enemy.maw_ambush', 30, 2],
];

function ambush(enemyId: string, skillId: string, floor: number) {
  const sim = createSim({ enemyId, floor, level: 30, gear: 'none', phase: 1 });
  let cast = false;
  let hit = false;
  let emerged = false;
  sim.world.events.on('SkillCast', (e) => {
    if (e.actorId === sim.enemy.id && e.skillId === skillId) cast = true;
  });
  sim.world.events.on('SkillHit', (e) => {
    if (e.skillId === skillId) hit = true;
  });
  sim.world.events.on('ActorEmerged', (e) => {
    if (e.actorId === sim.enemy.id) emerged = true;
  });
  const step = (seconds: number, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      sim.world.player.hp = sim.world.player.maxHp;
      tickSim(sim, DT);
      each?.();
    }
  };
  const untilCast = () => {
    for (let i = 0; i < 60 * 60 && !cast; i++) step(1 / 60);
    expect(cast).toBe(true);
  };
  const untilEmerged = () => {
    for (let i = 0; i < 6 * 60 && !emerged; i++) step(1 / 60);
    expect(emerged).toBe(true);
  };
  return { sim, step, untilCast, untilEmerged, hit: () => hit };
}

describe.each(CASES)('%s 的 %s', (enemyId, skillId, floor, radius) => {
  it('站著不動：牠鑽進地下（打不到），從主角腳下鑽出來咬中', () => {
    const a = ambush(enemyId, skillId, floor);
    a.untilCast();
    let hidden = false;
    a.step(1, () => {
      if (a.sim.enemy.vanished && a.sim.enemy.untouchable && a.sim.enemy.underground) hidden = true;
    });
    expect(hidden).toBe(true);
    a.untilEmerged();
    a.step(0.1);
    expect(a.hit()).toBe(true);
    expect(a.sim.enemy.vanished).toBe(false);
    expect(distance(a.sim.enemy.position, a.sim.world.player.position)).toBeLessThan(radius + 1.5);
  });

  it('印記停住之後走出去就躲得掉', () => {
    const a = ambush(enemyId, skillId, floor);
    a.untilCast();
    // 等到還在地下、印記已經停住（鑽出來前最後一小段）
    for (let i = 0; i < 6 * 60; i++) {
      const leap = a.sim.world.scheduler.leaps.find((l) => l.ctx.caster.id === a.sim.enemy.id);
      if (leap && leap.elapsed >= leap.def.lockAt + 0.05) break;
      a.step(1 / 60);
    }
    const p = a.sim.world.player.position;
    a.sim.world.player.position = vec2(p.x + radius + 3, p.y);
    a.sim.world.player.prevPosition = a.sim.world.player.position;
    a.untilEmerged();
    a.step(0.1);
    expect(a.hit()).toBe(false);
  });

  it('主角就在身邊時不用這一招', () => {
    const sim = createSim({ enemyId, floor, level: 30, gear: 'none', phase: 1 });
    expect(sim.data.skills.get(skillId).minRange).toBeGreaterThanOrEqual(3);
  });
});
