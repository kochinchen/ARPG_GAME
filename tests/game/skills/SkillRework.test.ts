import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { createWorldWithMap, enemiesOf, run } from '../helpers';

/** 設計者 2026-10-29 的技能調整：劍刃旋舞、毀滅重擊、冰槍、冰霜新星 */
const ROOM = [
  '####################',
  '#S.................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];
type Spawn = { enemyId: string; at: [number, number] };
const dummyAt = (x: number, y: number): Spawn => ({ enemyId: 'enemy.training_dummy', at: [x, y] });

function setup(spawns: Spawn[]) {
  const ctx = createWorldWithMap(ROOM, spawns);
  const p = ctx.world.player;
  p.stats.setBase('critChance', 0);
  p.stats.setBase('maxMana', 500);
  p.mana = 500;
  ctx.world.progress.level = 30;
  for (const e of enemiesOf(ctx.world)) {
    e.stats.setBase('maxHp', 1e6);
    e.hp = 1e6;
  }
  return ctx;
}

function cast(world: GameWorld, commands: { push(c: GameCommand): void }, skillId: string, rank: number, at: Actor | { x: number; y: number }, seconds = 1) {
  world.player.skillRanks.set(skillId, rank);
  world.loadout.combos[0] = [skillId, null, null];
  world.loadout.select(0);
  commands.push(
    'id' in at ? { type: 'CastRight', worldPos: at.position, targetId: at.id } : { type: 'CastRight', worldPos: vec2(at.x, at.y), targetId: null },
  );
  run(world, seconds);
}

const hurt = (a: Actor) => a.hp < a.maxHp;

describe('技能調整（設計者 2026-10-29）', () => {
  it('劍刃旋舞：劍風跟著主角轉，Lv1 持續 3 秒、每 0.5 秒一跳；Lv5 持續 7 秒', () => {
    for (const [rank, seconds] of [
      [1, 3],
      [5, 7],
    ] as const) {
      const { world, commands, events } = setup([dummyAt(3, 1.5)]);
      const dummy = enemiesOf(world)[0]!;
      let ticks = 0;
      events.on('ActorDamaged', (e) => {
        if (e.targetId === dummy.id) ticks++;
      });
      cast(world, commands, 'melee.blade_dance', rank, dummy, seconds + 1);
      expect(ticks).toBe(seconds * 2);
    }
  });

  it('劍刃旋舞：主角走開後，劍風跟著走（原地的敵人不再受傷）', () => {
    const { world, commands } = setup([dummyAt(3, 1.5)]);
    const dummy = enemiesOf(world)[0]!;
    cast(world, commands, 'melee.blade_dance', 1, dummy, 0.6);
    const zone = world.scheduler.zones[0]!;
    world.player.position = vec2(15, 3.5);
    run(world, 0.1);
    expect(distance(zone.position, world.player.position)).toBeLessThan(0.01);
    const hp = dummy.hp;
    run(world, 2);
    expect(dummy.hp).toBe(hp);
  });

  it('毀滅重擊：只打單一目標', () => {
    const { world, commands } = setup([dummyAt(2.5, 1.5), dummyAt(3, 2.2)]);
    const [target, side] = enemiesOf(world);
    cast(world, commands, 'melee.devastator', 1, target!, 1.5);
    expect(hurt(target!)).toBe(true);
    expect(hurt(side!)).toBe(false);
  });

  it('冰槍：Lv1 一支、Lv3 兩支、Lv5 三支（扇形）', () => {
    for (const [rank, count] of [
      [1, 1],
      [3, 2],
      [5, 3],
    ] as const) {
      const { world, commands } = setup([]);
      world.player.skillRanks.set('magic.ice_lance', rank);
      world.loadout.combos[0] = ['magic.ice_lance', null, null];
      world.loadout.select(0);
      commands.push({ type: 'CastRight', worldPos: vec2(18, 3), targetId: null });
      let most = 0;
      run(world, 1, () => {
        most = Math.max(most, world.projectiles.filter((p) => p.skill.id === 'magic.ice_lance').length);
      });
      expect(most).toBe(count);
    }
  });

  it('冰霜新星：慢慢滾的冰球，撞到敵人才炸開（範圍傷害、緩速）', () => {
    const { world, commands } = setup([dummyAt(8, 1.5), dummyAt(8, 3.5)]);
    const [front, beside] = enemiesOf(world);
    cast(world, commands, 'magic.frost_nova', 1, front!, 0.6);
    // 0.6 秒還在路上：冰球每秒 4.5 格
    expect(hurt(front!)).toBe(false);
    run(world, 2);
    expect(hurt(front!)).toBe(true);
    expect(front!.hasStatus('slow') || front!.hasStatus('freeze')).toBe(true);
    // 炸開範圍 3 格：旁邊的也受傷
    expect(hurt(beside!)).toBe(true);
  });

  it('冰霜新星：沒撞到東西也會在終點（或撞牆時）炸開', () => {
    const { world, commands, events } = setup([]);
    const areas: string[] = [];
    events.on('AreaTriggered', (e) => {
      if (e.skillId === 'magic.frost_nova') areas.push(e.skillId);
    });
    cast(world, commands, 'magic.frost_nova', 1, { x: 18, y: 1.5 }, 5);
    expect(areas).toHaveLength(1);
  });
});
