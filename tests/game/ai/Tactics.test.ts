import { describe, expect, it } from 'vitest';
import { distance, normalize, sub, vec2 } from '../../../src/core/math/Vec2';
import { NO_MODS } from '../../../src/game/combo/StepMods';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameEvents } from '../../../src/game/GameEvents';
import { createWorld, createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** 怪物的集體戰術（設計者 2026-10-30、11-07）：呼朋引伴、包圍站位、圍攻上限、後排、閃避、求援 */
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

function setup(spawns: Spawn[]) {
  const ctx = createWorldWithMap(HALL, spawns);
  makeInvulnerable(ctx.world.player);
  ctx.world.player.position = vec2(2, 5.5);
  return ctx;
}

describe('呼朋引伴', () => {
  it('發現主角的怪物叫醒 6 格內看得到牠的閒置同伴；同伴會延遲一下才行動', () => {
    // 骷髏在主角偵測範圍內；同伴在主角偵測範圍外、但離骷髏 5 格
    const { world, events } = setup([at('skeleton', 8, 5.5), at('skeleton', 13, 5.5)]);
    const alerts: GameEvents['EnemyAlerted'][] = [];
    events.on('EnemyAlerted', (e) => alerts.push(e));
    const [scout, ally] = enemiesOf(world);
    ally!.ai!.detectRange = 0;
    run(world, 0.05);
    expect(scout!.ai!.state).toBe('chase');
    expect(alerts).toEqual([{ actorId: scout!.id, allies: 1 }]);
    expect(ally!.ai!.state).toBe('idle');
    run(world, 0.7);
    expect(ally!.ai!.state).toBe('chase');
    expect(ally!.ai!.targetId).toBe(world.player.id);
  });

  it('警戒只傳一層：被叫醒的同伴不會再往外叫', () => {
    const { world } = setup([at('skeleton', 8, 5.5), at('skeleton', 13, 5.5), at('skeleton', 18, 5.5)]);
    const [, ally, far] = enemiesOf(world);
    for (const e of [ally!, far!]) e.ai!.detectRange = 0;
    run(world, 1.5);
    expect(ally!.ai!.state).toBe('chase');
    expect(far!.ai!.state).toBe('idle');
  });
});

describe('包圍站位', () => {
  it('多隻近戰分散在主角四周（整圈包圍，不留缺口）', () => {
    const spawns = [0, 1, 2, 3].map((i) => at('skeleton', 12, 3.25 + i * 1.5));
    const { world } = setup(spawns);
    world.player.position = vec2(8, 5.5);
    const skeletons = enemiesOf(world);
    // 站位在另一邊的先繞過去（中繼點），到齊後再看
    run(world, 4);
    const angles = skeletons.map((s) => {
      const slot = s.ai!.slot!;
      expect(slot).not.toBeNull();
      return Math.atan2(slot.y - 5.5, slot.x - 8);
    });
    angles.sort((a, b) => a - b);
    // 4 隻大致平分一整圈：相鄰站位（含頭尾相接）都差 90 度左右，背後沒有大缺口
    const gaps = angles.map((a, i) => (i === 0 ? a + Math.PI * 2 - angles[angles.length - 1]! : a - angles[i - 1]!));
    for (const g of gaps) expect(Math.abs(g - Math.PI / 2)).toBeLessThan(0.35);
  });

  it('快的怪（遊擊）拿背後的站位，從側面繞過去、不穿過主角', () => {
    // 三隻骷髏與一隻骨刺獵獸都從右邊來；正面朝右
    const { world } = setup([at('skeleton', 12, 4.5), at('skeleton', 12, 5.5), at('skeleton', 12, 6.5), at('bone_hound', 12.5, 5.5)]);
    world.player.position = vec2(8, 5.5);
    const hound = enemiesOf(world)[3]!;
    let closest = Infinity;
    run(world, 4, () => {
      closest = Math.min(closest, distance(hound.position, world.player.position));
    });
    // 到了主角背後（左邊）
    expect(hound.position.x).toBeLessThan(world.player.position.x - 0.3);
    expect(closest).toBeGreaterThan(world.player.radius + hound.radius - 0.05);
  });

  it('同時貼身的近戰最多 6 隻，其餘在外圈等候、不出手', () => {
    const spawns = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at('skeleton', 12 + (i % 2), 2 + i));
    const { world } = setup(spawns);
    world.player.position = vec2(8, 5.5);
    run(world, 0.6);
    const skeletons = enemiesOf(world);
    const waiting = skeletons.filter((s) => s.ai!.waiting);
    expect(waiting).toHaveLength(2);
    run(world, 3);
    for (const s of waiting) if (s.ai!.waiting) expect(s.cast).toBeNull();
  });

  it('後排（法師）站在前排後方：離主角比前排遠，在怪物這一側', () => {
    const { world } = setup([at('skeleton', 12, 5), at('skeleton', 12, 6), at('skeleton_mage', 13, 5.5)]);
    world.player.position = vec2(8, 5.5);
    const [front, , mage] = enemiesOf(world);
    run(world, 0.6);
    const slot = mage!.ai!.slot!;
    expect(slot.x).toBeGreaterThan(8);
    expect(distance(slot, world.player.position)).toBeGreaterThan(distance(front!.ai!.slot!, world.player.position) + 2);
  });

  it('只有一隻近戰時直接追，不分配站位', () => {
    const { world } = setup([at('skeleton', 8, 5.5)]);
    run(world, 0.6);
    expect(enemiesOf(world)[0]!.ai!.slot).toBeNull();
  });
});

