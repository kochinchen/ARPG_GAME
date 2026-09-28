import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { AFFIX_COUNT, type Rarity } from '../../../src/data/schema/item';
import { describeItem } from '../../../src/game/items/ItemDescriber';
import { EPIC_NAMES } from '../../../src/data/itemNames';
import { affixTier, ItemGenerator } from '../../../src/game/items/ItemGenerator';

const data = DataRegistry.load(gameData);
const WEIGHTS = { normal: 60, magic: 30, rare: 10, epic: 0, legendary: 0, mythic: 0 };

describe('ItemGenerator', () => {
  it('同一個 seed 產生相同物品', () => {
    const a = new ItemGenerator(data, new Rng(7));
    const b = new ItemGenerator(data, new Rng(7));
    for (let i = 0; i < 20; i++) expect(a.generate(1, WEIGHTS)).toEqual(b.generate(1, WEIGHTS));
  });

  it('1000 件物品的稀有度分佈符合權重 ±3%', () => {
    const gen = new ItemGenerator(data, new Rng(123));
    const counts: Record<Rarity, number> = { normal: 0, magic: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
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
    expect(name.subtitle).toBe('魔法 劍 · 短劍');
    // 劍的內建加成：近戰 +8%、暴擊 +2%
    expect(name.lines).toEqual(['傷害 3–7', '+8% 近戰傷害', '+2% 暴擊率', '-20% 遠程傷害', '-20% 法術傷害', '+2 最小傷害']);
  });

  it('百分比類詞綴以 % 顯示', () => {
    const d = describeItem(
      { uid: 'y', baseId: 'boots.leather', rarity: 'rare', itemLevel: 1, affixes: [{ id: 'affix.swift', rolls: [0.08] }] },
      data,
    );
    // 稀有：主要詞綴（移動速度）的主題前綴 + 基底
    expect(d.name).toMatch(/^(風行|影行|疾風)・?皮靴$/);
    expect(d.lines).toContain('+8% 移動速度');
  });
});

describe('裝備命名', () => {
  const item = (uid: string, baseId: string, rarity: Rarity, affixes: { id: string; rolls: number[] }[] = []) => ({ uid, baseId, rarity, itemLevel: 10, affixes });

  it('同一件物品永遠同名；不同物品會挑到不同名稱', () => {
    const a = describeItem(item('u1', 'weapon.iron_longsword', 'epic'), data).name;
    expect(describeItem(item('u1', 'weapon.iron_longsword', 'epic'), data).name).toBe(a);
    const names = new Set(Array.from({ length: 30 }, (_, i) => describeItem(item(`u${i}`, 'weapon.iron_longsword', 'epic'), data).name));
    expect(names.size).toBeGreaterThan(3);
  });

  it('普通：品質詞 + 基底；史詩：特殊名稱，類型寫在下方', () => {
    for (let i = 0; i < 20; i++) expect(describeItem(item(`n${i}`, 'weapon.hand_axe', 'normal'), data).name).toMatch(/手斧$/);
    const epic = describeItem(item('e1', 'weapon.hunting_bow', 'epic'), data);
    expect(epic.name).not.toContain('獵弓');
    expect(epic.subtitle).toBe('史詩 弓 · 獵弓');
  });

  it('稀有飾品使用神秘名稱', () => {
    const d = describeItem(item('r1', 'ring.silver', 'rare', [{ id: 'affix.vital', rolls: [8] }]), data);
    expect(d.name).not.toBe('銀戒');
    expect(d.subtitle).toBe('稀有 戒指 · 銀戒');
  });
});

describe('掉落的基底', () => {
  it('深層不再掉最初級的基底，但每種裝備都還有得掉', () => {
    const gen = new ItemGenerator(data, new Rng(3));
    const bases = new Set(Array.from({ length: 1500 }, () => gen.generate(30, WEIGHTS).baseId));
    expect(bases.has('weapon.short_sword')).toBe(false);
    expect(bases.has('weapon.bloodmark_blade')).toBe(true);
    for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring', 'amulet']) {
      expect([...bases].some((id) => data.items.get(id).slot === slot)).toBe(true);
    }
  });
});

