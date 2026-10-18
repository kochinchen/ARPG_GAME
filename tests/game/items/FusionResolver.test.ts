import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/Rng';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { Rarity, WeaponType } from '../../../src/data/schema/item';
import { fuse, previewFusion } from '../../../src/game/items/FusionResolver';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';

/** 融合判定（v0.5.0 P3）：SPEC §2 與 融合範例_v0.5.0.md 的五個範例 */
const data = DataRegistry.load(gameData);
const baseOf = (w: WeaponType) => data.items.all.find((b) => b.weaponType === w)!.id;
const baseOfSlot = (slot: string) => data.items.all.find((b) => b.slot === slot)!.id;

let n = 0;
const weapon = (w: WeaponType, rarity: Rarity, itemLevel: number, extra: Partial<ItemInstance> = {}): ItemInstance => ({
  uid: `${w}-${n++}`,
  baseId: baseOf(w),
  rarity,
  itemLevel,
  affixes: [],
  ...extra,
});
const legendary = (w: WeaponType, legendaryId: string, itemLevel: number, rarity: Rarity = 'legendary') => weapon(w, rarity, itemLevel, { legendaryId });
const jewel = (slot: 'ring' | 'amulet', rarity: Rarity): ItemInstance => ({ uid: `${slot}-${n++}`, baseId: baseOfSlot(slot), rarity, itemLevel: 10, affixes: [] });

const MOUNTAIN = 'legendary.mountain_splitter'; // 裂山（橘斧）：重擊類技能傷害 +25%、擊退 +30%（◆）

