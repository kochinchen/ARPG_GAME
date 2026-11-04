import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { ItemGenerator } from '../../../src/game/items/ItemGenerator';
import { LootSystem } from '../../../src/game/items/LootSystem';
import { NavGrid } from '../../../src/game/movement/NavGrid';
import { generatedMapId, openHiddenRoom } from '../../../src/game/world/MapGenerator';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { MAP_TILES, type MapDef } from '../../../src/data/schema/map';
import { run } from '../helpers';

/** 隱藏魔王（balance.hiddenBoss）：預留的隱藏房平常是實心牆，骰到才打開；可以不打，不影響出口 */
const data = DataRegistry.load(gameData);
const config = data.balance.hiddenBoss;
const BOSS_FLOORS = config.bosses[0]!.floors;

function world(floor: number, seed = 3, force = false) {
  const events = new EventBus<GameEvents>();
  const w = new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events, seed });
  w.forceHiddenBoss = force;
  w.enterFloor(floor);
  return w;
}
const bossOf = (w: GameWorld) => w.actors.find((a) => a.defId === 'enemy.bone_dragon');

/** 從樓梯口走得到的格子 */
function reachable(map: MapDef): Set<number> {
  const W = map.rows[0]!.length;
  const H = map.rows.length;
  let start = -1;
  map.rows.forEach((r, y) => {
    const x = r.indexOf(MAP_TILES.spawn);
    if (x >= 0) start = y * W + x;
  });
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % W;
    const y = Math.floor(c / W);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || map.rows[ny]![nx] === MAP_TILES.wall) continue;
      const i = ny * W + nx;
      if (!seen.has(i)) {
        seen.add(i);
        stack.push(i);
      }
    }
  }
  return seen;
}
const markers = (map: MapDef) => {
  const W = map.rows[0]!.length;
  const out: number[] = [];
  map.rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === MAP_TILES.spawn || ch === MAP_TILES.midway || ch === MAP_TILES.exit) out.push(y * W + x);
  }));
  return out;
};

describe('隱藏房', () => {
  it('只有預留的樓層有；位置固定在右上角、大小固定', () => {
    expect(world(10).map.hiddenRoom).toBeUndefined();
    expect(world(15).map.hiddenRoom).toBeUndefined();
    expect(world(30).map.hiddenRoom).toBeUndefined();
    for (const floor of [11, 19, 23, 29]) {
      const room = world(floor).map.hiddenRoom!;
      const def = data.floors.all.find((f) => f.floors[0] <= floor && floor <= f.floors[1])!;
      expect(room.size).toBe(config.roomSize);
      expect(def.layout!.width - room.x - room.size / 2).toBe(4);
      expect(room.y - room.size / 2).toBe(4);
    }
  });

  it('封閉時整塊都是牆；打開後走得到房間中央，樓梯口、存檔點、出口的路不經過它', () => {
    const seeds = Number(process.env.SET_PIECE_SEEDS ?? 1);
    for (let seed = 1; seed <= seeds; seed++) {
      for (const floor of config.roomFloors) {
        const closed = world(floor, seed)['mapFor'](floor);
        const room = closed.hiddenRoom!;
        const [x, y, w, h] = room.carve[0]!;
        for (let yy = y; yy < y + h; yy++) expect(closed.rows[yy]!.slice(x, x + w)).toBe(MAP_TILES.wall.repeat(w));
        const before = reachable(closed);
        for (const m of markers(closed)) expect(before.has(m)).toBe(true);
        const open = openHiddenRoom(closed);
        const after = reachable(open);
        const W = closed.rows[0]!.length;
        expect(after.has((y + Math.floor(h / 2)) * W + x + Math.floor(w / 2))).toBe(true);
        // 只多出房間和通道：其他地方的牆與地板完全一樣
        expect(markers(open)).toEqual(markers(closed));
        for (const c of before) expect(after.has(c)).toBe(true);
      }
    }
  }, 240_000);

  it('有沒有魔王，一般怪物與寶箱的位置都一樣', () => {
    const a = world(17, 5, false);
    const b = world(17, 5, true);
    expect(bossOf(a)).toBeUndefined();
    expect(bossOf(b)).toBeDefined();
    expect(b.chests.map((c) => c.position)).toEqual(a.chests.map((c) => c.position));
    const others = (w: GameWorld) => w.actors.filter((x) => x.defId !== 'enemy.bone_dragon' && !data.balance.goldWalker.enemies.includes(x.defId ?? '')).map((x) => x.position);
    expect(others(b)).toEqual(others(a));
  });
});

