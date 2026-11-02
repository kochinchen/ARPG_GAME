import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { scaleForFloor } from '../../../src/game/world/DifficultyScaler';
import { repairSave } from '../../../src/save/SaveRepair';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { run } from '../helpers';

/** 噴錢的結晶獸（balance.goldWalker）：第 5 層起機率出現、單獨行動、血量同精英、打倒噴 400～1500 金幣（越深越多） */
const data = DataRegistry.load(gameData);
const config = data.balance.goldWalker;

function world(floor: number, seed = 3) {
  const events = new EventBus<GameEvents>();
  return new GameWorld({ data, floor, commands: new CommandQueue<GameCommand>(), events, seed });
}
const walkers = (w: GameWorld) => w.actors.filter((a) => a.defId !== null && config.enemies.includes(a.defId));
const groundGold = (w: GameWorld) => w.groundItems.reduce((sum, g) => sum + (g.content.kind === 'gold' ? g.content.amount : 0), 0);

/** 找一個這一層有結晶獸的世界（機率出現） */
function withWalkers(floor: number) {
  for (let seed = 1; seed < 100; seed++) {
    const w = world(floor, seed);
    if (walkers(w).length > 0) return w;
  }
  throw new Error(`第 ${floor} 層找不到結晶獸`);
}

describe('噴錢的結晶獸', () => {
  it('第 5 層以前不出現；第 5 層起每個機率各自擲：平均約 1.05 隻、最多 6 隻', () => {
    for (let seed = 1; seed <= 12; seed++) expect(walkers(world(4, seed))).toHaveLength(0);
    let total = 0;
    let max = 0;
    const N = 80;
    for (let seed = 1; seed <= N; seed++) {
      const n = walkers(world(5, seed)).length;
      total += n;
      max = Math.max(max, n);
    }
    // 0.3 + 0.25 + 0.2 + 0.15 + 0.1 + 0.05
    expect(total / N).toBeGreaterThan(0.7);
    expect(total / N).toBeLessThan(1.4);
    expect(max).toBeLessThanOrEqual(config.chances.length);
    // 要產生 92 個世界，全部測試一起跑時會超過預設的 30 秒
  }, 120_000);

  it('血量同精英、體型固定，但不算精英', () => {
    const w = withWalkers(12);
    const elite = data.balance.elite;
    const scaling = scaleForFloor(12, data.balance.difficulty);
    for (const a of walkers(w)) {
      const def = data.enemies.get(a.defId!);
      expect(a.visualRadius).toBeCloseTo(def.radius * def.size);
      expect(a.elite).toBe(false);
      expect(a.stats.get('maxHp')).toBeCloseTo(def.hp * scaling.hp * elite.hpMultiplier);
    }
  });

  it('單獨行動：和其他怪物有距離，不招呼同伴也不被叫醒', () => {
    const w = withWalkers(12);
    const list = walkers(w);
    for (const a of list) {
      expect(a.ai!.solitary).toBe(true);
      for (const other of w.actors) {
        if (other === a || other.faction !== 'enemy' || other.isBoss || other.name.startsWith('首領') || list.includes(other)) continue;
        expect(distance(a.position, other.position), `${a.name}、${other.name}`).toBeGreaterThanOrEqual(config.alone);
      }
    }
  });

  it('打倒時噴出金幣：第 5 層約 530、最後幾層接近 1500，分成幾堆', () => {
    const expected = (f: number) => config.gold[0] + ((config.gold[1] - config.gold[0]) * (f - 1)) / 34;
    for (const floor of [5, 33]) {
      const w = withWalkers(floor);
      const before = groundGold(w);
      walkers(w)[0]!.hp = 0;
      run(w, 1 / 60);
      const gained = groundGold(w) - before;
      expect(gained).toBeGreaterThanOrEqual(Math.floor(expected(floor) * (1 - config.variance)));
      expect(gained).toBeLessThanOrEqual(Math.ceil(expected(floor) * (1 + config.variance)));
    }
  });

  it('晶核碎裂：死亡 0.8 秒後才發動，四種都會打到站在旁邊的主角', () => {
    for (const id of config.enemies) {
      const w = withWalkers(6);
      const walker = walkers(w)[0]!;
      // 換成指定的屬性：直接測這隻怪的死亡技能
      const def = data.enemies.get(id);
      expect(def.onDeath).toBeDefined();
      w.player.position = vec2(walker.position.x + 1, walker.position.y);
      (walker as { defId: string | null }).defId = id;
      const hp = w.player.hp;
      walker.hp = 0;
      run(w, def.onDeath!.delay - 0.2);
      expect(w.player.hp, `${def.name} 前`).toBe(hp);
      run(w, 2);
      expect(w.player.hp, `${def.name} 後`).toBeLessThan(hp);
    }
  });

  it('換樓層時，還沒發動的晶核碎裂會取消', () => {
    const w = withWalkers(6);
    const walker = walkers(w)[0]!;
    (walker as { defId: string | null }).defId = 'enemy.ember_walker';
    const bursts: string[] = [];
    w.events.on('AreaTriggered', (e) => bursts.push(e.skillId));
    walker.hp = 0;
    run(w, 0.1);
    w.enterFloor(7);
    run(w, 1.2);
    expect(bursts).not.toContain('enemy.ember_shatter');
  });

  it('不算進開出口的擊殺數', () => {
    const w = withWalkers(6);
    const before = w.floors.remainingToOpen;
    walkers(w)[0]!.hp = 0;
    run(w, 1 / 60);
    expect(w.floors.remainingToOpen).toBe(before);
  });

  it('讀檔不重擲：不能靠重新整理刷錢', () => {
    const w = withWalkers(9);
    const save = SaveMapper.capture(w, 'T');
    const fresh = world(1, save.meta.runSeed);
    SaveMapper.restore(fresh, repairSave(save, data));
    expect(walkers(fresh)).toHaveLength(0);
  });

  it('每次進入樓層都重新擲；打過之後回來還可能再出現', () => {
    const w = withWalkers(7);
    walkers(w)[0]!.hp = 0;
    run(w, 1 / 60);
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      w.enterFloor(8);
      run(w, 1 / 60);
      w.enterFloor(7);
      run(w, 1 / 60);
      seen = walkers(w).length > 0;
    }
    expect(seen).toBe(true);
  });
});
