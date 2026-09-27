import { describe, expect, it, vi } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';
import type { Actor } from '../../../src/game/entities/Actor';
import { SaveMapper } from '../../../src/save/SaveMapper';
import { repairSave } from '../../../src/save/SaveRepair';
import { makeInvulnerable, run } from '../helpers';

/** 樓層魔王：每 5 層（各區間不同魔王）、出口前方、擊敗後出口才開、召喚、階段變化、大量掉落 */
const data = DataRegistry.load(gameData);

function world(floor: number, seed = 1) {
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  return { world: new GameWorld({ data, floor, commands, events, seed }), commands, events };
}
const bossOf = (w: GameWorld) => w.actors.find((a) => a.isBoss);
const kill = (w: GameWorld, actors: Actor[]) => {
  for (const a of actors) {
    a.lastDamagedBy = w.player.id;
    a.hp = 0;
  }
  run(w, 1 / 60);
};
/** 讓 Boss 不理玩家：只測規則，不讓戰鬥干擾 */
const sleep = (boss: Actor) => {
  boss.ai!.detectRange = 0;
};

describe('Boss 層', () => {
  it('每 5 層一隻魔王（依樓層區間不同），位置在出口前方；第 4、6 層沒有', () => {
    const expected: [number, string][] = [
      [5, 'enemy.crypt_guardian'],
      [10, 'enemy.fallen_priest'],
      [15, 'enemy.lava_behemoth'],
      [20, 'enemy.fallen_knight'],
      [25, 'enemy.spider_queen'],
      [30, 'enemy.abyss_lord'],
      [35, 'enemy.abyss_lord'],
    ];
    for (const [floor, id] of expected) {
      const w = world(floor).world;
      const bosses = w.actors.filter((a) => a.isBoss);
      expect(bosses).toHaveLength(1);
      expect(bosses[0]!.defId).toBe(id);
      expect(distance(bosses[0]!.position, w.exit!.position)).toBeLessThan(6);
      expect(w.floors.bossFloor).toBe(true);
    }
    for (const floor of [4, 6]) {
      expect(bossOf(world(floor).world)).toBeUndefined();
      expect(world(floor).world.floors.bossFloor).toBe(false);
    }
  });

  it('清光其他怪物出口仍不開；擊敗 Boss 後才開', () => {
    const { world: w, events } = world(5);
    const boss = bossOf(w)!;
    sleep(boss);
    const locked = vi.fn();
    events.on('ExitLocked', locked);
    kill(w, w.actors.filter((a) => a.faction === 'enemy' && !a.isBoss));
    expect(w.floors.exitOpen).toBe(false);
    w.useExit();
    expect(locked).toHaveBeenCalledWith({ remaining: 1, boss: true });

    kill(w, [boss]);
    expect(w.floors.bossDefeated).toBe(true);
    expect(w.floors.exitOpen).toBe(true);
  });

  it('Boss 大量掉落（6 次、沒有「什麼都沒有」）', () => {
    const { world: w } = world(5);
    const boss = bossOf(w)!;
    sleep(boss);
    const before = w.groundItems.length;
    kill(w, [boss]);
    expect(w.groundItems.length - before).toBeGreaterThanOrEqual(6);
  });
});