describe('詞綴強度', () => {
  const ALL = { normal: 0, magic: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  const only = (rarity: Rarity) => ({ ...ALL, [rarity]: 1 });
  /** 某稀有度、某物品等級下，某詞綴擲出的所有數值 */
  const rolls = (rarity: Rarity, level: number, affixId: string, count = 3000) => {
    const gen = new ItemGenerator(data, new Rng(11));
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      for (const a of gen.generate(level, only(rarity)).affixes) if (a.id === affixId) values.push(a.rolls[0]!);
    }
    return values;
  };

  it('每 10 層提高一個階級（T1～T5）', () => {
    expect([1, 9, 10, 19, 20, 39, 40, 99].map((l) => affixTier(l, data.balance))).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });

  it('階級越高數值越高：固定值成長快、百分比成長慢', () => {
    const hp1 = Math.max(...rolls('rare', 5, 'affix.vital'));
    const hp5 = Math.max(...rolls('rare', 45, 'affix.vital'));
    expect(hp1).toBeLessThanOrEqual(15);
    expect(hp5).toBeCloseTo(15 * (1 + 0.5 * 4), 0);
    const crit5 = Math.max(...rolls('rare', 45, 'affix.precise'));
    expect(crit5).toBeLessThanOrEqual(0.05 * (1 + 0.15 * 4) + 1e-9);
  });

  it('紫裝的詞綴比黃裝高 20%～50%（橘 / 紅是固定設計，見 Legendary.test）', () => {
    const rare = rolls('rare', 5, 'affix.vital');
    const epic = rolls('epic', 5, 'affix.vital');
    expect(Math.min(...epic)).toBeGreaterThanOrEqual(Math.round(5 * 1.2));
    expect(Math.max(...epic)).toBeLessThanOrEqual(Math.round(15 * 1.5));
    expect(Math.max(...epic)).toBeGreaterThan(Math.max(...rare));
  });

  it('紫裝一定帶有名稱決定的主題詞綴，名稱與屬性對得上', () => {
    const gen = new ItemGenerator(data, new Rng(21));
    for (let i = 0; i < 300; i++) {
      const item = gen.generate(25, only('epic'));
      const base = data.items.get(item.baseId);
      const name = describeItem(item, data).name;
      const kind = base.weaponType ?? base.slot;
      const theme = EPIC_NAMES[kind as keyof typeof EPIC_NAMES].find(([n]) => n === name)!;
      expect(theme, name).toBeDefined();
      expect(item.affixes[0]!.id).toBe(theme[1]);
      expect(item.affixes.length).toBeGreaterThanOrEqual(4);
      expect(new Set(item.affixes.map((a) => a.id)).size).toBe(item.affixes.length);
    }
  });

  it('盔甲與鞋子也有足夠的詞綴：神話可以湊滿 6 條', () => {
    for (const slot of ['armor', 'boots'] as const) {
      const pool = data.affixes.all.filter((a) => a.minItemLevel <= 10 && (!a.slots || a.slots.includes(slot)));
      expect(pool.length, slot).toBeGreaterThanOrEqual(8);
    }
  });

  it('所有史詩主題詞綴都存在', () => {
    for (const list of Object.values(EPIC_NAMES)) for (const [, id] of list) expect(data.affixes.has(id), id).toBe(true);
  });
});

