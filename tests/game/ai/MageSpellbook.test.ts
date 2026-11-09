import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { vec2 } from '../../../src/core/math/Vec2';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { Actor } from '../../../src/game/entities/Actor';
import { rollMimic, rollSpellbook, teachSpellbook } from '../../../src/game/enemies/MimicSkills';
import { createWorldWithMap } from '../helpers';

/**
 * 法師的階級與袍色（設計者 2026-11-08）：
 * 骷髏法師（低階）固定會魔法 1 階，低機率 2 階（越深越高），精英低機率 3 階；雷霆法師（中階）固定 2 階，低機率 3 階，精英低機率 4 階。
 * 火、冰、雷由袍色決定，白袍 / 金袍三系都會。
 */
const data = DataRegistry.load(gameData);
const config = data.balance.mageSpellbook;
const tree = (id: string) => data.skills.get(id.replace(/^mimic\./, '')).tree!;
const ROOM = ['########', '#S.....#', '#......#', '########'];
const roll = (id: string, floor: number, elite: boolean, seed: number) => rollSpellbook(data.enemies.get(id), floor, elite, data.skills, config, new Rng(seed))!;
const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

const CASES: [string, number, string[]][] = [
  ['enemy.skeleton_mage', 1, ['C']],
  ['enemy.skeleton_mage_fire', 1, ['A']],
  ['enemy.skeleton_mage_frost', 1, ['B']],
  ['enemy.skeleton_mage_white', 1, ['A', 'B', 'C']],
  ['enemy.storm_mage', 2, ['C']],
  ['enemy.storm_mage_fire', 2, ['A']],
  ['enemy.storm_mage_frost', 2, ['B']],
  ['enemy.storm_mage_gold', 2, ['A', 'B', 'C']],
];

describe.each(CASES)('%s', (id, tier, branches) => {
  it('固定會那一階每一系的招；一般最多高一階，精英最多高兩階；系別不會跑掉', () => {
    for (const seed of SEEDS) {
      const plain = roll(id, 20, false, seed).spells.map(tree);
      const base = plain.filter((t) => t.tier === tier);
      expect(base.map((t) => t.branch).sort()).toEqual(branches);
      expect(plain.length).toBeLessThanOrEqual(branches.length + 1);
      expect(Math.max(...plain.map((t) => t.tier))).toBeLessThanOrEqual(tier + 1);
      const strong = roll(id, 20, true, seed).spells.map(tree);
      expect(Math.max(...strong.map((t) => t.tier))).toBeLessThanOrEqual(tier + 2);
      for (const t of strong) expect(branches).toContain(t.branch);
    }
  });

  it('高一階的機率越深越高；一般的不會有高兩階，精英是低機率', () => {
    const rate = (floor: number, elite: boolean, t: number) => SEEDS.filter((s) => roll(id, floor, elite, s).spells.some((x) => tree(x).tier === t)).length / SEEDS.length;
    const shallow = rate(6, false, tier + 1);
    const deep = rate(30, false, tier + 1);
    expect(shallow).toBeGreaterThan(0.03);
    expect(shallow).toBeLessThan(0.2);
    expect(deep).toBeGreaterThan(0.38);
    expect(rate(30, false, tier + 2)).toBe(0);
    const elite = rate(30, true, tier + 2);
    expect(elite).toBeGreaterThan(0.15);
    expect(elite).toBeLessThan(0.35);
  });

  it('不會再隨機學別的招', () => {
    expect(rollMimic(data.enemies.get(id), 40, true, data.skills, data.balance.enemyMimic, new Rng(1))).toBeNull();
  });

  it('普通攻擊是會的系其中一種', () => {
    const basics = data.enemies.get(id).spellbook!.schools.map((s) => s.basic);
    const seen = new Set(SEEDS.map((s) => roll(id, 10, false, s).basic));
    expect([...seen].sort()).toEqual([...new Set(basics)].sort());
  });
});

describe('學會法術書', () => {
  const spawn = (id: string, floor: number, elite: boolean, spells: string[]): Actor => {
    const { world } = createWorldWithMap(ROOM, []);
    const actor = world.spawnScaledEnemy(id, floor, vec2(5.5, 1.5));
    (actor as { elite: boolean }).elite = elite;
    teachSpellbook(actor, { basic: 'enemy.spark_bolt', spells }, floor, data.balance.enemyMimic, config);
    return actor;
  };

  it('招式等級隨樓層，一般最高 3、精英固定 1；普通攻擊換成抽到的那一種', () => {
    const spell = 'mimic.magic.chain_lightning';
    expect(spawn('enemy.storm_mage', 6, false, [spell]).skillRanks.get(spell)).toBe(1);
    expect(spawn('enemy.storm_mage', 15, false, [spell]).skillRanks.get(spell)).toBe(2);
    expect(spawn('enemy.storm_mage', 60, false, [spell]).skillRanks.get(spell)).toBe(3);
    const elite = spawn('enemy.storm_mage', 60, true, [spell]);
    expect(elite.skillRanks.get(spell)).toBe(1);
    expect(elite.ai!.skillId).toBe('enemy.spark_bolt');
    expect(elite.ai!.specialSkills).toEqual([spell]);
  });

  it('精英會高倍率的招時傷害不再往下調（設計者 2026-11-09 取消倍率上限）', () => {
    const bonus = (spell: string) => spawn('enemy.storm_mage', 30, true, [spell]).stats.get('damageBonus');
    expect(bonus('mimic.magic.thunder_strike')).toBe(0);
    expect(bonus('mimic.magic.meteor')).toBe(0);
  });
});
