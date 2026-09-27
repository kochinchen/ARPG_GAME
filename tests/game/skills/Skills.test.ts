import { describe, expect, it, vi } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { describeSkill } from '../../../src/game/skills/SkillDescriber';
import { createWorldWithMap, DT, enemiesOf, makeInvulnerable, noBaseRegen, run } from '../helpers';

const ROOM = [
  '##################',
  '#S...............#',
  '#................#',
  '#................#',
  '#................#',
  '##################',
];

type Spawn = { enemyId: string; at: [number, number] };
const dummyAt = (x: number, y: number): Spawn => ({ enemyId: 'enemy.training_dummy', at: [x, y] });
const skeletonAt = (x: number, y: number): Spawn => ({ enemyId: 'enemy.skeleton', at: [x, y] });
const castAt = (target: Actor | { x: number; y: number }): GameCommand =>
  'id' in target
    ? { type: 'CastRight', worldPos: target.position, targetId: target.id }
    : { type: 'CastRight', worldPos: vec2(target.x, target.y), targetId: null };

function setup(spawns: Spawn[] = [dummyAt(6.5, 1.5)], extraSkills: unknown[] = []) {
  const ctx = createWorldWithMap(ROOM, spawns, { extra: { skills: extraSkills } });
  ctx.world.player.stats.setBase('critChance', 0);
  ctx.world.player.stats.setBase('manaRegen', 0);
  // 三格連段全部解鎖（Lv6）
  ctx.world.progress.level = 10;
  return ctx;
}

/** 測試用：直接學會技能並放進 Q 連段 */
function comboQ(world: GameWorld, ...skillIds: (string | null)[]) {
  for (const id of skillIds) if (id) world.player.skillRanks.set(id, world.player.skillRanks.get(id) ?? 1);
  world.loadout.combos[0] = [skillIds[0] ?? null, skillIds[1] ?? null, skillIds[2] ?? null];
  world.loadout.select(0);
}

function recordCasts(ctx: ReturnType<typeof setup>) {
  const casts: string[] = [];
  ctx.events.on('SkillCast', (e) => {
    if (e.actorId === ctx.world.player.id) casts.push(e.skillId);
  });
  return casts;
}