describe('主倍率與強屬性', () => {
  const ALL = { normal: 0, magic: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
  const only = (rarity: Rarity) => ({ ...ALL, [rarity]: 1 });
  const many = (rarity: Rarity, slot: 'weapon' | 'ring' | 'armor', count = 400) => {
    const gen = new ItemGenerator(data, new Rng(31));
    return Array.from({ length: count }, () => gen.generateForSlot(slot, 20, only(rarity))!);
  };

  it('主倍率落在各稀有度的區間，相鄰稀有度互相重疊', () => {
    const ranges = data.balance.mainRoll.base;
    for (const rarity of ['magic', 'rare', 'epic', 'legendary', 'mythic'] as const) {
      for (const item of many(rarity, 'weapon', 200)) {
        expect(item.quality!).toBeGreaterThanOrEqual(ranges[rarity][0]);
        expect(item.quality!).toBeLessThanOrEqual(ranges[rarity][1]);
      }
    }
    expect(ranges.magic[1]).toBeGreaterThan(ranges.rare[0]);
    expect(ranges.rare[1]).toBeGreaterThan(ranges.epic[0]);
    expect(ranges.epic[1]).toBeGreaterThan(ranges.legendary[0]);
    expect(ranges.legendary[1]).toBeGreaterThan(ranges.mythic[0]);
    expect(many('normal', 'weapon', 50).every((i) => i.quality === undefined)).toBe(true);
  });

  it('鐵製長劍（基礎 6–13）+213%：顯示最終傷害與基礎值', () => {
    const d = describeItem({ uid: 'l', baseId: 'weapon.iron_longsword', rarity: 'legendary', itemLevel: 12, quality: 2.13, affixes: [] }, data);
    // 6 × 3.13 = 18.78 → 19；13 × 3.13 = 40.69 → 41
    expect(d.baseLines[0]).toBe('傷害 19–41（基礎 6–13）');
    expect(d.mainLine).toBe('武器傷害 +213%');
  });

  it('武器：主倍率乘在基礎傷害；法杖改乘法術強度，武器傷害不乘', () => {
    const sword = describeItem({ uid: 'w', baseId: 'weapon.rune_sword', rarity: 'epic', itemLevel: 26, quality: 1.5, affixes: [] }, data);
    expect(sword.baseLines).toContain('傷害 38–68（基礎 15–27）');
    expect(sword.mainLine).toBe('武器傷害 +150%');
    const staff = describeItem({ uid: 's', baseId: 'weapon.rune_staff', rarity: 'epic', itemLevel: 26, quality: 1.5, affixes: [] }, data);
    expect(staff.baseLines).toContain('傷害 7–13');
    expect(staff.baseLines).toContain('法術強度 40（基礎 16）');
    expect(staff.mainLine).toBe('法術強度 +150%');
  });

  it('拿錯類型的武器：內建扣其他類別的傷害（與詞綴直接相加）', () => {
    const bow = describeItem({ uid: 'b', baseId: 'weapon.long_bow', rarity: 'normal', itemLevel: 12, affixes: [] }, data);
    expect(bow.baseLines).toEqual(['傷害 9–17', '+15% 遠程傷害', '-15% 近戰傷害', '-20% 法術傷害']);
    const staff = describeItem({ uid: 's', baseId: 'weapon.rune_staff', rarity: 'normal', itemLevel: 18, affixes: [] }, data);
    expect(staff.baseLines).toEqual(['傷害 7–13', '+15% 法術傷害', '-20% 近戰傷害', '-20% 遠程傷害', '法術強度 16']);
  });

  it('防具：主倍率乘在基礎防禦；飾品：乘在所有詞綴', () => {
    const armor = describeItem({ uid: 'a', baseId: 'armor.plate', rarity: 'rare', itemLevel: 20, quality: 1, affixes: [] }, data);
    expect(armor.baseLines).toContain('防禦 36（基礎 18）');
    expect(armor.mainLine).toBe('防禦 +100%');
    const ring = describeItem({ uid: 'r', baseId: 'ring.gold', rarity: 'rare', itemLevel: 20, quality: 0.5, affixes: [{ id: 'affix.vital', rolls: [20] }] }, data);
    expect(ring.affixLines).toContain('+30 生命上限');
    expect(ring.mainLine).toBe('所有詞綴 +50%');
  });

  it('紫裝的強屬性 1 條，且來自該部位的強屬性池；黃裝沒有強屬性', () => {
    for (const item of many('epic', 'armor', 100)) {
      const strong = item.affixes.map((a) => data.affixes.get(a.id)).filter((a) => a.kind === 'strong');
      expect(strong).toHaveLength(1);
      for (const a of strong) if (a.slots) expect(a.slots).toContain('armor');
    }
    for (const item of many('rare', 'armor', 100)) expect(item.affixes.every((a) => data.affixes.get(a.id).kind === 'item')).toBe(true);
  });

  it('紫裝：主倍率 + 3 條普通詞綴 + 1 條由名稱決定的強屬性', () => {
    for (const item of many('epic', 'weapon', 100)) {
      const d = describeItem(item, data);
      expect(d.mainLine).not.toBeNull();
      expect(d.strongLines).toHaveLength(1);
      expect(d.affixLines).toHaveLength(3);
      expect(data.affixes.get(item.affixes[0]!.id).kind).toBe('strong');
    }
  });
});
