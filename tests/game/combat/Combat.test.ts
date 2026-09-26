import { describe, expect, it, vi } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { skillReach } from '../../../src/game/skills/SkillSystem';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { createWorld, run } from '../helpers';

/** 測試地圖中，(8.5, 2.5) 的訓練木樁 */
function dummyNearSpawn(world: GameWorld): Actor {
  const dummy = world.actors.find((a) => a.defId === 'enemy.training_dummy' && a.position.x === 8.5);
  if (!dummy) throw new Error('dummy not found');
  return dummy;
}

const press = (target: Actor, held = false) =>
  ({ type: 'PrimaryAction', worldPos: target.position, targetId: target.id, held }) as const;

describe('普通攻擊整合測試（M2，M4 起經由 SkillSystem）', () => {
  it('地圖上的訓練木樁依資料生成', () => {
    const { world, data } = createWorld();
    const dummies = world.actors.filter((a) => a.defId === 'enemy.training_dummy');
    expect(dummies).toHaveLength(4);
    expect(dummies[0]!.hp).toBe(data.enemies.get('enemy.training_dummy').hp);
  });

  it('單擊木樁：走進攻擊距離後只打一下，並停在距離內', () => {
    const { world, commands, data } = createWorld();
    const dummy = dummyNearSpawn(world);
    commands.push(press(dummy));
    commands.push({ type: 'PrimaryRelease' });
    run(world, 4);

    expect(world.player.castCount).toBe(1);
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
    expect(world.player.intentTargetId).toBeNull();
    expect(distance(world.player.position, dummy.position)).toBeLessThanOrEqual(
      skillReach(world.player, data.skills.get('basic.attack')) + dummy.radius,
    );
  });

  it('按住左鍵持續攻擊，次數符合攻速；放開後停手', () => {
    const { world, commands, data } = createWorld();
    const dummy = dummyNearSpawn(world);
    dummy.stats.setBase('maxHp', 100_000);
    dummy.hp = 100_000;

    commands.push(press(dummy));
    run(world, 4, (t) => {
      if (t % 6 === 0) commands.push(press(dummy, true));
    });
    const attacksWhileHeld = world.player.castCount;
    commands.push({ type: 'PrimaryRelease' });
    run(world, 2);

    // 走過去約 1.5 秒，其餘時間依攻速出手
    const attackSpeed = data.balance.player.attackSpeed;
    expect(attacksWhileHeld).toBeGreaterThanOrEqual(Math.floor(2 * attackSpeed));
    expect(world.player.castCount - attacksWhileHeld).toBeLessThanOrEqual(1);
    expect(world.player.intentTargetId).toBeNull();
  });

  it('擊殺木樁：發出一次 ActorDied（擊殺者為玩家），木樁從世界移除', () => {
    const { world, commands, events } = createWorld();
    const dummy = dummyNearSpawn(world);
    const onDied = vi.fn();
    events.on('ActorDied', onDied);

    commands.push(press(dummy));
    run(world, 30, (t) => {
      if (t % 6 === 0) commands.push(press(dummy, true));
    });

    expect(onDied).toHaveBeenCalledTimes(1);
    expect(onDied).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: dummy.id, faction: 'enemy', killerId: world.player.id }),
    );
    expect(world.actors).not.toContain(dummy);
    expect(world.player.intentTargetId).toBeNull();
  });

  it('從地面開始按住拖曳：經過木樁也不會停下攻擊', () => {
    const { world, commands } = createWorld();
    const dummy = dummyNearSpawn(world);
    commands.push({ type: 'PrimaryAction', worldPos: vec2(4.5, 1.5), targetId: null, held: false });
    run(world, 1, (t) => {
      if (t % 6 === 0) commands.push(press(dummy, true));
    });
    expect(world.player.intentTargetId).toBeNull();
    expect(world.player.castCount).toBe(0);
  });

  it('點地面會取消攻擊', () => {
    const { world, commands } = createWorld();
    const dummy = dummyNearSpawn(world);
    commands.push(press(dummy));
    run(world, 0.2);
    commands.push({ type: 'PrimaryAction', worldPos: vec2(1.5, 5.5), targetId: null, held: false });
    run(world, 0.1);
    expect(world.player.intentTargetId).toBeNull();
    expect(world.player.path.at(-1)).toEqual(vec2(1.5, 5.5));
  });

  it('沒有 targetId 時以 World 座標點選', () => {
    const { world, commands } = createWorld();
    const dummy = dummyNearSpawn(world);
    commands.push({ type: 'PrimaryAction', worldPos: vec2(8.6, 2.4), targetId: null, held: false });
    run(world, 0.1);
    expect(world.player.intentTargetId).toBe(dummy.id);
  });
});
