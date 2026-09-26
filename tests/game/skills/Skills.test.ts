import { describe, expect, it, vi } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import { createWorldWithMap, DT, enemiesOf, run } from '../helpers';

const ROOM = [
  '##################',
  '#S...............#',
  '#................#',
  '#................#',
  '#................#',
  '##################',
];

const dummyAt = (x: number, y: number) => ({ enemyId: 'enemy.training_dummy', at: [x, y] as [number, number] });
const select = (slot: 0 | 1 | 2): GameCommand => ({ type: 'SelectRightSlot', slot });
const castAt = (target: Actor | { x: number; y: number }): GameCommand =>
  'id' in target
    ? { type: 'CastRight', worldPos: target.position, targetId: target.id }
    : { type: 'CastRight', worldPos: vec2(target.x, target.y), targetId: null };

/** 固定傷害的測試技能：只加資料、不改程式 */
const TEST_BOLT = {
  id: 'magic.test_bolt',
  name: '測試飛彈',
  targeting: 'enemy',
  range: 10,
  cost: { mana: 5, perRank: 1 },
  castTime: 0,
  effects: [{ type: 'damage', element: 'fire', source: 'flat', base: [10, 10], perRankPct: 0.2 }],
};

function setup(spawns = [dummyAt(6.5, 1.5)], extraSkills: unknown[] = []) {
  const ctx = createWorldWithMap(ROOM, spawns, { extra: { skills: extraSkills } });
  ctx.world.player.stats.setBase('critChance', 0);
  return ctx;
}

