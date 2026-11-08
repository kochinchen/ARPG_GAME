import { describe, expect, it } from 'vitest';
import { distance, normalize, sub, vec2 } from '../../../src/core/math/Vec2';
import { NO_MODS } from '../../../src/game/combo/StepMods';
import type { SkillDef } from '../../../src/data/schema/skill';
import type { Actor } from '../../../src/game/entities/Actor';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** 非人形怪物的行為（設計者 2026-11-08）：躲掩護、圍獵、蜂擁、撞牆暈、自爆、鑽地、護衛與潰散 */
const HALL = [
  '##############################################',
  '#S...........................................#',
  '#............................................#',
  '#............................................#',
  '#............................................#',
  '#............................................#',
  '#............................................#',
  '#............................................#',
  '#............................................#',
  '#............................................#',
  '##############################################',
];
type Spawn = { enemyId: string; at: [number, number] };
const at = (enemyId: string, x: number, y: number): Spawn => ({ enemyId: `enemy.${enemyId}`, at: [x, y] });

function setup(spawns: Spawn[], player = vec2(6, 5.5)) {
  const ctx = createWorldWithMap(HALL, spawns);
  makeInvulnerable(ctx.world.player);
  ctx.world.player.position = player;
  return ctx;
}
type World = ReturnType<typeof setup>['world'];

const provoke = (world: World, ...enemies: Actor[]) => {
  for (const e of enemies) e.ai!.provokedBy = world.player.id;
};

/** 從 from 朝 target 發射一發主角的投射物 */
function shoot(world: World, skill: SkillDef, from: { x: number; y: number }, target: Actor) {
  world.projectiles.push({
    id: 9999,
    caster: world.player,
    skill,
    rank: 1,
    position: vec2(from.x, from.y),
    prevPosition: vec2(from.x, from.y),
    direction: normalize(sub(target.position, from)),
    speed: 10,
    radius: 0.3,
    remaining: 20,
    pierceLeft: 0,
    hitIds: new Set(),
    onHit: [],
    alive: true,
    mods: NO_MODS,
  });
}

describe('躲掩護：遠程怪躲在巨獸背後射擊', () => {
  it('弓手站到「主角 → 巨獸」的延長線上、巨獸背後', () => {
    const { world } = setup([at('horned_brute', 11, 5.5), at('skeleton_archer', 14, 3)]);
    const [brute, archer] = enemiesOf(world);
    provoke(world, brute!, archer!);
    run(world, 0.7);
    expect(archer!.ai!.covered).toBe(true);
    const slot = archer!.ai!.slot!;
    const player = world.player.position;
    // 比巨獸離主角遠，而且幾乎在同一條線上
    expect(distance(slot, player)).toBeGreaterThan(distance(brute!.position, player) + brute!.radius);
    const a = normalize(sub(brute!.position, player));
    const b = normalize(sub(slot, player));
    expect(a.x * b.x + a.y * b.y).toBeGreaterThan(0.97);
    // 出手之間走到掩護的位置（巨獸衝鋒時位置會跟著變）
    let reached = false;
    let closest = Infinity;
    run(world, 6, () => {
      const spot = archer!.ai!.slot;
      if (archer!.ai!.covered && spot) closest = Math.min(closest, distance(archer!.position, spot));
      if (closest < 0.8) reached = true;
    });
    expect(reached, `最近 ${closest.toFixed(2)} 格`).toBe(true);
  });

  it('主角跑遠到射不到：射手離開掩護、自己追出來', () => {
    const { world } = setup([at('horned_brute', 11, 5.5), at('skeleton_archer', 14, 3)]);
    const [brute, archer] = enemiesOf(world);
    provoke(world, brute!, archer!);
    run(world, 0.7);
    expect(archer!.ai!.covered).toBe(true);
    world.player.position = vec2(40, 5.5);
    run(world, 0.6);
    expect(archer!.ai!.covered).toBe(false);
  });

  it('沒有巨獸就照平常的後排站', () => {
    const { world } = setup([at('skeleton', 11, 5), at('skeleton', 11, 6), at('skeleton_archer', 14, 3)]);
    const enemies = enemiesOf(world);
    provoke(world, ...enemies);
    run(world, 0.7);
    expect(enemies[2]!.ai!.covered).toBe(false);
  });
});

