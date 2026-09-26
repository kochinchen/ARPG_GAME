import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { createWorldWithMap, DT, enemiesOf, makeInvulnerable, run } from '../helpers';

/** 新怪物種類（怪物第一批）：遠程保持距離、特殊技能、前搖可躲、樓層分布 */

const ROOM = [
  '##############################',
  '#S...........................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
];
const at = (enemyId: string, x: number, y: number) => ({ enemyId, at: [x, y] as [number, number] });

function setup(spawns: ReturnType<typeof at>[], playerAt = vec2(4.5, 4.5)) {
  const ctx = createWorldWithMap(ROOM, spawns);
  const player = ctx.world.player;
  player.position = playerAt;
  player.prevPosition = playerAt;
  makeInvulnerable(player);
  return ctx;
}

describe('骷髏弓手（ranged AI）', () => {
  it('在射程內停下來射箭，不會走到貼身', () => {
    const { world } = setup([at('enemy.skeleton_archer', 12.5, 4.5)]);
    const archer = enemiesOf(world)[0]!;
    const hp = world.player.hp;
    run(world, 4);
    expect(archer.castCount).toBeGreaterThan(0);
    expect(distance(archer.position, world.player.position)).toBeGreaterThan(4);
    expect(world.player.hp).toBeLessThan(hp);
  });

  it('被貼近時後退拉開距離；每次後退之間至少射一箭', () => {
    const { world } = setup([at('enemy.skeleton_archer', 6.5, 4.5)]);
    const archer = enemiesOf(world)[0]!;
    archer.ai!.state = 'chase';
    archer.ai!.targetId = world.player.id;
    const start = distance(archer.position, world.player.position);
    run(world, 1.2);
    expect(distance(archer.position, world.player.position)).toBeGreaterThan(start + 1);

    // 玩家一直貼上去：弓手仍會出手，而不是永遠逃跑
    const casts = archer.castCount;
    for (let t = 0; t < 6 / DT; t++) {
      world.player.position = vec2(archer.position.x - 1.2, archer.position.y);
      world.update(DT);
    }
    expect(archer.castCount).toBeGreaterThan(casts);
  });
});

describe('重甲骷髏：蓄力重擊有前搖，可以躲', () => {
  function smash(stayInside: boolean) {
    const { world, events } = setup([at('enemy.armored_skeleton', 5.6, 4.5)]);
    const brute = enemiesOf(world)[0]!;
    const casts: { skillId: string; impactIn: number }[] = [];
    let smashDamage = 0;
    let smashing = false;
    events.on('SkillCast', (e) => {
      if (e.actorId !== brute.id) return;
      casts.push({ skillId: e.skillId, impactIn: e.impactIn });
      smashing = e.skillId === 'enemy.brute_smash';
    });
    events.on('ActorDamaged', (e) => {
      if (e.targetId === world.player.id && smashing) smashDamage += e.amount;
    });
    // 第一次施放一定是重擊（冷卻已好、目標在範圍內）
    run(world, 0.2);
    if (!stayInside) world.player.position = vec2(1.6, 4.5); // 前搖期間走出 2 格範圍
    run(world, 1.4);
    return { casts, smashDamage };
  }

  it('第一招是重擊，前搖約 1 秒', () => {
    const { casts } = smash(true);
    expect(casts[0]!.skillId).toBe('enemy.brute_smash');
    expect(casts[0]!.impactIn).toBeCloseTo(1.4 * 0.7);
  });

  it('留在範圍內會被打中；前搖期間走出範圍就躲開', () => {
    expect(smash(true).smashDamage).toBeGreaterThan(0);
    expect(smash(false).smashDamage).toBe(0);
  });
});

describe('骷髏法師：烈焰爆裂落在施放當下的位置', () => {
  function burst(dodge: boolean) {
    const { world, events } = setup([at('enemy.skeleton_mage', 9.5, 4.5)]);
    const mage = enemiesOf(world)[0]!;
    // 讓冰霜箭不干擾：只觀察火焰傷害
    let fire = 0;
    let firstCast = '';
    events.on('SkillCast', (e) => {
      if (e.actorId === mage.id && !firstCast) firstCast = e.skillId;
    });
    events.on('ActorDamaged', (e) => {
      if (e.targetId === world.player.id && e.element === 'fire') fire += e.amount;
    });
    run(world, 0.2);
    if (dodge) world.player.position = vec2(4.5, 1.5);
    run(world, 1.4);
    return { fire, firstCast };
  }

  it('冷卻好、目標在範圍內時先用烈焰爆裂', () => {
    expect(burst(false).firstCast).toBe('enemy.flame_burst');
  });

  it('留在原地被燒到；走開就躲過', () => {
    expect(burst(false).fire).toBeGreaterThan(0);
    expect(burst(true).fire).toBe(0);
  });
});

describe('食屍鬼', () => {
  it('比骷髏戰士快，先衝到玩家身邊', () => {
    const { world } = setup([at('enemy.ghoul', 11.5, 3.5), at('enemy.skeleton', 11.5, 5.5)]);
    const [ghoul, skeleton] = enemiesOf(world);
    run(world, 1);
    expect(distance(ghoul!.position, world.player.position)).toBeLessThan(distance(skeleton!.position, world.player.position));
  });
});

describe('樓層分布（minFloor）', () => {
  const data = DataRegistry.load(gameData);
  const kinds = (floor: number) => {
    const found = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const world = new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed });
      for (const e of enemiesOf(world)) found.add(e.defId!);
    }
    return found;
  };

  it('第 1～2 層只有骷髏戰士與食屍鬼', () => {
    expect([...kinds(1)].sort()).toEqual(['enemy.ghoul', 'enemy.skeleton']);
    expect([...kinds(2)].sort()).toEqual(['enemy.ghoul', 'enemy.skeleton']);
  });

  it('第 3 層起有弓手、第 4 層起有重甲骷髏、第 6 層起有法師', () => {
    expect(kinds(3).has('enemy.skeleton_archer')).toBe(true);
    expect(kinds(3).has('enemy.armored_skeleton')).toBe(false);
    expect(kinds(4).has('enemy.armored_skeleton')).toBe(true);
    expect(kinds(5).has('enemy.skeleton_mage')).toBe(false);
    expect(kinds(6).has('enemy.skeleton_mage')).toBe(true);
  });

  it('資料驗證：區間第一層沒有任何可生成的怪物時報錯', () => {
    const floors = (gameData.floors as { id: string }[]).map((f) =>
      f.id === 'floor.crypt_1' ? { ...f, monsterPool: [{ enemyId: 'enemy.skeleton', weight: 1, minFloor: 2 }] } : f,
    );
    expect(() => DataRegistry.load({ ...gameData, floors })).toThrow(/沒有任何可生成的怪物/);
  });
});