describe('Q / W / E 連段（M6 技能大改）', () => {
  it('「重砍 → 重砍 → 火球」：依序施放三招，第三招仍是火球（Combo 以加成疊加，不替換技能）', () => {
    const ctx = setup([dummyAt(4.5, 1.5)]);
    const casts = recordCasts(ctx);
    const onCompleted = vi.fn();
    ctx.events.on('ComboCompleted', onCompleted);
    comboQ(ctx.world, 'melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball');
    const dummy = enemiesOf(ctx.world)[0]!;

    ctx.commands.push(castAt(dummy));
    run(ctx.world, 5);
    expect(casts).toEqual(['melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball']);
    expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ ruleId: 'combo.flame_finisher', name: '烈焰終擊 · 巨型火球' }));
    expect(ctx.world.combos.isRunning(ctx.world.player)).toBe(false);
  });

  it('Q / W / E 切換右鍵要施放的連段', () => {
    const ctx = setup();
    const casts = recordCasts(ctx);
    ctx.world.loadout.combos[1] = ['magic.fireball', 'magic.fireball', null];
    ctx.commands.push({ type: 'SelectRightSlot', slot: 1 }, castAt(enemiesOf(ctx.world)[0]!));
    run(ctx.world, 2);
    expect(casts).toEqual(['magic.fireball', 'magic.fireball']);
    expect(ctx.world.loadout.activeCombo).toBe(1);
  });

  it('連段中某一步沒有目標：整組中斷', () => {
    const ctx = setup();
    comboQ(ctx.world, 'melee.heavy_slash', 'magic.fireball');
    const casts = recordCasts(ctx);
    const onInterrupt = vi.fn();
    ctx.events.on('ComboInterrupted', onInterrupt);
    // Q 第一步是對單體的重砍，點地面沒有目標
    ctx.commands.push(castAt({ x: 10, y: 3 }));
    run(ctx.world, 2);
    expect(casts).toEqual([]);
    expect(onInterrupt).toHaveBeenCalledWith({ step: 1 });
  });

  it('魔力不足時在該步中斷，之前的步驟已施放', () => {
    const ctx = setup([dummyAt(4.5, 1.5)]);
    const casts = recordCasts(ctx);
    comboQ(ctx.world, 'melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball');
    // 重砍 2 + 重砍 2，第三步火球需要 2 → 只夠前兩步
    ctx.world.player.mana = 4;
    ctx.commands.push(castAt(enemiesOf(ctx.world)[0]!));
    run(ctx.world, 5);
    expect(casts).toEqual(['melee.heavy_slash', 'melee.heavy_slash']);
    expect(ctx.world.combos.isRunning(ctx.world.player)).toBe(false);
  });

  it('點地面移動會取消連段', () => {
    const ctx = setup([dummyAt(10.5, 3.5)]);
    const casts = recordCasts(ctx);
    ctx.commands.push(castAt(enemiesOf(ctx.world)[0]!));
    run(ctx.world, 0.2);
    ctx.commands.push({ type: 'PrimaryAction', worldPos: vec2(1.5, 4.5), targetId: null, held: false });
    run(ctx.world, 3);
    expect(casts).toEqual([]);
    expect(ctx.world.combos.isRunning(ctx.world.player)).toBe(false);
  });

  it('連段施放中再按右鍵不會重新開始；結束後才開始下一組', () => {
    const ctx = setup();
    const casts = recordCasts(ctx);
    comboQ(ctx.world, 'magic.fireball', 'magic.fireball');
    const dummy = enemiesOf(ctx.world)[0]!;
    ctx.commands.push(castAt(dummy));
    run(ctx.world, 0.3, (t) => {
      if (t % 6 === 0) ctx.commands.push(castAt(dummy));
    });
    run(ctx.world, 2);
    expect(casts).toEqual(['magic.fireball', 'magic.fireball']);
  });

  it('連段格子只接受已學會、在技能樹中的主動技能；null 清空', () => {
    const ctx = setup();
    const send = (c: GameCommand) => {
      ctx.commands.push(c);
      ctx.world.update(DT);
    };
    send({ type: 'SetComboSlot', combo: 2, step: 1, skillId: 'ranged.quick_shot' });
    expect(ctx.world.loadout.combos[2][1]).toBeNull();
    send({ type: 'SetComboSlot', combo: 2, step: 1, skillId: 'basic.attack' });
    expect(ctx.world.loadout.combos[2][1]).toBeNull();
    ctx.world.player.skillRanks.set('support.vitality', 1);
    send({ type: 'SetComboSlot', combo: 2, step: 1, skillId: 'support.vitality' });
    expect(ctx.world.loadout.combos[2][1]).toBeNull();
    send({ type: 'SetComboSlot', combo: 2, step: 1, skillId: 'magic.fireball' });
    expect(ctx.world.loadout.combos[2][1]).toBe('magic.fireball');
    send({ type: 'SetComboSlot', combo: 2, step: 1, skillId: null });
    expect(ctx.world.loadout.combos[2][1]).toBeNull();
  });
});

