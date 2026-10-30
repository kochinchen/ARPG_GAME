import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { rankValue } from '../../../src/data/schema/common';
import type { EffectDef } from '../../../src/data/schema/effects';
import { rollMimic, schoolOf, teachMimic } from '../../../src/game/enemies/MimicSkills';
import { createWorld, createWorldWithMap, enemiesOf, makeInvulnerable, run } from '../helpers';

/** 怪物學主角技能（設計者 2026-10-30） */
const data = DataRegistry.load(gameData);
const config = data.balance.enemyMimic;
const mimics = data.skills.all.filter((s) => s.id.startsWith('mimic.'));
const enemy = (id: string) => data.enemies.get(`enemy.${id}`);

function damages(effects: readonly EffectDef[]): Extract<EffectDef, { type: 'damage' }>[] {
  return effects.flatMap((e) => {
    if (e.type === 'damage') return [e];
    if (e.type === 'projectile') return damages(e.onHit);
    if (e.type === 'dash') return damages(e.onPath);
    if (e.type === 'area' || e.type === 'chain' || e.type === 'zone' || e.type === 'delayed') return damages(e.effects);
    return [];
  });
}

describe('怪物版技能（資料）', () => {
  it('近戰、遠程、法術三棵樹的主動技能都有怪物版；戰術與輔助沒有', () => {
    const sources = mimics.map((m) => data.skills.get(m.id.slice('mimic.'.length)).tree!.category);
    expect(new Set(sources)).toEqual(new Set(['melee', 'ranged', 'magic']));
    expect(mimics.length).toBe(36);
  });

  it('傷害 × 0.6、不耗魔力、法術強度改用怪物傷害；冷卻依層級至少 4 / 6 / 8 / 10 秒，前搖 × 1.5', () => {
    for (const m of mimics) {
      const original = data.skills.get(m.id.slice('mimic.'.length));
      const tier = original.tree!.tier;
      expect(m.cooldown).toBeGreaterThanOrEqual(config.minCooldown + config.cooldownPerTier * (tier - 1));
      expect(m.castTime).toBeCloseTo(original.castTime * config.castTimeMultiplier);
      expect(rankValue(m.cost.mana, 1)).toBe(0);
      const ours = damages(m.effects);
      const theirs = damages(original.effects);
      ours.forEach((d, i) => {
        expect(d.scaling).not.toBe('spell');
        expect(rankValue(d.multiplier, 3)).toBeCloseTo(rankValue(theirs[i]!.multiplier, 3) * config.damage);
      });
    }
  });

  it('非單體技能都有使用距離（怪物才知道什麼時候出招）', () => {
    for (const m of mimics) if (m.targeting !== 'enemy') expect(m.range, m.id).toBeGreaterThan(0);
  });
});

describe('怪物學到哪一招', () => {
  const roll = (id: string, floor: number, elite = false, seed = 1) =>
    rollMimic(enemy(id), floor, elite, data.skills, config, new Rng(seed));

  it('法術系學法術樹、會保持距離的學遠程樹、其他學近戰樹', () => {
    expect(schoolOf(enemy('skeleton_mage'), data.skills)).toBe('magic');
    expect(schoolOf(enemy('skeleton_archer'), data.skills)).toBe('ranged');
    expect(schoolOf(enemy('skeleton'), data.skills)).toBe('melee');
    expect(roll('skeleton_mage', 12, true)!.skillId).toMatch(/^mimic\.magic\./);
    expect(roll('skeleton', 12, true)!.skillId).toMatch(/^mimic\.melee\./);
  });

  it('9 樓以前不會學；魔王不會學；精英必定學到', () => {
    for (let seed = 1; seed < 50; seed++) expect(roll('skeleton', 9, true, seed)).toBeNull();
    expect(roll('crypt_guardian', 30, true)).toBeNull();
    for (let seed = 1; seed < 50; seed++) expect(roll('skeleton', 10, true, seed)).not.toBeNull();
  });

  it('越深學得到越高層的技能、等級越高；一般怪的機率依樓層', () => {
    const tierOf = (floor: number) => {
      let max = 0;
      for (let seed = 1; seed < 300; seed++) {
        const r = roll('skeleton_mage', floor, true, seed)!;
        max = Math.max(max, data.skills.get(r.skillId.slice('mimic.'.length)).tree!.tier);
      }
      return max;
    };
    expect(tierOf(10)).toBe(1);
    expect(tierOf(15)).toBe(2);
    expect(tierOf(20)).toBe(3);
    expect(tierOf(30)).toBe(4);
    expect(roll('skeleton', 10, true)!.rank).toBe(1);
    expect(roll('skeleton', 30, true)!.rank).toBe(5);
    const learned = (floor: number) => Array.from({ length: 2000 }, (_, seed) => roll('skeleton', floor, false, seed)).filter(Boolean).length / 2000;
    expect(learned(12)).toBeCloseTo(0.1, 1);
    expect(learned(30)).toBeCloseTo(0.25, 1);
  });
});

describe('怪物使用學會的招式', () => {
  it('骷髏法師學會火球：冷卻好、主角在範圍內就施放', () => {
    const { world, events } = createWorldWithMap(
      ['####################', '#S.................#', '#..................#', '#..................#', '####################'],
      [{ enemyId: 'enemy.skeleton_mage', at: [8, 2.5] }],
    );
    makeInvulnerable(world.player);
    world.player.position = vec2(3, 2.5);
    const mage = enemiesOf(world)[0]!;
    teachMimic(mage, { skillId: 'mimic.magic.fireball', rank: 1 });
    const casts: string[] = [];
    events.on('SkillCast', (e) => {
      if (e.actorId === mage.id) casts.push(e.skillId);
    });
    run(world, 3);
    expect(casts[0]).toBe('mimic.magic.fireball');
    expect(world.player.hp).toBeLessThan(world.player.maxHp);
  });
});

describe('深層實戰（不會出錯）', () => {
  it.each([12, 20, 30])('第 %i 層：主角站進怪群 15 秒，學會招式的怪會施放', (floor) => {
    const { world, events } = createWorld(7);
    world.enterFloor(floor);
    makeInvulnerable(world.player);
    const learned = enemiesOf(world).filter((e) => e.ai?.specialSkills.some((id) => id.startsWith('mimic.')));
    expect(learned.length).toBeGreaterThan(0);
    const casts: string[] = [];
    events.on('SkillCast', (e) => {
      if (e.skillId.startsWith('mimic.')) casts.push(e.skillId);
    });
    // 依序站到幾隻會招式的怪旁邊
    for (const e of learned.slice(0, 4)) {
      world.player.position = vec2(e.position.x + 1, e.position.y);
      run(world, 4);
    }
    expect(casts.length).toBeGreaterThan(0);
  });
});