describe('技能系統（M4）', () => {
  it('W 火球：朝游標發射投射物，擊中後爆炸造成火焰傷害並扣魔力', () => {
    const { world, commands, events } = setup();
    const dummy = enemiesOf(world)[0]!;
    const onDamaged = vi.fn();
    events.on('ActorDamaged', onDamaged);

    commands.push(select(1), castAt(dummy));
    run(world, 0.3);
    expect(world.projectiles).toHaveLength(1);
    expect(world.player.mana).toBeLessThan(world.player.maxMana - 4);

    run(world, 1);
    expect(world.projectiles).toHaveLength(0);
    expect(onDamaged).toHaveBeenCalledWith(expect.objectContaining({ targetId: dummy.id, element: 'fire' }));
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
  });

  it('游標在敵人身上時，方向技能瞄準敵人位置（而非游標下的地面點）', () => {
    const { world, commands } = setup([dummyAt(8.5, 3.5)]);
    const dummy = enemiesOf(world)[0]!;
    // 模擬點在木樁頭上：游標下的地面點在木樁後方
    commands.push(select(1), { type: 'CastRight', worldPos: vec2(7.2, 2.2), targetId: dummy.id });
    run(world, 1.5);
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
  });

  it('Q / W / E 切換右鍵技能', () => {
    const { world, commands, events } = setup();
    const dummy = enemiesOf(world)[0]!;
    const casts: string[] = [];
    events.on('SkillCast', (e) => casts.push(e.skillId));

    commands.push(select(0), castAt(dummy));
    run(world, 2.5);
    commands.push(select(1), castAt(dummy));
    run(world, 1);
    commands.push(select(2), castAt(dummy));
    run(world, 1);

    expect(casts).toEqual(['melee.bash', 'magic.fireball', 'magic.frost_nova']);
    expect(world.loadout.activeRight).toBe(2);
  });

  it('Q 重擊：對敵人技能會先走進距離再出手', () => {
    const { world, commands } = setup([dummyAt(10.5, 3.5)]);
    const dummy = enemiesOf(world)[0]!;
    commands.push(select(0), castAt(dummy));
    run(world, 0.2);
    expect(world.player.isMoving).toBe(true);
    expect(world.player.castCount).toBe(0);
    run(world, 3.5);
    expect(world.player.castCount).toBe(1);
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
  });

  it('E 冰霜新星：只打到範圍內的敵人', () => {
    const { world, commands } = setup([dummyAt(3.5, 2.5), dummyAt(12.5, 2.5)]);
    const [near, far] = enemiesOf(world);
    commands.push(select(2), castAt({ x: 5, y: 5 }));
    run(world, 0.5);
    expect(near!.hp).toBeLessThan(near!.maxHp);
    expect(far!.hp).toBe(far!.maxHp);
  });

  it('冷卻中不會施放；保留的意圖在冷卻結束後施放', () => {
    const { world, commands, events, data } = setup([]);
    const casts = vi.fn();
    events.on('SkillCast', casts);
    commands.push(select(2), castAt({ x: 5, y: 5 }));
    run(world, 0.5);
    commands.push(castAt({ x: 5, y: 5 }));
    run(world, 1);
    expect(casts).toHaveBeenCalledTimes(1);
    expect(world.player.cooldowns.get('magic.frost_nova')).toBeGreaterThan(0);

    run(world, data.skills.get('magic.frost_nova').cooldown);
    expect(casts).toHaveBeenCalledTimes(2);
  });

  it('魔力不足時施放失敗，不扣魔力、不產生效果', () => {
    const { world, commands, events } = setup();
    const onFailed = vi.fn();
    events.on('SkillFailed', onFailed);
    world.player.stats.setBase('manaRegen', 0);
    world.player.mana = 2;

    commands.push(select(1), castAt({ x: 10, y: 2 }));
    run(world, 0.5);
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ skillId: 'magic.fireball', reason: 'mana' }));
    expect(world.projectiles).toHaveLength(0);
    expect(world.player.mana).toBe(2);
    expect(world.player.castCount).toBe(0);
  });

  it('投射物撞牆會在牆邊爆炸，不會穿牆打到後面的敵人', () => {
    const { world, commands, events } = createWorldWithMap(
      ['############', '#S...#.....#', '#....#.....#', '############'],
      [dummyAt(8.5, 1.5)],
    );
    const dummy = enemiesOf(world)[0]!;
    const areas: { x: number; y: number }[] = [];
    events.on('AreaTriggered', (e) => areas.push(e.position));

    commands.push(select(1), castAt(dummy));
    run(world, 2);
    expect(world.projectiles).toHaveLength(0);
    expect(areas).toHaveLength(1);
    expect(areas[0]!.x).toBeGreaterThan(4.9);
    expect(areas[0]!.x).toBeLessThan(5.2);
    expect(dummy.hp).toBe(dummy.maxHp);
  });

  it('施放中不能移動，施放完才繼續走', () => {
    const { world, commands } = setup([]);
    commands.push(select(1), castAt({ x: 10, y: 1.5 }));
    world.update(DT);
    expect(world.player.isCasting).toBe(true);
    // 施放開始後才點地面：路徑會保留，但要等施放結束才移動
    commands.push({ type: 'PrimaryAction', worldPos: vec2(1.5, 4.5), targetId: null, held: false });
    const start = world.player.position;
    run(world, 0.3);
    expect(world.player.isCasting).toBe(true);
    expect(world.player.isMoving).toBe(true);
    expect(world.player.position).toEqual(start);
    run(world, 1);
    expect(world.player.position).not.toEqual(start);
  });

  it('新增技能只需加資料；Lv1 與 Lv5 的傷害與魔力消耗依 perRank 成長', () => {
    const measure = (rank: number) => {
      const { world, commands, data } = setup([dummyAt(6.5, 1.5)], [TEST_BOLT]);
      const dummy = enemiesOf(world)[0]!;
      world.player.stats.setBase('manaRegen', 0);
      world.player.skillRanks.set('magic.test_bolt', rank);
      world.loadout.right[0] = 'magic.test_bolt';
      commands.push(select(0), castAt(dummy));
      run(world, 0.5);
      return {
        damage: dummy.maxHp - dummy.hp,
        mana: world.player.maxMana - world.player.mana,
        cost: world.skills.manaCost(data.skills.get('magic.test_bolt'), rank),
      };
    };
    expect(measure(1)).toEqual({ damage: 10, mana: 5, cost: 5 });
    expect(measure(5)).toEqual({ damage: 18, mana: 9, cost: 9 });
  });

  it('多發投射物依 spread 散開', () => {
    const volley = {
      id: 'ranged.test_volley',
      name: '測試齊射',
      targeting: 'direction',
      castTime: 0,
      effects: [{ type: 'projectile', speed: 5, radius: 0.2, range: 8, count: 3, spreadDeg: 40, onHit: [] }],
    };
    const { world, commands } = setup([], [volley]);
    world.player.skillRanks.set('ranged.test_volley', 1);
    world.loadout.right[0] = 'ranged.test_volley';
    commands.push(select(0), castAt({ x: 12, y: 3 }));
    world.update(DT);
    expect(world.projectiles).toHaveLength(3);
    const dirs = world.projectiles.map((p) => Math.atan2(p.direction.y, p.direction.x));
    expect(dirs[2]! - dirs[0]!).toBeCloseTo((40 * Math.PI) / 180);
  });
});

