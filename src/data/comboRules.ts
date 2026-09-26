import type { z } from 'zod';
import type { ComboRuleSchema } from './schema/combo';

type Rule = z.input<typeof ComboRuleSchema>;

/**
 * Combo Rule 資料庫（規格：docs/COMBO_SYSTEM.md 第 3、5 節）。
 * 規則以標籤比對，不綁技能名稱；只有 Exact Secret Combo 指定技能。
 * 數值為 Lv1 基準，實際值 × 目標步驟技能的 LevelFactor。
 */
export const comboRules: Rule[] = [
  // ─────────── Tier 1：Exact Secret Combo ───────────
  {
    id: 'combo.flame_finisher',
    name: '烈焰終擊',
    description: '兩次重砍之後的火球化為巨型火球。',
    tier: 1,
    order: 1,
    match: { kind: 'exact', skills: ['melee.heavy_slash', 'melee.heavy_slash', 'magic.fireball'] },
    modifiers: [
      { type: 'damage', value: 0.3 },
      { type: 'aoeRadius', value: 0.4 },
      { type: 'projectileSize', value: 0.3 },
    ],
    displayNames: [{ finalSkill: 'magic.fireball', name: '烈焰終擊 · 巨型火球' }],
  },
  {
    id: 'combo.frozen_impact',
    name: '冰霜重擊',
    description: '冰球減速後衝撞，接毀滅重擊。',
    tier: 1,
    order: 2,
    match: { kind: 'exact', skills: ['magic.ice_orb', 'melee.shield_bash', 'melee.devastator'] },
    modifiers: [
      { type: 'damage', value: 0.3 },
      { type: 'knockback', value: 0.8 },
      { type: 'stagger', value: 0.25, when: { targetHasStatus: ['slow'] } },
    ],
  },

  // ─────────── Tier 2：Element Escalation ───────────
  {
    id: 'combo.inferno',
    name: '煉獄',
    tier: 2,
    order: 11,
    match: { kind: 'pattern', steps: [{ anyTags: ['Fire'] }, { anyTags: ['Fire'] }, { anyTags: ['Fire'] }], distinctSkills: true, sameElement: 'Fire' },
    modifiers: [
      { type: 'damage', value: 0.25 },
      { type: 'burn', value: 0.25 },
      { type: 'aoeRadius', value: 0.2 },
    ],
  },
  {
    id: 'combo.deep_freeze',
    name: '深度凍結',
    tier: 2,
    order: 12,
    match: { kind: 'pattern', steps: [{ anyTags: ['Ice'] }, { anyTags: ['Ice'] }, { anyTags: ['Ice'] }], distinctSkills: true, sameElement: 'Ice' },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'freezeChance', value: 0.2 },
      { type: 'freezeDuration', value: 0.2 },
    ],
  },
  {
    id: 'combo.storm_surge',
    name: '雷湧',
    tier: 2,
    order: 13,
    match: {
      kind: 'pattern',
      steps: [{ anyTags: ['Lightning'] }, { anyTags: ['Lightning'] }, { anyTags: ['Lightning'] }],
      distinctSkills: true,
      sameElement: 'Lightning',
    },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'chainCount', value: 1 },
      { type: 'statusChance', value: 0.15 },
    ],
  },

  // ─────────── Tier 3：Status / Setup / Execute ───────────
  {
    id: 'combo.armor_crusher',
    name: '碎甲',
    tier: 3,
    order: 3,
    match: { kind: 'pattern', steps: [{ anyTags: ['ArmorBreak'] }, { anyTags: ['Physical'] }, { anyTags: ['Heavy'] }] },
    modifiers: [
      { type: 'armorPenetration', value: 0.25 },
      { type: 'damage', value: 0.2 },
    ],
  },
  {
    id: 'combo.control_rush',
    name: '控場突進',
    tier: 3,
    order: 4,
    match: { kind: 'pattern', steps: [{ anyTags: ['Slow', 'Freeze'] }, { anyTags: ['Advance'] }, { anyTags: ['Heavy', 'Impact'] }] },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'knockback', value: 0.6 },
      { type: 'stagger', value: 0.25 },
    ],
  },
  {
    id: 'combo.elemental_weapon',
    name: '元素附刃',
    tier: 3,
    order: 5,
    match: { kind: 'pattern', steps: [{ hasElement: true }, { anyTags: ['Physical'] }, { anyTags: ['Physical'] }] },
    modifiers: [
      { type: 'elementDamage', value: 0.15, target: 'step2', element: 'fromStep1' },
      { type: 'elementDamage', value: 0.25, target: 'step3', element: 'fromStep1' },
    ],
  },
  {
    id: 'combo.marked_execution',
    name: '標記處決',
    tier: 3,
    order: 8,
    match: { kind: 'pattern', steps: [{ anyTags: ['Mark'] }, { anyTags: ['MultiHit', 'Heavy'] }, { anyTags: ['Execute'] }] },
    modifiers: [
      { type: 'crit', value: 0.25 },
      { type: 'damage', value: 0.25 },
    ],
  },
  {
    id: 'combo.guard_counterattack',
    name: '守勢反擊',
    tier: 3,
    order: 15,
    match: { kind: 'pattern', steps: [{ anyTags: ['Guard', 'Shield'] }, { anyTags: ['Counter', 'Impact'] }, { anyTags: ['Heavy'] }] },
    modifiers: [
      { type: 'damage', value: 0.25 },
      { type: 'stagger', value: 0.2 },
      { type: 'knockbackResist', value: 1, target: 'self' },
    ],
  },
  {
    id: 'combo.elemental_execution',
    name: '元素處決',
    tier: 3,
    order: 16,
    match: {
      kind: 'pattern',
      steps: [{ hasElement: true, anyTags: ['Slow', 'Freeze', 'Stun'] }, { role: ['Setup'] }, { anyTags: ['Execute'] }],
    },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'crit', value: 0.2, when: { targetHasStatus: ['slow', 'freeze', 'weakPoint'] } },
    ],
  },

  // ─────────── Tier 4：Range Transition ───────────
  {
    id: 'combo.tactical_retreat',
    name: '戰術撤退',
    tier: 4,
    order: 6,
    match: {
      kind: 'pattern',
      steps: [{ range: ['Near'], hasDamage: true }, { anyTags: ['Retreat', 'Roll'] }, { anyTags: ['Projectile'] }],
      rangePattern: ['Near', 'Mid', 'Far'],
    },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'projectileSpeed', value: 0.25 },
      { type: 'aoeRadius', value: 0.15 },
    ],
  },
  {
    id: 'combo.hunter_rush',
    name: '獵手突襲',
    tier: 4,
    order: 7,
    match: {
      kind: 'pattern',
      steps: [{ range: ['Far'], role: ['Setup'] }, { anyTags: ['Advance'] }, { range: ['Near'], role: ['Finisher'] }],
      rangePattern: ['Far', 'Mid', 'Near'],
    },
    modifiers: [
      { type: 'damage', value: 0.25 },
      { type: 'crit', value: 0.1 },
      { type: 'crit', value: 0.15, when: { stepHasTag: { step: 1, tag: 'Mark' } } },
    ],
  },
  {
    id: 'combo.momentum_strike',
    name: '衝勢打擊',
    tier: 4,
    order: 10,
    match: { kind: 'pattern', steps: [{ anyTags: ['Advance', 'Roll', 'Reposition'] }, { anyTags: ['Physical'] }, { anyTags: ['Heavy', 'Impact'] }] },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'knockback', value: 0.3 },
    ],
  },

  // ─────────── Tier 5：Generic Action ───────────
  {
    id: 'combo.heavy_chain_finisher',
    name: '重擊連鎖',
    tier: 5,
    order: 1,
    match: { kind: 'pattern', steps: [{ anyTags: ['Heavy'] }, { anyTags: ['Heavy'] }, { anyTags: ['Projectile'] }] },
    modifiers: [
      { type: 'damage', value: 0.25 },
      { type: 'projectileSize', value: 0.25 },
      { type: 'aoeRadius', value: 0.3 },
    ],
    displayNames: [{ finalSkill: 'magic.fireball', name: '巨型火球' }],
  },
  {
    id: 'combo.fast_momentum',
    name: '疾風蓄勢',
    tier: 5,
    order: 2,
    match: { kind: 'pattern', steps: [{ anyTags: ['Fast'] }, { anyTags: ['Fast'] }, { anyTags: ['Heavy'] }] },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'animationSpeed', value: 0.15 },
      { type: 'crit', value: 0.1 },
    ],
  },
  {
    id: 'combo.piercing_barrage',
    name: '穿透彈幕',
    tier: 5,
    order: 9,
    match: { kind: 'pattern', steps: [{ anyTags: ['Pierce'] }, { anyTags: ['MultiHit'] }, { anyTags: ['AoE'] }] },
    modifiers: [
      { type: 'aoeRadius', value: 0.25 },
      { type: 'projectileCount', value: 1, when: { stepHasTag: { step: 3, tag: 'Projectile' } } },
      { type: 'hitCount', value: 1, when: { stepLacksTag: { step: 3, tag: 'Projectile' } } },
      { type: 'damage', value: 0.15 },
    ],
  },
  {
    id: 'combo.rapid_finisher',
    name: '連擊終結',
    tier: 5,
    order: 14,
    match: { kind: 'pattern', steps: [{ anyTags: ['MultiHit'] }, { anyTags: ['MultiHit'] }, { role: ['Finisher'] }] },
    modifiers: [
      { type: 'damage', value: 0.2 },
      { type: 'crit', value: 0.15 },
      { type: 'damage', value: 0.1, when: { hitsAtLeast: { steps: [1, 2], hits: 6 } } },
    ],
  },
];
