import { describe, expect, it, vi } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { Rng } from '../../../src/core/Rng';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { NavGrid } from '../../../src/game/movement/NavGrid';
import { scaleForFloor } from '../../../src/game/world/DifficultyScaler';
import { SpawnSystem } from '../../../src/game/world/SpawnSystem';
import { generatedMapId } from '../../../src/game/world/MapGenerator';
import { run } from '../helpers';

const data = DataRegistry.load(gameData);

function floorWorld(floor = 1, seed = 1) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const world = new GameWorld({ data, floor, commands, events, seed });
  return { world, commands, events };
}

const enemies = (world: GameWorld) => world.actors.filter((a) => a.faction === 'enemy');
/** 擊敗 n 隻怪物 */
/** 擊殺 n 隻怪物；掉落物隨機，會影響「離開樓層前的確認」，所以一併清掉 */
function kill(world: GameWorld, n: number) {
  for (const e of enemies(world).slice(0, n)) e.hp = 0;
  run(world, 1 / 60);
  world.groundItems.length = 0;
}
function useExit(world: GameWorld, commands: CommandQueue<GameCommand>) {
  const exit = world.exit!;
  world.player.position = vec2(exit.position.x - 0.5, exit.position.y);
  commands.push({ type: 'PrimaryAction', worldPos: exit.position, targetId: null, interactId: exit.id, held: false });
  run(world, 1);
}

describe('DifficultyScaler', () => {
  const d = data.balance.difficulty;
  it('第 1 層為基準；之後每層線性成長；密度有上限', () => {
    // 前期怪物數量加成：第 1～5 層 +20%，之後遞減，第 30 層起沒有加成
    expect(scaleForFloor(1, d)).toEqual({ hp: 1, damage: 1, defense: 1, xp: 1, density: 1.2 });
    expect(scaleForFloor(5, d).density).toBeCloseTo((1 + 4 * d.densityPerFloor) * 1.2);
    expect(scaleForFloor(30, d).density).toBe(d.maxDensityMultiplier);
    expect(scaleForFloor(20, d).density).toBeCloseTo(d.maxDensityMultiplier * (1 + 0.2 * (10 / 25)));
    const f10 = scaleForFloor(10, d);
    expect(f10.hp).toBeCloseTo(1 + 9 * d.hpPerFloor);
    expect(f10.damage).toBeCloseTo(1 + 9 * d.damagePerFloor);
    expect(f10.xp).toBeCloseTo(1 + 9 * d.xpPerFloor);
    const f50 = scaleForFloor(50, d);
    expect(f50.hp).toBeCloseTo(1 + 49 * d.hpPerFloor);
    expect(f50.density).toBe(d.maxDensityMultiplier);
  });
});

describe('SpawnSystem', () => {
  const map = data.maps.get('map.crypt_a');
  const floorDef = data.floors.get('floor.crypt_1');
  const avoid = [vec2(3.5, 3.5), vec2(20.5, 16.5)];

  it('同一個 seed 產生相同的配置；怪物不會出現在安全範圍內，且都在地板上', () => {
    const plan = (seed: number) => new SpawnSystem(NavGrid.fromMap(map), new Rng(seed)).planMonsters(floorDef, 1, avoid.map((center) => ({ center, radius: 7 })));
    const a = plan(5);
    expect(a).toEqual(plan(5));
    expect(a.length).toBeGreaterThan(5);
    const nav = NavGrid.fromMap(map);
    for (const r of a) {
      expect(nav.isClearAt(r.position, 0.3)).toBe(true);
      for (const p of avoid) expect(distance(r.position, p)).toBeGreaterThanOrEqual(7);
    }
  });

  it('密度倍率越高怪物越多', () => {
    const count = (mult: number) => new SpawnSystem(NavGrid.fromMap(map), new Rng(3)).planMonsters(floorDef, mult, avoid.map((center) => ({ center, radius: 7 }))).length;
    expect(count(2)).toBeGreaterThan(count(1));
  });
});

