import { describe, expect, it } from 'vitest';
import { gameData } from '../../src/data';
import { STEAL_CAP } from '../../src/data/balance';
import { DataRegistry } from '../../src/data/DataRegistry';
import { itemStats } from '../../src/game/items/ItemStats';

/**
 * 吸血 / 吸魔硬上限（設計者規定，要往上調必須先討論）：
 * 技能最高 +0.5%（1～5 級 0.1%～0.5%），其他每一個來源最高 +0.3%。新增資料超過時這裡會失敗。
 */
const data = DataRegistry.load(gameData);
const STEAL = new Set(['lifeSteal', 'manaSteal']);
const ranks = (v: number | readonly number[]) => (typeof v === 'number' ? [v] : [...v]);

describe('吸血 / 吸魔硬上限', () => {
  it('上限數值：技能 0.5%、其他來源 0.3%、暴擊時回復 0.5%', () => {
    expect(STEAL_CAP).toEqual({ skill: 0.005, perSource: 0.003, critHeal: 0.005 });
  });

  it('技能：血之汲取 / 魔力汲取 1～5 級為 0.1%～0.5%；所有技能都不超過 0.5%', () => {
    for (const id of ['support.blood_drain', 'support.mana_drain']) {
      const values = ranks(data.skills.get(id).passive[0]!.values).map((v) => Math.round(v * 10000) / 10000);
      expect(values, id).toEqual([0.001, 0.002, 0.003, 0.004, 0.005]);
    }
    for (const s of data.skills.all) for (const p of s.passive) if (STEAL.has(p.stat)) expect(Math.max(...ranks(p.values)), s.id).toBeLessThanOrEqual(STEAL_CAP.skill);
  });

  it('詞綴：數值不成長、最高不超過 0.3%', () => {
    for (const a of data.affixes.all.filter((a) => STEAL.has(a.stat))) {
      expect(a.growth, a.id).toBe(0);
      expect(a.value[1], a.id).toBeLessThanOrEqual(STEAL_CAP.perSource);
    }
  });

  it('傳奇 / 神話：固定屬性、條件加成、回復傷害的一部分都不超過 0.3%', () => {
    for (const d of data.legendaries.all) {
      for (const line of d.lines) {
        if (line.type === 'stat' && STEAL.has(line.stat)) expect(line.value[1] * (1 + line.growth * (data.balance.affixPower.maxTier - 1)), d.id).toBeLessThanOrEqual(STEAL_CAP.perSource + 1e-9);
      }
      // 效果裡的吸血數值（條件屬性、hpOfDamage）
      const json = JSON.stringify(d.lines);
      for (const m of json.matchAll(/"stat":"(?:lifeSteal|manaSteal)"[^}]*?"value":([\d.]+)/g)) expect(Number(m[1]), d.id).toBeLessThanOrEqual(STEAL_CAP.perSource);
      for (const l of d.lines) {
        if (l.type !== 'effect') continue;
        for (const m of l.mechanics) {
          if (m.type !== 'trigger') continue;
          const cap = m.on === 'crit' ? STEAL_CAP.critHeal : STEAL_CAP.perSource;
          for (const a of m.actions) if (a.type === 'restore' && a.hpOfDamage !== undefined) expect(a.hpOfDamage, d.id).toBeLessThanOrEqual(cap);
        }
      }
    }
  });

  it('舊物品（數值超過上限）以上限計算', () => {
    const old = { uid: 'x', baseId: 'ring.gold', rarity: 'epic' as const, itemLevel: 40, quality: 0.6, affixes: [{ id: 'strong.bloodthirst', rolls: [0.05] }] };
    expect(itemStats(old, data).affixes[0]!.value).toBe(STEAL_CAP.perSource);
  });
});
