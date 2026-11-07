import { describe, expect, it } from 'vitest';
import { distance, vec2, type Vec2 } from '../../../src/core/math/Vec2';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameEvents } from '../../../src/game/GameEvents';
import type { Zone } from '../../../src/game/skills/EffectScheduler';
import { createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** 怪物的進階行為（設計者 2026-11-07）：躲範圍傷害、預判射擊、誘敵、撿藥水、吃屍體、復活屍體 */
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
type World = ReturnType<typeof setup>['world'];

/** 主角放在地上的區域（不造成傷害，只看怪物會不會躲） */
function zone(world: World, position: Vec2, radius: number, seconds = 30): Zone {
  const z: Zone = {
    id: 9000 + world.scheduler.zones.length,
    ctx: { caster: world.player } as unknown as Zone['ctx'],
    position,
    radius,
    remaining: seconds,
    interval: 1,
    timer: 1,
    ticksLeft: 0,
    followCaster: false,
    exclusive: false,
    effects: [],
  };
  world.scheduler.zones.push(z);
  return z;
}

/** 固定地圖沒有樓層：直接設定 AI 看的樓層（預判比例隨樓層） */
const aiFloor = (world: World, floor: number) => {
  (world as unknown as { ai: { floor: number } }).ai.floor = floor;
};

const provoke = (world: World, ...enemies: Actor[]) => {
  for (const e of enemies) e.ai!.provokedBy = world.player.id;
};

describe('躲開地上的範圍傷害', () => {
  it('路線繞開主角放的區域，不穿過去', () => {
    const { world } = setup([at('skeleton', 16, 5.5)]);
    world.player.position = vec2(4, 5.5);
    const skeleton = enemiesOf(world)[0]!;
    const fire = zone(world, vec2(10, 5.5), 1.5);
    provoke(world, skeleton);
    let inside = 0;
    let closest = Infinity;
    run(world, 6, () => {
      if (distance(skeleton.position, fire.position) < fire.radius) inside++;
      closest = Math.min(closest, distance(skeleton.position, world.player.position));
    });
    expect(inside).toBe(0);
    expect(closest).toBeLessThan(1.2);
  });

  it('站在區域裡的怪走出來', () => {
    const { world } = setup([at('skeleton', 12, 5.5)]);
    world.player.position = vec2(4, 5.5);
    const skeleton = enemiesOf(world)[0]!;
    provoke(world, skeleton);
    run(world, 0.2);
    zone(world, skeleton.position, 1.5);
    const center = skeleton.position;
    run(world, 0.6);
    expect(distance(skeleton.position, center)).toBeGreaterThan(1.5);
  });

  it('主角站在區域裡：怪在邊緣猶豫一陣子，之後硬闖；魔王不躲', () => {
    const { world, data } = setup([at('skeleton', 12, 5.5)]);
    world.player.position = vec2(6, 5.5);
    const skeleton = enemiesOf(world)[0]!;
    zone(world, world.player.position, 2);
    provoke(world, skeleton);
    run(world, 1.5);
    expect(distance(skeleton.position, world.player.position)).toBeGreaterThan(2);
    run(world, data.balance.enemyTactics.avoidZones.patience + 1.5);
    expect(distance(skeleton.position, world.player.position)).toBeLessThan(1.2);
  });
});

describe('預判射擊', () => {
  /** 弓手對著往上走的主角射箭，回傳瞄準點與主角當時的位置 */
  function aim(floor: number) {
    const { world, events } = setup([at('skeleton_archer', 14, 9)]);
    world.player.position = vec2(8, 9);
    const archer = enemiesOf(world)[0]!;
    archer.ai!.keepDistance = 0;
    aiFloor(world, floor);
    provoke(world, archer);
    const casts: { point: Vec2; player: Vec2 }[] = [];
    events.on('SkillCast', (e) => {
      if (e.actorId === archer.id) casts.push({ point: e.point, player: world.player.position });
    });
    run(world, 3, () => {
      // 主角一直往上走（每個 Tick 重新設定路線）
      world.player.path = [vec2(8, Math.max(1.5, world.player.position.y - 5))];
      if (world.player.position.y < 2) world.player.position = vec2(8, 9);
    });
    return casts;
  }

  it('瞄準主角走過去會到的位置；深層算得更準', () => {
    const shallow = aim(1);
    const deep = aim(30);
    expect(shallow.length).toBeGreaterThan(0);
    expect(deep.length).toBeGreaterThan(0);
    const ahead = (c: { point: Vec2; player: Vec2 }) => c.player.y - c.point.y;
    for (const c of [...shallow, ...deep]) expect(ahead(c)).toBeGreaterThan(0.05);
    expect(ahead(deep[0]!)).toBeGreaterThan(ahead(shallow[0]!) * 1.8);
  });

  it('主角站著不動就瞄準目前位置', () => {
    const { world, events } = setup([at('skeleton_archer', 14, 5.5)]);
    world.player.position = vec2(8, 5.5);
    const archer = enemiesOf(world)[0]!;
    aiFloor(world, 30);
    provoke(world, archer);
    const points: Vec2[] = [];
    events.on('SkillCast', (e) => {
      if (e.actorId === archer.id) points.push(e.point);
    });
    run(world, 2);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(distance(p, world.player.position)).toBeLessThan(1e-6);
  });
});

describe('誘敵', () => {
  it('血少的怪往遠處另一群閒置的怪逃，不叫醒牠們；到了再回頭打', () => {
    const { world, data } = setup([at('skeleton', 6, 5.5), at('skeleton', 6, 7), at('skeleton', 22, 5.5), at('skeleton', 23, 6)]);
    data.balance.enemyTactics.lure.chance = 1;
    const [bait, buddy, ...far] = enemiesOf(world);
    bait!.ai!.pack = { id: 0, size: 2 };
    buddy!.ai!.pack = { id: 0, size: 2 };
    for (const f of far) f.ai!.pack = { id: 1, size: 2 };
    world.player.position = vec2(4, 5.5);
    run(world, 0.6);
    expect(bait!.ai!.state).toBe('chase');
    bait!.hp = bait!.maxHp * 0.2;
    // 正在揮砍的這一下打完才逃
    run(world, 1.1);
    expect(bait!.ai!.state).toBe('flee');
    run(world, 2);
    expect(bait!.position.x).toBeGreaterThan(9);
    expect(far.every((f) => f.ai!.state === 'idle')).toBe(true);
    run(world, 6);
    expect(bait!.ai!.state).not.toBe('flee');
  });

  it('每隻只擲一次；附近沒有別群就不逃', () => {
    const { world, data } = setup([at('skeleton', 6, 5.5)]);
    data.balance.enemyTactics.lure.chance = 1;
    const skeleton = enemiesOf(world)[0]!;
    world.player.position = vec2(4, 5.5);
    run(world, 0.6);
    skeleton.hp = skeleton.maxHp * 0.2;
    run(world, 1);
    expect(skeleton.ai!.state).toBe('chase');
    expect(skeleton.ai!.lureRolled).toBe(true);
  });
});

describe('撿藥水', () => {
  const potion = (world: World, x: number, y: number) => world.spawnGroundItem(vec2(x, y), { kind: 'potion', potionId: 'potion.rejuvenation', count: 1 });

  it('血少的骷髏跑去撿地上的藥水、當場喝掉；藥水消失，每隻只喝一次', () => {
    const { world, data, events } = setup([at('skeleton', 8, 5.5)]);
    world.player.position = vec2(4, 5.5);
    const skeleton = enemiesOf(world)[0]!;
    run(world, 0.6);
    const first = potion(world, 12, 8);
    const second = potion(world, 12, 3);
    const errands: GameEvents['EnemyErrand'][] = [];
    events.on('EnemyErrand', (e) => errands.push(e));
    skeleton.hp = skeleton.maxHp * 0.2;
    run(world, 0.1);
    expect(skeleton.ai!.state).toBe('errand');
    expect(errands).toEqual([{ actorId: skeleton.id, kind: 'potion' }]);
    run(world, 4);
    expect(skeleton.hp).toBeCloseTo(skeleton.maxHp * (0.2 + data.balance.enemyTactics.potion.heal), 0);
    expect(world.groundItems.filter((g) => g === first || g === second)).toHaveLength(1);
    expect(skeleton.ai!.drankPotion).toBe(true);
    skeleton.hp = skeleton.maxHp * 0.2;
    run(world, 2);
    expect(world.groundItems.filter((g) => g === first || g === second)).toHaveLength(1);
  });

  it('主角先撿走就放棄；不會撿的怪（食屍鬼）不撿', () => {
    const { world } = setup([at('skeleton', 8, 5.5), at('ghoul', 8, 7)]);
    world.player.position = vec2(4, 5.5);
    const [skeleton, ghoul] = enemiesOf(world);
    run(world, 0.6);
    const item = potion(world, 14, 8);
    skeleton!.hp = skeleton!.maxHp * 0.2;
    ghoul!.hp = ghoul!.maxHp * 0.2;
    run(world, 0.1);
    expect(skeleton!.ai!.state).toBe('errand');
    expect(ghoul!.ai!.state).not.toBe('errand');
    world.groundItems.splice(world.groundItems.indexOf(item), 1);
    run(world, 0.1);
    expect(skeleton!.ai!.state).not.toBe('errand');
    expect(skeleton!.hp).toBeCloseTo(skeleton!.maxHp * 0.2);
  });
});

describe('處理屍體', () => {
  /** 在 x, y 留下一具 defId 的屍體 */
  function corpse(world: World, defId: string, x: number, y: number) {
    const c = { index: null, defId, position: vec2(x, y), facing: vec2(1, 0), visualRadius: 0.3, restored: true };
    world.corpses.push(c);
    return c;
  }

  it('受傷的食屍鬼去吃屍體：回血、變大、傷害提高，屍體消失', () => {
    const { world, data } = setup([at('ghoul', 8, 5.5)]);
    world.player.position = vec2(4, 5.5);
    const ghoul = enemiesOf(world)[0]!;
    run(world, 0.6);
    const body = corpse(world, 'enemy.skeleton', 11, 7);
    ghoul.hp = ghoul.maxHp * 0.5;
    run(world, 0.1);
    expect(ghoul.ai!.state).toBe('errand');
    run(world, 3);
    const config = data.balance.enemyTactics.devour;
    expect(world.corpses).not.toContain(body);
    expect(ghoul.growth).toBeCloseTo(1 + config.grow);
    expect(ghoul.stats.get('damageBonus')).toBeCloseTo(config.damage);
    expect(ghoul.hp).toBeGreaterThan(ghoul.maxHp * 0.8);
  });

  it('骷髏法師讓不死族的屍體站起來（召喚物、半血）；野獸的屍體不行', () => {
    const { world, data } = setup([at('skeleton_mage', 10, 5.5)]);
    world.player.position = vec2(4, 5.5);
    const mage = enemiesOf(world)[0]!;
    run(world, 0.6);
    const beast = corpse(world, 'enemy.bone_hound', 9, 8);
    const bones = corpse(world, 'enemy.skeleton', 11, 8);
    run(world, data.balance.enemyTactics.raise.duration + 1);
    expect(world.corpses).toContain(beast);
    expect(world.corpses).not.toContain(bones);
    const raised = enemiesOf(world).find((e) => e.defId === 'enemy.skeleton')!;
    expect(raised).toBeDefined();
    expect(raised.summonedBy).toBe(mage.id);
    expect(raised.xpReward).toBe(0);
    expect(raised.ai!.state).toBe('chase');
    expect(mage.ai!.raises).toBe(1);
    expect(mage.ai!.raiseCooldown).toBeGreaterThan(0);
  });
});
