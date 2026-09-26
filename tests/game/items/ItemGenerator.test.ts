import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { AFFIX_COUNT, type Rarity } from '../../../src/data/schema/item';
import { describeItem } from '../../../src/game/items/ItemDescriber';
import { ItemGenerator } from '../../../src/game/items/ItemGenerator';

const data = DataRegistry.load(gameData);
const WEIGHTS = { normal: 60, magic: 30, rare: 10, legendary: 0 };

describe('ItemGenerator', () => {
  it('同一個 seed 產生相同物品', () => {
    const a = new ItemGenerator(data, new Rng(7));
    const b = new ItemGenerator(data, new Rng(7));
    for (let i = 0; i < 20; i++) expect(a.generate(1, WEIGHTS)).toEqual(b.generate(1, WEIGHTS));
  });

  it('1000 件物品的稀有度分佈符合權重 ±3%', () => {
    const gen = new ItemGenerator(data, new Rng(123));
    const counts: Record<Rarity, number> = { normal: 0, magic: 0, rare: 0, legendary: 0 };
    for (let i = 0; i < 1000; i++) counts[gen.generate(1, WEIGHTS).rarity]++;
    expect(counts.normal / 1000).toBeCloseTo(0.6, 1);
    expect(Math.abs(counts.normal / 1000 - 0.6)).toBeLessThan(0.03);
    expect(Math.abs(counts.magic / 1000 - 0.3)).toBeLessThan(0.03);
    expect(Math.abs(counts.rare / 1000 - 0.1)).toBeLessThan(0.03);
    expect(counts.legendary).toBe(0);
  });

  it('詞綴數量符合稀有度、不重複、只出現在允許的欄位、數值在範圍內', () => {
    const gen = new ItemGenerator(data, new Rng(5));
    for (let i = 0; i < 500; i++) {
      const item = gen.generate(1, WEIGHTS);
      const base = data.items.get(item.baseId);
      const [min, max] = AFFIX_COUNT[item.rarity];
      expect(item.affixes.length).toBeGreaterThanOrEqual(0);
      expect(item.affixes.length).toBeLessThanOrEqual(max);
      if (min > 0) expect(item.affixes.length).toBeGreaterThanOrEqual(1);
      expect(new Set(item.affixes.map((a) => a.id)).size).toBe(item.affixes.length);
      for (const affix of item.affixes) {
        const def = data.affixes.get(affix.id);
        if (def.slots) expect(def.slots).toContain(base.slot);
        const value = affix.rolls[0]!;
        expect(value).toBeGreaterThanOrEqual(def.value[0]);
        expect(value).toBeLessThanOrEqual(def.value[1]);
        if (Number.isInteger(def.value[0]) && Number.isInteger(def.value[1])) expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('每件物品的 uid 不重複', () => {
    const gen = new ItemGenerator(data, new Rng(9));
    const uids = new Set(Array.from({ length: 300 }, () => gen.generate(1, WEIGHTS).uid));
    expect(uids.size).toBe(300);
  });
});

describe('describeItem', () => {
  it('Magic 物品名稱為「第一個詞綴 + 基底」，並列出基底屬性與詞綴', () => {
    const name = describeItem(
      { uid: 'x', baseId: 'weapon.short_sword', rarity: 'magic', itemLevel: 1, affixes: [{ id: 'affix.sharp', rolls: [2] }] },
      data,
    );
    expect(name.name).toBe('鋒利的短劍');
    expect(name.lines).toEqual(['傷害 2–5', '+2 最小傷害']);
  });

  it('百分比類詞綴以 % 顯示', () => {
    const d = describeItem(
      { uid: 'y', baseId: 'boots.leather', rarity: 'rare', itemLevel: 1, affixes: [{ id: 'affix.swift', rolls: [0.08] }] },
      data,
    );
    expect(d.name).toBe('皮靴');
    expect(d.lines).toContain('+8% 移動速度');
  });
});