describe('Support 常駐被動（M6 技能大改）', () => {
  function setupSupport() {
    const ctx = setup([]);
    const send = (...c: GameCommand[]) => {
      ctx.commands.push(...c);
      ctx.world.update(DT);
    };
    return { ...ctx, send };
  }

  it('裝備後才生效；卸下後回到原值；升級後效果更新', () => {
    const { world, send } = setupSupport();
    const base = world.player.maxHp;
    world.player.skillRanks.set('support.vitality', 1);
    world.update(DT);
    expect(world.player.maxHp).toBe(base);

    send({ type: 'SetSupportSlot', slot: 0, skillId: 'support.vitality' });
    expect(world.player.maxHp).toBeCloseTo(base * 1.1);
    world.player.skillRanks.set('support.vitality', 3);
    world.update(DT);
    expect(world.player.maxHp).toBeCloseTo(base * 1.3);

    send({ type: 'SetSupportSlot', slot: 0, skillId: null });
    expect(world.player.maxHp).toBe(base);
  });

  it('未學會不能裝備；同一個 Support 放到新欄位時從舊欄位移除', () => {
    const { world, send } = setupSupport();
    send({ type: 'SetSupportSlot', slot: 0, skillId: 'support.overdrive' });
    expect(world.loadout.supports[0]).toBeNull();
    world.player.skillRanks.set('support.precision', 1);
    send({ type: 'SetSupportSlot', slot: 0, skillId: 'support.precision' }, { type: 'SetSupportSlot', slot: 2, skillId: 'support.precision' });
    expect(world.loadout.supports).toEqual([null, null, 'support.precision']);
  });

  it('節能降低魔力消耗；戰鬥節奏提高攻速與施法速度', () => {
    const { world, send, data } = setupSupport();
    world.player.skillRanks.set('support.efficiency', 5);
    world.player.skillRanks.set('support.combat_rhythm', 1);
    send(
      { type: 'SetSupportSlot', slot: 0, skillId: 'support.efficiency' },
      { type: 'SetSupportSlot', slot: 1, skillId: 'support.combat_rhythm' },
    );
    const fireball = data.skills.get('magic.fireball');
    expect(world.skills.manaCost(fireball, 5, world.player)).toBeCloseTo(5 * (1 - 0.17));
    expect(world.skills.castDuration(fireball, world.player)).toBeCloseTo(0.4 / 1.06);
    expect(world.player.stats.get('attackSpeed')).toBeCloseTo(data.balance.player.attackSpeed * 1.06);
  });

  it('再生：每秒回復最大生命的比例', () => {
    const { world, send, data } = setupSupport();
    world.player.skillRanks.set('support.regeneration', 5);
    send({ type: 'SetSupportSlot', slot: 0, skillId: 'support.regeneration' });
    noBaseRegen(world.player);
    world.player.hp = 10;
    run(world, 2);
    // 沒有受到傷害 = 脫戰，回復 × 5
    const { multiplier } = data.balance.player.outOfCombatRegen;
    expect(world.player.hp).toBeCloseTo(10 + world.player.maxHp * 0.015 * multiplier * 2, 0);
  });
});