describe('圍獵：野獸先繞圈，再一起撲', () => {
  const hounds = () => [at('bone_hound', 14, 4), at('bone_hound', 14, 5.5), at('bone_hound', 14, 7)];

  it('先在外圍繞圈不出手，之後撲上去、一隻接一隻', () => {
    const { world, events } = setup(hounds());
    const pack = enemiesOf(world);
    provoke(world, ...pack);
    const firstCast = new Map<number, number>();
    let t = 0;
    events.on('SkillCast', (e) => {
      if (!firstCast.has(e.actorId)) firstCast.set(e.actorId, t);
    });
    run(world, 1.6, () => (t += 1 / 60));
    expect(firstCast.size).toBe(0);
    for (const h of pack) {
      expect(h.ai!.waiting).toBe(true);
      expect(distance(h.ai!.slot!, world.player.position)).toBeGreaterThan(3.5);
    }
    run(world, 4, () => (t += 1 / 60));
    expect(firstCast.size).toBe(3);
    const times = [...firstCast.values()].sort((a, b) => a - b);
    // 第一隻先撲，其他的跟上（不是同時）
    expect(times[2]! - times[0]!).toBeGreaterThan(0.3);
    expect(times[2]! - times[0]!).toBeLessThan(1.5);
  });

  it('繞圈時被打，就馬上一起撲上去', () => {
    const { world, events } = setup(hounds());
    const pack = enemiesOf(world);
    provoke(world, ...pack);
    run(world, 0.8);
    let casts = 0;
    events.on('SkillCast', () => casts++);
    pack[0]!.ai!.angerTimer = 4;
    run(world, 1);
    expect(casts).toBeGreaterThan(0);
  });

  it('只有一隻就不繞圈', () => {
    const { world } = setup([at('bone_hound', 14, 5.5)]);
    const [hound] = enemiesOf(world);
    provoke(world, hound!);
    run(world, 0.8);
    expect(hound!.ai!.waiting).toBe(false);
  });
});

describe('蜂擁：孵化蜘蛛', () => {
  it('不排站位、不等候補位，直接一擁而上', () => {
    const spawns = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at('hatchling_spider', 13, 2 + i));
    const { world } = setup(spawns);
    const swarm = enemiesOf(world);
    provoke(world, ...swarm);
    run(world, 0.7);
    for (const s of swarm) {
      expect(s.ai!.waiting).toBe(false);
      expect(s.ai!.slot).toBeNull();
    }
  });

  it('同一隻母體生的不到 3 隻：回去守在母體身邊；主角靠近母體才出手', () => {
    const { world, events } = setup([at('egg_matron', 14, 5.5)], vec2(9, 5.5));
    const [matron] = enemiesOf(world);
    provoke(world, matron!);
    let hatched = false;
    events.on('SkillCast', (e) => {
      if (e.skillId === 'enemy.spawn_brood') hatched = true;
    });
    run(world, 2.5);
    expect(hatched).toBe(true);
    const brood = world.actors.filter((a) => a.alive && a.summonedBy === matron!.id);
    expect(brood.length).toBeGreaterThan(0);
    expect(brood.length).toBeLessThan(3);
    for (const s of brood) {
      expect(s.ai!.waiting).toBe(true);
      expect(distance(s.ai!.slot!, matron!.position)).toBeLessThan(2);
    }
    // 主角走到母體身邊：出手
    world.player.position = vec2(matron!.position.x - 2, matron!.position.y);
    run(world, 0.6);
    for (const s of brood) expect(s.ai!.waiting).toBe(false);
  });
});

describe('角甲巨獸撞牆暈眩', () => {
  it('衝鋒時主角閃開，撞到牆自己暈 2 秒', () => {
    const { world, events } = setup([at('horned_brute', 5.5, 5.5)], vec2(2.5, 5.5));
    const [brute] = enemiesOf(world);
    provoke(world, brute!);
    let crashed = 0;
    events.on('ActorCrashed', () => crashed++);
    events.on('SkillCast', (e) => {
      // 開始衝鋒就閃開（衝鋒朝出招時瞄準的方向）
      if (e.skillId === 'enemy.horn_charge') world.player.position = vec2(4, 9);
    });
    let stunned = false;
    run(world, 2, () => {
      if (brute!.hasStatus('stun')) stunned = true;
    });
    expect(crashed).toBe(1);
    expect(stunned).toBe(true);
  });

  it('撞到主角就不會暈', () => {
    const { world, events } = setup([at('horned_brute', 9, 5.5)], vec2(5, 5.5));
    const [brute] = enemiesOf(world);
    provoke(world, brute!);
    let crashed = 0;
    let charged = 0;
    events.on('ActorCrashed', () => crashed++);
    events.on('SkillCast', (e) => {
      if (e.skillId === 'enemy.horn_charge') charged++;
    });
    run(world, 2);
    expect(charged).toBeGreaterThan(0);
    expect(crashed).toBe(0);
  });
});

