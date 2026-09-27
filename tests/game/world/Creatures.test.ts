import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { floorDefFor } from '../../../src/game/world/FloorManager';
import { MONSTER_MODELS } from '../../../src/render/figure/Monsters';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** 非人形怪物（10 樓以上） */
const data = DataRegistry.load(gameData);

const ROOM = [
  '##############################',
  '#S...........................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '#............................#',
  '##############################',
];

/** 某一層實際會生成的怪物（依 minFloor 過濾） */
const openPool = (floor: number) => floorDefFor(data, floor).monsterPool.filter((m) => m.minFloor <= floor);
const poolOn = (floor: number) => openPool(floor).map((m) => m.enemyId);

const CREATURE_IDS = [
  'enemy.bone_hound',
  'enemy.blood_lizard',
  'enemy.shadow_panther',
  'enemy.acid_beetle',
  'enemy.hatchling_spider',
  'enemy.hook_claw',
  'enemy.horned_brute',
  'enemy.molten_brute',
  'enemy.quake_beast',
  'enemy.poison_spitter',
  'enemy.frost_sporeling',
  'enemy.fire_crawler',
  'enemy.eye_floater',
  'enemy.brain_floater',
  'enemy.void_spore',
  'enemy.egg_matron',
  'enemy.soul_flower',
  'enemy.burrower',
];

describe('非人形怪物的出現樓層', () => {
  it('9 樓以前只有人形怪；10 樓起逐步加入，22 樓起全部出現', () => {
    for (const floor of [1, 5, 9]) expect(poolOn(floor).some((id) => CREATURE_IDS.includes(id))).toBe(false);
    const f10 = poolOn(10).filter((id) => CREATURE_IDS.includes(id));
    expect(f10.length).toBeGreaterThan(0);
    expect(f10.length).toBeLessThanOrEqual(3);
    let previous = f10.length;
    for (const floor of [12, 15, 18, 20]) {
      const count = poolOn(floor).filter((id) => CREATURE_IDS.includes(id)).length;
      expect(count).toBeGreaterThan(previous);
      previous = count;
    }
    expect(new Set(poolOn(22))).toEqual(new Set([...poolOn(22).filter((id) => !CREATURE_IDS.includes(id)), ...CREATURE_IDS]));
  });

  it('越深的樓層人形怪的比重越低', () => {
    const humanShare = (floor: number) => {
      const pool = openPool(floor);
      const total = pool.reduce((s, m) => s + m.weight, 0);
      return pool.filter((m) => !CREATURE_IDS.includes(m.enemyId)).reduce((s, m) => s + m.weight, 0) / total;
    };
    expect(humanShare(25)).toBeLessThan(humanShare(15));
    expect(humanShare(15)).toBeLessThan(humanShare(10));
  });

  it('每種怪物都有自己的多面體模型', () => {
    for (const enemy of data.enemies.all) expect(MONSTER_MODELS[enemy.id], enemy.id).toBeDefined();
  });
});

describe('非人形怪物的行為', () => {
  const fight = (enemyId: string, at: [number, number], seconds: number) => {
    const { world, events } = createWorldWithMap(ROOM, [{ enemyId, at }]);
    makeInvulnerable(world.player);
    const [enemy] = enemiesOf(world);
    const start = vec2(enemy!.position.x, enemy!.position.y);
    const casts: string[] = [];
    events.on('SkillCast', (e) => {
      if (e.actorId === enemy!.id) casts.push(e.skillId);
    });
    run(world, seconds);
    return { world, enemy: enemy!, start, casts };
  };

  it('奪魂寄生花固定在原地，但會攻擊範圍內的玩家', () => {
    const { enemy, start, casts } = fight('enemy.soul_flower', [7.5, 3.5], 6);
    expect(distance(enemy.position, start)).toBeLessThan(0.05);
    expect(casts.length).toBeGreaterThan(0);
  });

  it('卵囊母體會生出孵化蜘蛛（最多同時 4 隻）', () => {
    const { world, enemy, casts } = fight('enemy.egg_matron', [7.5, 3.5], 4);
    expect(casts).toContain('enemy.spawn_brood');
    const brood = world.actors.filter((a) => a.summonedBy === enemy.id);
    expect(brood.length).toBeGreaterThan(0);
    expect(brood.length).toBeLessThanOrEqual(4);
    expect(brood.every((a) => a.defId === 'enemy.hatchling_spider')).toBe(true);
  });

  it('骨刺獵獸會從遠處撲向玩家', () => {
    const { casts } = fight('enemy.bone_hound', [6.5, 3.5], 3);
    expect(casts).toContain('enemy.pounce');
  });

  it('震地獸靠近後使用震地踐踏', () => {
    const { casts } = fight('enemy.quake_beast', [3.5, 2.5], 8);
    expect(casts).toContain('enemy.quake_stomp');
  });
});
