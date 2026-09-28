import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import { canAscend, descendKind, selectableFloors } from '../../../src/game/world/Endgame';
import { scaleForFloor } from '../../../src/game/world/DifficultyScaler';
import { makeInvulnerable, run } from '../helpers';

const data = DataRegistry.load(gameData);
const cfg = data.balance.endgame;

function world(floor: number, seed = 7) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const w = new GameWorld({ data, floor, commands, events, seed });
  const send = (c: GameCommand) => {
    commands.push(c);
    run(w, 1 / 60);
  };
  return { world: w, events, send };
}
const mainBoss = (w: GameWorld) => w.actors.find((a) => a.isBoss && !a.miniBoss)!;
const kill = (w: GameWorld, actor = mainBoss(w)) => {
  actor.hp = 0;
  run(w, 1 / 60);
};

describe('終局規則（純函式）', () => {
  const p = (cleared: boolean, completedHidden: boolean, highestFloor: number) => ({ cleared, completedHidden, highestFloor });

  it('讀檔可選的樓層：未通關不能選；已通關 1～30；進入挑戰後 31～35；完成隱藏難關 1～35', () => {
    expect(selectableFloors(p(false, false, 20), cfg)).toEqual([]);
    expect(selectableFloors(p(true, false, 30), cfg)).toHaveLength(30);
    expect(selectableFloors(p(true, false, 33), cfg)).toEqual([31, 32, 33, 34, 35]);
    expect(selectableFloors(p(true, true, 35), cfg)).toHaveLength(35);
  });

  it('第 31 層不能往上（完成隱藏難關後可以）；31～35 之間可以', () => {
    expect(canAscend(31, p(true, false, 31), cfg)).toBe(false);
    expect(canAscend(32, p(true, false, 32), cfg)).toBe(true);
    expect(canAscend(31, p(true, true, 35), cfg)).toBe(true);
    expect(canAscend(1, p(false, false, 1), cfg)).toBe(false);
  });

  it('出口：第 30 層第一次要確認；第 35 層沒有下一層', () => {
    expect(descendKind(29, p(false, false, 29), cfg)).toBe('next');
    expect(descendKind(30, p(true, false, 30), cfg)).toBe('confirmChallenge');
    expect(descendKind(30, p(true, true, 35), cfg)).toBe('next');
    expect(descendKind(35, p(true, true, 35), cfg)).toBe('none');
  });
});

describe('第 30 層：通關與進入挑戰', () => {
  it('擊敗第 30 層的魔王 = 已通關；出口先詢問，確認後才前往第 31 層', () => {
    const { world: w, events, send } = world(30);
    const cleared: string[] = [];
    const asked: number[] = [];
    events.on('GameCleared', (e) => cleared.push(e.stage));
    events.on('ChallengeConfirm', (e) => asked.push(e.toFloor));
    kill(w);
    expect(w.progress.cleared).toBe(true);
    expect(cleared).toEqual(['normal']);
    w.useExit();
    run(w, 1 / 60);
    expect(asked).toEqual([31]);
    expect(w.floors.floor).toBe(30);
    send({ type: 'ConfirmEnterChallenge' });
    expect(w.floors.floor).toBe(31);
    // 第 31 層沒有往上的樓梯
    expect(w.stairsUp).toBeNull();
  });
});

describe('第 31～34 層：中途小王', () => {
  it('最多 4 隻小王，各在自己的空地中央；數值是魔王的一半，沒有階段變化', () => {
    const { world: w } = world(32);
    const minis = w.actors.filter((a) => a.miniBoss);
    expect(minis.length).toBeGreaterThanOrEqual(2);
    expect(minis.length).toBeLessThanOrEqual(cfg.miniBoss.maxPerFloor);
    const scaling = scaleForFloor(32, data.balance.difficulty);
    for (const m of minis) {
      const def = data.enemies.get(m.defId!);
      expect(['enemy.crypt_guardian', 'enemy.fallen_priest']).toContain(def.id);
      expect(m.maxHp).toBeCloseTo(def.hp * scaling.hp * cfg.miniBoss.hpMultiplier, 0);
      const spot = w.map.subArenas.find((a) => distance(vec2(a.x, a.y), m.position) < 2);
      expect(spot, def.id).toBeDefined();
      // 空地裡沒有一般怪物
      expect(w.actors.filter((x) => x.faction === 'enemy' && !x.isBoss && distance(x.position, vec2(spot!.x, spot!.y)) < spot!.radius)).toHaveLength(0);
    }
    // 小王被打到一半也不會變身
    const m = minis[0]!;
    m.hp = m.maxHp * 0.2;
    run(w, 1 / 60);
    expect(w.bosses.phaseOf(m)).toBe(0);
  });
});

