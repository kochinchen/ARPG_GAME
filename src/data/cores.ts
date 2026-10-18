import type { z } from 'zod';
import type { CoreDataSchema, CoreLine } from './schema/core';
import type { SkillFilter } from './schema/legendary';

/**
 * 熔核（規格：SPEC_v0.5.0_鑲嵌與融合 §1.6、§3、§7.2）：攻核由武器融合、護核由防具融合（飾品不能當材料）。
 * 數值都是 T1 範圍；實際數值 = 擲骰 × 核階倍率 × 核色倍率（balance.fusion）。
 * 不放吸血 / 吸魔（吸取硬上限守則）與回魔（由 Support 被動負責）——tests/data/StealCap.test.ts 把關。
 */

type Input = z.input<typeof CoreDataSchema>;
type LineInput = z.input<typeof CoreDataSchema>['shared'][number];

const stat = (id: string, s: Extract<CoreLine, { type: 'stat' }>['stat'], value: [number, number], extra: Partial<LineInput> = {}): LineInput =>
  ({ type: 'stat', id, stat: s, value, ...extra }) as LineInput;
const inc = (id: string, s: Extract<CoreLine, { type: 'stat' }>['stat'], value: [number, number]): LineInput =>
  ({ type: 'stat', id, stat: s, modifier: 'increased', value }) as LineInput;
const element = (id: string, kind: 'damage' | 'resist', value: [number, number]): LineInput => ({ type: 'element', id, kind, value }) as LineInput;
const mods = (id: string, label: string, mod: Extract<CoreLine, { type: 'mods' }>['mod'], value: [number, number], extra: Partial<LineInput> = {}): LineInput =>
  ({ type: 'mods', id, label, mod, value, ...extra }) as LineInput;

const HEAVY: SkillFilter = { tags: ['Heavy'] };
const PROJECTILE: SkillFilter = { tags: ['Projectile'] };