describe('融合預覽：五個範例的固定部分', () => {
  it('#1 短劍（白 2）＋手斧（白 3）→ 混核（銳＋重）/ T1 / 白 1 條；245 金幣 / 14 精華', () => {
    const pv = previewFusion([weapon('sword', 'normal', 2), weapon('axe', 'normal', 3)], [], data);
    expect(pv.problems).toEqual([]);
    expect(pv.types.sort()).toEqual(['heavy', 'sharp']);
    expect(pv.mixed).toBe(true);
    expect([pv.tier, pv.rarity, pv.lineCount]).toEqual([1, 'normal', 1]);
    expect(pv.brand.chance).toBe(0);
    expect(pv.cost).toEqual({ gold: 245, essence: 14 });
    // 混核：每個部位兩個核種各一條候選，數值 ×0.7
    const weaponSlot = pv.slots.find((s) => s.slot === 'weapon')!;
    expect(weaponSlot.options.map((o) => o.type).sort()).toEqual(['heavy', 'sharp']);
    const crit = weaponSlot.options.find((o) => o.type === 'sharp')!.lines.find((l) => l.line.id === 'core.sharp.crit')!;
    expect(crit.range[0]).toBeCloseTo(0.02 * 0.7);
    expect(crit.range[1]).toBeCloseTo(0.04 * 0.7);
  });

  it('#2 四把弓（白 5、藍 8、黃 9、藍 13）→ 穿核 純 / T1 / 藍 2 條；頭盔欄射擊距離 0.5～1.0 格', () => {
    const pv = previewFusion([weapon('bow', 'normal', 5), weapon('bow', 'magic', 8), weapon('bow', 'rare', 9), weapon('bow', 'magic', 13)], [], data);
    expect(pv.types).toEqual(['pierce']);
    expect([pv.pure, pv.tier, pv.weight, pv.rarity, pv.lineCount]).toEqual([true, 1, 4, 'magic', 2]);
    expect(pv.next).toEqual({ rarity: 'rare', gap: 1 });
    expect(pv.cost).toEqual({ gold: 995, essence: 25 });
    const helmet = pv.slots.find((s) => s.slot === 'helmet')!.options[0]!.lines[0]!;
    expect(helmet.line.id).toBe('core.pierce.range');
    expect(helmet.range).toEqual([0.5, 1]);
    // 藍核抽不到「穿透 +1」（紫以上）
    expect(pv.slots.find((s) => s.slot === 'weapon')!.options[0]!.lines.map((l) => l.line.id)).toEqual(['core.pierce.projectile_speed']);
    expect(pv.secondary.map((s) => s.line.id)).not.toContain('core.pierce.pierce');
  });

  it('#3 裂山（橘 18）＋鐵斧（黃 17）＋月刃斧（藍 19）→ 重核 / T2 / 紫 3 條；印記 35%；1,470 / 31', () => {
    const pv = previewFusion([legendary('axe', MOUNTAIN, 18), weapon('axe', 'rare', 17), weapon('axe', 'magic', 19)], [], data);
    expect(pv.types).toEqual(['heavy']);
    expect([pv.pure, pv.tier, pv.weight, pv.rarity, pv.lineCount]).toEqual([false, 2, 10, 'epic', 3]);
    expect(pv.brand.candidates).toHaveLength(1);
    expect(pv.brand.candidates[0]!.text).toMatch(/^重擊類技能傷害 \+25%/);
    expect(pv.brand.chance).toBeCloseTo(0.35);
    expect(pv.cost).toEqual({ gold: 1470, essence: 31 });
    expect(pv.warnings).toContain('投入傳奇 / 神話裝備，融合後無法復原');
  });

  it('#4 裂山（橘 22）＋三把弓（白 20、藍 21、黃 23）→ 穿核 / T3 / 紫；跨核印記；2,270 / 42', () => {
    const pv = previewFusion([legendary('axe', MOUNTAIN, 22), weapon('bow', 'normal', 20), weapon('bow', 'magic', 21), weapon('bow', 'rare', 23)], [], data);
    expect(pv.types).toEqual(['pierce']);
    expect([pv.tier, pv.rarity]).toEqual([3, 'epic']);
    expect(pv.brand.candidates[0]!.legendaryId).toBe(MOUNTAIN);
    expect(pv.cost).toEqual({ gold: 2270, essence: 42 });
  });

  it('#5 紅弓＋焚星＋寒月＋水晶杖（火焰詞綴）＋紫戒指＋橘護身符 → 靈核（火）/ T3 / 橘；印記 91% 夾到 85%；3,045 / 52', () => {
    const inputs = [
      legendary('bow', 'mythic.sky_rending_string', 30, 'mythic'),
      legendary('staff', 'legendary.star_burner', 28),
      legendary('sword', 'legendary.cold_moon', 29),
      weapon('staff', 'rare', 30, { affixes: [{ id: 'affix.burning', rolls: [0.08] }] }),
    ];
    const pv = previewFusion(inputs, [jewel('ring', 'epic'), jewel('amulet', 'legendary')], data);
    expect(pv.problems).toEqual([]);
    expect(pv.types).toEqual(['arcane']);
    expect([pv.tier, pv.weight, pv.rarity, pv.lineCount, pv.element]).toEqual([3, 28, 'legendary', 3, 'fire']);
    expect(pv.brand.jewelryBoost).toBeCloseTo(0.35);
    expect(pv.brand.candidates.map((c) => [c.legendaryId, c.chance])).toEqual([
      ['legendary.star_burner', 0.7],
      ['legendary.cold_moon', 0.7],
    ]);
    expect(pv.brand.chance).toBe(0.85);
    expect(pv.brand.capped).toBe(true);
    expect(pv.warnings).toContain('印記機率已達上限 85%');
    expect(pv.cost).toEqual({ gold: 3045, essence: 52 });
    // 武器欄：附加火焰 11.9～26.4%（6～10% × 1.32 × 1.5～2.0）
    const wpn = pv.slots.find((s) => s.slot === 'weapon')!.options[0]!.lines[0]!;
    expect(wpn.range[0]).toBeCloseTo(0.06 * 1.32 * 1.5);
    expect(wpn.range[1]).toBeCloseTo(0.1 * 1.32 * 2);
  });

  it('SPEC §2.4：騎士長劍（黃 12）＋月刃斧（藍 12）＋裂山（橘 18）＋短杖（白 1）＋黃戒指 → 重核 T2 紫；印記 45%；1,195 / 27', () => {
    const sword = weapon('sword', 'rare', 12);
    const mountain = legendary('axe', MOUNTAIN, 18);
    const pv = previewFusion(
      [sword, weapon('axe', 'magic', 12), mountain, weapon('staff', 'normal', 1)],
      [jewel('ring', 'rare')],
      data,
    );
    expect(pv.votes).toEqual({ sword: 1, axe: 2, staff: 1 });
    expect([pv.types[0], pv.tier, pv.rarity]).toEqual(['heavy', 2, 'epic']);
    expect(pv.brand.chance).toBeCloseTo(0.45);
    expect(pv.cost).toEqual({ gold: 1195, essence: 27 });
    // 權重 10（紫門檻 9）：拿掉裂山（7）或騎士長劍（黃 2）都會掉到黃；拿掉月刃斧（藍 1）或短杖（白 0）不會
    expect(pv.rarityCritical).toEqual([sword.uid, mountain.uid]);
  });
});