describe('隱藏魔王', () => {
  it('約 20% 出現；只在指定的樓層', () => {
    const w = world(BOSS_FLOORS[0]!);
    let n = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      w['playTime'] = i;
      if (w['rollHiddenBoss'](BOSS_FLOORS[0]!)) n++;
    }
    expect(n / N).toBeGreaterThan(0.17);
    expect(n / N).toBeLessThan(0.23);
    expect(bossOf(world(23, 1, true))).toBeUndefined();
  });

  it('站在房間中央、抽到兩種不同屬性，不算進開出口的擊殺數', () => {
    const w = world(16, 2, true);
    const boss = bossOf(w)!;
    const room = w.map.hiddenRoom!;
    expect(Math.hypot(boss.position.x - room.x, boss.position.y - room.y)).toBeLessThan(1);
    expect(boss.innateElements).toHaveLength(2);
    expect(boss.innateElements![0]).not.toBe(boss.innateElements![1]);
    expect(boss.isBoss).toBe(true);
    const before = w.floors.remainingToOpen;
    boss.hp = 0;
    run(w, 0.1);
    expect(boss.alive).toBe(false);
    expect(w.floors.remainingToOpen).toBe(before);
    expect(w.floors.bossFloor).toBe(false);
    expect(w.hiddenBoss!.dead).toBe(true);
  });

  it('讀檔不重擲：沒骰到的還是沒有；有的還在、屬性相同；打倒的不會復活', () => {
    const reload = (w: GameWorld) => {
      const save = SaveMapper.capture(w, 'T');
      const next = new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events: new EventBus<GameEvents>(), seed: w.runSeed });
      next.forceHiddenBoss = true;
      SaveMapper.restore(next, repairSave(save, data));
      return next;
    };
    let none = world(16, 1, false);
    for (let seed = 2; bossOf(none); seed++) none = world(16, seed, false);
    expect(bossOf(reload(none))).toBeUndefined();
    const w = world(16, 2, true);
    const elements = [...bossOf(w)!.innateElements!];
    const again = reload(w);
    expect(bossOf(again)!.innateElements).toEqual(elements);
    expect(reachable(again.map).size).toBe(reachable(w.map).size);
    bossOf(w)!.hp = 0;
    run(w, 0.1);
    const after = reload(w);
    expect(bossOf(after)).toBeUndefined();
    expect(after.map.rows).toEqual(w.map.rows);
  });

  it('招式：每次出招只有一種屬性，且一定是抽到的屬性', () => {
    const w = world(16, 2, true);
    const boss = bossOf(w)!;
    boss.innateElements = ['cold', 'poison'];
    const seen = new Set<string>();
    w.events.on('AreaTriggered', (e) => {
      if (e.skillId.startsWith('enemy.maw_spit') && e.element) seen.add(e.element);
    });
    const skill = data.skills.get('enemy.maw_spit');
    for (let i = 0; i < 12; i++) {
      w.skills['executor'].execute(boss, skill, 1, null, boss.position, boss.facing);
      run(w, 2);
    }
    expect([...seen].sort()).toEqual(['cold', 'poison']);
  });
});