describe('火囊爬行者自爆', () => {
  it('血量低於 40%：衝上去自爆，傷到主角，自己也死掉', () => {
    const { world, events } = setup([at('fire_crawler', 13, 5.5)]);
    const [crawler] = enemiesOf(world);
    provoke(world, crawler!);
    run(world, 0.3);
    crawler!.hp = crawler!.maxHp * 0.3;
    let kamikaze = 0;
    let burnt = 0;
    events.on('EnemyKamikaze', () => kamikaze++);
    events.on('ActorDamaged', (e) => {
      if (e.targetId === world.player.id && e.sourceId === crawler!.id) burnt++;
    });
    run(world, 6);
    expect(kamikaze).toBe(1);
    expect(burnt).toBeGreaterThan(0);
    expect(crawler!.alive).toBe(false);
  });

  it('血量還多時照常保持距離噴火球', () => {
    const { world, events } = setup([at('fire_crawler', 13, 5.5)]);
    const [crawler] = enemiesOf(world);
    provoke(world, crawler!);
    let kamikaze = 0;
    events.on('EnemyKamikaze', () => kamikaze++);
    run(world, 3);
    expect(kamikaze).toBe(0);
    expect(crawler!.alive).toBe(true);
  });
});

describe('鑽地寄生蟲鑽地閃避', () => {
  it('看到投射物就鑽進地下（打不到），從主角背後鑽出來', () => {
    const { world, data } = setup([at('burrower', 14, 5.5)]);
    data.balance.enemyTactics.burrow.chance = 1;
    const [worm] = enemiesOf(world);
    provoke(world, worm!);
    run(world, 0.3);
    world.player.facing = vec2(1, 0);
    shoot(world, data.skills.get('basic.attack'), world.player.position, worm!);
    let hidden = false;
    run(world, 0.5, () => {
      if (worm!.vanished && worm!.untouchable) hidden = true;
    });
    expect(hidden).toBe(true);
    run(world, 1.4);
    expect(worm!.vanished).toBe(false);
    // 從背後（左邊）鑽出來
    expect(worm!.position.x).toBeLessThan(world.player.position.x);
    expect(distance(worm!.position, world.player.position)).toBeLessThan(2);
  });
});

describe('深淵祭司與小惡魔', () => {
  function summoned() {
    const ctx = setup([at('abyss_priest', 16, 5.5)], vec2(9.5, 5.5));
    const [priest] = enemiesOf(ctx.world);
    provoke(ctx.world, priest!);
    run(ctx.world, 3);
    const imps = ctx.world.actors.filter((a) => a.alive && a.summonedBy === priest!.id);
    return { ...ctx, priest: priest!, imps };
  }

  it('小惡魔守在祭司與主角之間，主角沒靠近祭司就不出手', () => {
    const { world, priest, imps } = summoned();
    expect(imps.length).toBeGreaterThan(0);
    for (const imp of imps) {
      expect(imp.ai!.waiting).toBe(true);
      const slot = imp.ai!.slot!;
      expect(distance(slot, priest.position)).toBeLessThan(2);
      // 在祭司面向主角的那一側
      expect(distance(slot, world.player.position)).toBeLessThan(distance(priest.position, world.player.position));
    }
  });

  it('祭司死了，小惡魔潰散逃跑', () => {
    const { world, priest, imps, events } = summoned();
    let routed = 0;
    events.on('EnemyRouted', () => routed++);
    priest.hp = 0;
    run(world, 0.1);
    expect(routed).toBe(imps.length);
    for (const imp of imps) expect(imp.ai!.state).toBe('flee');
    const before = imps.map((i) => distance(i.position, world.player.position));
    run(world, 1);
    imps.forEach((imp, i) => expect(distance(imp.position, world.player.position)).toBeGreaterThan(before[i]!));
  });
});