/** 從 from 朝 target 發射一發主角的投射物 */
function shoot(world: ReturnType<typeof setup>['world'], skill: ReturnType<typeof setup>['data']['skills']['all'][number], from: { x: number; y: number }, target: Actor) {
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

describe('閃避投射物', () => {
  it('追擊中的怪看到會打中自己的投射物，往旁邊閃開', () => {
    const ctx = setup([at('ghoul', 14, 5.5)]);
    const { world, data, events } = ctx;
    data.balance.enemyTactics.dodge.chance = [1, 1];
    const ghoul = enemiesOf(world)[0]!;
    ghoul.ai!.provokedBy = world.player.id;
    run(world, 0.2);
    expect(ghoul.ai!.state).toBe('chase');
    const dodged: number[] = [];
    events.on('EnemyDodged', (e) => dodged.push(e.actorId));
    const startY = ghoul.position.y;
    // 從 6 格外射過去（0.6 秒前反應）
    shoot(world, data.skills.get('magic.fireball'), vec2(ghoul.position.x - 6.5, ghoul.position.y), ghoul);
    run(world, 1);
    expect(dodged).toEqual([ghoul.id]);
    expect(Math.abs(ghoul.position.y - startY)).toBeGreaterThan(0.3);
    expect(ghoul.hp).toBe(ghoul.maxHp);
  });

  it('機率沒擲中、或來不及閃（太近）就會被打中；魔王不閃', () => {
    const { world, data } = setup([at('ghoul', 14, 5.5)]);
    data.balance.enemyTactics.dodge.chance = [1, 1];
    const ghoul = enemiesOf(world)[0]!;
    ghoul.ai!.provokedBy = world.player.id;
    run(world, 0.2);
    shoot(world, data.skills.get('magic.fireball'), vec2(ghoul.position.x - 1, ghoul.position.y), ghoul);
    run(world, 0.3);
    expect(world.projectiles).toHaveLength(0);
    expect(ghoul.ai!.dodgeTimer).toBe(0);
  });
});

describe('求援', () => {
  /** 主角附近一群 4 隻（第 0 群），遠處兩群閒置（第 1、2 群） */
  function packs() {
    const ctx = setup([
      ...[0, 1, 2, 3].map((i) => at('skeleton', 6 + i * 0.8, 3 + (i % 2) * 5)),
      at('skeleton', 30, 3), at('skeleton', 31, 3),
      at('skeleton', 30, 8), at('skeleton', 31, 8),
    ]);
    const all = enemiesOf(ctx.world);
    all.forEach((e, i) => {
      e.ai!.pack = { id: i < 4 ? 0 : i < 6 ? 1 : 2, size: i < 4 ? 4 : 2 };
      if (i >= 4) e.ai!.detectRange = 0;
    });
    return { ...ctx, near: all.slice(0, 4), far: all.slice(4) };
  }

  it('被打掉超過一半，剩下的一隻跑去叫遠處的兩群，叫完回來打', () => {
    const { world, events, near, far } = packs();
    const calls: number[] = [];
    events.on('EnemyCalling', (e) => calls.push(e.packs));
    run(world, 0.6);
    expect(near.every((e) => e.ai!.state === 'chase')).toBe(true);
    // 打掉一半（2 隻）還不會求援
    for (const e of near.slice(0, 2)) e.alive = false;
    run(world, 1);
    expect(calls).toEqual([]);
    near[2]!.alive = false;
    run(world, 1);
    const messenger = near[3]!;
    expect(calls).toEqual([2]);
    expect(messenger.ai!.state).toBe('call');
    run(world, 15);
    expect(far.every((e) => e.ai!.state === 'chase' && e.ai!.targetId === world.player.id)).toBe(true);
    expect(messenger.ai!.state).toBe('chase');
  });

  it('打倒傳令兵就叫不到；被叫來的群不會再往外叫', () => {
    const { world, near, far } = packs();
    run(world, 0.6);
    for (const e of near.slice(0, 3)) e.alive = false;
    run(world, 1);
    near[3]!.alive = false;
    run(world, 10);
    expect(far.every((e) => e.ai!.state === 'idle')).toBe(true);
    expect(far.every((e) => !e.ai!.packCalled)).toBe(true);
  });
});

describe('求援（實際樓層）', () => {
  it('生成時記錄每一群與隻數；一群被打掉超過一半就有傳令兵去叫別群', () => {
    const { world, events } = createWorld(3);
    world.enterFloor(12);
    makeInvulnerable(world.player);
    const enemies = enemiesOf(world).filter((e) => e.ai?.pack);
    expect(enemies.length).toBeGreaterThan(50);
    const byPack = new Map<number, Actor[]>();
    for (const e of enemies) byPack.set(e.ai!.pack!.id, [...(byPack.get(e.ai!.pack!.id) ?? []), e]);
    for (const [, members] of byPack) expect(members.length).toBe(members[0]!.ai!.pack!.size);
    const pack = [...byPack.values()].find((m) => m.length >= 3)!;
    world.player.position = vec2(pack[0]!.position.x + 1.5, pack[0]!.position.y);
    run(world, 1);
    const calls: number[] = [];
    events.on('EnemyCalling', (e) => calls.push(e.actorId));
    for (const e of pack.slice(0, Math.floor(pack.length / 2) + 1)) e.alive = false;
    run(world, 1);
    expect(calls).toHaveLength(1);
  });
});