describe('地上的腐液', () => {
  const spread = (w: GameWorld, boss: NonNullable<ReturnType<typeof bossOf>>) => {
    for (let i = 0; i < 5; i++) {
      w.skills['executor'].execute(boss, data.skills.get('enemy.maw_spread'), 1, null, boss.position, boss.facing);
      run(w, 2.5);
    }
  };

  it('怨念蔓延：直徑 2.5 格、10 秒、冷卻 30 秒，不隨樓層放大，彼此不重疊', () => {
    expect(data.skills.get('enemy.maw_spread').cooldown).toBe(30);
    expect(data.skills.get('enemy.maw_spread').fixedArea).toBe(true);
    const w = world(22, 2, true);
    const boss = bossOf(w)!;
    boss.innateElements = ['cold', 'poison'];
    spread(w, boss);
    const zones = w.scheduler.zones.filter((z) => z.ctx.skill.id.startsWith('enemy.maw_spread'));
    expect(zones.length).toBeGreaterThan(3);
    for (const a of zones) {
      expect(a.radius).toBe(1.25);
      expect(a.remaining).toBeLessThanOrEqual(10);
      for (const b of zones) if (a !== b) expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThanOrEqual(2.5);
    }
  });

  it('腐蝕足跡、觸手噴濺：直徑 1.5 格、約每 20 秒一次', () => {
    const boss = data.enemies.get('enemy.bone_dragon');
    expect(boss.passives).toEqual([{ skill: 'enemy.maw_trail', every: 20 }, { skill: 'enemy.maw_vent', every: 20 }]);
    expect(JSON.stringify(data.skills.get('enemy.maw_trail').effects)).toContain('"radius":0.75');
    expect(JSON.stringify(data.skills.get('enemy.maw_vent').effects)).toContain('"radius":0.75');
  });
});

describe('掉寶', () => {
  const loot = () => {
    const rng = new Rng(9);
    const nav = NavGrid.fromMap({ rows: ['...'] });
    return new LootSystem(data, rng, new ItemGenerator(data, rng.fork('i'), rng.fork('s')), nav, () => ({}) as never, () => 16, () => 3, () => 16, new EventBus<GameEvents>());
  };

  it('第 16 層：一定 6 件裝備，另外 2000～3000 金幣；約 10% 有一件 5 孔白裝', () => {
    const system = loot();
    let white = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const drops = system.roll('loot.hidden_boss');
      const items = drops.flatMap((d) => (d.kind === 'item' ? [d.item] : []));
      expect(items).toHaveLength(6);
      const gold = drops.reduce((sum, d) => sum + (d.kind === 'gold' ? d.amount : 0), 0);
      expect(gold).toBeGreaterThanOrEqual(2000);
      expect(gold).toBeLessThanOrEqual(3000);
      const full = items.filter((it) => it.rarity === 'normal' && it.sockets?.max === data.balance.sockets.max.normal);
      if (full.length > 0) white++;
    }
    expect(white / N).toBeGreaterThan(0.07);
    expect(white / N).toBeLessThan(0.14);
  });
});

describe('萬骸之口的掉寶：越深越多，但不如噬界足眼', () => {
  const lootAt = (floor: number) => {
    const rng = new Rng(9);
    const nav = NavGrid.fromMap({ rows: ['...'] });
    return new LootSystem(data, rng, new ItemGenerator(data, rng.fork('i'), rng.fork('s')), nav, () => ({}) as never, () => floor, () => 3, () => floor, new EventBus<GameEvents>());
  };

  it.each([[16, 6], [17, 7], [18, 7], [19, 8], [21, 9], [22, 9]])('第 %i 層 %i 件', (floor, items) => {
    const drops = lootAt(floor).roll('loot.hidden_boss');
    expect(drops.filter((d) => d.kind === 'item').length).toBe(items);
  });

  it('第 22 層：金幣 ×1.5、5 孔白裝約 15%', () => {
    const system = lootAt(22);
    let white = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const drops = system.roll('loot.hidden_boss');
      const gold = drops.reduce((sum, d) => sum + (d.kind === 'gold' ? d.amount : 0), 0);
      expect(gold).toBeGreaterThanOrEqual(3000);
      expect(gold).toBeLessThanOrEqual(4500);
      if (drops.some((d) => d.kind === 'item' && d.item.rarity === 'normal' && d.item.sockets?.max === data.balance.sockets.max.normal)) white++;
    }
    expect(white / N).toBeGreaterThan(0.11);
    expect(white / N).toBeLessThan(0.19);
  });
});

