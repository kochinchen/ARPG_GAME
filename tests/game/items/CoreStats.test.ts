import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { CoreSlot } from '../../../src/data/schema/core';
import type { CoreInstance, CoreRoll } from '../../../src/game/items/CoreInstance';
import { coreEffects, coreLineMax, coreLineValue } from '../../../src/game/items/CoreStats';
import { coreWeaponDamage, socketBonus } from '../../../src/game/items/SocketBonus';
import { itemStats } from '../../../src/game/items/ItemStats';
import type { ItemInstance } from '../../../src/game/items/ItemInstance';
import { castRange } from '../../../src/game/skills/SkillSystem';
import { NO_MODS } from '../../../src/game/combo/StepMods';
import { createWorld } from '../helpers';

/** 熔核屬性生效（v0.5.0 P2，SPEC §1.3、§1.6、§2.3） */
const data = DataRegistry.load(gameData);
const line = (id: string) => data.cores.lines.get(id);
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

const EMPTY_MAIN: Record<CoreSlot, CoreRoll[]> = { weapon: [], helmet: [], armor: [], gloves: [], boots: [], shield: [] };
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

  it('同核鑲滿的裝備放寬它提供的屬性上限：多「孔數 × 0.5 顆」；其他配法維持 1.5 顆', () => {
    const big = core({ types: ['sharp'], tier: 5, rarity: 'legendary', power: 2, main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.sharp.crit', roll: 1 }], gloves: [{ lineId: 'core.sharp.crit_damage', roll: 1 }] } });
    const crit = (fx: ReturnType<typeof coreEffects>) => fx.stats.find((s) => s.stat === 'critChance')!.value;
    const five = (extra: { bonus?: number; matchedHoles?: number }) => Array.from({ length: 5 }, () => ({ slot: 'weapon' as const, core: big, ...extra }));
    // 沒有同核鑲滿：1.5 顆 = 21%
    close(crit(coreEffects(five({}), data)), 0.14 * 1.5);
    // 白裝 5 孔同核鑲滿：14% × 5 × 1.5 = 105%，上限 (1.5 + 2.5) 顆 = 56%
    const matched = coreEffects(five({ bonus: 1.5, matchedHoles: 5 }), data);
    close(crit(matched), 0.14 * 4);
    expect(matched.capped).toContain('暴擊率');
    // 同核鑲滿的手套不提供暴擊率：不放寬武器的暴擊率上限
    const gloves = { slot: 'gloves' as const, core: big, bonus: 1.2, matchedHoles: 2 };
    close(crit(coreEffects([...five({}), gloves], data)), 0.14 * 1.5);
    // 兩件同核鑲滿的裝備都提供暴擊率：各自放寬（1.5 + 2.5 + 1 顆）
    const helmetCrit = core({ types: ['sharp'], tier: 5, rarity: 'legendary', power: 2, main: { ...EMPTY_MAIN, helmet: [{ lineId: 'core.sharp.crit', roll: 1 }] } });
    close(crit(coreEffects([...five({ bonus: 1.5, matchedHoles: 5 }), { slot: 'helmet', core: helmetCrit, bonus: 1.2, matchedHoles: 2 }], data)), 0.14 * 5);
  });

  it('身上的白裝武器 5 孔鑲滿同一種核：暴擊率吃到放寬後的上限', () => {
    const { world } = createWorld();
    const sword = data.items.all.find((b) => b.weaponType === 'sword' && b.tier === 1)!;
    const big = core({ types: ['sharp'], tier: 5, rarity: 'legendary', power: 2, main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.sharp.crit', roll: 1 }] } });
    const before = world.player.stats.get('critChance');
    world.equipment.equip({ uid: 'w', baseId: sword.id, rarity: 'normal', itemLevel: 1, affixes: [], sockets: { max: 5, cores: [big, big, big, big, big] } });
    expect(world.player.stats.get('critChance') - (before + (sword.baseStats.critChance ?? 0))).toBeCloseTo(0.14 * 4);
    // 少鑲一顆：沒有同核鑲滿，回到 1.5 顆
    world.equipment.setSockets('weapon', { max: 5, cores: [big, big, big, big] });
    expect(world.player.stats.get('critChance') - (before + (sword.baseStats.critChance ?? 0))).toBeCloseTo(0.14 * 1.5);
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

  it('熔核不看裝備稀有度：白～橘都 ×1', () => {
    const helmetOf = (rarity: ItemInstance['rarity']) => {
      const { world, data } = createWorld();
      const helmet = data.items.all.find((b) => b.slot === 'helmet')!.id;
      const c = core({ types: ['pierce'], main: { ...EMPTY_MAIN, helmet: [{ lineId: 'core.pierce.range', roll: 1 }] } });
      world.equipment.equip(socketed(helmet, [c], rarity));
      return world.player.stats.get('projectileRange');
    };
    expect([helmetOf('normal'), helmetOf('magic'), helmetOf('rare'), helmetOf('epic'), helmetOf('legendary')].map((v) => +v.toFixed(3))).toEqual([1, 1, 1, 1, 1]);
  });

  it('同核加成：孔都鑲滿、核種相同 → 1 + 孔數 × 10%；沒鑲滿、核種不同時沒有', () => {
    const sharp = core({ types: ['sharp'] });
    const mixed = core({ types: ['sharp', 'heavy'] });
    close(socketBonus({ max: 5, cores: [sharp, sharp, { ...sharp, tier: 5 }, sharp, sharp] }, data.balance), 1.5);
    close(socketBonus({ max: 2, cores: [sharp, sharp] }, data.balance), 1.2);
    expect(socketBonus({ max: 3, cores: [sharp, sharp] }, data.balance)).toBe(1);
    expect(socketBonus({ max: 2, cores: [sharp, mixed] }, data.balance)).toBe(1);
    // 混核：兩個核種都相同（順序不拘）才算
    close(socketBonus({ max: 2, cores: [mixed, { ...mixed, types: ['heavy', 'sharp'] }] }, data.balance), 1.2);
    expect(socketBonus(undefined, data.balance)).toBe(1);
  });

  it('同核加成乘在熔核數值上（固定數值的穿透不乘）', () => {
    // T1 白核：不會撞到全身上限
    const c = core({ types: ['sharp'], main: { ...EMPTY_MAIN, boots: [{ lineId: 'core.sharp.move_speed', roll: 0.5 }] } });
    const total = (n: number, bonus: number) => coreEffects(Array.from({ length: n }, () => ({ slot: 'boots' as const, core: c, bonus })), data).stats[0]!.value;
    expect(total(2, 1.2) / total(2, 1)).toBeCloseTo(1.2);
    const pierce = core({ types: ['pierce'], main: { ...EMPTY_MAIN, weapon: [{ lineId: 'core.pierce.pierce', roll: 1 }] } });
    expect(coreEffects([{ slot: 'weapon', core: pierce, bonus: 1.5 }], data).mechanics[0]!.mechanic).toMatchObject({ mods: { pierce: 1 } });
  });

  it('鑲在武器：依核階給武器傷害 +16%～80%，和主倍率相加（法杖放大法術強度）；同核加成也乘', () => {
    expect([1, 2, 3, 4, 5].map((tier) => coreWeaponDamage({ tier }, data.balance))).toEqual([0.16, 0.32, 0.48, 0.64, 0.8]);
    const sword = data.items.all.find((b) => b.weaponType === 'sword' && b.tier === 1)!;
    const t5 = core({ types: ['sharp'], tier: 5 });
    const white = (cores: CoreInstance[], max = 5): ItemInstance => ({ uid: 'w', baseId: sword.id, rarity: 'normal', itemLevel: 1, affixes: [], sockets: { max, cores } });
    // 一顆 T5、孔沒鑲滿：+80%
    expect(itemStats(white([t5]), data).coreDamage).toBeCloseTo(0.8);
    // 五顆 T5 銳核鑲滿：80% × 5 × 同核加成 1.5 = +600%
    const five = itemStats(white([t5, t5, t5, t5, t5]), data);
    expect(five.coreDamage).toBeCloseTo(6);
    expect(five.baseStats.damageMax).toBe(Math.round(sword.baseStats.damageMax! * 7));
    // 主倍率與熔核相加
    expect(itemStats({ ...white([t5]), quality: 1 }, data).baseStats.damageMax).toBe(Math.round(sword.baseStats.damageMax! * 2.8));
    const staff = data.items.all.find((b) => b.weaponType === 'staff' && b.tier === 1)!;
    expect(itemStats({ ...white([t5]), baseId: staff.id }, data).baseStats.spellPower).toBe(Math.round(staff.baseStats.spellPower! * 1.8));
    // 防具沒有武器傷害
    const helmet = data.items.all.find((b) => b.slot === 'helmet')!;
    expect(itemStats({ ...white([t5]), baseId: helmet.id }, data).coreDamage).toBe(0);
  });

  it('身上的武器鑲上 / 取下熔核：武器傷害跟著變', () => {
    const { world } = createWorld();
    const sword = data.items.all.find((b) => b.weaponType === 'sword' && b.tier === 1)!;
    world.equipment.equip({ uid: 'w', baseId: sword.id, rarity: 'normal', itemLevel: 1, affixes: [], sockets: { max: 2, cores: [] } });
    const before = world.player.stats.get('damageMax');
    world.equipment.setSockets('weapon', { max: 2, cores: [core({ types: ['sharp'], tier: 5 })] });
    expect(world.player.stats.get('damageMax') - before).toBe(Math.round(sword.baseStats.damageMax! * 1.8) - sword.baseStats.damageMax!);
    world.equipment.setSockets('weapon', { max: 2, cores: [] });
    expect(world.player.stats.get('damageMax')).toBe(before);
  });
});