describe('第 35 層：王座廳', () => {
  it('一個直徑 40 個魔王身體寬度的圓形空間；最終魔王在中央、10 個寶箱、沒有一般怪物與出口', () => {
    const { world: w } = world(35);
    const boss = mainBoss(w);
    expect(boss.defId).toBe('enemy.abyss_sovereign');
    const def = data.enemies.get('enemy.abyss_sovereign');
    const arena = w.map.arena!;
    expect(arena.radius * 2).toBeGreaterThanOrEqual(40 * 2 * def.radius * def.size - 1);
    expect(distance(boss.position, vec2(arena.x, arena.y))).toBeLessThan(2);
    expect(w.actors.filter((a) => a.faction === 'enemy' && !a.isBoss)).toHaveLength(0);
    expect(w.chests).toHaveLength(10);
    expect(w.exit).toBeNull();
    // 樓梯口與中途存檔點都有商人，離魔王很遠
    expect(w.merchants).toHaveLength(2);
    expect(distance(w.spawnPoint, boss.position)).toBeGreaterThan(40);
    // 全抗性 30%，HP 約 30,000
    expect(boss.stats.get('fireResist')).toBeCloseTo(0.3);
    expect(boss.stats.get('physicalResist')).toBeCloseTo(0.3);
    expect(boss.maxHp).toBeGreaterThan(29500);
    expect(boss.maxHp).toBeLessThan(30500);
  });

  it('擊敗最終魔王 = 已完成隱藏難關；之後第 31 層可以往上', () => {
    const { world: w, events } = world(35);
    const cleared: string[] = [];
    events.on('GameCleared', (e) => cleared.push(e.stage));
    kill(w);
    expect(w.progress.completedHidden).toBe(true);
    expect(cleared).toEqual(['hidden']);
    w.enterFloor(31);
    expect(w.stairsUp).not.toBeNull();
  });

  it('王座廳的寶箱：每個必出 2 罐藥水與至少 1 件裝備', () => {
    const table = data.lootTables.get('loot.final_chest');
    expect(table.guaranteedPotions).toBe(2);
    expect(table.guaranteedItems).toBe(1);
  });
});

describe('讀檔選層', () => {
  it('只能前往可選範圍內的樓層，從樓梯口開始', () => {
    const { world: w } = world(10);
    expect(w.startAtFloor(3)).toBe(false);
    w.progress.cleared = true;
    w.progress.highestFloor = 30;
    expect(w.startAtFloor(31)).toBe(false);
    expect(w.startAtFloor(3)).toBe(true);
    expect(w.floors.floor).toBe(3);
    expect(distance(w.player.position, w.spawnPoint)).toBeLessThan(0.1);
  });
});