describe('樓層模式（M7）', () => {
  it('第 1 層：玩家在樓梯口，怪物與寶箱依設定生成，存檔點附近沒有怪物', () => {
    const { world } = floorWorld(1);
    expect(world.floors.floor).toBe(1);
    expect(world.progress.currentFloor).toBe(1);
    expect(world.player.position).toEqual(world.spawnPoint);
    expect(enemies(world).length).toBe(world.floors.total);
    expect(world.floors.total).toBeGreaterThan(5);
    const def = world.floors.defFor(1);
    expect(world.chests.length).toBeGreaterThanOrEqual(def.chests[0]);
    expect(world.chests.length).toBeLessThanOrEqual(def.chests[1]);
    const safe = world.checkpoints.checkpoints.map((c) => c.position);
    for (const e of enemies(world)) for (const p of safe) expect(distance(e.position, p)).toBeGreaterThanOrEqual(data.balance.floor.safeRadius);
    // 樓梯口與出口：更大的安全範圍（大於怪物的偵測距離）
    for (const e of enemies(world)) {
      expect(distance(e.position, world.spawnPoint)).toBeGreaterThanOrEqual(data.balance.floor.stairsSafeRadius);
      expect(distance(e.position, world.exit!.position)).toBeGreaterThanOrEqual(data.balance.floor.stairsSafeRadius);
    }
    expect(data.balance.floor.stairsSafeRadius).toBeGreaterThan(Math.max(...data.enemies.all.map((e) => e.detectRange)));
    expect(world.exit?.open).toBe(false);
  });

  it('出口未開啟時點擊：提示還需擊敗幾隻；擊敗足夠比例後開啟', () => {
    const { world, commands, events } = floorWorld(1);
    const onLocked = vi.fn();
    const onOpened = vi.fn();
    events.on('ExitLocked', onLocked);
    events.on('ExitOpened', onOpened);
    const needed = Math.ceil(world.floors.total * world.floors.defFor(1).clearRatio);

    useExit(world, commands);
    expect(onLocked).toHaveBeenCalledWith({ remaining: needed, boss: false });
    expect(world.floors.floor).toBe(1);

    kill(world, needed - 1);
    expect(world.exit?.open).toBe(false);
    kill(world, 1);
    expect(onOpened).toHaveBeenCalledWith({ floor: 1 });
    expect(world.exit?.open).toBe(true);
  });

  it('點開啟的出口進入下一層：換地圖、清空本層、保留玩家進度，怪物變強', () => {
    const { world, commands, events } = floorWorld(1);
    const onEntered = vi.fn();
    events.on('FloorEntered', onEntered);
    // 怪物有隨機體型（血量不同）：比較同一種、非精英怪的平均值
    const average = (key: 'maxHp' | 'xpReward') => {
      const list = enemies(world).filter((e) => e.defId === 'enemy.skeleton' && !e.elite);
      return list.reduce((sum, e) => sum + e[key], 0) / list.length;
    };
    const floor1Hp = average('maxHp');
    const floor1Xp = average('xpReward');
    world.inventory.addItem({ uid: 'keep', baseId: 'ring.plain', rarity: 'normal', itemLevel: 1, affixes: [] });
    world.spawnGroundItem(vec2(3.5, 4.5), { kind: 'gold', amount: 5 });
    world.progress.level = 4;

    kill(world, world.floors.total);
    useExit(world, commands);

    expect(onEntered).toHaveBeenCalledWith({ floor: 2, mapId: generatedMapId(2) });
    expect(world.floors.floor).toBe(2);
    expect(world.map.id).toBe(generatedMapId(2));
    expect(world.progress).toMatchObject({ currentFloor: 2, highestFloor: 2, level: 4 });
    expect(world.itemLevel).toBe(2);
    expect(world.groundItems).toHaveLength(0);
    expect(world.inventory.items.map((i) => i.uid)).toContain('keep');
    expect(world.player.position).toEqual(world.spawnPoint);
    expect(world.exit?.open).toBe(false);
    expect(average('maxHp')).toBeGreaterThan(floor1Hp);
    expect(average('xpReward')).toBeGreaterThan(floor1Xp);
  });

  it('新地圖可以正常尋路移動', () => {
    const { world, commands } = floorWorld(2);
    const target = world.checkpoints.checkpoints[1]!.position;
    commands.push({ type: 'PrimaryAction', worldPos: target, targetId: null, held: false });
    world.update(1 / 60);
    expect(world.player.path.length).toBeGreaterThan(0);
  });
});

