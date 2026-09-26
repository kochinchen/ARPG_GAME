import { describe, expect, it, vi } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { createWorldWithMap, DT, enemiesOf, makeInvulnerable, run } from '../helpers';

const CORRIDOR = [
  '############################################',
  '#S.........................................#',
  '#..........................................#',
  '#..........................................#',
  '############################################',
];

const skeletonAt = (x: number, y: number) => ({ enemyId: 'enemy.skeleton', at: [x, y] as [number, number] });

describe('怪物 AI（M3）', () => {
  it('玩家在偵測範圍外時保持閒置', () => {
    const { world } = createWorldWithMap(CORRIDOR, [skeletonAt(20.5, 2.5)]);
    run(world, 1);
    const [skeleton] = enemiesOf(world);
    expect(skeleton!.ai!.state).toBe('idle');
    expect(skeleton!.position).toEqual(vec2(20.5, 2.5));
  });

  it('玩家進入偵測範圍後追擊並攻擊', () => {
    const { world } = createWorldWithMap(CORRIDOR, [skeletonAt(6.5, 2.5)]);
    makeInvulnerable(world.player);
    run(world, 0.1);
    const [skeleton] = enemiesOf(world);
    expect(skeleton!.ai!.state).toBe('chase');

    run(world, 4);
    expect(skeleton!.attackCount).toBeGreaterThan(0);
    expect(world.player.hp).toBeLessThan(world.player.maxHp);
  });

  it('牆壁擋住視線時不會發現玩家', () => {
    const { world } = createWorldWithMap(
      [
        '###########',
        '#S...#....#',
        '#....#....#',
        '#.........#',
        '###########',
      ],
      [skeletonAt(7.5, 1.5)],
    );
    run(world, 1);
    expect(enemiesOf(world)[0]!.ai!.state).toBe('idle');
  });

  it('在偵測範圍外被攻擊時會反擊', () => {
    const { world, events } = createWorldWithMap(CORRIDOR, [skeletonAt(30.5, 2.5)]);
    const skeleton = enemiesOf(world)[0]!;
    events.emit('ActorDamaged', {
      targetId: skeleton.id,
      sourceId: world.player.id,
      amount: 1,
      isCrit: false,
      element: 'physical',
      position: skeleton.position,
    });
    run(world, DT);
    expect(skeleton.ai!.state).toBe('chase');
    expect(skeleton.attackTarget).toBe(world.player.id);
  });

  it('離家超過 Leash 距離就放棄，走回出生點後回到閒置', () => {
    const { world, commands } = createWorldWithMap(CORRIDOR, [skeletonAt(6.5, 2.5)]);
    makeInvulnerable(world.player);
    const skeleton = enemiesOf(world)[0]!;
    run(world, 0.1);
    expect(skeleton.ai!.state).toBe('chase');

    // 玩家往走廊深處跑（玩家比骷髏快）
    commands.push({ type: 'PrimaryAction', worldPos: vec2(42.5, 2.5), targetId: null, held: false });
    let sawReturn = false;
    run(world, 20, () => {
      if (skeleton.ai!.state === 'return') sawReturn = true;
    });

    expect(sawReturn).toBe(true);
    expect(skeleton.ai!.state).toBe('idle');
    expect(distance(skeleton.position, vec2(6.5, 2.5))).toBeLessThan(0.05);
  });

  it('5 隻同時追擊時不會疊成一點', () => {
    const { world } = createWorldWithMap(CORRIDOR, [
      skeletonAt(8.5, 1.5),
      skeletonAt(8.5, 2.5),
      skeletonAt(8.5, 3.5),
      skeletonAt(9.5, 2.0),
      skeletonAt(9.5, 3.0),
    ]);
    makeInvulnerable(world.player);
    run(world, 5);

    const actors = world.actors.filter((a) => a.alive);
    for (let i = 0; i < actors.length; i++) {
      for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i]!;
        const b = actors[j]!;
        expect(distance(a.position, b.position)).toBeGreaterThan((a.radius + b.radius) * 0.8);
      }
    }
    for (const a of actors) expect(world.nav.isClearAt(a.position, a.radius - 0.01)).toBe(true);
  });
});

describe('玩家死亡（M3）', () => {
  it('HP 歸零後倒地、不接受操作，延遲後回到出生點並補滿 HP', () => {
    const { world, commands, events, data } = createWorldWithMap(CORRIDOR, [skeletonAt(4.5, 2.5)]);
    const onDied = vi.fn();
    const onRespawn = vi.fn();
    let hpAtRespawn = 0;
    events.on('ActorDied', onDied);
    events.on('PlayerRespawned', (e) => {
      onRespawn(e);
      hpAtRespawn = world.player.hp;
    });

    commands.push({ type: 'PrimaryAction', worldPos: vec2(3.5, 1.5), targetId: null, held: false });
    run(world, 0.5);
    world.player.hp = 1;
    run(world, 3, () => {
      if (!world.player.alive) {
        commands.push({ type: 'PrimaryAction', worldPos: vec2(20.5, 2.5), targetId: null, held: false });
      }
    });
    expect(onDied).toHaveBeenCalledWith(expect.objectContaining({ actorId: world.player.id, faction: 'player' }));

    // 倒地期間不會移動
    expect(world.player.path).toEqual([]);

    run(world, data.balance.player.respawnDelay + 0.5);
    expect(world.player.alive).toBe(true);
    expect(hpAtRespawn).toBe(world.player.maxHp);
    expect(onRespawn).toHaveBeenCalledWith({ position: world.spawnPoint });
    expect(onRespawn).toHaveBeenCalledTimes(1);
    expect(world.actors).toContain(world.player);
  });

  it('倒地時怪物放棄追擊；已擊殺的怪物不會因玩家死亡而重生', () => {
    const { world } = createWorldWithMap(CORRIDOR, [skeletonAt(4.5, 2.5), skeletonAt(30.5, 2.5)]);
    const [near, far] = enemiesOf(world);
    far!.hp = 0;
    run(world, 0.5);
    expect(world.actors).not.toContain(far);

    world.player.hp = 1;
    run(world, 2);
    expect(world.player.alive).toBe(false);
    expect(near!.ai!.state).not.toBe('chase');
    expect(near!.attackTarget).toBeNull();

    run(world, 3);
    expect(world.player.alive).toBe(true);
    expect(world.actors).not.toContain(far);
  });
});