describe('技能效果（M6 技能大改）', () => {
  function castQ(ctx: ReturnType<typeof setup>, target: Actor | { x: number; y: number }, seconds = 2) {
    ctx.commands.push(castAt(target));
    run(ctx.world, seconds);
  }
  const hitsOn = (ctx: ReturnType<typeof setup>, actor: Actor) => {
    const hits: number[] = [];
    ctx.events.on('ActorDamaged', (e) => {
      if (e.targetId === actor.id) hits.push(e.amount);
    });
    return hits;
  };

  it('多段攻擊：雙重斬命中兩次', () => {
    const ctx = setup([dummyAt(3.5, 1.5)]);
    comboQ(ctx.world, 'melee.double_slash');
    const dummy = enemiesOf(ctx.world)[0]!;
    const hits = hitsOn(ctx, dummy);
    castQ(ctx, dummy);
    expect(hits).toHaveLength(2);
  });

  it('冰球：命中後緩速，時間到恢復', () => {
    const ctx = setup([skeletonAt(9.5, 1.5)]);
    makeInvulnerable(ctx.world.player);
    comboQ(ctx.world, 'magic.ice_orb');
    const skeleton = enemiesOf(ctx.world)[0]!;
    const speed = skeleton.moveSpeed;
    castQ(ctx, skeleton, 1.2);
    expect(skeleton.hasStatus('slow')).toBe(true);
    expect(skeleton.moveSpeed).toBeCloseTo(speed * 0.7);
    run(ctx.world, 2.5);
    expect(skeleton.hasStatus('slow')).toBe(false);
    expect(skeleton.moveSpeed).toBeCloseTo(speed);
  });

  it('絕對零度：冰凍的敵人不能移動也不能攻擊；Boss 改為強力緩速', () => {
    const boss = { id: 'enemy.test_boss', name: 'Boss', hp: 9999, damage: [1, 1], defense: 0, moveSpeed: 2, attackRange: 0.4, detectRange: 0, ai: 'melee', skills: ['basic.attack'], xp: 0, boss: true };
    const ctx = createWorldWithMap(ROOM, [skeletonAt(3.5, 2.5), { enemyId: 'enemy.test_boss', at: [2.5, 3.5] }], { extra: { enemies: [boss] } });
    makeInvulnerable(ctx.world.player);
    ctx.world.player.skillRanks.set('magic.absolute_zero', 1);
    ctx.world.loadout.combos[0] = ['magic.absolute_zero', null, null];
    const [skeleton, bossActor] = enemiesOf(ctx.world);
    skeleton!.stats.setBase('maxHp', 9999);
    skeleton!.hp = 9999;
    ctx.commands.push(castAt({ x: 5, y: 5 }));
    run(ctx.world, 0.4);
    expect(skeleton!.isDisabled).toBe(true);
    const frozenAt = skeleton!.position;
    const casts = skeleton!.castCount;
    run(ctx.world, 1);
    expect(skeleton!.position).toEqual(frozenAt);
    expect(skeleton!.castCount).toBe(casts);
    expect(bossActor!.hasStatus('freeze')).toBe(false);
    expect(bossActor!.hasStatus('slow')).toBe(true);
  });

  it('裂地擊：只打到前方扇形內的敵人，並擊退；不會移動的木樁不被擊退', () => {
    const ctx = setup([skeletonAt(3.5, 1.5), skeletonAt(1.5, 3.5), dummyAt(3.5, 2.5)]);
    makeInvulnerable(ctx.world.player);
    comboQ(ctx.world, 'melee.earth_break');
    const [front, side, dummy] = enemiesOf(ctx.world);
    for (const e of [front!, side!]) {
      e.stats.setBase('maxHp', 9999);
      e.hp = 9999;
      // 幾乎不動：被打後的反擊追擊不會抵消擊退距離（速度需 > 0 才能被擊退）
      e.stats.setBase('moveSpeed', 0.001);
    }
    const frontStart = front!.position;
    castQ(ctx, { x: 6.5, y: 1.5 }, 1);
    expect(front!.hp).toBeLessThan(9999);
    expect(side!.hp).toBe(9999);
    expect(distance(front!.position, ctx.world.player.position)).toBeGreaterThan(distance(frontStart, ctx.world.player.position));
    expect(dummy!.position).toEqual(vec2(3.5, 2.5));
  });

  it('後跳射擊：施放者往反方向位移後射擊', () => {
    const ctx = createWorldWithMap(['##########', '#........#', '#...S....#', '#........#', '##########'], [dummyAt(8.5, 2.5)]);
    ctx.world.player.skillRanks.set('ranged.backstep_shot', 1);
    ctx.world.loadout.combos[0] = ['ranged.backstep_shot', null, null];
    const start = ctx.world.player.position;
    ctx.commands.push(castAt(enemiesOf(ctx.world)[0]!));
    run(ctx.world, 1.5);
    expect(ctx.world.player.position.x).toBeLessThan(start.x - 2);
    expect(enemiesOf(ctx.world)[0]!.hp).toBeLessThan(enemiesOf(ctx.world)[0]!.maxHp);
  });

  it('連鎖閃電：在多個敵人之間跳躍，每個只打一次', () => {
    const ctx = setup([dummyAt(5.5, 1.5), dummyAt(7.5, 1.5), dummyAt(9.5, 1.5), dummyAt(16.5, 4.5)]);
    comboQ(ctx.world, 'magic.chain_lightning');
    const [a, b, c, far] = enemiesOf(ctx.world);
    const hits = [a!, b!, c!, far!].map((d) => hitsOn(ctx, d));
    castQ(ctx, a!, 1);
    expect(hits.map((h) => h.length)).toEqual([1, 1, 1, 0]);
  });

  it('火牆：地面區域持續造成傷害，時間到消失', () => {
    const ctx = setup([dummyAt(6.5, 2.5)]);
    comboQ(ctx.world, 'magic.firewall');
    const dummy = enemiesOf(ctx.world)[0]!;
    const hits = hitsOn(ctx, dummy);
    castQ(ctx, dummy, 0.5);
    expect(ctx.world.scheduler.zones).toHaveLength(1);
    expect(dummy.hasStatus('burn')).toBe(true);
    run(ctx.world, 4);
    expect(hits.length).toBe(4);
    expect(ctx.world.scheduler.zones).toHaveLength(0);
  });

  it('雷擊：延遲後才造成傷害（期間有預警）', () => {
    const ctx = setup([dummyAt(6.5, 2.5)]);
    comboQ(ctx.world, 'magic.thunder_strike');
    const dummy = enemiesOf(ctx.world)[0]!;
    const hits = hitsOn(ctx, dummy);
    ctx.commands.push(castAt(dummy));
    run(ctx.world, 0.3);
    expect(ctx.world.scheduler.pending).toHaveLength(1);
    expect(hits).toHaveLength(0);
    run(ctx.world, 0.5);
    expect(hits).toHaveLength(1);
  });

  it('火焰爆破：對燃燒中的目標傷害較高', () => {
    const measure = (burning: boolean) => {
      const ctx = setup([dummyAt(5.5, 2.5)]);
      comboQ(ctx.world, 'magic.flame_burst');
      const dummy = enemiesOf(ctx.world)[0]!;
      dummy.stats.setBase('maxHp', 9999);
      dummy.hp = 9999;
      if (burning) ctx.world.statuses.apply(dummy, 'burn', 10, 0, null);
      ctx.world.player.stats.setBase('spellPower', 100);
      castQ(ctx, dummy, 1);
      return 9999 - dummy.hp;
    };
    const normal = measure(false);
    const bonus = measure(true);
    expect(bonus / normal).toBeGreaterThan(1.1);
  });

  it('電擊：方向偏一點也會自動修正打中敵人', () => {
    const ctx = setup([dummyAt(8.5, 2.5)]);
    comboQ(ctx.world, 'magic.spark');
    const dummy = enemiesOf(ctx.world)[0]!;
    castQ(ctx, { x: 8.5, y: 1.5 }, 1.5);
    expect(dummy.hp).toBeLessThan(dummy.maxHp);
  });

  it('突進斬：沿路徑斬擊，只打到路徑上的敵人；命中後下一個近戰技能消耗強化', () => {
    const ctx = setup([dummyAt(3.5, 1.5), dummyAt(3.5, 4.5)]);
    const [onPath, offPath] = enemiesOf(ctx.world);
    const player = ctx.world.player;
    const start = player.position;
    comboQ(ctx.world, 'melee.dash_slash');
    castQ(ctx, { x: 12, y: 1.5 }, 1);
    expect(player.position.x).toBeGreaterThan(start.x + 2.5);
    expect(onPath!.hp).toBeLessThan(onPath!.maxHp);
    expect(offPath!.hp).toBe(offPath!.maxHp);
    expect(player.hasStatus('meleeEmpower')).toBe(true);

    comboQ(ctx.world, 'melee.heavy_slash');
    castQ(ctx, onPath!, 1);
    expect(player.hasStatus('meleeEmpower')).toBe(false);
  });

  it('後跳射擊：後跳後下一個遠程技能消耗強化；近戰技能不會消耗', () => {
    const ctx = setup([dummyAt(9.5, 1.5)]);
    const player = ctx.world.player;
    player.position = vec2(4.5, 1.5);
    comboQ(ctx.world, 'ranged.backstep_shot');
    // 施放時間 = 1 / 攻速；等後跳整段結束（強化持續 2 秒）
    castQ(ctx, { x: 12, y: 1.5 }, 0.9);
    expect(player.hasStatus('rangedEmpower')).toBe(true);

    const casts = recordCasts(ctx);
    comboQ(ctx.world, 'melee.dash_slash');
    castQ(ctx, { x: 12, y: 1.5 }, 0.1);
    expect(casts).toEqual(['melee.dash_slash']);
    expect(player.hasStatus('rangedEmpower')).toBe(true);
    run(ctx.world, 0.8);

    comboQ(ctx.world, 'ranged.quick_shot');
    castQ(ctx, { x: 12, y: 1.5 }, 0.1);
    expect(player.hasStatus('rangedEmpower')).toBe(false);
  });

  it('挑空斬：目標浮空期間無法行動', () => {
    const ctx = setup([skeletonAt(3, 1.5)]);
    makeInvulnerable(ctx.world.player);
    const target = enemiesOf(ctx.world)[0]!;
    target.stats.setBase('maxHp', 9999);
    target.hp = 9999;
    comboQ(ctx.world, 'melee.launch_slash');
    ctx.commands.push(castAt(target));
    let airborne = false;
    run(ctx.world, 1, () => {
      if (target.hasStatus('airborne')) airborne ||= target.isDisabled;
    });
    expect(airborne).toBe(true);
  });

  it('標記射擊：被標記的目標受到的傷害提高', () => {
    const ctx = setup([dummyAt(8.5, 1.5), dummyAt(8.5, 3.5)]);
    const [marked, plain] = enemiesOf(ctx.world);
    for (const d of [marked!, plain!]) {
      d.stats.setBase('maxHp', 9999);
      d.hp = 9999;
    }
    ctx.world.player.stats.setBase('damageMin', 20);
    ctx.world.player.stats.setBase('damageMax', 20);
    ctx.world.statuses.apply(marked!, 'marked', 10, 0.15, ctx.world.player);
    const markedHits = hitsOn(ctx, marked!);
    const plainHits = hitsOn(ctx, plain!);
    comboQ(ctx.world, 'ranged.quick_shot');
    castQ(ctx, marked!, 1);
    castQ(ctx, plain!, 1);
    expect(markedHits[0]! / plainHits[0]!).toBeCloseTo(1.15, 1);
  });

  it('散射：Lv1 25° / 5 支，每級 +5° / +1 支，Lv5 45° / 9 支', () => {
    for (const [rank, count, spreadDeg] of [
      [1, 5, 25],
      [5, 9, 45],
    ] as const) {
      const ctx = setup([]);
      comboQ(ctx.world, 'ranged.spread_shot');
      ctx.world.player.skillRanks.set('ranged.spread_shot', rank);
      ctx.commands.push(castAt({ x: 12, y: 1.5 }));
      let arrows: { x: number; y: number }[] = [];
      run(ctx.world, 1, () => {
        if (arrows.length === 0 && ctx.world.projectiles.length > 0) arrows = ctx.world.projectiles.map((p) => p.direction);
      });
      expect(arrows).toHaveLength(count);
      const angles = arrows.map((d) => (Math.atan2(d.y, d.x) * 180) / Math.PI);
      expect(Math.max(...angles) - Math.min(...angles)).toBeCloseTo(spreadDeg, 0);
    }
  });

  it('刃術 / 射術：擊退距離、處決加成、爆炸範圍依等級成長', () => {
    const data = DataRegistry.load(gameData);
    const lines = (id: string, rank: number) => describeSkill(data.skills.get(id), rank, 0);
    expect(lines('melee.quake_slash', 1)).toContain('擊退 2 格');
    expect(lines('melee.quake_slash', 2)).toContain('擊退 2.5 格');
    expect(lines('melee.execution_slash', 1)).toContain('目標生命低於 30% 時，傷害 +50%');
    expect(lines('melee.execution_slash', 2)).toContain('目標生命低於 30% 時，傷害 +60%');
    expect(lines('ranged.explosive_arrow', 1)).toContain('範圍 2 格');
    expect(lines('ranged.explosive_arrow', 2)).toContain('範圍 2.5 格');
    expect(lines('ranged.spread_shot', 1)).toContain('5 發投射物，散射 25°');
    expect(lines('ranged.spread_shot', 2)).toContain('6 發投射物，散射 30°');
  });

  it('新增技能只需加資料：每級倍率與魔力依陣列成長', () => {
    const bolt = {
      id: 'magic.test_bolt',
      name: '測試飛彈',
      tree: undefined,
      targeting: 'enemy',
      range: 10,
      castTime: 0,
      cost: { mana: [5, 6, 7, 8, 9] },
      effects: [{ type: 'damage', element: 'fire', scaling: 'flat', base: [10, 10], multiplier: [1, 1.2, 1.4, 1.6, 1.8] }],
    };
    const measure = (rank: number) => {
      const ctx = setup([dummyAt(6.5, 1.5)], [bolt]);
      const dummy = enemiesOf(ctx.world)[0]!;
      ctx.world.player.skillRanks.set('magic.test_bolt', rank);
      // 測試技能不在技能樹中，直接指定連段
      ctx.world.loadout.combos[0] = ['magic.test_bolt', null, null];
      noBaseRegen(ctx.world.player);
      castQ(ctx, dummy, 0.5);
      return { damage: dummy.maxHp - dummy.hp, mana: ctx.world.player.maxMana - ctx.world.player.mana };
    };
    expect(measure(1)).toEqual({ damage: 10, mana: 5 });
    expect(measure(5)).toEqual({ damage: 18, mana: 9 });
  });
});