describe('存檔點（M7）', () => {
  it('走到中途存檔點時啟動；死亡後回到中途存檔點；進入新樓層後重設為樓梯口', () => {
    const { world, commands, events } = floorWorld(1);
    const onActivated = vi.fn();
    events.on('CheckpointActivated', onActivated);
    const midway = world.checkpoints.checkpoints.find((c) => c.kind === 'midway')!;
    expect(world.checkpoints.respawn.kind).toBe('stairs');

    world.player.position = midway.position;
    run(world, 1 / 60);
    expect(midway.active).toBe(true);
    expect(onActivated).toHaveBeenCalledWith({ kind: 'midway', position: midway.position });

    world.player.position = world.spawnPoint;
    world.player.hp = 0;
    run(world, data.balance.player.respawnDelay + 0.5);
    expect(world.player.alive).toBe(true);
    expect(world.player.position).toEqual(midway.position);

    kill(world, world.floors.total);
    useExit(world, commands);
    expect(world.checkpoints.respawn.kind).toBe('stairs');
  });

  it('擊殺經驗依樓層倍率增加', () => {
    const { world } = floorWorld(1);
    const enemy = enemies(world)[0]!;
    enemy.lastDamagedBy = world.player.id;
    enemy.hp = 0;
    run(world, 1 / 60);
    expect(world.progress.xp).toBe(data.enemies.get(enemy.defId!).xp);

    const deeper = floorWorld(11).world;
    const d = enemies(deeper)[0]!;
    expect(d.xpReward).toBe(Math.round(data.enemies.get(d.defId!).xp * scaleForFloor(11, data.balance.difficulty).xp));
  });
});

