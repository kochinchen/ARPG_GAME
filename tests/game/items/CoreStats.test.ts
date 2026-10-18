import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { CoreSlot } from '../../../src/data/schema/core';
import type { CoreInstance, CoreRoll } from '../../../src/game/items/CoreInstance';
import { coreEffects, coreLineMax, coreLineValue } from '../../../src/game/items/CoreStats';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import { castRange } from '../../../src/game/skills/SkillSystem';
import { NO_MODS } from '../../../src/game/combo/StepMods';
import { createWorld } from '../helpers';

/** 熔核屬性生效（v0.5.0 P2，SPEC §1.3、§1.6、§2.3） */
const data = DataRegistry.load(gameData);
const line = (id: string) => data.cores.lines.get(id);
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

const EMPTY_MAIN: Record<CoreSlot, CoreRoll[]> = { weapon: [], helmet: [], armor: [], gloves: [], boots: [] };
function core(over: Partial<CoreInstance> & Pick<CoreInstance, 'types'>): CoreInstance {
  return { uid: 'c', tier: 1, rarity: 'normal', power: 1, itemLevel: 1, main: { ...EMPTY_MAIN }, secondary: [], ...over };
}
const strongIndex = (id: string) => data.legendaries.get(id).lines.findIndex((l) => l.strong);

describe('熔核數值', () => {
  it('T1 範圍 × 核階倍率 × 核色倍率；混核主屬性再 ×0.7', () => {
    const crit = line('core.sharp.crit'); // T1 2～4%
    close(coreLineValue(crit, { tier: 1, power: 1 }, 0.5, data.balance), 0.03);
    close(coreLineValue(crit, { tier: 3, power: 1.3 }, 1, data.balance), 0.04 * 1.32 * 1.3);
    close(coreLineValue(crit, { tier: 1, power: 1 }, 1, data.balance, true), 0.04 * 0.7);
  });

  it('射擊距離 T5 改用 +1.5～2.0 格；穿透 +1 固定不乘倍率', () => {
    close(coreLineValue(line('core.pierce.range'), { tier: 4, power: 1 }, 1, data.balance), 1 * 1.52);
    close(coreLineValue(line('core.pierce.range'), { tier: 5, power: 1 }, 0, data.balance), 1.5);
    expect(coreLineValue(line('core.pierce.pierce'), { tier: 5, power: 2 }, 1, data.balance)).toBe(1);
  });

  it('全身上限的基準：一顆 T5 橘核的最高值（暴擊率 4% × 1.75 × 2.0 = 14%）', () => {
    close(coreLineMax(line('core.sharp.crit'), data.balance), 0.14);
  });
});