describe('Boss 戰鬥', () => {
  function fight(seconds: number) {
    const ctx = world(5, 3);
    const w = ctx.world;
    const boss = bossOf(w)!;
    makeInvulnerable(w.player);
    // 玩家站在 Boss 旁邊（Boss 會馬上發現）
    const spot = [0, 1, 2, 3, 4, 5, 6, 7]
      .map((i) => vec2(boss.position.x + Math.cos((i * Math.PI) / 4) * 3, boss.position.y + Math.sin((i * Math.PI) / 4) * 3))
      .find((p) => w.nav.isClearAt(p, 0.3) && w.nav.hasLineOfSight(p, boss.position, 0))!;
    w.player.position = spot;
    w.player.prevPosition = spot;
    const casts: string[] = [];
    ctx.events.on('SkillCast', (e) => {
      if (e.actorId === boss.id) casts.push(e.skillId);
    });
    run(w, seconds);
    return { ...ctx, boss, casts };
  }

  it('第一招是召喚：召喚物最多同時 6 隻，會追擊玩家', () => {
    const { world: w, boss, casts } = fight(1.2);
    expect(casts[0]).toBe('enemy.guardian_summon');
    const minions = w.actors.filter((a) => a.summonedBy === boss.id);
    expect(minions.length).toBeGreaterThan(0);
    expect(minions.length).toBeLessThanOrEqual(6);
    expect(minions.every((m) => m.ai?.targetId === w.player.id)).toBe(true);
  });

  it('召喚物：不給經驗、不掉寶、不計入樓層擊殺數', () => {
    const { world: w, boss } = fight(1.2);
    const minions = w.actors.filter((a) => a.summonedBy === boss.id);
    const killed = w.floors.killed;
    const xp = w.progress.xp;
    const ground = w.groundItems.length;
    kill(w, minions);
    expect(w.floors.killed).toBe(killed);
    expect(w.progress.xp).toBe(xp);
    expect(w.groundItems.length).toBe(ground);
  });

  it('戰鬥中會使用旋風斬 / 王者橫掃（有前搖提示）', () => {
    const { casts } = fight(14);
    expect(casts.some((c) => c === 'enemy.guardian_charge' || c === 'enemy.guardian_slam')).toBe(true);
    expect(data.skills.get('enemy.guardian_slam').telegraph).toBe(true);
  });

  it('階段變化：HP 60% 以下進入第 2 階段（攻速提高、多了震盪技能），30% 以下第 3 階段；每個階段只觸發一次', () => {
    const { world: w, events } = world(5);
    const boss = bossOf(w)!;
    sleep(boss);
    const changed = vi.fn();
    events.on('BossPhaseChanged', changed);
    const speed = boss.stats.get('attackSpeed');
    boss.hp = boss.maxHp * 0.65;
    run(w, 1 / 60);
    expect(changed).not.toHaveBeenCalled();
    boss.hp = boss.maxHp * 0.55;
    run(w, 0.5);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 1, label: '墓穴之怒' }));
    expect(w.bosses.phaseOf(boss)).toBe(1);
    expect(boss.stats.get('attackSpeed')).toBeCloseTo(speed * 1.2);
    expect(boss.ai!.specialSkills).toContain('enemy.guardian_quake');
    expect(boss.skillRanks.has('enemy.guardian_quake')).toBe(true);
    boss.hp = boss.maxHp * 0.1;
    run(w, 0.5);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(w.bosses.phaseLabel(boss)).toBe('亡者軍團');
    expect(boss.ai!.specialSkills[0]).toBe('enemy.guardian_legion');
  });

  it('一次掉很多血時依序進入每個階段', () => {
    const { world: w, events } = world(20);
    const boss = bossOf(w)!;
    sleep(boss);
    const labels: string[] = [];
    events.on('BossPhaseChanged', (e) => labels.push(e.label));
    boss.hp = boss.maxHp * 0.1;
    run(w, 1 / 60);
    expect(labels).toEqual(['火焰附魔', '寒冰附魔', '雷霆附魔']);
    // 最後一個階段的技能：主要攻擊換成雷霆斬
    expect(boss.ai!.skillId).toBe('enemy.knight_thunder_strike');
  });

  it('魔王的外觀至少是主角的 2 倍大', () => {
    for (const floor of [5, 10, 15, 20, 25, 30]) {
      const boss = bossOf(world(floor).world)!;
      expect(boss.visualRadius / 0.5).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Boss 與存檔', () => {
  const reload = (w: GameWorld) => {
    const save = SaveMapper.capture(w, 'T');
    const fresh = world(1, save.meta.runSeed).world;
    SaveMapper.restore(fresh, repairSave(save, data));
    return fresh;
  };

  it('Boss 還活著 → 讀檔後仍在；擊敗後讀檔 → Boss 不再出現、出口仍開', () => {
    const { world: w } = world(5, 7);
    expect(bossOf(reload(w))).toBeDefined();
    const boss = bossOf(w)!;
    sleep(boss);
    kill(w, [boss]);
    const loaded = reload(w);
    expect(bossOf(loaded)).toBeUndefined();
    expect(loaded.floors.exitOpen).toBe(true);
    expect(loaded.floors.bossDefeated).toBe(true);
  });

  it('資料驗證：Boss 層的怪物必須設定 boss: true', () => {
    const floors = (gameData.floors as { id: string }[]).map((f) => ({ ...f, boss: { enemyId: 'enemy.skeleton', every: 5 } }));
    expect(() => DataRegistry.load({ ...gameData, floors })).toThrow(/boss: true/);
  });
});
