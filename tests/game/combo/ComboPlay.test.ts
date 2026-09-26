import { describe, expect, it, vi } from 'vitest';
import { vec2 } from '../../../src/core/math/Vec2';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { createWorldWithMap, DT, enemiesOf, run } from '../helpers';

const ROOM = [
  '####################',
  '#S.................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];
type Spawn = { enemyId: string; at: [number, number] };
const dummyAt = (x: number, y: number): Spawn => ({ enemyId: 'enemy.training_dummy', at: [x, y] });
const castAt = (target: Actor): GameCommand => ({ type: 'CastRight', worldPos: target.position, targetId: target.id });

function setup(spawns: Spawn[] = [dummyAt(4.5, 1.5)], seed = 1, level = 10) {
  const ctx = createWorldWithMap(ROOM, spawns, { seed });
  const p = ctx.world.player;
  p.stats.setBase('critChance', 0);
  p.stats.setBase('manaRegen', 0);
  p.stats.setBase('maxMana', 500);
  p.mana = 500;
  ctx.world.progress.level = level;
  for (const d of enemiesOf(ctx.world)) {
    d.stats.setBase('maxHp', 99999);
    d.hp = 99999;
  }
  return ctx;
}

function setQ(world: GameWorld, ...ids: (string | null)[]) {
  for (const id of ids) if (id) world.player.skillRanks.set(id, world.player.skillRanks.get(id) ?? 1);
  world.loadout.combos[0] = [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null];
  world.loadout.select(0);
}

const FLAME = ['melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball'];

describe('Combo Discovery 與 Codex（D01～D05）', () => {
  it('D01：第一次完整施放 → ComboDiscovered，Codex 新增條目，UI 由 ??? 變成名稱', () => {
    const { world, commands, events } = setup();
    setQ(world, ...FLAME);
    const comboId = `combo.flame_finisher|${FLAME.join('>')}`;
    const onDiscovered = vi.fn();
    events.on('ComboDiscovered', onDiscovered);
    expect(world.codex.has(comboId)).toBe(false);

    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 5);
    expect(onDiscovered).toHaveBeenCalledTimes(1);
    expect(onDiscovered).toHaveBeenCalledWith(expect.objectContaining({ comboId, name: '烈焰終擊 · 巨型火球' }));
    expect(world.codex.get(comboId)?.timesUsed).toBe(1);
  });

  it('D02：再次施放不再發出 Discovered，使用次數 +1', () => {
    const { world, commands, events } = setup();
    setQ(world, ...FLAME);
    const onDiscovered = vi.fn();
    events.on('ComboDiscovered', onDiscovered);
    const dummy = enemiesOf(world)[0]!;
    commands.push(castAt(dummy));
    run(world, 5);
    commands.push(castAt(dummy));
    run(world, 5);
    expect(onDiscovered).toHaveBeenCalledTimes(1);
    expect(world.codex.all[0]?.timesUsed).toBe(2);
  });

  it('D03：第二招中斷（魔力不足）→ 不寫入 Codex、不計次', () => {
    const { world, commands, events } = setup();
    setQ(world, ...FLAME);
    const onCompleted = vi.fn();
    events.on('ComboCompleted', onCompleted);
    world.player.mana = 3;
    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 5);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(world.codex.all).toHaveLength(0);
  });

  it('D04：Codex 以具體排列為單位；同一條規則換一組技能仍是 ???', () => {
    const { world, commands } = setup();
    setQ(world, 'melee.armor_break', 'melee.earth_break', 'ranged.quick_shot');
    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 6);
    expect(world.codex.all.map((e) => e.ruleId)).toEqual(['combo.heavy_chain_finisher']);

    const other = world.comboResolver.resolve(['melee.armor_break', 'melee.earth_break', 'magic.fireball'], () => 1);
    expect(other.status === 'combo' && other.rule.id).toBe('combo.heavy_chain_finisher');
    expect(other.status === 'combo' && world.codex.has(other.comboId)).toBe(false);
  });

  it('D05：Codex 不影響戰鬥結果（有無已發現紀錄，傷害完全相同）', () => {
    const play = (prefill: boolean) => {
      const { world, commands } = setup(undefined, 7);
      setQ(world, ...FLAME);
      if (prefill) {
        world.codex.record(
          { comboId: `combo.flame_finisher|${FLAME.join('>')}`, ruleId: 'combo.flame_finisher', comboName: 'x', skills: FLAME as [string, string, string], effectDescription: [] },
          0,
        );
      }
      const dummy = enemiesOf(world)[0]!;
      commands.push(castAt(dummy));
      run(world, 5);
      return dummy.hp;
    };
    expect(play(true)).toBe(play(false));
  });
});

