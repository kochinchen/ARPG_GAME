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
  it('#1 短劍（白 2）＋手斧（白 3）→ 混核（銳＋重）/ T1 / 白 1 條；123 金幣 / 8 精華', () => {
    const pv = previewFusion([weapon('sword', 'normal', 2), weapon('axe', 'normal', 3)], [], data);
    expect(pv.problems).toEqual([]);
    expect(pv.types.sort()).toEqual(['heavy', 'sharp']);
    expect(pv.mixed).toBe(true);
    expect([pv.tier, pv.rarity, pv.lineCount]).toEqual([1, 'normal', 1]);
    expect(pv.brand.chance).toBe(0);
    expect(pv.cost).toMatchObject({ gold: 123, essence: 8, materials: { weaponEssence: 8 } });
    // 混核：每個部位兩個核種各一條候選，數值 ×0.7
    const weaponSlot = pv.slots.find((s) => s.slot === 'weapon')!;
    expect(weaponSlot.options.map((o) => o.type).sort()).toEqual(['heavy', 'sharp']);
    const crit = weaponSlot.options.find((o) => o.type === 'sharp')!.lines.find((l) => l.line.id === 'core.sharp.crit')!;
    expect(crit.range[0]).toBeCloseTo(0.02 * 0.7);
    expect(crit.range[1]).toBeCloseTo(0.04 * 0.7);
  });

  it('#2 四把弓（白 5、藍 8、黃 9、藍 13）→ 穿核 純 / T2 / 藍 2＋1 條（純核多一條）；頭盔欄射擊距離 0.58～1.15 格', () => {
    const pv = previewFusion([weapon('bow', 'normal', 5), weapon('bow', 'magic', 8), weapon('bow', 'rare', 9), weapon('bow', 'magic', 13)], [], data);
    expect(pv.types).toEqual(['pierce']);
    expect([pv.pure, pv.tier, pv.weight, pv.rarity, pv.lineCount]).toEqual([true, 2, 4, 'magic', 3]);
    expect(pv.next).toEqual({ rarity: 'rare', gap: 1 });
    expect(pv.cost).toMatchObject({ gold: 498, essence: 14, materials: { weaponEssence: 14 } });
    const helmet = pv.slots.find((s) => s.slot === 'helmet')!.options[0]!.lines[0]!;
    expect(helmet.line.id).toBe('core.pierce.range');
    // T2：0.5～1.0 格 × 1.15
    expect(helmet.range[0]).toBeCloseTo(0.5 * 1.15);
    expect(helmet.range[1]).toBeCloseTo(1 * 1.15);
    // 藍核抽不到「穿透 +1」（紫以上）
    expect(pv.slots.find((s) => s.slot === 'weapon')!.options[0]!.lines.map((l) => l.line.id)).toEqual(['core.pierce.projectile_speed']);
    expect(pv.secondary.map((s) => s.line.id)).not.toContain('core.pierce.pierce');
    expect(pv.secondary.map((s) => s.line.id)).not.toContain('core.pierce.projectile_speed');
  });

  it('#3 裂山（橘 18）＋鐵斧（黃 17）＋月刃斧（藍 19）→ 重核 / T3 / 紫 3 條；印記 35%；735 / 16', () => {
    const pv = previewFusion([legendary('axe', MOUNTAIN, 18), weapon('axe', 'rare', 17), weapon('axe', 'magic', 19)], [], data);
    expect(pv.types).toEqual(['heavy']);
    expect([pv.pure, pv.tier, pv.weight, pv.rarity, pv.lineCount]).toEqual([false, 3, 10, 'epic', 3]);
    expect(pv.brand.candidates).toHaveLength(1);
    expect(pv.brand.candidates[0]!.text).toMatch(/^重擊類技能傷害 \+25%/);
    expect(pv.brand.chance).toBeCloseTo(0.35);
    expect(pv.cost).toMatchObject({ gold: 735, essence: 16, materials: { weaponEssence: 16 } });
    expect(pv.warnings).toContain('投入傳奇 / 神話裝備，融合後無法復原');
  });

  it('#4 裂山（橘 22）＋三把弓（白 20、藍 21、黃 23）→ 穿核 / T3 / 紫；跨核印記；1,135 / 22', () => {
    const pv = previewFusion([legendary('axe', MOUNTAIN, 22), weapon('bow', 'normal', 20), weapon('bow', 'magic', 21), weapon('bow', 'rare', 23)], [], data);
    expect(pv.types).toEqual(['pierce']);
    expect([pv.tier, pv.rarity]).toEqual([3, 'epic']);
    expect(pv.brand.candidates[0]!.legendaryId).toBe(MOUNTAIN);
    expect(pv.cost).toMatchObject({ gold: 1135, essence: 22, materials: { weaponEssence: 22 } });
  });

  it('#5 紅弓＋焚星＋寒月＋水晶杖（火焰詞綴）＋紫戒指＋橘護身符 → 靈核（火）/ T4 / 橘；印記 91% 夾到 85%；1,523 / 26', () => {
    const inputs = [
      legendary('bow', 'mythic.sky_rending_string', 30, 'mythic'),
      legendary('staff', 'legendary.star_burner', 28),
      legendary('sword', 'legendary.cold_moon', 29),
      weapon('staff', 'rare', 30, { affixes: [{ id: 'affix.burning', rolls: [0.08] }] }),
    ];
    const pv = previewFusion(inputs, [jewel('ring', 'epic'), jewel('amulet', 'legendary')], data);
    expect(pv.problems).toEqual([]);
    expect(pv.types).toEqual(['arcane']);
    expect([pv.tier, pv.weight, pv.rarity, pv.lineCount, pv.element]).toEqual([4, 28, 'legendary', 3, 'fire']);
    expect(pv.brand.jewelryBoost).toBeCloseTo(0.35);
    expect(pv.brand.candidates.map((c) => [c.legendaryId, c.chance])).toEqual([
      ['legendary.star_burner', 0.7],
      ['legendary.cold_moon', 0.7],
    ]);
    expect(pv.brand.chance).toBe(0.85);
    expect(pv.brand.capped).toBe(true);
    expect(pv.warnings).toContain('印記機率已達上限 85%');
    expect(pv.cost).toMatchObject({ gold: 1523, essence: 26, materials: { weaponEssence: 26 } });
    // 武器欄：附加火焰 13.7～30.4%（6～10% × T4 1.52 × 1.5～2.0）
    const wpn = pv.slots.find((s) => s.slot === 'weapon')!.options[0]!.lines[0]!;
    expect(wpn.range[0]).toBeCloseTo(0.06 * 1.52 * 1.5);
    expect(wpn.range[1]).toBeCloseTo(0.1 * 1.52 * 2);
  });

  it('SPEC §2.4：騎士長劍（黃 12）＋月刃斧（藍 12）＋裂山（橘 18）＋短杖（白 1）＋黃戒指 → 重核 T2 紫；印記 45%；598 / 14', () => {
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
    expect(pv.cost).toMatchObject({ gold: 598, essence: 14, materials: { weaponEssence: 14 } });
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

  it('核階：平均物品等級每 8 級一階（32 以上 T5），最高 T5；與詞綴階級（每 10 級）分開', () => {
    const tierOf = (lv: number) => previewFusion([weapon('sword', 'normal', lv), weapon('sword', 'normal', lv)], [], data).tier;
    expect([tierOf(7), tierOf(8), tierOf(31), tierOf(32), tierOf(80)]).toEqual([1, 2, 4, 5, 5]);
    expect(data.balance.affixPower.levelsPerTier).toBe(10);
  });

  it('不能融合：數量不對、合成區放了飾品、白飾品', () => {
    expect(previewFusion([weapon('sword', 'normal', 5)], [], data).problems).toContain('請放入 2～4 件裝備');
    const ring = { uid: 'r', baseId: baseOfSlot('ring'), rarity: 'magic' as const, itemLevel: 5, affixes: [] };
    expect(previewFusion([weapon('sword', 'normal', 5), ring], [], data).problems).toContain('合成區不能放戒指或護身符');
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
      expect(core).toMatchObject({ types: ['heavy'], tier: 3, rarity: 'epic', itemLevel: 18 });
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
    // 副屬性池：重核在武器以外的部位 5 條 ＋ 通用 5 條，藥水效果重複只算一次 = 9 條，每條約 2/9；不會抽到武器欄的屬性
    expect(secondaryIds.size).toBe(9);
    for (const count of secondaryIds.values()) expect(count / 1000).toBeGreaterThan(0.17);
    expect([...secondaryIds.keys()]).not.toContain('core.shared.potion');
    expect([...secondaryIds.keys()]).not.toContain('core.heavy.heavy_damage');
    expect([...secondaryIds.keys()]).not.toContain('core.heavy.knockback');
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

describe('防具融合（2026-10-18 提前到 v0.5.0）', () => {
  const gear = (slot: string, rarity: Rarity, itemLevel: number, extra: Partial<ItemInstance> = {}): ItemInstance => ({ uid: `${slot}-${n++}`, baseId: baseOfSlot(slot), rarity, itemLevel, affixes: [], ...extra });

  it('防具依部位決定護核：鞋子 → 疾核、手套 → 掌核、頭盔 → 冠核、盔甲與盾牌 → 壁核；付防具精華', () => {
    expect(previewFusion([gear('boots', 'rare', 20), gear('boots', 'magic', 20)], [], data).types).toEqual(['swift']);
    expect(previewFusion([gear('gloves', 'rare', 20), gear('gloves', 'magic', 20)], [], data).types).toEqual(['grip']);
    expect(previewFusion([gear('helmet', 'rare', 20), gear('helmet', 'magic', 20)], [], data).types).toEqual(['crown']);
    const wall = previewFusion([gear('armor', 'rare', 20), gear('armor', 'rare', 20), gear('shield', 'magic', 20), gear('shield', 'magic', 20)], [], data);
    expect(wall.types).toEqual(['wall']);
    expect(wall.mixed).toBe(false);
    // 盔甲與盾牌同屬壁核，但不是同一類 → 不是純核
    expect(wall.pure).toBe(false);
    expect(wall.cost.materials).toEqual({ armorEssence: wall.cost.essence });
  });

  it('純核：四件鞋子 → 屬性多一條', () => {
    const pv = previewFusion([0, 1, 2, 3].map(() => gear('boots', 'epic', 30)), [], data);
    expect([pv.pure, pv.rarity, pv.lineCount]).toEqual([true, 'legendary', 4]);
  });

  it('武器與防具混放：多數決；2 弓＋2 鞋子 → 混核（穿＋疾），精華各付一半', () => {
    const three = previewFusion([weapon('sword', 'rare', 20), weapon('sword', 'rare', 20), weapon('sword', 'rare', 20), gear('armor', 'rare', 20)], [], data);
    expect(three.types).toEqual(['sharp']);
    expect(three.cost.materials).toEqual({ weaponEssence: three.cost.essence });
    const mix = previewFusion([weapon('bow', 'rare', 20), weapon('bow', 'rare', 20), gear('boots', 'rare', 20), gear('boots', 'rare', 20)], [], data);
    expect(mix.types.sort()).toEqual(['pierce', 'swift']);
    expect(mix.cost.materials).toEqual({ weaponEssence: Math.ceil(mix.cost.essence / 2), armorEssence: Math.ceil(mix.cost.essence / 2) });
  });

  it('冠核的元素：投入防具上最多的元素抗性詞綴', () => {
    const fireHelm = gear('helmet', 'rare', 20, { affixes: [{ id: 'affix.fireproof', rolls: [0.08] }] });
    const pv = previewFusion([fireHelm, gear('helmet', 'magic', 20)], [], data);
    expect([pv.types[0], pv.hasElement, pv.element]).toEqual(['crown', true, 'fire']);
  });

  it('副屬性不抽護核的武器欄屬性；擲出的熔核五個部位都有主屬性', () => {
    const inputs = [0, 1, 2].map(() => gear('gloves', 'epic', 30));
    const pv = previewFusion(inputs, [], data);
    expect(pv.secondary.map((x) => x.line.id)).not.toContain('core.grip.crit_damage');
    const core = fuse(inputs, [], data, new Rng(9), 'g1');
    expect(core.types).toEqual(['grip']);
    for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots'] as const) expect(core.main[slot]).toHaveLength(1);
  });

  it('橘色防具的強屬性也能成為印記', () => {
    const def = data.legendaries.all.find((d) => d.rarity === 'legendary' && d.kind === 'boots' && d.lines.some((l) => l.strong))!;
    const pv = previewFusion([gear('boots', 'legendary', 25, { legendaryId: def.id }), gear('boots', 'rare', 25)], [], data);
    expect(pv.brand.candidates.map((c) => c.legendaryId)).toEqual([def.id]);
  });
});
