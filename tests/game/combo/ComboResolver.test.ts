import { describe, expect, it } from 'vitest';
import { gameData } from '../../../src/data';
import { DataRegistry } from '../../../src/data/DataRegistry';
import { isRangeSequenceValid, type RangeType } from '../../../src/data/schema/combo';
import { levelFactor } from '../../../src/game/combo/ComboModifierFactory';
import { ComboResolver, matches } from '../../../src/game/combo/ComboResolver';
import { ComboSkillIndex, type ComboProfile } from '../../../src/game/combo/ComboSkillIndex';

const data = DataRegistry.load(gameData);
const index = new ComboSkillIndex(data.skills);
const resolver = new ComboResolver(data.comboRules, index);
const resolve = (ids: string[], ranks: Record<string, number> = {}) => resolver.resolve(ids, (id) => ranks[id] ?? 1);

// 技能代號（對照 docs/COMBO_SYSTEM.md 第 9 節）
const S = {
  HS: 'melee.heavy_slash', AB: 'melee.armor_break', EB: 'melee.earth_break', DV: 'melee.devastator',
  QS: 'melee.quick_slash', DS: 'melee.double_slash', PB: 'melee.phantom_blades',
  GS: 'melee.guard_stance', SB: 'melee.shield_bash', IW: 'melee.iron_will',
  QSh: 'ranged.quick_shot', CS: 'ranged.charge_shot', WP: 'ranged.weak_point', ES: 'ranged.execution_shot',
  PS: 'ranged.piercing_shot', SS: 'ranged.spread_shot', RF: 'ranged.rapid_fire', RA: 'ranged.rain_of_arrows',
  BS: 'ranged.backstep_shot', RS: 'ranged.roll_shot',
  FB: 'magic.fireball', FBu: 'magic.flame_burst', MT: 'magic.meteor',
  IO: 'magic.ice_orb', IL: 'magic.ice_lance', FN: 'magic.frost_nova', AZ: 'magic.absolute_zero',
  SK: 'magic.spark', CL: 'magic.chain_lightning', TS: 'magic.thunder_strike', SC: 'magic.storm_core',
} as const;

/** 驗證「同時也符合」的規則，證明 Priority 衝突確實存在 */
function alsoMatches(ids: string[], ruleId: string): boolean {
  const profiles = ids.map((id) => index.get(id)!) as [ComboProfile, ComboProfile, ComboProfile];
  return matches(data.comboRules.get(ruleId), profiles);
}

describe('Range 驗證', () => {
  const all: RangeType[] = ['Near', 'Mid', 'Far'];
  it('27 種排列中只有 Near→Far→Near、Far→Near→Far 不合理', () => {
    const invalid = all.flatMap((a) => all.flatMap((b) => all.flatMap((c) => (isRangeSequenceValid(a, b, c) ? [] : [`${a}-${b}-${c}`]))));
    expect(invalid).toEqual(['Near-Far-Near', 'Far-Near-Far']);
  });
});