describe('保底稀有度', () => {
  const rolls = (table: string, floor: number) => {
    const rng = new Rng(21);
    const nav = NavGrid.fromMap({ rows: ['...'] });
    const system = new LootSystem(data, rng, new ItemGenerator(data, rng.fork('i'), rng.fork('s')), nav, () => ({}) as never, () => floor, () => 3, () => floor, new EventBus<GameEvents>());
    return Array.from({ length: 500 }, () => system.roll(table).flatMap((d) => (d.kind === 'item' ? [d.item] : [])));
  };

  it.each([16, 19, 22])('萬骸之口第 %i 層：每次至少一件橘裝以上，件數不變', (floor) => {
    for (const items of rolls('loot.hidden_boss', floor)) {
      expect(items.some((it) => it.rarity === 'legendary' || it.rarity === 'mythic')).toBe(true);
      expect(items).toHaveLength(6 + Math.round((3 * (floor - 16)) / 6));
    }
  });

  it.each([23, 26, 29])('噬界足眼第 %i 層：每次至少一件紅裝，件數不變', (floor) => {
    for (const items of rolls('loot.abyss_eye', floor)) {
      expect(items.some((it) => it.rarity === 'mythic')).toBe(true);
      expect(items).toHaveLength(6 + (floor - 23));
    }
  });

  it('5 孔白裝和保底可以同時出現', () => {
    const both = rolls('loot.hidden_boss', 22).filter((items) => items.some((it) => it.rarity === 'normal' && it.sockets?.max === data.balance.sockets.max.normal));
    expect(both.length).toBeGreaterThan(0);
    for (const items of both) expect(items.some((it) => it.rarity === 'legendary' || it.rarity === 'mythic')).toBe(true);
  });
});

describe('噬界足眼的掉寶：越深越多', () => {
  const lootAt = (floor: number) => {
    const rng = new Rng(9);
    const nav = NavGrid.fromMap({ rows: ['...'] });
    return new LootSystem(data, rng, new ItemGenerator(data, rng.fork('i'), rng.fork('s')), nav, () => ({}) as never, () => floor, () => 5, () => floor, new EventBus<GameEvents>());
  };
  const count = (floor: number) => {
    const drops = lootAt(floor).roll('loot.abyss_eye');
    return { items: drops.filter((d) => d.kind === 'item').length, gold: drops.reduce((sum, d) => sum + (d.kind === 'gold' ? d.amount : 0), 0) };
  };

  it.each([[23, 6, 1], [24, 7, 7 / 6], [26, 9, 1.5], [27, 10, 10 / 6], [28, 11, 11 / 6], [29, 12, 2]])('第 %i 層 %i 件，金幣 ×%f', (floor, items, gold) => {
    const c = count(floor);
    expect(c.items).toBe(items);
    expect(c.gold).toBeGreaterThanOrEqual(Math.floor(2000 * gold));
    expect(c.gold).toBeLessThanOrEqual(Math.ceil(3000 * gold));
  });

  it('5 孔白裝：第 23 層約 10%、第 29 層約 25%', () => {
    const white = (floor: number) => {
      const system = lootAt(floor);
      let n = 0;
      for (let i = 0; i < 1000; i++) {
        const drops = system.roll('loot.abyss_eye');
        if (drops.some((d) => d.kind === 'item' && d.item.rarity === 'normal' && d.item.sockets?.max === data.balance.sockets.max.normal)) n++;
      }
      return n / 1000;
    };
    expect(white(23)).toBeGreaterThan(0.07);
    expect(white(23)).toBeLessThan(0.14);
    expect(white(29)).toBeGreaterThan(0.2);
    expect(white(29)).toBeLessThan(0.3);
  });
});

it('地圖 ID 不變', () => expect(world(11).map.id).toBe(generatedMapId(11)));
