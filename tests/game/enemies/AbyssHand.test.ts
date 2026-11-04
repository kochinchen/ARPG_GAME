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
import { vec2 } from '../../../src/core/math/Vec2';
import { coreExtraTexts } from '../../../src/game/items/CoreDescriber';
import type { CoreInstance } from '../../../src/game/items/CoreInstance';
import { coreEffects } from '../../../src/game/items/CoreStats';

/** 奪界雙手：兩隻一對、兩隻都倒下才掉一份寶、一起出招、第三階段手被打壞 */
const data = DataRegistry.load(gameData);
const DT = 1 / 60;

function world(floor = 11, seed = 5) {
  const events = new EventBus<GameEvents>();
  const w = new GameWorld({ data, floor: 1, commands: new CommandQueue<GameCommand>(), events, seed });
  w.forceHiddenBoss = true;
  w.enterFloor(floor);
  const hands = () => w.actors.filter((a) => a.defId?.startsWith('enemy.abyss_hand'));
  return { w, events, hands };
}

function fight(w: GameWorld, hands: ReturnType<typeof world>['hands']) {
  // 主角站在兩隻附近、不會死
  const [a] = hands();
  w.player.position = vec2(a!.position.x + 3, a!.position.y + 4);
  w.player.stats.addModifier({ stat: 'maxHp', kind: 'flat', value: 1e7, source: 'test' });
  w.player.hp = w.player.maxHp;
}