describe('回到上一層（M9）', () => {
  function useStairsUp(world: GameWorld, commands: CommandQueue<GameCommand>) {
    const stairs = world.stairsUp!;
    commands.push({ type: 'PrimaryAction', worldPos: stairs.position, targetId: null, interactId: stairs.id, held: false });
    run(world, 0.2);
  }
  function openChest(world: GameWorld, commands: CommandQueue<GameCommand>, index = 0) {
    const chest = world.chests.find((c) => c.spawnIndex === index)!;
    world.player.position = vec2(chest.position.x - 0.5, chest.position.y);
    commands.push({ type: 'PrimaryAction', worldPos: chest.position, targetId: null, interactId: chest.id, held: false });
    run(world, 0.5);
    return chest;
  }

  it('第 1 層沒有往上的樓梯；第 2 層以上樓梯口可以往上', () => {
    const { world } = floorWorld(1);
    expect(world.stairsUp).toBeNull();
    world.enterFloor(2);
    expect(world.stairsUp).not.toBeNull();
    expect(world.stairsUp!.position).toEqual(world.spawnPoint);
  });

  it('第 3 層往上：到第 2 層樓梯口，怪物全部重生、擊殺數 0、到過的中途點維持啟動、出口關閉', () => {
    const { world, commands } = floorWorld(2, 7);
    const fullCount = enemies(world).length;
    kill(world, 3);
    const midway = world.checkpoints.checkpoints.find((c) => c.kind === 'midway')!;
    world.player.position = midway.position;
    run(world, 1 / 60);
    expect(midway.active).toBe(true);
    world.enterFloor(3);

    useStairsUp(world, commands);
    expect(world.floors.floor).toBe(2);
    expect(world.progress.highestFloor).toBe(3);
    expect(enemies(world).length).toBe(fullCount);
    expect(world.floors.killed).toBe(0);
    // 以前到過第 2 層的中途：重新進入後中途點維持啟動，但一樣從樓梯口開始
    expect(world.checkpoints.get('midway')!.active).toBe(true);
    expect(distance(world.player.position, world.spawnPoint)).toBeLessThan(0.01);
    expect(world.floors.exitOpen).toBe(false);
    expect(world.exit!.open).toBe(false);
  });

  it('重新進入已通過的樓層：出口關閉，要重新清怪才能往下', () => {
    const { world, commands } = floorWorld(1);
    expect(world.floors.exitOpen).toBe(false);
    world.enterFloor(2);
    expect(world.floors.exitOpen).toBe(false);
    useStairsUp(world, commands);
    expect(world.floors.floor).toBe(1);
    expect(world.floors.exitOpen).toBe(false);
    expect(world.floors.remainingToOpen).toBeGreaterThan(0);
    kill(world, enemies(world).length);
    expect(world.floors.exitOpen).toBe(true);
  });

  it('寶箱只能開一次：開過的寶箱下樓再上樓仍是開啟狀態', () => {
    const { world, commands } = floorWorld(2);
    const chest = openChest(world, commands);
    expect(chest.opened).toBe(true);
    expect(world.floors.isChestOpened(2, 0)).toBe(true);
    world.enterFloor(3);
    useStairsUp(world, commands);
    expect(world.floors.floor).toBe(2);
    expect(world.chests.find((c) => c.spawnIndex === 0)!.opened).toBe(true);
    expect(world.chests.filter((c) => c.spawnIndex !== 0).every((c) => !c.opened)).toBe(true);
  });

  it('回到上層後再往下：下一層怪物重生、從樓梯口開始', () => {
    const { world, commands } = floorWorld(3, 4);
    const fullCount = enemies(world).length;
    kill(world, 4);
    useStairsUp(world, commands);
    expect(world.floors.floor).toBe(2);
    // 回到的樓層出口關閉：清怪後才能往下
    kill(world, enemies(world).length);
    useExit(world, commands);
    expect(world.floors.floor).toBe(3);
    expect(enemies(world).length).toBe(fullCount);
    expect(distance(world.player.position, world.spawnPoint)).toBeLessThan(0.01);
  });
});

describe('離開樓層前的確認（M8）', () => {
  /** 擊敗所有怪物讓出口開啟；怪物的隨機掉落清掉，只留下測試放的物品 */
  function openExit(world: GameWorld) {
    for (const e of enemies(world)) e.hp = 0;
    run(world, 1 / 60);
    world.groundItems.length = 0;
  }
  const rareItem = (world: GameWorld) => world.itemGenerator.create(data.items.all[0]!, 'rare', 1);

  it('地上有稀有以上物品：點出口先詢問、不換層；確認後才換層', () => {
    const { world, commands, events } = floorWorld(1);
    openExit(world);
    world.spawnGroundItem(world.spawnPoint, { kind: 'item', item: rareItem(world) });
    world.spawnGroundItem(world.spawnPoint, { kind: 'item', item: world.itemGenerator.create(data.items.all[0]!, 'magic', 1) });
    const asked = vi.fn();
    events.on('LeaveFloorConfirm', asked);
    useExit(world, commands);
    expect(asked).toHaveBeenCalledWith({ direction: 'down', toFloor: 2, valuableItems: 1 });
    expect(world.floors.floor).toBe(1);

    commands.push({ type: 'ConfirmLeaveFloor', direction: 'down' });
    run(world, 1 / 60);
    expect(world.floors.floor).toBe(2);
  });

  it('只有普通 / 魔法物品、藥水、金幣：不詢問，直接換層', () => {
    const { world, commands, events } = floorWorld(1);
    openExit(world);
    world.spawnGroundItem(world.spawnPoint, { kind: 'gold', amount: 5 });
    const asked = vi.fn();
    events.on('LeaveFloorConfirm', asked);
    useExit(world, commands);
    expect(asked).not.toHaveBeenCalled();
    expect(world.floors.floor).toBe(2);
  });

  it('往上的樓梯也會詢問；出口未開時仍是「還需擊敗幾隻」', () => {
    const { world, commands, events } = floorWorld(2);
    world.spawnGroundItem(world.spawnPoint, { kind: 'item', item: rareItem(world) });
    const asked = vi.fn();
    const locked = vi.fn();
    events.on('LeaveFloorConfirm', asked);
    events.on('ExitLocked', locked);
    useExit(world, commands);
    expect(locked).toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();

    const stairs = world.stairsUp!;
    world.player.position = stairs.position;
    commands.push({ type: 'PrimaryAction', worldPos: stairs.position, targetId: null, interactId: stairs.id, held: false });
    run(world, 0.2);
    expect(asked).toHaveBeenCalledWith({ direction: 'up', toFloor: 1, valuableItems: 1 });
    expect(world.floors.floor).toBe(2);
  });
});

