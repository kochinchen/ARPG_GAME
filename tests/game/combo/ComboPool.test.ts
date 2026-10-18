import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { WeaponType } from '../../../src/data/schema/item';
import { ComboResolver } from '../../../src/game/combo/ComboResolver';
import { ComboSkillIndex } from '../../../src/game/combo/ComboSkillIndex';
import { weaponDenial } from '../../../src/game/skills/skillCategory';

/**
 * v0.4.0：武器允許矩陣與戰術技能對 Combo 池的影響（SPEC_v0.4.0 §1.2）。
 * 盾擊取代雙重斬後（近戰 T2，暈眩＋重擊），基準與劍斧的數字跟著改變（括號內為 SPEC 原本的數字）；弓、法杖不能用近戰，數字不變。
 * 之後再加上法術＋戰術的兩條規則（元素投擲、元素陷阱），三種武器的 Combo 池都變大，法杖最明顯。
 * 技能、標籤或規則改動造成數字變化時，先確認是刻意的，再同步更新 SPEC 與組合技圖鑑。
 */
const data = DataRegistry.load(gameData);
const resolver = new ComboResolver(data.comboRules, new ComboSkillIndex(data.skills), data.balance.combo.nearNearFarBonus);
const active = data.skills.all.filter((s) => s.tree && s.kind === 'active');
const NEW_RULES = new Set(['combo.stun_opening', 'combo.exploit_weakness', 'combo.trap_detonation', 'combo.elemental_throw', 'combo.elemental_trap']);

/** 只有原本 19 條規則的判定（v0.4.0 之前的基準；新規則不參與，避免搶走原本會成立的排列） */
const oldResolver = new ComboResolver(
  { all: data.comboRules.all.filter((r) => !NEW_RULES.has(r.id)) } as unknown as typeof data.comboRules,
  new ComboSkillIndex(data.skills),
  data.balance.combo.nearNearFarBonus,
);

function pool(skills: typeof active, ruleFilter: (id: string) => boolean = () => true) {
  const judge = ruleFilter === oldRules ? oldResolver : resolver;
  let total = 0;
  const hit = new Set<string>();
  for (const a of skills) for (const b of skills) for (const c of skills) {
    const r = judge.resolve([a.id, b.id, c.id], () => 1);
    if (r.status !== 'combo' || !ruleFilter(r.rule.id)) continue;
    total++;
    hit.add(r.rule.id);
  }
  const dead = data.comboRules.all.filter((r) => ruleFilter(r.id) && !hit.has(r.id)).map((r) => r.name);
  return { total, dead };
}
const usable = (weapon: WeaponType, skills = active) => skills.filter((s) => weaponDenial(s, weapon, data.balance.weaponRules) === null);
const original = active.filter((s) => s.tree!.category !== 'utility');
const oldRules = (id: string) => !NEW_RULES.has(id);

describe('Combo 池（SPEC_v0.4.0 §1.2）', () => {
  it('基準：36 招、只用原本 19 條規則可觸發 10,139 種排列（SPEC 10,040；差別來自盾擊取代雙重斬）', () => {
    expect(original).toHaveLength(36);
    expect(pool(original, oldRules).total).toBe(10139);
  });

  it('只套武器規則：劍斧 3,491（SPEC 3,490）、弓 3,287、法杖 119', () => {
    expect(pool(usable('sword', original), oldRules).total).toBe(3491);
    expect(pool(usable('axe', original), oldRules).total).toBe(3491);
    expect(pool(usable('bow', original), oldRules).total).toBe(3287);
    expect(pool(usable('staff', original), oldRules).total).toBe(119);
  });

  it('加入戰術 12 招與 5 條新規則：劍斧 11,610（SPEC 10,161）、弓 11,170（9,264）、法杖 3,134（1,943）；打不到的是刻意保留的規則', () => {
    expect(pool(usable('sword'))).toEqual({ total: 11610, dead: ['標記處決'] });
    expect(pool(usable('bow'))).toEqual({ total: 11170, dead: ['烈焰終擊', '冰霜重擊', '碎甲'] });
    expect(pool(usable('staff'))).toEqual({ total: 3134, dead: ['烈焰終擊', '冰霜重擊', '碎甲', '標記處決', '元素處決'] });
  });
});

describe('v0.4.0 新規則', () => {
  const ruleOf = (...ids: [string, string, string]) => {
    const r = resolver.resolve(ids, () => 1);
    return r.status === 'combo' ? r.rule.id : null;
  };

  it('破綻一擊：暈眩 → 物理 → 重擊 / 處決', () => {
    expect(ruleOf('utility.phantom_rush', 'utility.throwing_axe', 'melee.heavy_slash')).toBe('combo.stun_opening');
    expect(ruleOf('utility.shadow_step', 'utility.throwing_axe', 'melee.heavy_slash')).not.toBe('combo.stun_opening');
  });

  it('乘虛而入：弱化 → 任一有傷害 → 終結技', () => {
    expect(ruleOf('utility.flash_powder', 'utility.poison_knife', 'magic.ice_lance')).toBe('combo.exploit_weakness');
    expect(ruleOf('utility.flash_powder', 'utility.roll', 'magic.ice_lance')).not.toBe('combo.exploit_weakness');
  });

  it('佈雷引爆：遠距範圍佈置 → 位移 / 拉近 → 爆發 / 重擊 / 範圍', () => {
    expect(ruleOf('utility.powder_keg', 'utility.grapple_hook', 'magic.thunder_strike')).toBe('combo.trap_detonation');
    expect(ruleOf('utility.trip_net', 'utility.roll', 'magic.storm_core')).toBe('combo.trap_detonation');
    // 中距離的霜凍瓶不算遠距佈置
    expect(ruleOf('utility.frost_flask', 'utility.grapple_hook', 'magic.thunder_strike')).not.toBe('combo.trap_detonation');
  });

  it('元素投擲：元素 → 元素 → 物理投射物（火球 → 火球 → 淬毒飛刀），投射物帶上第一招的元素', () => {
    expect(ruleOf('magic.fireball', 'magic.fireball', 'utility.poison_knife')).toBe('combo.elemental_throw');
    expect(ruleOf('magic.ice_orb', 'magic.ice_lance', 'utility.grapple_hook')).toBe('combo.elemental_throw');
    // 兩種不同元素時由優先的雙元素附刃接手
    expect(ruleOf('magic.fireball', 'magic.ice_lance', 'utility.throwing_axe')).toBe('combo.dual_element_weapon');
  });

  it('元素陷阱：元素 → 遠距範圍機關 → 元素（冰球 → 火藥桶 → 火球），機關帶上第一招的元素', () => {
    expect(ruleOf('magic.ice_orb', 'utility.powder_keg', 'magic.fireball')).toBe('combo.elemental_trap');
    expect(ruleOf('magic.spark', 'utility.frost_mine', 'magic.thunder_strike')).toBe('combo.elemental_trap');
    const r = resolver.resolve(['magic.ice_orb', 'utility.powder_keg', 'magic.fireball'], () => 1);
    expect(r.status === 'combo' && r.modifiers.steps[1].elementDamage).toEqual([{ element: 'cold', value: 0.25 }]);
  });
});