export const cores: Input = {
  types: [
    // ── 攻核（武器融合）──
    {
      id: 'sharp',
      name: '銳核',
      family: 'attack',
      weapon: 'sword',
      enabled: true,
      slots: {
        weapon: [stat('core.sharp.crit', 'critChance', [0.02, 0.04]), inc('core.sharp.attack_speed', 'attackSpeed', [0.04, 0.08])],
        helmet: [stat('core.sharp.cast_speed', 'castSpeed', [0.04, 0.08])],
        armor: [stat('core.sharp.dodge', 'dodgeChance', [0.02, 0.04])],
        gloves: [stat('core.sharp.crit_damage', 'critDamageBonus', [0.08, 0.12])],
        boots: [inc('core.sharp.move_speed', 'moveSpeed', [0.03, 0.05])],
      },
    },
    {
      id: 'heavy',
      name: '重核',
      family: 'attack',
      weapon: 'axe',
      enabled: true,
      slots: {
        weapon: [
          mods('core.heavy.heavy_damage', '重擊類技能傷害', 'damage', [0.08, 0.12], { when: HEAVY }),
          mods('core.heavy.knockback', '擊退距離', 'knockback', [0.15, 0.25]),
        ],
        helmet: [stat('core.heavy.potion', 'potionEffect', [0.08, 0.12])],
        armor: [stat('core.heavy.physical_resist', 'physicalResist', [0.03, 0.05]), stat('core.heavy.knockback_resist', 'knockbackResist', [0.15, 0.25])],
        gloves: [mods('core.heavy.knockback_gloves', '擊退距離', 'knockback', [0.15, 0.25])],
        boots: [stat('core.heavy.stun_resist', 'stunResist', [0.15, 0.25])],
      },
    },
    {
      id: 'pierce',
      name: '穿核',
      family: 'attack',
      weapon: 'bow',
      enabled: true,
      slots: {
        weapon: [
          mods('core.pierce.projectile_speed', '投射物速度', 'projectileSpeed', [0.08, 0.12], { when: PROJECTILE }),
          mods('core.pierce.pierce', '投射物穿透', 'pierce', [1, 1], { when: PROJECTILE, scaling: 'none', minRarity: 'epic' }),
        ],
        helmet: [stat('core.pierce.range', 'projectileRange', [0.5, 1], { t5Value: [1.5, 2] })],
        armor: [stat('core.pierce.slow_resist', 'slowResist', [0.15, 0.25]), inc('core.pierce.move_speed', 'moveSpeed', [0.03, 0.05])],
        gloves: [mods('core.pierce.projectile_attack_speed', '投射物技能攻擊速度', 'attackSpeed', [0.04, 0.08], { when: PROJECTILE })],
        boots: [stat('core.pierce.slow_resist_boots', 'slowResist', [0.15, 0.25])],
      },
    },
    {
      id: 'arcane',
      name: '靈核',
      family: 'attack',
      weapon: 'staff',
      enabled: true,
      slots: {
        weapon: [element('core.arcane.element_damage', 'damage', [0.06, 0.1])],
        helmet: [inc('core.arcane.max_mana', 'maxMana', [0.06, 0.1]), stat('core.arcane.mana_cost', 'manaCostReduction', [0.03, 0.05])],
        armor: [element('core.arcane.element_resist', 'resist', [0.06, 0.1])],
        gloves: [stat('core.arcane.cast_speed', 'castSpeed', [0.04, 0.08])],
        boots: [element('core.arcane.element_resist_boots', 'resist', [0.06, 0.1])],
      },
    },

    // ── 護核（防具融合：頭盔、盔甲、手套、鞋子、盾牌；2026-10-18 提前到 v0.5.0）──
    {
      id: 'wall',
      name: '壁核',
      family: 'defense',
      sourceSlots: ['armor', 'shield'],
      enabled: true,
      slots: {
        weapon: [stat('core.wall.melee', 'meleeDamageBonus', [0.08, 0.12])],
        helmet: [stat('core.wall.potion', 'potionEffect', [0.08, 0.12])],
        armor: [inc('core.wall.defense', 'defense', [0.04, 0.08]), stat('core.wall.damage_reduction', 'damageReduction', [0.03, 0.05])],
        gloves: [stat('core.wall.block', 'blockChance', [0.02, 0.04])],
        boots: [stat('core.wall.physical_resist', 'physicalResist', [0.02, 0.04])],
      },
    },
    {
      id: 'swift',
      name: '疾核',
      family: 'defense',
      sourceSlots: ['boots'],
      enabled: true,
      slots: {
        weapon: [inc('core.swift.attack_speed', 'attackSpeed', [0.04, 0.08])],
        helmet: [inc('core.swift.move_speed', 'moveSpeed', [0.03, 0.05])],
        armor: [stat('core.swift.dodge', 'dodgeChance', [0.02, 0.04]), stat('core.swift.slow_resist', 'slowResist', [0.15, 0.25])],
        gloves: [inc('core.swift.attack_speed_gloves', 'attackSpeed', [0.03, 0.06])],
        boots: [inc('core.swift.move_speed_boots', 'moveSpeed', [0.04, 0.06])],
      },
    },
    {
      id: 'grip',
      name: '掌核',
      family: 'defense',
      sourceSlots: ['gloves'],
      enabled: true,
      slots: {
        weapon: [stat('core.grip.crit_damage', 'critDamageBonus', [0.08, 0.12])],
        helmet: [stat('core.grip.cast_speed', 'castSpeed', [0.04, 0.08])],
        armor: [stat('core.grip.knockback_resist', 'knockbackResist', [0.15, 0.25])],
        gloves: [stat('core.grip.crit', 'critChance', [0.015, 0.03])],
        boots: [stat('core.grip.knockback_resist_boots', 'knockbackResist', [0.15, 0.25])],
      },
    },
    {
      id: 'crown',
      name: '冠核',
      family: 'defense',
      sourceSlots: ['helmet'],
      enabled: true,
      slots: {
        weapon: [stat('core.crown.damage', 'damageBonus', [0.04, 0.06])],
        helmet: [inc('core.crown.max_mana', 'maxMana', [0.06, 0.1]), stat('core.crown.mana_cost', 'manaCostReduction', [0.03, 0.05])],
        armor: [element('core.crown.element_resist', 'resist', [0.06, 0.1]), stat('core.crown.stun_resist', 'stunResist', [0.15, 0.25])],
        gloves: [stat('core.crown.spell_damage', 'spellDamageBonus', [0.04, 0.08])],
        boots: [stat('core.crown.stun_resist_boots', 'stunResist', [0.15, 0.25])],
      },
    },
  ],
  shared: [
    inc('core.shared.max_hp', 'maxHp', [0.03, 0.06]),
    inc('core.shared.defense', 'defense', [0.04, 0.08]),
    stat('core.shared.damage', 'damageBonus', [0.02, 0.04]),
    stat('core.shared.crit_damage', 'critDamageBonus', [0.06, 0.1]),
    stat('core.shared.potion', 'potionEffect', [0.04, 0.08]),
  ],
};