describe('ComboResolver：規格測試案例 T01～T26', () => {
  type Expect = { rule?: string; reason?: string; name?: string; step3?: Record<string, number>; also?: string[] };
  const cases: [string, string[], Expect][] = [
    ['T01 Exact Secret', [S.HS, S.HS, S.FB], { rule: 'combo.flame_finisher', name: '烈焰終擊 · 巨型火球', step3: { damage: 0.3, aoeRadius: 0.4, projectileSize: 0.3 }, also: ['combo.heavy_chain_finisher'] }],
    ['T02 Generic Tag', [S.AB, S.EB, S.QSh], { rule: 'combo.heavy_chain_finisher', step3: { damage: 0.25, projectileSize: 0.25, aoeRadius: 0.3 } }],
    ['T03 Triple Same', [S.FB, S.FB, S.FB], { reason: 'tripleSame' }],
    ['T04 Triple Same（本會符合 R14）', [S.PB, S.PB, S.PB], { reason: 'tripleSame', also: ['combo.rapid_finisher'] }],
    ['T05 Near-Far-Near', [S.HS, S.FB, S.HS], { reason: 'invalidRange' }],
    ['T06 Far-Near-Far', [S.FB, S.HS, S.IO], { reason: 'invalidRange' }],
    ['T07 Near-Mid-Far', [S.HS, S.BS, S.FB], { rule: 'combo.tactical_retreat', step3: { damage: 0.2, projectileSpeed: 0.25, aoeRadius: 0.15 } }],
    ['T08 Far-Mid-Near（含 Mark）', [S.WP, S.SB, S.DV], { rule: 'combo.hunter_rush', step3: { damage: 0.25, crit: 0.25 } }],
    ['T09 火系三連', [S.FB, S.FBu, S.MT], { rule: 'combo.inferno', step3: { damage: 0.25, burn: 0.25, aoeRadius: 0.2 } }],
    ['T10 冰系三連', [S.IO, S.IL, S.FN], { rule: 'combo.deep_freeze', step3: { damage: 0.2, freezeChance: 0.2, freezeDuration: 0.2 } }],
    ['T11 同元素但有重複', [S.FB, S.FB, S.MT], { reason: 'noRule' }],
    ['T12 雷系三連', [S.SK, S.TS, S.CL], { rule: 'combo.storm_surge', step3: { damage: 0.2, chainCount: 1, statusChance: 0.15 } }],
    ['T13 跨系 + Priority 衝突', [S.IO, S.SB, S.DV], { rule: 'combo.frozen_impact', step3: { damage: 0.3, knockback: 0.8 }, also: ['combo.control_rush', 'combo.hunter_rush'] }],
    ['T15 兩同一異 + 同層衝突', [S.DS, S.DS, S.HS], { rule: 'combo.fast_momentum', step3: { damage: 0.2, animationSpeed: 0.15, crit: 0.1 }, also: ['combo.rapid_finisher'] }],
    ['T16 跨層衝突（Tier 3 > 5）', [S.AB, S.EB, S.CS], { rule: 'combo.armor_crusher', step3: { armorPenetration: 0.25, damage: 0.2 }, also: ['combo.heavy_chain_finisher'] }],
    ['T17 跨層衝突（Tier 2 > 5）', [S.CL, S.SC, S.TS], { rule: 'combo.storm_surge', step3: { damage: 0.2 }, also: ['combo.rapid_finisher'] }],
    ['T18 Generic（第三招無投射物 → 命中次數）', [S.PS, S.SS, S.RA], { rule: 'combo.piercing_barrage', step3: { aoeRadius: 0.25, hitCount: 1, projectileCount: 0, damage: 0.15 } }],
    ['T19 Mid 開頭', [S.RS, S.HS, S.DV], { rule: 'combo.momentum_strike', step3: { damage: 0.2, knockback: 0.3 } }],
    ['T20 合理但無規則', [S.GS, S.IW, S.GS], { reason: 'noRule' }],
    ['T21 未滿三格', [S.HS, S.FB], { reason: 'tooShort' }],
    ['T22 Hits 條件加成', [S.SS, S.RF, S.ES], { rule: 'combo.rapid_finisher', step3: { damage: 0.3, crit: 0.15 } }],
    ['T24 同元素但排列不合理', [S.FN, S.IO, S.AZ], { reason: 'invalidRange' }],
    ['T25 Status Setup', [S.IO, S.WP, S.ES], { rule: 'combo.elemental_execution', step3: { damage: 0.2 } }],
    ['T26 Guard 路線', [S.GS, S.SB, S.HS], { rule: 'combo.guard_counterattack', step3: { damage: 0.25 } }],
  ];

  for (const [title, ids, expected] of cases) {
    it(title, () => {
      const r = resolve(ids);
      expect(r.steps).toEqual(ids); // 無論結果如何，技能都照常施放
      if (expected.reason) {
        expect(r).toMatchObject({ status: 'none', reason: expected.reason });
      } else {
        expect(r.status).toBe('combo');
        if (r.status !== 'combo') return;
        expect(r.rule.id).toBe(expected.rule);
        if (expected.name) expect(r.displayName).toBe(expected.name);
        for (const [key, value] of Object.entries(expected.step3 ?? {})) {
          expect(r.modifiers.steps[2][key as 'damage'], key).toBeCloseTo(value);
        }
      }
      for (const other of expected.also ?? []) expect(alsoMatches(ids, other), `也符合 ${other}`).toBe(true);
    });
  }

  it('T14 跨系：元素附刃，第二、三招追加第一招的元素傷害', () => {
    const r = resolve([S.FB, S.QS, S.DS]);
    expect(r.status === 'combo' && r.rule.id).toBe('combo.elemental_weapon');
    if (r.status !== 'combo') return;
    expect(r.modifiers.steps[1].elementDamage).toEqual([{ element: 'fire', value: 0.15 }]);
    expect(r.modifiers.steps[2].elementDamage).toEqual([{ element: 'fire', value: 0.25 }]);
    expect(r.modifiers.steps[0].elementDamage).toEqual([]);
  });

  it('T23 LevelFactor：第三招火球 Lv5 → 加成 × 1.4，顯示名稱替換為巨型火球', () => {
    const r = resolve([S.AB, S.EB, S.FB], { [S.FB]: 5 });
    expect(r.status === 'combo' && r.rule.id).toBe('combo.heavy_chain_finisher');
    if (r.status !== 'combo') return;
    expect(r.displayName).toBe('巨型火球');
    expect(r.modifiers.steps[2].damage).toBeCloseTo(0.35);
    expect(r.modifiers.steps[2].projectileSize).toBeCloseTo(0.35);
    expect(r.modifiers.steps[2].aoeRadius).toBeCloseTo(0.42);
  });

  it('LevelFactor：Lv1～Lv5 = 1.0 / 1.1 / 1.2 / 1.3 / 1.4；數量類不縮放', () => {
    expect([1, 2, 3, 4, 5].map(levelFactor)).toEqual([1, 1.1, 1.2, 1.3, 1.4]);
    const r = resolve([S.SK, S.TS, S.CL], { [S.CL]: 5 });
    if (r.status !== 'combo') throw new Error('expected combo');
    expect(r.modifiers.steps[2].chainCount).toBe(1);
    expect(r.modifiers.steps[2].damage).toBeCloseTo(0.28);
  });

  it('條件式加成：Hunter Rush 第一招沒有 Mark 時只有基本暴擊加成', () => {
    // 火牆（Far Setup、無 Mark）→ 衝撞 → 絕對零度（Near Finisher、冰系，不符合元素附刃的「物理」第三招）
    const r = resolve(['magic.firewall', S.SB, S.AZ]);
    if (r.status !== 'combo') throw new Error('expected combo');
    expect(r.rule.id).toBe('combo.hunter_rush');
    expect(r.modifiers.steps[2].crit).toBeCloseTo(0.1);
  });

  it('同層規則：冰球 → 衝撞 → 幻影連斬 是元素附刃（幻影連斬不是 Heavy / Impact，控場突進不成立）', () => {
    const r = resolve([S.IO, S.SB, S.PB]);
    expect(r.status === 'combo' && r.rule.id).toBe('combo.elemental_weapon');
    expect(alsoMatches([S.IO, S.SB, S.PB], 'combo.control_rush')).toBe(false);
  });

  it('R16 對狀態目標的暴擊加成在命中時判斷', () => {
    const r = resolve([S.IO, S.WP, S.ES]);
    if (r.status !== 'combo') throw new Error('expected combo');
    expect(r.modifiers.steps[2].crit).toBe(0);
    expect(r.modifiers.steps[2].vsTarget).toEqual([{ type: 'crit', statuses: ['slow', 'freeze', 'weakPoint'], value: 0.2 }]);
  });

  it('Guard Counterattack：整組連段期間免疫擊退', () => {
    const r = resolve([S.GS, S.SB, S.HS]);
    expect(r.status === 'combo' && r.modifiers.knockbackResist).toBe(true);
  });

  it('不在技能樹中的技能（普通攻擊）不參與 Combo 判定', () => {
    expect(resolve(['basic.attack', S.HS, S.FB])).toMatchObject({ status: 'none', reason: 'notComboSkill' });
  });

  it('Combo 說明文字（Codex / UI 使用）', () => {
    const r = resolve([S.HS, S.HS, S.FB]);
    if (r.status !== 'combo') throw new Error('expected combo');
    expect(r.description).toEqual(['第三招：傷害 +30%、範圍 +40%、投射物大小 +30%']);
  });
});
