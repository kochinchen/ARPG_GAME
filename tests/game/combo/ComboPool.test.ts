import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import type { WeaponType } from '../../../src/data/schema/item';
import { ComboResolver } from '../../../src/game/combo/ComboResolver';
import { ComboSkillIndex } from '../../../src/game/combo/ComboSkillIndex';
import { weaponDenial } from '../../../src/game/skills/skillCategory';

/**
 * v0.4.0：武器允許矩陣與戰術技能對 Combo 池的影響（數字與 SPEC_v0.4.0 §1.2 一致）。
 * 技能、標籤或規則改動造成數字變化時，先確認是刻意的，再同步更新 SPEC 與組合技圖鑑。
 */
const data = DataRegistry.load(gameData);
const resolver = new ComboResolver(data.comboRules, new ComboSkillIndex(data.skills), data.balance.combo.nearNearFarBonus);
const active = data.skills.all.filter((s) => s.tree && s.kind === 'active');
const NEW_RULES = new Set(['combo.stun_opening', 'combo.exploit_weakness', 'combo.trap_detonation']);

function pool(skills: typeof active, ruleFilter: (id: string) => boolean = () => true) {
  let total = 0;
  const hit = new Set<string>();
  for (const a of skills) for (const b of skills) for (const c of skills) {
    const r = resolver.resolve([a.id, b.id, c.id], () => 1);
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
  it('基準：原本 36 招、19 條規則可觸發 10,040 種排列', () => {
    expect(original).toHaveLength(36);
    expect(pool(original, oldRules).total).toBe(10040);
  });

  it('只套武器規則：劍斧 3,490、弓 3,287、法杖 119', () => {
    expect(pool(usable('sword', original), oldRules).total).toBe(3490);
    expect(pool(usable('axe', original), oldRules).total).toBe(3490);
    expect(pool(usable('bow', original), oldRules).total).toBe(3287);
    expect(pool(usable('staff', original), oldRules).total).toBe(119);
  });

  it('加入戰術 12 招與 3 條新規則：劍斧 10,161、弓 9,264、法杖 1,943；打不到的是刻意保留的規則', () => {
    expect(pool(usable('sword'))).toEqual({ total: 10161, dead: ['標記處決'] });
    expect(pool(usable('bow'))).toEqual({ total: 9264, dead: ['烈焰終擊', '冰霜重擊', '碎甲'] });
    expect(pool(usable('staff'))).toEqual({ total: 1943, dead: ['烈焰終擊', '冰霜重擊', '碎甲', '標記處決', '元素處決'] });
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
});