describe('Combo 加成實際作用在技能上', () => {
  it('烈焰終擊：第三招火球的爆炸範圍 +40%、投射物 +30%；單獨施放火球沒有加成', () => {
    const radii = (steps: string[]) => {
      const { world, commands, events } = setup();
      setQ(world, ...steps);
      const areas: number[] = [];
      const sizes: number[] = [];
      events.on('AreaTriggered', (e) => areas.push(e.radius));
      // 貼身施放時投射物會在同一個 Tick 內生成並命中，因此在生成當下記錄
      const push = world.projectiles.push.bind(world.projectiles);
      world.projectiles.push = (...items) => {
        for (const p of items) sizes.push(p.radius);
        return push(...items);
      };
      commands.push(castAt(enemiesOf(world)[0]!));
      run(world, 5);
      return { area: areas.at(-1), size: Math.max(...sizes) };
    };
    const combo = radii(FLAME);
    const plain = radii(['magic.fireball']);
    expect(combo.area).toBeCloseTo(plain.area! * 1.4);
    expect(combo.size).toBeCloseTo(plain.size * 1.3);
  });

  it('只強化第三招：前兩招重砍沒有加成（Step3 為預設目標）', () => {
    const { world, commands } = setup();
    setQ(world, ...FLAME);
    const mods: number[] = [];
    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 5, () => {
      if (world.player.cast) mods.push(world.player.cast.mods.damage);
    });
    expect(new Set(mods)).toEqual(new Set([0, 0.3]));
  });

  it('元素附刃：第二、三招每一擊追加火焰傷害', () => {
    const { world, commands, events } = setup();
    setQ(world, 'magic.fireball', 'melee.quick_slash', 'melee.double_slash');
    const fireHits: number[] = [];
    events.on('ActorDamaged', (e) => {
      if (e.element === 'fire') fireHits.push(e.amount);
    });
    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 5);
    // 火球 1 次 + 快斬追加 1 次 + 雙重斬追加 2 次
    expect(fireHits).toHaveLength(4);
  });

  it('雷湧：第三招連鎖閃電多跳一次', () => {
    const dummies = [4.5, 6.5, 8.5, 10.5, 12.5, 14.5].map((x) => dummyAt(x, 2.5));
    const { world, commands, events } = setup(dummies);
    setQ(world, 'magic.spark', 'magic.thunder_strike', 'magic.chain_lightning');
    const chains: number[] = [];
    events.on('ChainTriggered', (e) => chains.push(e.points.length - 1));
    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 5);
    expect(chains.at(-1)).toBe(5); // 原本 1 + 3 跳；加成後 1 + 4 跳
  });

  it('守勢反擊：整組連段期間免疫擊退，結束後移除', () => {
    const { world, commands } = setup();
    setQ(world, 'melee.guard_stance', 'melee.shield_bash', 'melee.heavy_slash');
    commands.push(castAt(enemiesOf(world)[0]!));
    let seen = false;
    run(world, 4, () => {
      if (world.player.hasStatus('unstoppable')) seen = true;
    });
    expect(seen).toBe(true);
    expect(world.player.hasStatus('unstoppable')).toBe(false);
  });

  it('不合理排列與三連同招照常施放，只是沒有 Combo', () => {
    const { world, commands, events } = setup();
    const casts: string[] = [];
    const onCompleted = vi.fn();
    events.on('SkillCast', (e) => casts.push(e.skillId));
    events.on('ComboCompleted', onCompleted);
    setQ(world, 'magic.fireball', 'magic.fireball', 'magic.fireball');
    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 4);
    expect(casts.filter((c) => c === 'magic.fireball')).toHaveLength(3);
    expect(onCompleted).not.toHaveBeenCalled();
  });
});

describe('連段格子解鎖', () => {
  it('Lv1 只有第 1 格；施放時忽略未解鎖的格子', () => {
    const { world, commands, events } = setup(undefined, 1, 1);
    setQ(world, ...FLAME);
    const casts: string[] = [];
    events.on('SkillCast', (e) => casts.push(e.skillId));
    commands.push(castAt(enemiesOf(world)[0]!));
    run(world, 4);
    expect(world.comboSlotsUnlocked).toBe(1);
    expect(casts).toEqual(['melee.heavy_slash']);
  });

  it('未解鎖的格子不能設定；Lv3 解鎖第 2 格、Lv6 解鎖第 3 格', () => {
    const { world, commands, data } = setup(undefined, 1, 1);
    const send = (c: GameCommand) => {
      commands.push(c);
      world.update(DT);
    };
    const [, lv2, lv3] = data.balance.player.comboSlotLevels;
    send({ type: 'SetComboSlot', combo: 1, step: 1, skillId: 'magic.fireball' });
    expect(world.loadout.combos[1][1]).toBeNull();
    world.progress.level = lv2;
    expect(world.comboSlotsUnlocked).toBe(2);
    send({ type: 'SetComboSlot', combo: 1, step: 1, skillId: 'magic.fireball' });
    expect(world.loadout.combos[1][1]).toBe('magic.fireball');
    world.progress.level = lv3;
    expect(world.comboSlotsUnlocked).toBe(3);
  });
});

void vec2;