describe('深淵統御者：三個階段', () => {
  it('階段切換：70% 破盾（防禦 −20%）、30% 魔化（近戰 −20%、魔法 +20%），招式跟著換；三個階段都會實際出招', () => {
    const { world: w, events } = world(35);
    const boss = mainBoss(w);
    makeInvulnerable(w.player);
    w.player.position = vec2(boss.position.x + 4, boss.position.y);
    w.player.prevPosition = w.player.position;
    const casts: string[][] = [[], [], []];
    events.on('SkillCast', (e) => {
      if (e.actorId === boss.id) casts[w.bosses.phaseOf(boss)]!.push(e.skillId);
    });
    const defense = boss.stats.get('defense');
    run(w, 25);
    boss.hp = boss.maxHp * 0.6;
    run(w, 25);
    expect(w.bosses.phaseLabel(boss)).toBe('破盾狂獸');
    expect(boss.stats.get('defense')).toBeCloseTo(defense * 0.8);
    boss.hp = boss.maxHp * 0.2;
    run(w, 25);
    expect(w.bosses.phaseLabel(boss)).toBe('深淵魔化');
    expect(boss.stats.get('meleeDamageBonus')).toBeCloseTo(-0.2);
    expect(boss.stats.get('spellDamageBonus')).toBeCloseTo(0.2);
    // 第 1 階段有盾牌衝撞，之後沒有；第 2 階段五道劍氣；第 3 階段放火冰彈幕
    expect(casts[0]).toContain('enemy.sov_charge');
    expect(casts[1]).toContain('enemy.sov_fan_slash');
    expect(casts[1]).not.toContain('enemy.sov_charge');
    expect(casts[2]).toContain('enemy.sov_fire_volley');
    expect(casts[2]).toContain('enemy.sov_ice_volley');
  });
});

describe('魔王貼身時也會用特殊技能', () => {
  it('墓穴守衛站在玩家旁邊 30 秒：除了普通攻擊，也會用衝鋒、重擊、召喚', () => {
    const { world: w, events } = world(5);
    const boss = mainBoss(w);
    makeInvulnerable(w.player);
    w.player.position = vec2(boss.position.x + 1.6, boss.position.y);
    w.player.prevPosition = w.player.position;
    const casts = new Set<string>();
    events.on('SkillCast', (e) => {
      if (e.actorId === boss.id) casts.add(e.skillId);
    });
    run(w, 30);
    expect([...casts].filter((id) => id !== 'basic.attack').length).toBeGreaterThanOrEqual(2);
  });
});

describe('直線範圍（盾牌衝撞 30 × 10、五道劍氣 60 × 2）', () => {
  it('長方形內命中、外面不命中；offsetDeg 旋轉方向', async () => {
    const { AreaEffect } = await import('../../../src/game/skills/effects/AreaEffect');
    const { NO_MODS } = await import('../../../src/game/combo/StepMods');
    const { world: w } = world(35);
    const boss = mainBoss(w);
    const hits: number[] = [];
    const ctx = (dir = vec2(1, 0)) => ({
      caster: boss,
      skill: data.skills.get('enemy.sov_charge'),
      rank: 1,
      target: null,
      origin: boss.position,
      direction: dir,
      services: { targeting: w.targeting, events: w.events } as never,
      mods: NO_MODS,
      run: () => hits.push(1),
    });
    const at = (dx: number, dy: number) => {
      w.player.position = vec2(boss.position.x + dx, boss.position.y + dy);
      hits.length = 0;
    };
    const charge = { type: 'area' as const, radius: 30, at: 'origin' as const, offsetDeg: 0, includeTarget: false, line: { length: 30, width: 10 }, effects: [] as never[] };
    at(25, 4);
    new AreaEffect().apply(charge, ctx());
    expect(hits).toHaveLength(1);
    at(25, 6.5);
    new AreaEffect().apply(charge, ctx());
    expect(hits).toHaveLength(0);
    at(33, 0);
    new AreaEffect().apply(charge, ctx());
    expect(hits).toHaveLength(0);
    // 五道劍氣的一道：往右 80°（y 方向）旋轉後，正前方 40 格的玩家不會被這一道打到，正側面的會
    const beam = { ...charge, radius: 60, offsetDeg: 80, line: { length: 60, width: 2 } };
    at(40, 0);
    new AreaEffect().apply(beam, ctx());
    expect(hits).toHaveLength(0);
    const r = (80 * Math.PI) / 180;
    at(Math.cos(r) * 40, Math.sin(r) * 40);
    new AreaEffect().apply(beam, ctx());
    expect(hits).toHaveLength(1);
  });
});