describe('藥水與魔力回復', () => {
  it('Space 同時回復 HP 與 MP，數量減 1', () => {
    const { world, commands, data, events } = setup([]);
    const potion = data.potions.get(data.balance.player.potionId);
    const onUsed = vi.fn();
    events.on('PotionUsed', onUsed);
    noBaseRegen(world.player);
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

  it('冷卻中連按無效；回復不超過上限；HP 與 MP 都滿時不使用', () => {
    const { world, commands } = setup([]);
    const before = world.potions.count;
    commands.push({ type: 'UsePotion' });
    world.update(DT);
    expect(world.potions.count).toBe(before);

    world.player.hp = 90;
    commands.push({ type: 'UsePotion' }, { type: 'UsePotion' });
    world.update(DT);
    expect(world.potions.count).toBe(before - 1);
    expect(world.player.hp).toBe(world.player.maxHp);
  });

  it('魔力每秒回復：固定 manaRegen + 最大魔力 × manaRegenPct', () => {
    const { world, data } = setup([]);
    const p = data.balance.player;
    // setup 把固定回復關掉，這裡設回正式數值
    world.player.stats.setBase('manaRegen', p.manaRegenPerSec);
    world.player.mana = 0;
    run(world, 2);
    expect(world.player.mana).toBeCloseTo(2 * (p.manaRegenPerSec + world.player.maxMana * p.manaRegenPctPerSec), 1);
  });

  it('基礎生命回復：戰鬥中每秒 hpRegenPctPerSec × 最大生命；脫戰 4 秒後 × 5；hp 歸零時不回復', () => {
    const { world, data, events } = setup([]);
    const p = data.balance.player;
    const hurt = () => events.emit('ActorDamaged', { targetId: world.player.id, sourceId: null, amount: 1 } as never);
    world.player.stats.setBase('maxHp', 1000);
    // 戰鬥中：剛受到傷害，delay 秒內是一般速度
    world.player.hp = 10;
    hurt();
    run(world, p.outOfCombatRegen.delay - 0.5);
    expect(world.player.hp).toBeCloseTo(10 + 1000 * p.hpRegenPctPerSec * (p.outOfCombatRegen.delay - 0.5), 0);
    // 脫戰：回復 × multiplier
    run(world, 0.5);
    const before = world.player.hp;
    run(world, 2);
    expect(world.player.hp).toBeCloseTo(before + 1000 * p.hpRegenPctPerSec * p.outOfCombatRegen.multiplier * 2, 0);
    // 再受到傷害就回到一般速度
    hurt();
    const inCombat = world.player.hp;
    run(world, 1);
    expect(world.player.hp).toBeCloseTo(inCombat + 1000 * p.hpRegenPctPerSec, 0);
    world.player.hp = 0;
    run(world, 1 / 60);
    expect(world.player.hp).toBe(0);
  });
});

describe('怪物也經由 SkillSystem 攻擊', () => {
  it('骷髏以 basic.attack 攻擊玩家', () => {
    const { world, events } = createWorldWithMap(ROOM, [skeletonAt(4.5, 2.5)]);
    const casts: string[] = [];
    events.on('SkillCast', (e) => {
      if (e.actorId !== world.player.id) casts.push(e.skillId);
    });
    run(world, 3);
    expect(casts.length).toBeGreaterThan(0);
    expect(new Set(casts)).toEqual(new Set(['basic.attack']));
  });
});

describe('近戰傷害加成（屬性點「攻擊」）', () => {
  /** 對木樁施放一招，回傳第一下的傷害 */
  function firstHit(skillId: string, meleeBonus: number): number {
    const ctx = setup([dummyAt(2.6, 1.5)]);
    const stats = ctx.world.player.stats;
    stats.setBase('damageMin', 20);
    stats.setBase('damageMax', 20);
    stats.setBase('meleeDamageBonus', meleeBonus);
    comboQ(ctx.world, skillId);
    const dummy = enemiesOf(ctx.world)[0]!;
    makeInvulnerable(dummy);
    const hits: number[] = [];
    ctx.events.on('ActorDamaged', (e) => {
      if (e.targetId === dummy.id) hits.push(e.amount);
    });
    ctx.commands.push(castAt(dummy));
    run(ctx.world, 2);
    return hits[0]!;
  }

  it('只影響近戰技能（tag: melee），遠程與魔法不受影響', () => {
    expect(firstHit('melee.heavy_slash', 0.5)).toBeCloseTo(firstHit('melee.heavy_slash', 0) * 1.5);
    expect(firstHit('ranged.quick_shot', 0.5)).toBeCloseTo(firstHit('ranged.quick_shot', 0));
    expect(firstHit('magic.fireball', 0.5)).toBeCloseTo(firstHit('magic.fireball', 0));
  });
});
