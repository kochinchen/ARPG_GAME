import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { CoreSlot } from '../../../src/data/schema/core';
import type { CoreInstance, CoreRoll } from '../../../src/game/items/CoreInstance';
import { coreLineText, coreName, coreRangeText, describeCore, socketLines } from '../../../src/game/items/CoreDescriber';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';

/** 熔核與孔位的說明文字（v0.5.0 P7） */
const data = DataRegistry.load(gameData);
const line = (id: string) => data.cores.lines.get(id);
const EMPTY: Record<CoreSlot, CoreRoll[]> = { weapon: [], helmet: [], armor: [], gloves: [], boots: [], shield: [] };
const core = (over: Partial<CoreInstance> = {}): CoreInstance => ({
  uid: 'c',
  types: ['sharp'],
  tier: 1,
  rarity: 'epic',
  power: 1.5,
  itemLevel: 10,
  main: { ...EMPTY, weapon: [{ lineId: 'core.sharp.crit', roll: 1 }], boots: [{ lineId: 'core.sharp.move_speed', roll: 0 }] },
  secondary: [{ lineId: 'core.shared.max_hp', roll: 1 }],
  ...over,
});

describe('熔核說明', () => {
  it('名稱：單一核種、靈核帶元素、混核', () => {
    expect(coreName(core(), data)).toBe('銳核');
    expect(coreName(core({ types: ['arcane'], element: 'fire' }), data)).toBe('靈核（火）');
    expect(coreName(core({ types: ['sharp', 'heavy'] }), data)).toBe('混核（銳＋重）');
  });

  it('屬性文字：百分比、技能加成、穿透、射擊距離、元素', () => {
    expect(coreLineText(line('core.sharp.crit'), 0.06, undefined)).toBe('+6% 暴擊率');
    expect(coreLineText(line('core.heavy.heavy_damage'), 0.12, undefined)).toBe('+12% 重擊類技能傷害');
    expect(coreLineText(line('core.pierce.pierce'), 1, undefined)).toBe('+1 投射物穿透');
    expect(coreLineText(line('core.pierce.range'), 0.8, undefined)).toBe('+0.8 格射擊距離');
    expect(coreLineText(line('core.arcane.element_resist'), 0.1, 'cold')).toBe('+10% 冰寒抗性');
  });

  it('範圍文字（融合預覽）', () => {
    expect(coreRangeText(line('core.sharp.crit'), [0.024, 0.06], null)).toBe('+2.4～6% 暴擊率');
    expect(coreRangeText(line('core.pierce.pierce'), [1, 1], null)).toBe('+1 投射物穿透');
  });

  it('各部位的主屬性、副屬性、印記', () => {
    const d = describeCore(core({ brand: { legendaryId: 'legendary.star_burner', line: 3 } }), data);
    expect(d.subtitle).toBe('史詩熔核 · T1');
    // 武器：先列依核階的武器傷害（T1 16%）
    expect(d.slots.find((s) => s.slot === 'weapon')!.texts).toEqual(['+16% 武器傷害', '+6% 暴擊率']);
    expect(d.slots.find((s) => s.slot === 'boots')!.texts).toEqual(['+4.5% 移動速度']);
    expect(d.secondary).toEqual(['+9% 生命上限']);
    expect(d.brand).toBe('印記（焚星）：火球傷害 +30% × 0.7');
  });

  it('裝備的孔位列：熔核在這個部位的效果與空孔', () => {
    const helmet = data.items.all.find((b) => b.slot === 'helmet')!.id;
    const item: ItemInstance = { uid: 'h', baseId: helmet, rarity: 'magic', itemLevel: 5, affixes: [], sockets: { max: 2, cores: [core({ main: { ...EMPTY, helmet: [{ lineId: 'core.sharp.cast_speed', roll: 0 }] } })] } };
    // 不看裝備稀有度：藍裝與紫裝一樣
    expect(socketLines(item, data)).toEqual([
      { text: '◆ 銳核 T1：+6% 施法速度、+9% 生命上限', rarity: 'epic' },
      { text: '◇ 空孔', rarity: null },
    ]);
    // 孔都鑲滿同一種核：同核加成 1 + 2 × 10%
    const full = { ...item, sockets: { max: 2, cores: [item.sockets!.cores[0]!, { ...item.sockets!.cores[0]!, uid: 'c2', tier: 3 }] } };
    expect(socketLines(full, data).map((l) => l.text)).toEqual([
      '◆ 銳核 T1：+7.2% 施法速度、+10.8% 生命上限',
      '◆ 銳核 T3：+9.5% 施法速度、+14.3% 生命上限',
      '同核加成（2 孔都是銳核）：熔核數值 ×1.2',
    ]);
    // 武器（法杖寫成法術強度）
    const staff = data.items.all.find((b) => b.weaponType === 'staff')!.id;
    expect(socketLines({ ...item, baseId: staff, sockets: { max: 1, cores: [core({ main: { ...EMPTY } , secondary: [] })] } }, data)[0]!.text).toBe('◆ 銳核 T1：+18% 法術強度');
    expect(socketLines({ ...item, sockets: undefined } as never, data)).toEqual([]);
  });
});
