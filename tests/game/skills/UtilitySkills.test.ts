import { describe, expect, it } from 'vitest';
import { distance, vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { GameCommand } from '../../../src/game/Commands';
import type { Actor } from '../../../src/game/entities/Actor';
import type { GameWorld } from '../../../src/game/GameWorld';
import { describeSkill } from '../../../src/game/skills/SkillDescriber';
import { weaponDenial } from '../../../src/game/skills/skillCategory';
import { createWorldWithMap, enemiesOf, run } from '../helpers';

/** v0.4.0 戰術：身法 4 招＋投擲 4 招 */
const data = DataRegistry.load(gameData);

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

function setup(spawns: Spawn[]) {
  const ctx = createWorldWithMap(ROOM, spawns);
  const p = ctx.world.player;
  p.stats.setBase('critChance', 0);
  p.stats.setBase('maxMana', 500);
  p.mana = 500;
  ctx.world.progress.level = 30;
  for (const e of enemiesOf(ctx.world)) {
    e.stats.setBase('maxHp', 1e6);
    e.hp = 1e6;
  }
  return ctx;
}

/** 學會技能（指定等級）並放進 Q 連段第一格，朝目標施放 */
function cast(world: GameWorld, commands: { push(c: GameCommand): void }, skillId: string, rank: number, at: Actor | { x: number; y: number }, seconds = 1) {
  world.player.skillRanks.set(skillId, rank);
  world.loadout.combos[0] = [skillId, null, null];
  world.loadout.select(0);
  commands.push(
    'id' in at ? { type: 'CastRight', worldPos: at.position, targetId: at.id } : { type: 'CastRight', worldPos: vec2(at.x, at.y), targetId: null },
  );
  run(world, seconds);
}

const hurt = (a: Actor) => a.hp < a.maxHp;
const statusCount = (a: Actor, kind: string) => a.statuses.filter((s) => s.kind === kind).length;

describe('戰術 · 身法', () => {
  it('翻滾：朝游標反方向後翻約 2.5 格，翻滾後短時間免疫擊退', () => {
    // 起點在房間中央（出生點靠牆，往後翻會被牆擋住）
    const { world, commands } = setup([]);
    world.player.position = vec2(9, 2.5);
    cast(world, commands, 'utility.roll', 1, { x: 14, y: 2.5 }, 0.25);
    expect(9 - world.player.position.x).toBeCloseTo(2.5, 0);
    expect(world.player.hasStatus('unstoppable')).toBe(true);
  });

  it('影步：向前穿過擋路的敵人走完 4 格，並強化下一個近戰與遠程技能', () => {
    const { world, commands } = setup([dummyAt(3.5, 1.5)]);
    const dummy = enemiesOf(world)[0]!;
    cast(world, commands, 'utility.shadow_step', 1, dummy, 0.3);
    expect(world.player.position.x).toBeGreaterThan(dummy.position.x + 1);
    expect(world.player.hasStatus('meleeEmpower')).toBe(true);
    expect(world.player.hasStatus('rangedEmpower')).toBe(true);
  });

  it('鉤索：命中把敵人拉近（Lv1 約 2 格）；Lv5 拉到面前停住並緩速', () => {
    const { world, commands } = setup([skeletonAt(7.5, 1.5)]);
    const skeleton = enemiesOf(world)[0]!;
    skeleton.stats.setBase('moveSpeed', 0.01);
    const before = distance(world.player.position, skeleton.position);
    cast(world, commands, 'utility.grapple_hook', 1, skeleton, 0.8);
    expect(hurt(skeleton)).toBe(true);
    expect(before - distance(world.player.position, skeleton.position)).toBeCloseTo(2, 0);
    expect(skeleton.hasStatus('slow')).toBe(false);

    const lv5 = setup([skeletonAt(5.5, 1.5)]);
    const target = enemiesOf(lv5.world)[0]!;
    target.stats.setBase('moveSpeed', 0.01);
    cast(lv5.world, lv5.commands, 'utility.grapple_hook', 5, target, 0.8);
    const gap = distance(lv5.world.player.position, target.position) - lv5.world.player.radius - target.radius;
    expect(gap).toBeLessThan(0.5);
    expect(gap).toBeGreaterThan(0);
    expect(target.hasStatus('slow')).toBe(true);
  });

  it('幻影突襲：穿越 5 格，路徑上的敵人全部受傷並暈眩，路徑外的不受影響', () => {
    const { world, commands } = setup([skeletonAt(3.5, 1.5), skeletonAt(5, 1.5), skeletonAt(4, 4.5)]);
    const [a, b, off] = enemiesOf(world);
    cast(world, commands, 'utility.phantom_rush', 1, { x: 14, y: 1.5 }, 0.35);
    expect(world.player.position.x).toBeGreaterThan(5.5);
    for (const e of [a!, b!]) {
      expect(hurt(e)).toBe(true);
      expect(e.hasStatus('stun')).toBe(true);
    }
    expect(hurt(off!)).toBe(false);
  });
});

describe('戰術 · 投擲', () => {
  it('淬毒飛刀：Lv1 一把、固定傷害＋中毒；Lv5 近身三把打同一隻，疊滿 3 層毒', () => {
    const { world, commands } = setup([dummyAt(3.5, 1.5)]);
    const dummy = enemiesOf(world)[0]!;
    cast(world, commands, 'utility.poison_knife', 1, dummy, 0.6);
    expect(hurt(dummy)).toBe(true);
    expect(statusCount(dummy, 'poison')).toBe(1);

    const lv5 = setup([dummyAt(2.8, 1.5)]);
    const near = enemiesOf(lv5.world)[0]!;
    cast(lv5.world, lv5.commands, 'utility.poison_knife', 5, near, 0.6);
    expect(statusCount(near, 'poison')).toBe(3);
  });

  it('霜凍投射器（設計者 2026-10-30）：放在游標處，每秒朝最近的敵人射一支冰箭，持續 20 秒；Lv5 每支 15% 武器傷害', () => {
    const { world, commands, events } = setup([dummyAt(6.5, 2.5)]);
    const dummy = enemiesOf(world)[0]!;
    let arrows = 0;
    events.on('ActorDamaged', (e) => {
      if (e.targetId === dummy.id && e.element === 'cold') arrows++;
    });
    cast(world, commands, 'utility.frost_flask', 5, { x: 4, y: 2.5 }, 3);
    // 3 秒約 3 支
    expect(arrows).toBeGreaterThanOrEqual(2);
    expect(arrows).toBeLessThanOrEqual(4);
    expect(data.skills.get('utility.frost_flask').effects[0]).toMatchObject({ interval: 1, onShot: [{ onHit: [{ element: 'cold', multiplier: [0.05, 0.075, 0.1, 0.125, 0.15] }] }] });
  });

  it('擲斧：Lv5 三把扇形、每把穿透 2 個，一排三隻都流血', () => {
    const { world, commands } = setup([dummyAt(3, 1.5), dummyAt(4.5, 1.5), dummyAt(6, 1.5)]);
    const row = enemiesOf(world);
    cast(world, commands, 'utility.throwing_axe', 5, row[2]!, 1);
    for (const e of row) {
      expect(hurt(e)).toBe(true);
      expect(statusCount(e, 'bleed')).toBeGreaterThanOrEqual(1);
    }
  });

  it('擲斧的流血（設計者 2026-10-29）：3 秒共 60%～120% 武器傷害，可以疊加（最多 5 層）', () => {
    const { world, commands } = setup([dummyAt(3, 1.5)]);
    const dummy = enemiesOf(world)[0]!;
    dummy.stats.addModifier({ stat: 'maxHp', kind: 'flat', value: 1e6, source: 'test' });
    dummy.hp = dummy.maxHp;
    for (let i = 0; i < 7; i++) cast(world, commands, 'utility.throwing_axe', 1, dummy, 0.4);
    expect(statusCount(dummy, 'bleed')).toBe(5);
    const bleed = dummy.statuses.find((s) => s.kind === 'bleed')!;
    expect(bleed.magnitude).toBeCloseTo(0.6);
  });

  it('閃光粉：落地範圍弱化 20 秒；Lv1 全元素 −7.5%，Lv4 起也降低物理抗性；30 魔力、冷卻 30 秒', () => {
    const { world, commands } = setup([dummyAt(5.5, 2.5)]);
    const dummy = enemiesOf(world)[0]!;
    cast(world, commands, 'utility.flash_powder', 1, dummy, 1);
    const expose = dummy.statuses.find((s) => s.kind === 'expose')!;
    expect(expose.magnitude).toBeCloseTo(0.075);
    expect(expose.physicalMagnitude).toBe(0);
    expect(expose.remaining).toBeGreaterThan(18.5);
    for (const rank of [1, 5]) expect(world.skills.manaCost(data.skills.get('utility.flash_powder'), rank)).toBe(30);
    expect(world.player.cooldowns.get('utility.flash_powder')).toBeGreaterThan(28);

    const lv4 = setup([dummyAt(5.5, 2.5)]);
    const target = enemiesOf(lv4.world)[0]!;
    cast(lv4.world, lv4.commands, 'utility.flash_powder', 4, target, 1);
    const lv4Expose = target.statuses.find((s) => s.kind === 'expose')!;
    expect(lv4Expose.magnitude).toBeCloseTo(0.2);
    expect(lv4Expose.physicalMagnitude).toBeCloseTo(0.1);
  });

  it('連段裡有技能還在冷卻：整組不施放並提示剩餘秒數；冷卻結束後恢復', () => {
    const { world, commands, events } = setup([dummyAt(5.5, 2.5)]);
    const dummy = enemiesOf(world)[0]!;
    const failures: string[] = [];
    events.on('SkillFailed', (e) => {
      if (e.reason === 'cooldown') failures.push(e.text);
    });
    cast(world, commands, 'utility.flash_powder', 1, dummy, 1);
    const casts = world.player.castCount;
    world.player.skillRanks.set('utility.poison_knife', 1);
    world.loadout.combos[0] = ['utility.poison_knife', 'utility.flash_powder', null];
    commands.push({ type: 'CastRight', worldPos: dummy.position, targetId: dummy.id });
    run(world, 1);
    expect(world.player.castCount).toBe(casts);
    expect(failures.at(-1)).toMatch(/^閃光粉冷卻中（\d+ 秒）$/);

    run(world, 29);
    commands.push({ type: 'CastRight', worldPos: dummy.position, targetId: dummy.id });
    run(world, 1.5);
    expect(world.player.castCount).toBe(casts + 2);
  });
});

describe('戰術 · 共通', () => {
  const utility = data.skills.all.filter((s) => s.tree?.category === 'utility');

  it('任何武器都能用；冷卻 0（閃光粉例外：30 秒）；投擲不吃攻速', () => {
    expect(utility.length).toBeGreaterThanOrEqual(8);
    for (const s of utility) {
      for (const weapon of ['sword', 'axe', 'bow', 'staff'] as const) expect(weaponDenial(s, weapon, data.balance.weaponRules), `${s.id} × ${weapon}`).toBeNull();
      expect(s.cooldown, s.id).toBe(s.id === 'utility.flash_powder' ? 30 : 0);
      expect(s.useAttackSpeed, s.id).toBe(false);
    }
  });

  it('技能說明：鉤索 Lv1～4 不顯示 Lv5 才有的緩速；傷害以攻擊力（武器 / 法術取高）顯示', () => {
    const hook = data.skills.get('utility.grapple_hook');
    expect(describeSkill(hook, 1, 6).some((l) => l.includes('緩速'))).toBe(false);
    expect(describeSkill(hook, 5, 6).some((l) => l.includes('緩速'))).toBe(true);
    const knife = data.skills.get('utility.poison_knife');
    expect(describeSkill(knife, 1, 2)).toContain('攻擊力 = 武器傷害與法術強度取較高者');
    expect(describeSkill(knife, 1, 2)).toContain('物理傷害 20% 攻擊力');
    expect(describeSkill(knife, 5, 5)).toContain('物理傷害 32% 攻擊力');
  });
});

describe('戰術 · 攻擊力（武器傷害與法術強度取高）', () => {
  it('法杖角色（法術強度高、武器傷害低）：淬毒飛刀與毒都以法術強度計算', () => {
    const { world, commands } = setup([dummyAt(3.5, 1.5)]);
    const dummy = enemiesOf(world)[0]!;
    dummy.stats.setBase('defense', 0);
    world.player.stats.setBase('damageMin', 2);
    world.player.stats.setBase('damageMax', 4);
    world.player.stats.setBase('spellPower', 200);
    const hits: number[] = [];
    world.events.on('ActorDamaged', (e) => {
      if (e.targetId === dummy.id) hits.push(e.amount);
    });
    cast(world, commands, 'utility.poison_knife', 1, dummy, 0.6);
    // 直接傷害 20% × 法術強度 200（±20%）＝ 32～48，不是武器傷害的 0～1
    expect(hits[0]!).toBeGreaterThanOrEqual(32);
    expect(hits[0]!).toBeLessThanOrEqual(48);
    // 毒：200 × 60% / 5 秒 = 每秒 24
    const poison = dummy.statuses.find((s) => s.kind === 'poison')!;
    expect(poison.dps).toBeCloseTo(24);
  });
});
