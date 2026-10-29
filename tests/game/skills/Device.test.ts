import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** v0.4.0 機關（戰術 B 路線）：絆索網、霜凍地雷、雷電圖騰、火藥桶 */
const ROOM = [
  '########################',
  '#S.....................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '########################',
];
type Spawn = { enemyId: string; at: [number, number] };
const dummyAt = (x: number, y: number): Spawn => ({ enemyId: 'enemy.training_dummy', at: [x, y] });
const skeletonAt = (x: number, y: number): Spawn => ({ enemyId: 'enemy.skeleton', at: [x, y] });

function setup(spawns: Spawn[] = []) {
  const ctx = createWorldWithMap(ROOM, spawns);
  const p = ctx.world.player;
  p.stats.setBase('critChance', 0);
  p.stats.setBase('maxMana', 999);
  p.mana = 999;
  makeInvulnerable(p);
  ctx.world.progress.level = 30;
  for (const e of enemiesOf(ctx.world)) {
    e.stats.setBase('maxHp', 1e6);
    e.hp = 1e6;
  }
  return ctx;
}

function cast(world: GameWorld, commands: { push(c: GameCommand): void }, skillId: string, rank: number, at: { x: number; y: number }, seconds = 0.6) {
  world.player.skillRanks.set(skillId, rank);
  world.loadout.combos[0] = [skillId, null, null];
  world.loadout.select(0);
  commands.push({ type: 'CastRight', worldPos: vec2(at.x, at.y), targetId: null });
  run(world, seconds);
}

const devicesOf = (world: GameWorld) => world.actors.filter((a) => a.device && a.alive);
const hurt = (a: Actor) => a.hp < a.maxHp;

describe('機關的共通規則', () => {
  it('血量 = 玩家最大生命 × 比例、防禦 = 玩家防禦；玩家數值變動時即時跟隨，並維持血量比例', () => {
    const { world, commands } = setup();
    const p = world.player;
    p.stats.setBase('maxHp', 1000);
    p.hp = 1000;
    p.stats.setBase('defense', 40);
    cast(world, commands, 'utility.powder_keg', 1, { x: 8, y: 3.5 });
    const keg = devicesOf(world)[0]!;
    expect(keg.maxHp).toBeCloseTo(250);
    expect(keg.stats.get('defense')).toBe(40);
    keg.hp = 125;
    p.stats.setBase('maxHp', 2000);
    p.stats.setBase('defense', 60);
    run(world, 0.1);
    expect(keg.maxHp).toBeCloseTo(500);
    expect(keg.hp).toBeCloseTo(250);
    expect(keg.stats.get('defense')).toBe(60);
  });

  it('全身最多 5 個（設計者 2026-10-29，原本 2 個）：放第 6 個時最舊的消失，而且不會爆炸', () => {
    const { world, commands } = setup([dummyAt(8, 3.5)]);
    const dummy = enemiesOf(world)[0]!;
    world.player.position = vec2(12, 3.5);
    cast(world, commands, 'utility.powder_keg', 1, { x: 8, y: 3.5 });
    cast(world, commands, 'utility.storm_totem', 1, { x: 16, y: 6 });
    for (const y of [2, 3.5, 5]) cast(world, commands, 'utility.frost_mine', 1, { x: 20, y });
    expect(devicesOf(world)).toHaveLength(5);
    cast(world, commands, 'utility.trip_net', 1, { x: 16, y: 3.5 });
    const kinds = devicesOf(world).map((d) => d.device!.skillId);
    expect(kinds).toHaveLength(5);
    expect(kinds).not.toContain('utility.powder_keg');
    // 火藥桶旁邊的木樁沒有被炸到（圖騰射程外）
    expect(hurt(dummy)).toBe(false);
  });

  it('同一種機關也可以放到 5 個（不另外限制）；第 6 個讓最早的消失', () => {
    const { world, commands } = setup();
    world.player.position = vec2(10, 3.5);
    for (const x of [4, 6, 8, 12, 14, 16]) cast(world, commands, 'utility.frost_mine', 1, { x, y: 3.5 });
    expect(devicesOf(world).map((d) => d.position.x)).toEqual([6, 8, 12, 14, 16]);
  });

  it('玩家的技能不會傷到機關；玩家倒地時機關全部消失', () => {
    const { world, commands } = setup();
    cast(world, commands, 'utility.powder_keg', 1, { x: 6, y: 3.5 });
    const keg = devicesOf(world)[0]!;
    cast(world, commands, 'utility.frost_flask', 5, { x: 6, y: 3.5 }, 1);
    expect(keg.hp).toBe(keg.maxHp);
    world.player.hp = 0;
    run(world, 0.2);
    expect(devicesOf(world)).toHaveLength(0);
  });
});

describe('觸控（iPad）', () => {
  it('招式鈕：自動瞄準最近的敵人，地面機關放在敵人腳下；沒有敵人時放在面前', () => {
    const { world, commands } = setup([dummyAt(6, 3.5)]);
    const dummy = enemiesOf(world)[0]!;
    world.player.position = vec2(3, 3.5);
    world.player.skillRanks.set('utility.powder_keg', 1);
    world.loadout.combos[0] = ['utility.powder_keg', null, null];
    commands.push({ type: 'AutoCastRight' });
    run(world, 0.6);
    expect(distance(devicesOf(world)[0]!.position, dummy.position)).toBeLessThan(0.1);

    const empty = setup();
    empty.world.player.position = vec2(10, 3.5);
    empty.world.player.facing = vec2(1, 0);
    empty.world.player.skillRanks.set('utility.powder_keg', 1);
    empty.world.loadout.combos[0] = ['utility.powder_keg', null, null];
    empty.commands.push({ type: 'AutoCastRight' });
    run(empty.world, 0.6);
    expect(devicesOf(empty.world)[0]!.position.x).toBeGreaterThan(10.5);
  });
});