describe('傳送口與魔王門前存檔點', () => {
  function click(world: GameWorld, commands: CommandQueue<GameCommand>, target: { id: number; position: { x: number; y: number } }) {
    world.player.position = vec2(target.position.x - 0.4, target.position.y);
    commands.push({ type: 'PrimaryAction', worldPos: vec2(target.position.x, target.position.y), targetId: null, interactId: target.id, held: false });
    run(world, 0.5);
  }

  it('中途點啟動後：樓梯口與中途旁各有一個傳送口，互相傳送', () => {
    const { world, commands, events } = floorWorld(2);
    expect(world.waypoints).toEqual([]);
    const midway = world.checkpoints.get('midway')!;
    world.player.position = midway.position;
    run(world, 1 / 60);
    expect(world.waypoints.map((w) => w.to)).toEqual(['midway', 'stairs']);
    const onUsed = vi.fn();
    events.on('WaypointUsed', onUsed);

    const atStairs = world.waypoints.find((w) => w.to === 'midway')!;
    expect(distance(atStairs.position, world.spawnPoint)).toBeLessThan(4);
    click(world, commands, atStairs);
    expect(distance(world.player.position, midway.position)).toBeLessThan(0.01);

    click(world, commands, world.waypoints.find((w) => w.to === 'stairs')!);
    expect(distance(world.player.position, world.spawnPoint)).toBeLessThan(0.01);
    expect(onUsed).toHaveBeenCalledTimes(2);
  });

  it('重新進入到過中途的樓層：一開始就有傳送口；沒到過中途的樓層沒有', () => {
    const { world } = floorWorld(2);
    world.player.position = world.checkpoints.get('midway')!.position;
    run(world, 1 / 60);
    world.enterFloor(3);
    expect(world.waypoints).toEqual([]);
    world.enterFloor(2);
    expect(world.checkpoints.get('midway')!.active).toBe(true);
    expect(world.waypoints).toHaveLength(2);
    expect(distance(world.player.position, world.spawnPoint)).toBeLessThan(0.01);
  });

  it('魔王層：競技場外有魔王門前存檔點，啟動後死亡回到那裡；重新進入後重設', () => {
    const { world } = floorWorld(5);
    const arena = world.map.arena!;
    const gate = world.checkpoints.get('boss')!;
    expect(gate).toBeDefined();
    const toCenter = Math.hypot(gate.position.x - arena.x, gate.position.y - arena.y);
    expect(toCenter).toBeGreaterThan(arena.radius);
    expect(toCenter).toBeLessThan(arena.radius + 4);
    expect(world.checkpoints.respawn.kind).toBe('stairs');

    world.player.position = gate.position;
    run(world, 1 / 60);
    expect(gate.active).toBe(true);
    expect(world.checkpoints.respawn.kind).toBe('boss');
    world.player.hp = 0;
    run(world, 6);
    expect(world.player.alive).toBe(true);
    expect(distance(world.player.position, gate.position)).toBeLessThan(0.01);

    world.enterFloor(6);
    world.enterFloor(5);
    expect(world.checkpoints.get('boss')!.active).toBe(false);
  });

  it('一般樓層沒有魔王門前存檔點', () => {
    expect(floorWorld(2).world.checkpoints.get('boss')).toBeUndefined();
  });
});
