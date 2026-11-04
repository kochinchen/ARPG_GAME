import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../../src/core/CommandQueue';
import { EventBus } from '../../../src/core/EventBus';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { GameEvents } from '../../../src/game/GameEvents';
import { GameWorld } from '../../../src/game/GameWorld';

/** 隱藏魔王「噬界足眼」：隨機抗性、爪子交替開合、停頓後尾巴脫離、跳起消失再落下 */
const data = DataRegistry.load(gameData);
const DT = 1 / 60;

function setup(seed = 5) {
  const events = new EventBus<GameEvents>();
  const w = new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events, seed });
  w.forceHiddenBoss = true;
  w.enterFloor(23);
  const boss = w.actors.find((a) => a.defId === 'enemy.abyss_dragon')!;
  // 玩家站在魔王旁邊、不會死，魔王才會開打
  w.player.position = vec2(boss.position.x + 2, boss.position.y);
  const tick = (seconds: number, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      w.player.hp = w.player.maxHp;
      w.update(DT);
      each?.();
    }
  };
  return { w, boss, tick, events };
}

describe('噬界足眼', () => {
  it('第 23～29 層（固定魔王層除外）才出現；吐息三種屬性全用；抽三個不重複、不是負值的抗性', () => {
    const { w, boss } = setup();
    expect(boss).toBeDefined();
    expect(data.balance.hiddenBoss.bosses.find((b) => b.enemyId === 'enemy.abyss_dragon')!.floors).toEqual([23, 24, 26, 27, 28, 29]);
    expect(boss.innateElements).toEqual(['fire', 'cold', 'lightning']);
    const resists = w.hiddenBoss!.resists;
    expect(resists).toHaveLength(3);
    expect(new Set(resists.map((r) => r.stat)).size).toBe(3);
    for (const r of resists) {
      // 第 23 層：和當層隱藏魔王的樓層減傷相同
      expect(r.value).toBeCloseTo(0.28);
    }
    expect(data.enemies.get('enemy.abyss_dragon').phases.map((p) => p.hpBelow)).toEqual([0.65, 0.3]);
    // 樓層減傷不打折，抽到的再疊上去；抗性總上限在 DamagePipeline
    const drawn = (stat: 'physicalResist' | 'knockbackResist') => resists.find((r) => r.stat === stat)?.value ?? 0;
    expect(boss.stats.get('physicalResist')).toBeCloseTo(0.28 + drawn('physicalResist'));
    expect(boss.stats.get('knockbackResist')).toBeCloseTo(drawn('knockbackResist'));
    // 魔王血條顯示抽到的抗性；玩家不是隱藏魔王，沒有
    expect(w.randomResistsOf(boss)).toEqual(resists);
    expect(w.randomResistsOf(w.player)).toEqual([]);
  });

  it('第二階段：爪子收合 20 秒（減傷 30%、站著不動、尾巴連發），張開 40～50 秒，如此交替', () => {
    const { boss, tick, events } = setup();
    const looks: number[] = [];
    events.on('BossLookChanged', (e) => looks.push(e.look));
    const base = boss.stats.get('damageReduction');
    boss.hp = boss.maxHp * 0.6;
    tick(0.1);
    expect(boss.stasis).toBe(true);
    expect(boss.stats.get('damageReduction')).toBeCloseTo(base + 0.3);
    expect(boss.barrage?.skills).toEqual(['enemy.tail_flame_burst', 'enemy.tail_frost_nova']);
    tick(19.5);
    expect(boss.stasis).toBe(true);
    tick(1);
    expect(boss.stasis).toBe(false);
    expect(boss.barrage).toBeNull();
    expect(boss.stats.get('damageReduction')).toBeCloseTo(base);
    expect(boss.ai!.skillId).toBe('basic.attack');
    expect(looks).toEqual([0]);
    tick(39);
    expect(boss.stasis).toBe(false);
    tick(11.5);
    expect(boss.stasis).toBe(true);
    expect(looks).toEqual([0, 1]);
  });

  it('第三階段：停 5 秒任何攻擊無效，尾巴脫離；打倒尾巴本體僵直 3 秒；本體死掉尾巴一起消失', () => {
    const { w, boss, tick } = setup();
    boss.hp = boss.maxHp * 0.25;
    tick(0.1);
    expect(boss.untouchable).toBe(true);
    expect(boss.stasis).toBe(true);
    const hp = boss.hp;
    (w as unknown as { pipeline: { apply(r: object): void } }).pipeline.apply({ source: w.player, target: boss, min: 100, max: 100, element: 'physical' });
    expect(boss.hp).toBe(hp);
    tick(4.8);
    expect(w.actors.some((a) => a.defId === 'enemy.abyss_tail')).toBe(false);
    tick(0.3);
    expect(boss.untouchable).toBe(false);
    const tail = w.actors.find((a) => a.defId === 'enemy.abyss_tail')!;
    expect(tail.alive).toBe(true);
    expect(tail.summonedBy).toBe(boss.id);
    expect(tail.xpReward).toBe(0);
    // 爪子不再收合
    tick(30);
    expect(boss.barrage).toBeNull();
    expect(boss.stasis).toBe(false);
    tail.hp = 0;
    tick(0.1);
    expect(boss.stasis).toBe(true);
    tick(3.1);
    expect(boss.stasis).toBe(false);
  });

  it('尾巴的連發：追著目標每秒輪流丟火焰爆破與冰霜新星；爪子收合時和脫離後都一樣', () => {
    const { w, boss, tick, events } = setup();
    const fired: string[] = [];
    events.on('BarrageFired', (e) => fired.push(e.skillId));
    boss.hp = boss.maxHp * 0.6;
    tick(0.1);
    boss.ai!.targetId = w.player.id;
    tick(4);
    expect(fired.length).toBeGreaterThanOrEqual(4);
    expect(fired.length).toBeLessThanOrEqual(5);
    fired.forEach((id, i) => expect(id).toBe(i % 2 === 0 ? 'enemy.tail_flame_burst' : 'enemy.tail_frost_nova'));
    // 收合時 AI 停著，就算沒有目標也照丟
    fired.length = 0;
    boss.ai!.targetId = null;
    tick(3);
    expect(fired.length).toBeGreaterThanOrEqual(2);
    // 第三階段：脫離的尾巴會自己追、自己丟
    fired.length = 0;
    boss.hp = boss.maxHp * 0.25;
    tick(5.2);
    const tail = w.actors.find((a) => a.defId === 'enemy.abyss_tail')!;
    expect(tail.alive).toBe(true);
    fired.length = 0;
    tick(3);
    expect(fired.length).toBeGreaterThanOrEqual(2);
    expect(boss.barrage).toBeNull();
  });

  it('主角死在附近：魔王回 15% 血、不退回前一個階段；死在遠處不回血', () => {
    const { w, boss, tick } = setup();
    boss.hp = boss.maxHp * 0.5;
    tick(0.1);
    const kill = () => {
      w.player.hp = 0;
      for (let i = 0; i < 3; i++) w.update(DT);
    };
    const hp = boss.hp;
    kill();
    expect(boss.hp).toBeCloseTo(hp + boss.maxHp * 0.15, 3);
    expect(w.bosses.phaseOf(boss)).toBe(1);
    // 回血後超過階段門檻也不會再進第一階段
    tick(5);
    w.player.position = vec2(boss.position.x + 2, boss.position.y);
    boss.hp = boss.maxHp * 0.9;
    kill();
    expect(boss.hp).toBeLessThanOrEqual(boss.maxHp);
    expect(w.bosses.phaseOf(boss)).toBe(1);
    // 離得很遠時死掉不回血
    tick(5);
    const far = boss.hp = boss.maxHp * 0.5;
    w.player.position = vec2(boss.position.x + 60, boss.position.y);
    kill();
    expect(boss.hp).toBe(far);
  });

  it('本體先死，尾巴一起消失', () => {
    const { w, boss, tick } = setup();
    boss.hp = boss.maxHp * 0.25;
    tick(5.2);
    const tail = w.actors.find((a) => a.defId === 'enemy.abyss_tail')!;
    boss.hp = 0;
    tick(0.2);
    expect(tail.alive).toBe(false);
  });

  it('跳起：3 秒打不到、印記追玩家 2.5 秒後鎖定，落在印記上', () => {
    const { w, boss, tick } = setup();
    const skill = data.skills.get('enemy.eye_leap');
    const ctx = { caster: boss, skill, rank: 1, target: w.player, origin: boss.position, direction: vec2(1, 0) };
    // 直接發動（不等 AI 選招）
    const effect = skill.effects[0]!;
    if (effect.type !== 'leap') throw new Error('墜天應該是 leap 效果');
    w.scheduler.leap(effect, { ...ctx, services: { events: w.events } as never, mods: {} as never, run: () => {} });
    expect(boss.vanished).toBe(true);
    expect(boss.untouchable).toBe(true);
    expect(boss.isDisabled).toBe(true);
    tick(2.3);
    expect(Math.hypot(w.scheduler.leapMark(boss.id)!.x - w.player.position.x, w.scheduler.leapMark(boss.id)!.y - w.player.position.y)).toBeLessThan(0.1);
    tick(0.3);
    // 2.5 秒之後鎖定：玩家走開，印記不動
    const locked = w.scheduler.leapMark(boss.id)!;
    w.player.position = vec2(w.player.position.x + 1, w.player.position.y);
    tick(0.2);
    expect(w.scheduler.leapMark(boss.id)).toEqual(locked);
    tick(0.3);
    expect(boss.vanished).toBe(false);
    expect(boss.untouchable).toBe(false);
    expect(boss.air).toBe(0);
    // 落地後被碰撞推開一點
    expect(Math.hypot(boss.position.x - locked.x, boss.position.y - locked.y)).toBeLessThan(1);
  });
});
