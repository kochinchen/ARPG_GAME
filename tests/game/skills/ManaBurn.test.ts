import { describe, expect, it } from 'vitest';
import { createWorldWithMap, DT, enemiesOf, makeInvulnerable } from '../helpers';

/** 燃魔（設計者 2026-11-18）：腦海浮體的心靈飛彈命中時燒掉最大魔力的 10% */
function setup() {
  const ctx = createWorldWithMap(['############', '#S.........#', '############'], [{ enemyId: 'enemy.brain_floater', at: [7.5, 1.5] }]);
  const { world, events } = ctx;
  makeInvulnerable(world.player);
  const burned: number[] = [];
  events.on('ManaBurned', (e) => {
    if (e.targetId === world.player.id) burned.push(e.amount);
  });
  /** 跑到主角被燒到第一次（最多 30 秒）；回傳被燒之前那一刻的魔力 */
  const untilBurned = (keepMana?: number) => {
    let before = world.player.mana;
    for (let t = 0; t < 30 && burned.length === 0; t += DT) {
      if (keepMana !== undefined) world.player.mana = keepMana;
      before = world.player.mana;
      world.update(DT);
    }
    return before;
  };
  return { ...ctx, burned, untilBurned };
}

describe('燃魔', () => {
  it('心靈飛彈的資料：命中造成傷害並燒掉 10% 最大魔力', () => {
    const { data } = setup();
    const projectile = data.skills.get('enemy.mind_bolt').effects[0]!;
    expect(projectile.type).toBe('projectile');
    if (projectile.type !== 'projectile') return;
    expect(projectile.onHit.map((e) => e.type)).toEqual(['damage', 'manaBurn']);
    expect(projectile.onHit[1]).toMatchObject({ type: 'manaBurn', percent: 0.1 });
  });

  it('被心靈飛彈打中：魔力少掉最大魔力的 10%，並發出 ManaBurned', () => {
    const { world, burned, untilBurned } = setup();
    const before = untilBurned(world.player.maxMana);
    expect(burned).toHaveLength(1);
    expect(burned[0]).toBeCloseTo(world.player.maxMana * 0.1);
    // 同一個 Tick 還有自然回魔，所以只比到 1 點以內
    expect(before - world.player.mana).toBeGreaterThan(world.player.maxMana * 0.1 - 1);
    expect(before - world.player.mana).toBeLessThanOrEqual(world.player.maxMana * 0.1);
  });

  it('魔力不夠燒：只燒掉剩下的，不會變成負的', () => {
    const { world, burned, untilBurned } = setup();
    untilBurned(2);
    expect(burned).toHaveLength(1);
    // 同一個 Tick 先自然回魔一點才被燒：比 2 多一點點，但遠少於 10% 最大魔力
    expect(burned[0]).toBeLessThan(2.5);
    expect(burned[0]).toBeLessThan(world.player.maxMana * 0.1);
    expect(world.player.mana).toBeGreaterThanOrEqual(0);
  });

  it('沒有魔力的目標（怪物）不受影響', () => {
    const { world } = setup();
    const foe = enemiesOf(world)[0]!;
    expect(foe.maxMana).toBe(0);
    expect(foe.mana).toBe(0);
  });
});
