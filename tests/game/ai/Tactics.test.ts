import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import type { GameEvents } from '../../../src/game/GameEvents';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** 怪物的集體戰術（設計者 2026-10-30）：呼朋引伴、包圍站位、圍攻上限、後排 */
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
  it('多隻近戰分散在主角四周，而不是擠在同一側；背後留缺口', () => {
    const spawns = [0, 1, 2, 3].map((i) => at('skeleton', 12, 3.25 + i * 1.5));
    const { world } = setup(spawns);
    world.player.position = vec2(8, 5.5);
    const skeletons = enemiesOf(world);
    run(world, 0.6);
    const angles = skeletons.map((s) => {
      const slot = s.ai!.slot!;
      expect(slot).not.toBeNull();
      return Math.atan2(slot.y - 5.5, slot.x - 8);
    });
    angles.sort((a, b) => a - b);
    // 4 隻至少展開 180 度（正面朝右，兩側包到上下）
    expect(angles[angles.length - 1]! - angles[0]!).toBeGreaterThan(Math.PI * 0.9);
    // 正背後（朝左，±35 度）沒有站位
    for (const a of angles) expect(Math.abs(Math.abs(a) - Math.PI)).toBeGreaterThan((35 * Math.PI) / 180 - 1e-6);
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