describe('融合預覽：規則', () => {
  it('2–2 平手 → 混核；四方平手 → 取物品等級最高的兩種', () => {
    expect(previewFusion([weapon('sword', 'normal', 5), weapon('sword', 'normal', 5), weapon('bow', 'normal', 5), weapon('bow', 'normal', 5)], [], data).types.sort()).toEqual(['pierce', 'sharp']);
    const four = previewFusion([weapon('sword', 'normal', 10), weapon('axe', 'normal', 20), weapon('bow', 'normal', 30), weapon('staff', 'normal', 5)], [], data);
    expect(four.types).toEqual(['pierce', 'heavy']);
  });

  it('核階：平均物品等級每 10 級一階，最高 T5', () => {
    const tierOf = (lv: number) => previewFusion([weapon('sword', 'normal', lv), weapon('sword', 'normal', lv)], [], data).tier;
    expect([tierOf(9), tierOf(10), tierOf(39), tierOf(40), tierOf(80)]).toEqual([1, 2, 4, 5, 5]);
  });

  it('不能融合：數量不對、放了非武器、白飾品', () => {
    expect(previewFusion([weapon('sword', 'normal', 5)], [], data).problems).toContain('請放入 2～4 把武器');
    const armor = { uid: 'a', baseId: baseOfSlot('armor'), rarity: 'normal' as const, itemLevel: 5, affixes: [] };
    expect(previewFusion([weapon('sword', 'normal', 5), armor], [], data).problems).toContain('合成區只能放武器');
    expect(previewFusion([weapon('sword', 'normal', 5), weapon('sword', 'normal', 5)], [jewel('ring', 'normal')], data).problems).toContain('普通（白）飾品不能放進飾品區');
    expect(() => fuse([weapon('sword', 'normal', 5)], [], data, new Rng(1), 'x')).toThrow();
  });

  it('紅武器沒有強屬性，不會成為印記候選', () => {
    const pv = previewFusion([legendary('bow', 'mythic.sky_rending_string', 30, 'mythic'), weapon('bow', 'rare', 30)], [], data);
    expect(pv.brand.candidates).toEqual([]);
    expect(pv.brand.chance).toBe(0);
  });
});

describe('融合擲骰', () => {
  const ex3 = () => [legendary('axe', MOUNTAIN, 18), weapon('axe', 'rare', 17), weapon('axe', 'magic', 19)];

  it('同一個種子得到同一顆熔核', () => {
    const inputs = ex3();
    expect(fuse(inputs, [], data, new Rng(42), 'c1')).toEqual(fuse(inputs, [], data, new Rng(42), 'c1'));
  });

  it('1,000 次分佈（範例 #3）：印記約 35%、核色倍率在紫 1.2～1.5、副屬性 2 條不重複、五個部位都有主屬性', () => {
    const rng = new Rng(7);
    const inputs = ex3();
    let brands = 0;
    const secondaryIds = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const core = fuse(inputs, [], data, rng, `c${i}`);
      expect(core).toMatchObject({ types: ['heavy'], tier: 2, rarity: 'epic', itemLevel: 18 });
      expect(core.power).toBeGreaterThanOrEqual(1.2);
      expect(core.power).toBeLessThanOrEqual(1.5);
      expect(core.secondary).toHaveLength(2);
      expect(new Set(core.secondary.map((s) => s.lineId)).size).toBe(2);
      for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots'] as const) expect(core.main[slot]).toHaveLength(1);
      for (const s of core.secondary) secondaryIds.set(s.lineId, (secondaryIds.get(s.lineId) ?? 0) + 1);
      if (core.brand) {
        brands++;
        expect(core.brand.legendaryId).toBe(MOUNTAIN);
      }
    }
    expect(brands / 1000).toBeGreaterThan(0.31);
    expect(brands / 1000).toBeLessThan(0.39);
    // 副屬性池：重核各部位 7 條 ＋ 通用 5 條 = 12 條，每條約 2/12
    expect(secondaryIds.size).toBe(12);
    for (const count of secondaryIds.values()) expect(count / 1000).toBeGreaterThan(0.12);
  });

  it('混核：每個部位兩條主屬性；靈核沒有元素詞綴時元素隨機（三種都會出現）', () => {
    const rng = new Rng(3);
    const elements = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const core = fuse([weapon('staff', 'normal', 5), weapon('sword', 'normal', 5)], [], data, rng, `m${i}`);
      expect(core.types).toHaveLength(2);
      expect(core.main.armor).toHaveLength(2);
      elements.add(core.element!);
    }
    expect([...elements].sort()).toEqual(['cold', 'fire', 'lightning']);
  });

  it('印記為數值類強屬性時，記下投入那件擲到的數值', () => {
    const id = 'legendary.sword_shadow_panther'; // 暴擊傷害 +22～28%（◆，數值行）
    const item = legendary('sword', id, 20);
    item.legendaryRolls = [0.1, 0.1, 0.1, 0.26];
    const pv = previewFusion([item, weapon('sword', 'normal', 20)], [], data);
    expect(pv.brand.candidates[0]).toMatchObject({ legendaryId: id, text: 'critDamageBonus' });
    expect(pv.brand.candidates[0]!.roll).toBeTypeOf('number');
  });
});