describe('全身熔核效果', () => {
  it('同一條屬性合計超過「T5 橘核最高值 × 1.5」時夾到上限，並標示已達上限', () => {
    const big = core({ types: ['sharp'], tier: 5, rarity: 'legendary', power: 2, main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.sharp.crit', roll: 1 }] } });
    const fx = coreEffects([{ slot: 'weapon', core: big }, { slot: 'weapon', core: { ...big, uid: 'd' } }], data);
    const crit = fx.stats.find((s) => s.stat === 'critChance')!;
    close(crit.value, 0.14 * 1.5);
    expect(fx.capped).toContain('暴擊率');
  });

  it('主屬性依部位：同一顆銳核在鞋子給移動速度、在武器給暴擊率；副屬性不分部位', () => {
    const c = core({
      types: ['sharp'],
      main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.sharp.crit', roll: 0 }], boots: [{ lineId: 'core.sharp.move_speed', roll: 0 }] },
      secondary: [{ lineId: 'core.shared.max_hp', roll: 0 }],
    });
    const boots = coreEffects([{ slot: 'boots', core: c }], data).stats;
    expect(boots).toEqual([
      { stat: 'moveSpeed', kind: 'increased', value: 0.03 },
      { stat: 'maxHp', kind: 'increased', value: 0.03 },
    ]);
  });

  it('靈核的元素存在核上：衣裝欄給該元素的抗性', () => {
    const c = core({ types: ['arcane'], element: 'cold', main: { ...EMPTY_MAIN, armor: [{ lineId: 'core.arcane.element_resist', roll: 1 }] } });
    expect(coreEffects([{ slot: 'armor', core: c }], data).stats).toEqual([{ stat: 'coldResist', kind: 'flat', value: 0.1 }]);
  });

  it('技能加成類（重擊類技能傷害）交給裝備效果系統', () => {
    const c = core({ types: ['heavy'], main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.heavy.heavy_damage', roll: 1 }] } });
    const fx = coreEffects([{ slot: 'weapon', core: c }], data);
    expect(fx.stats).toEqual([]);
    expect(fx.mechanics).toHaveLength(1);
    expect(fx.mechanics[0]!.mechanic).toMatchObject({ type: 'mods', when: { tags: ['Heavy'] }, mods: { damage: 0.12 } });
  });
});

describe('印記', () => {
  it('強屬性 × 0.7：焚星「火球傷害 +30%」→ +21%；兩顆相同印記合計夾到單顆 × 1.5', () => {
    const brand = { legendaryId: 'legendary.star_burner', line: strongIndex('legendary.star_burner') };
    const one = core({ types: ['arcane'], brand });
    const fx1 = coreEffects([{ slot: 'weapon', core: one }], data);
    expect(fx1.mechanics[0]!.mechanic).toMatchObject({ type: 'mods', when: { skills: ['magic.fireball'] } });
    close((fx1.mechanics[0]!.mechanic as { mods: { damage: number } }).mods.damage, 0.21);
    const fx2 = coreEffects([{ slot: 'weapon', core: one }, { slot: 'helmet', core: { ...one, uid: 'd' } }], data);
    close((fx2.mechanics[0]!.mechanic as { mods: { damage: number } }).mods.damage, 0.21 * 1.5);
    expect(fx2.capped).toContain('火球傷害 +30%');
  });

  it('整數類四捨五入、至少 1：散射多射出 2 支箭 → 1 支', () => {
    const id = 'legendary.bow_spine_hound';
    const fx = coreEffects([{ slot: 'weapon', core: core({ types: ['pierce'], brand: { legendaryId: id, line: strongIndex(id) } }) }], data);
    expect(fx.mechanics[0]!.mechanic).toMatchObject({ type: 'mods', mods: { projectileCount: 1 } });
  });

  it('數值類強屬性用投入那件擲到的數值 × 0.7', () => {
    const id = 'legendary.sword_shadow_panther'; // 暴擊傷害 +22～28%（◆）
    const fx = coreEffects([{ slot: 'armor', core: core({ types: ['sharp'], brand: { legendaryId: id, line: strongIndex(id), roll: 0.25 } }) }], data);
    expect(fx.stats).toHaveLength(1);
    expect(fx.stats[0]!.stat).toBe('critDamageBonus');
    close(fx.stats[0]!.value, 0.175);
  });

  it('不是強屬性的行（傳奇效果 ✦）不會變成印記', () => {
    const def = data.legendaries.get('legendary.star_burner');
    const unique = def.lines.findIndex((l) => l.type === 'effect' && l.unique);
    const fx = coreEffects([{ slot: 'weapon', core: core({ types: ['arcane'], brand: { legendaryId: def.id, line: unique } }) }], data);
    expect(fx.mechanics).toEqual([]);
    expect(fx.stats).toEqual([]);
  });
});

describe('裝備上的熔核', () => {
  // 紫裝：熔核倍率 1（白 0.5 … 橘 1.25 另有測試）
  const socketed = (baseId: string, cores: CoreInstance[], rarity: ItemInstance['rarity'] = 'epic'): ItemInstance => ({ uid: baseId, baseId, rarity, itemLevel: 10, affixes: [], sockets: { max: 2, cores } });

  it('穿上帶熔核的頭盔：射擊距離加到角色身上，投射物技能施放距離變長；脫下後移除', () => {
    const { world, data } = createWorld();
    const helmet = data.items.all.find((b) => b.slot === 'helmet')!.id;
    const range = core({ types: ['pierce'], main: { ...EMPTY_MAIN, helmet: [{ lineId: 'core.pierce.range', roll: 1 }] } });
    const quickShot = data.skills.get('ranged.quick_shot');
    const before = castRange(world.player, quickShot);
    const heavy = data.skills.get('melee.heavy_slash');
    const meleeBefore = castRange(world.player, heavy);
    world.equipment.equip(socketed(helmet, [range]));
    expect(world.player.stats.get('projectileRange')).toBeCloseTo(1);
    expect(castRange(world.player, quickShot)).toBeCloseTo(before + 1);
    expect(castRange(world.player, data.skills.get('utility.frost_flask'))).toBeCloseTo(data.skills.get('utility.frost_flask').range! + 1);
    expect(castRange(world.player, heavy)).toBe(meleeBefore);
    world.equipment.unequip('helmet');
    expect(world.player.stats.get('projectileRange')).toBe(0);
  });

  it('武器上的重核：重擊類技能施放時得到傷害加成，其他技能沒有', () => {
    const { world, data } = createWorld();
    const sword = data.items.all.find((b) => b.weaponType === 'sword')!.id;
    const heavy = core({ types: ['heavy'], main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.heavy.heavy_damage', roll: 1 }] } });
    world.equipment.equip(socketed(sword, [heavy]));
    const modsOf = (id: string) => world.itemEffects.modsFor(world.player, data.skills.get(id), NO_MODS).mods.damage;
    expect(modsOf('melee.heavy_slash')).toBeCloseTo(0.12);
    expect(modsOf('melee.quick_slash')).toBe(0);
    // 拆掉熔核（鑲嵌 / 拆卸在 P4）後重算：加成消失
    world.equipment.get('weapon')!.sockets!.cores = [];
    world.equipment.refreshCores();
    expect(modsOf('melee.heavy_slash')).toBe(0);
  });

  it('熔核強度跟著裝備稀有度：白 ×0.5、藍 ×0.6、黃 ×0.75、紫 ×1、橘 ×1.25（固定數值的穿透不乘）', () => {
    const helmetOf = (rarity: ItemInstance['rarity']) => {
      const { world, data } = createWorld();
      const helmet = data.items.all.find((b) => b.slot === 'helmet')!.id;
      const c = core({ types: ['pierce'], main: { ...EMPTY_MAIN, helmet: [{ lineId: 'core.pierce.range', roll: 1 }] } });
      world.equipment.equip(socketed(helmet, [c], rarity));
      return world.player.stats.get('projectileRange');
    };
    expect([helmetOf('normal'), helmetOf('magic'), helmetOf('rare'), helmetOf('epic'), helmetOf('legendary')].map((v) => +v.toFixed(3))).toEqual([0.5, 0.6, 0.75, 1, 1.25]);
    const pierce = core({ types: ['pierce'], main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.pierce.pierce', roll: 1 }] } });
    expect(coreEffects([{ slot: 'weapon', core: pierce, host: 0.5 }], data).mechanics[0]!.mechanic).toMatchObject({ mods: { pierce: 1 } });
  });

  it('白裝 5 孔 × 0.5 比不上紫裝 2 孔：同樣的熔核，白裝的合計約為紫裝的 1.25 倍而非 2.5 倍', () => {
    // T1 白核：不會撞到全身上限
    const c = core({ types: ['sharp'], main: { ...EMPTY_MAIN, boots: [{ lineId: 'core.sharp.move_speed', roll: 0.5 }] } });
    const total = (n: number, host: number) => coreEffects(Array.from({ length: n }, () => ({ slot: 'boots' as const, core: c, host })), data).stats[0]!.value;
    expect(total(5, 0.5) / total(2, 1)).toBeCloseTo(1.25);
  });
});