describe('怪物與機關', () => {
  it('3 格內的怪物改打機關；打壞火藥桶會爆炸，之後怪物改回追玩家', () => {
    const { world, commands } = setup([skeletonAt(14, 3.5), dummyAt(13, 5)]);
    const [skeleton, dummy] = enemiesOf(world);
    world.player.position = vec2(8, 3.5);
    cast(world, commands, 'utility.powder_keg', 1, { x: 12.5, y: 3.5 });
    const keg = devicesOf(world)[0]!;
    run(world, 0.2);
    expect(skeleton!.ai!.targetId).toBe(keg.id);
    // 讓骷髏很快打壞火藥桶
    keg.hp = 1;
    run(world, 3);
    expect(keg.alive).toBe(false);
    expect(hurt(dummy!)).toBe(true);
    expect(skeleton!.ai!.targetId).toBe(world.player.id);
  });

  it('距離超過 3 格的怪物不受影響', () => {
    const { world, commands } = setup([skeletonAt(20, 6)]);
    const skeleton = enemiesOf(world)[0]!;
    skeleton.stats.setBase('moveSpeed', 0.01);
    cast(world, commands, 'utility.powder_keg', 1, { x: 8, y: 2.5 });
    run(world, 0.3);
    expect(skeleton.ai!.targetId).not.toBe(devicesOf(world)[0]!.id);
  });
});

describe('四種機關', () => {
  it('絆索網：面前 3 格橫放；碰到的敵人浮空並緩速，每隻只觸發一次，次數用完消失', () => {
    const { world, commands } = setup([skeletonAt(20, 6), skeletonAt(20, 5), skeletonAt(20, 4)]);
    world.player.position = vec2(4, 3.5);
    cast(world, commands, 'utility.trip_net', 1, { x: 10, y: 3.5 }, 0.4);
    const net = devicesOf(world)[0]!;
    expect(distance(net.position, vec2(7, 3.5))).toBeLessThan(0.2);
    const [a, b, c] = enemiesOf(world);
    for (const e of [a!, b!, c!]) e.stats.setBase('moveSpeed', 0.01);
    // 網是垂直於面向（往右）的縱線：x = 7、y 在 -0.5～7.5 之間
    a!.position = vec2(7, 1.5);
    run(world, 0.1);
    expect(a!.hasStatus('airborne')).toBe(true);
    expect(a!.hasStatus('slow')).toBe(true);
    expect(net.device!.triggersLeft).toBe(1);
    run(world, 0.1);
    expect(net.device!.triggersLeft).toBe(1);
    // 站在網的延長線外不會觸發
    b!.position = vec2(9, 5.5);
    run(world, 0.1);
    expect(b!.hasStatus('airborne')).toBe(false);
    c!.position = vec2(7, 5.5);
    run(world, 0.1);
    expect(c!.hasStatus('airborne')).toBe(true);
    expect(net.alive).toBe(false);
  });

  it('霜凍地雷：佈置後 0.8 秒才待命；敵人靠近時爆炸冰凍並消失', () => {
    const { world, commands } = setup([dummyAt(8, 3.5), dummyAt(9, 3.5)]);
    const [a, b] = enemiesOf(world);
    world.player.skillRanks.set('utility.frost_mine', 1);
    world.loadout.combos[0] = ['utility.frost_mine', null, null];
    commands.push({ type: 'CastRight', worldPos: vec2(8.5, 3.5), targetId: null });
    run(world, 0.4);
    expect(devicesOf(world)).toHaveLength(1);
    expect(hurt(a!)).toBe(false);
    run(world, 1);
    expect(devicesOf(world)).toHaveLength(0);
    for (const e of [a!, b!]) {
      expect(hurt(e)).toBe(true);
      expect(e.hasStatus('freeze')).toBe(true);
    }
  });

  it('雷電圖騰：每秒朝最近的敵人射一道穿透閃電（吃法術強度），射完 5 發消失', () => {
    const { world, commands } = setup([dummyAt(10, 3.5), dummyAt(12, 3.5)]);
    world.player.stats.setBase('spellPower', 100);
    const [near, far] = enemiesOf(world);
    const hits = new Map<number, number>();
    world.events.on('ActorDamaged', (e) => hits.set(e.targetId, (hits.get(e.targetId) ?? 0) + 1));
    cast(world, commands, 'utility.storm_totem', 1, { x: 7, y: 3.5 }, 0.5);
    expect(devicesOf(world)).toHaveLength(1);
    run(world, 6);
    expect(hits.get(near!.id)).toBe(5);
    // 穿透：後面那隻也被打中
    expect(hits.get(far!.id)).toBe(5);
    expect(devicesOf(world)).toHaveLength(0);
  });

  it('火藥桶：10 秒後自己爆炸，範圍火焰傷害並燃燒', () => {
    const { world, commands } = setup([dummyAt(9, 3.5), dummyAt(16, 3.5)]);
    const [inside, outside] = enemiesOf(world);
    cast(world, commands, 'utility.powder_keg', 1, { x: 8, y: 3.5 });
    run(world, 9);
    expect(hurt(inside!)).toBe(false);
    run(world, 1.5);
    expect(hurt(inside!)).toBe(true);
    expect(inside!.hasStatus('burn')).toBe(true);
    expect(hurt(outside!)).toBe(false);
    expect(devicesOf(world)).toHaveLength(0);
  });
});