describe('藥水與魔力回復（M4）', () => {
  it('Space 同時回復 HP 與 MP，數量減 1', () => {
    const { world, commands, data, events } = setup([]);
    const potion = data.potions.get(data.balance.player.potionId);
    const onUsed = vi.fn();
    events.on('PotionUsed', onUsed);
    world.player.stats.setBase('manaRegen', 0);
    world.player.hp = 10;
    world.player.mana = 0;
    const before = world.potions.count;

    commands.push({ type: 'UsePotion' });
    world.update(DT);
    expect(world.player.hp).toBeCloseTo(10 + world.player.maxHp * potion.hpPct);
    expect(world.player.mana).toBeCloseTo(world.player.maxMana * potion.mpPct);
    expect(world.potions.count).toBe(before - 1);
    expect(onUsed).toHaveBeenCalledWith(expect.objectContaining({ remaining: before - 1 }));
  });

  it('冷卻中連按無效；回復不超過上限', () => {
    const { world, commands } = setup([]);
    world.player.hp = 90;
    commands.push({ type: 'UsePotion' }, { type: 'UsePotion' });
    world.update(DT);
    expect(world.potions.count).toBe(2);
    expect(world.player.hp).toBe(world.player.maxHp);
  });

  it('HP 與 MP 都滿時不會使用藥水', () => {
    const { world, commands } = setup([]);
    const before = world.potions.count;
    commands.push({ type: 'UsePotion' });
    world.update(DT);
    expect(world.potions.count).toBe(before);
  });

  it('藥水用完後無效', () => {
    const { world, commands } = setup([]);
    while (world.inventory.takePotion(world.potions.potionId));
    world.player.hp = 10;
    commands.push({ type: 'UsePotion' });
    world.update(DT);
    expect(world.player.hp).toBe(10);
    expect(world.potions.count).toBe(0);
  });

  it('魔力依 manaRegen 每秒回復', () => {
    const { world, data } = setup([]);
    world.player.mana = 0;
    run(world, 2);
    expect(world.player.mana).toBeCloseTo(2 * data.balance.player.manaRegenPerSec, 1);
  });
});

describe('怪物也經由 SkillSystem 攻擊（M4）', () => {
  it('骷髏以 basic.attack 攻擊玩家', () => {
    const { world, events } = createWorldWithMap(ROOM, [{ enemyId: 'enemy.skeleton', at: [4.5, 2.5] }]);
    const casts: string[] = [];
    events.on('SkillCast', (e) => {
      if (e.actorId !== world.player.id) casts.push(e.skillId);
    });
    run(world, 3);
    expect(casts.length).toBeGreaterThan(0);
    expect(new Set(casts)).toEqual(new Set(['basic.attack']));
    expect(distance(enemiesOf(world)[0]!.position, world.player.position)).toBeLessThan(1.5);
  });
});