describe('奪界雙手', () => {
  it('第 9、11～14 層；萬骸之口移到 16 層起', () => {
    const bosses = data.balance.hiddenBoss.bosses;
    expect(bosses.find((b) => b.enemyId === 'enemy.abyss_hand')!.floors).toEqual([9, 11, 12, 13, 14]);
    expect(Math.min(...bosses.find((b) => b.enemyId === 'enemy.bone_dragon')!.floors)).toBe(16);
    expect(data.balance.hiddenBoss.roomFloors).toContain(9);
  });

  it('一左一右兩隻同時出現，名字相同', () => {
    const { hands } = world(9);
    expect(hands().map((a) => a.defId).sort()).toEqual(['enemy.abyss_hand', 'enemy.abyss_hand_r']);
    expect(new Set(hands().map((a) => a.name)).size).toBe(1);
  });

  it('兩隻都倒下才掉一份寶、才算打贏', () => {
    const { w, events, hands } = world(11);
    const before = () => w.groundItems.length;
    let defeated = 0;
    events.on('BossPairDefeated', () => defeated++);
    const [a, b] = hands();
    const n = before();
    a!.hp = 0;
    w.update(DT);
    expect(defeated).toBe(0);
    expect(w.hiddenBoss!.dead).toBe(false);
    expect(before()).toBe(n);
    b!.hp = 0;
    w.update(DT);
    expect(defeated).toBe(1);
    expect(w.hiddenBoss!.dead).toBe(true);
    expect(before()).toBeGreaterThan(n + 4);
  });

  it('掉寶：9 層 4 件 → 14 層 6 件、至少一件紫、金幣 1000～1500、有機會掉紫色純核', () => {
    const roll = (floor: number, seed: number) => {
      const rng = new Rng(seed);
      const events = new EventBus<GameEvents>();
      const generator = new ItemGenerator(data, rng.fork('i'), rng.fork('s'));
      const nav = NavGrid.fromMap({ rows: ['...'] });
      return new LootSystem(data, rng.fork('l'), generator, nav, () => ({}) as never, () => floor, () => 1, () => floor, events).roll('loot.abyss_hand');
    };
    let cores = 0;
    const N = 200;
    for (let s = 0; s < N; s++) {
      const low = roll(9, s);
      const high = roll(14, s);
      const items = (d: typeof low) => d.filter((x) => x.kind === 'item');
      expect(items(low)).toHaveLength(4);
      expect(items(high)).toHaveLength(6);
      expect(items(low).some((x) => x.kind === 'item' && ['epic', 'legendary', 'mythic'].includes(x.item.rarity))).toBe(true);
      const gold = low.reduce((sum, x) => sum + (x.kind === 'gold' ? x.amount : 0), 0);
      expect(gold).toBeGreaterThanOrEqual(1000);
      expect(gold).toBeLessThanOrEqual(1500);
      for (const x of low) {
        if (x.kind !== 'core') continue;
        cores++;
        if (x.core.mark) continue;
        expect(x.core.rarity).toBe('epic');
        expect(x.core.pure).toBe(true);
        expect(x.core.types).toHaveLength(1);
        expect(x.core.secondary).toHaveLength(3);
      }
    }
    expect(cores / N).toBeGreaterThan(0.15);
    expect(cores / N).toBeLessThan(0.35);
  });

  it('低機率掉帶「奪取之手」的橘色純核：吸血吸魔各 0.2～0.6%，越深越容易高，可以堆疊', () => {
    const marked = (floor: number) => {
      const rng = new Rng(floor);
      const loot = new LootSystem(data, rng.fork('l'), new ItemGenerator(data, rng.fork('i'), rng.fork('s')), NavGrid.fromMap({ rows: ['...'] }), () => ({}) as never, () => floor, () => 1, () => floor, new EventBus<GameEvents>());
      const cores: CoreInstance[] = [];
      const N = 2500;
      for (let i = 0; i < N; i++) for (const d of loot.roll('loot.abyss_hand')) if (d.kind === 'core' && d.core.mark) cores.push(d.core);
      return { rate: cores.length / N, cores };
    };
    const low = marked(9);
    const high = marked(14);
    expect(low.rate).toBeGreaterThan(0.015);
    expect(low.rate).toBeLessThan(0.05);
    const mean = (cores: CoreInstance[]) => cores.flatMap((c) => c.mark!.rolls).reduce((a, b) => a + b, 0) / (cores.length * 2);
    for (const core of [...low.cores, ...high.cores]) {
      expect(core.rarity).toBe('legendary');
      expect(core.pure).toBe(true);
      expect(core.mark!.rolls).toHaveLength(2);
      for (const r of core.mark!.rolls) {
        expect(r).toBeGreaterThanOrEqual(0.002);
        expect(r).toBeLessThanOrEqual(0.006);
      }
    }
    expect(mean(high.cores)).toBeGreaterThan(mean(low.cores));

    // 兩顆疊加，超過上限（最高值 × 份數）才夾
    const core = low.cores[0]!;
    const two = coreEffects([{ slot: 'weapon', core: { ...core, mark: { id: 'mark.seizing_hand', rolls: [0.005, 0.003] } } }, { slot: 'gloves', core: { ...core, mark: { id: 'mark.seizing_hand', rolls: [0.002, 0.003] } } }], data);
    expect(two.stats.find((s) => s.stat === 'lifeSteal')!.value).toBeCloseTo(0.007);
    expect(two.stats.find((s) => s.stat === 'manaSteal')!.value).toBeCloseTo(0.006);
    expect(coreExtraTexts({ ...core, mark: { id: 'mark.seizing_hand', rolls: [0.0035, 0.006] } }, data).brand).toBe('印記（奪取之手）：+0.35% 生命吸取、+0.6% 魔力吸取');
  });

  it('會一起出招：趕到站位、同時施放同一招', () => {
    const { w, events, hands } = world(11);
    fight(w, hands);
    const casts: { id: number; skill: string; time: number }[] = [];
    let time = 0;
    events.on('SkillCast', (e) => {
      if (e.skillId === 'enemy.hand_clap' || e.skillId === 'enemy.hand_cross') casts.push({ id: e.actorId, skill: e.skillId, time });
    });
    for (; time < 60 && casts.length < 4; time += DT) {
      w.player.hp = w.player.maxHp;
      w.update(DT);
    }
    expect(casts.length).toBeGreaterThanOrEqual(4);
    expect(casts[0]!.skill).toBe('enemy.hand_clap');
    expect(casts[1]!.skill).toBe('enemy.hand_clap');
    expect(casts[1]!.id).not.toBe(casts[0]!.id);
    expect(casts[1]!.time - casts[0]!.time).toBeLessThan(0.5);
    expect(casts[2]!.skill).toBe('enemy.hand_cross');
  });

  it('奪取之握奪走主角的一個技能', () => {
    const { w, events, hands } = world(11);
    fight(w, hands);
    const skill = w.loadout.combos.flat().find((id) => id !== null);
    if (!skill) w.loadout.combos[0]![0] = 'melee.quake_slash';
    let sealed = '';
    events.on('SkillSealed', (e) => (sealed = e.skillId));
    for (let t = 0; t < 40 && !sealed; t += DT) {
      w.player.hp = w.player.maxHp;
      w.update(DT);
    }
    expect(w.loadout.combos.flat()).toContain(sealed);
    expect(w.player.cooldowns.get(sealed)).toBeGreaterThan(4.5);
  });

  it('30% 手被打壞：只剩腳刺與眼睛噴毒冰球，不再一起出招', () => {
    const { w, events, hands } = world(11);
    fight(w, hands);
    const [a] = hands();
    let look = -1;
    events.on('BossPhaseChanged', (e) => {
      if (e.actorId === a!.id) look = e.look;
    });
    a!.hp = a!.maxHp * 0.29;
    w.update(DT);
    expect(look).toBe(2);
    expect(a!.ai!.skillId).toBe('enemy.hand_stab');
    expect(a!.ai!.specialSkills).toEqual(['enemy.hand_eye_frost']);
    const paired: string[] = [];
    events.on('SkillCast', (e) => {
      if (e.skillId === 'enemy.hand_clap' || e.skillId === 'enemy.hand_cross') paired.push(e.skillId);
    });
    for (let t = 0; t < 30; t += DT) {
      w.player.hp = w.player.maxHp;
      a!.hp = Math.max(a!.hp, 1);
      w.update(DT);
    }
    expect(paired).toEqual([]);
  });
});
