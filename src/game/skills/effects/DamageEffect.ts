import { rankValue } from '../../../data/schema/common';
import type { DamageEffectDef } from '../../../data/schema/effects';
import type { Actor } from '../../entities/Actor';
import type { EffectContext, IEffect } from './IEffect';

/** Spell Power 傷害的浮動範圍 */
const SPELL_SPREAD = 0.2;

export class DamageEffect implements IEffect<'damage'> {
  readonly type = 'damage' as const;

  apply(def: DamageEffectDef, ctx: EffectContext): void {
    const target = ctx.target;
    if (!target) return;
    const stats = ctx.caster.stats;
    const [baseMin, baseMax] =
      def.scaling === 'weapon'
        ? [stats.get('damageMin'), stats.get('damageMax')]
        : def.scaling === 'spell'
          ? [stats.get('spellPower') * (1 - SPELL_SPREAD), stats.get('spellPower') * (1 + SPELL_SPREAD)]
          : (def.base ?? [0, 0]);

    const mods = ctx.mods;
    let multiplier = rankValue(def.multiplier, ctx.rank);
    let extraCritChance = mods.crit;
    if (def.bonus && conditionMet(def.bonus.when, target)) {
      multiplier *= 1 + def.bonus.damagePct;
      extraCritChance += def.bonus.critChance;
    }
    // Combo：傷害加成（含「對某狀態目標」的條件加成）
    let comboDamage = mods.damage;
    for (const c of mods.vsTarget) {
      if (!c.statuses.some((s) => target.hasStatus(s))) continue;
      if (c.type === 'damage') comboDamage += c.value;
      if (c.type === 'crit') extraCritChance += c.value;
    }
    multiplier *= 1 + comboDamage;

    const { pipeline } = ctx.services;
    for (let hit = 0; hit < def.hits + mods.hitCount; hit++) {
      if (target.hp <= 0) break;
      const result = pipeline.apply({
        source: ctx.caster,
        target,
        min: baseMin * multiplier,
        max: baseMax * multiplier,
        element: def.element,
        extraCritChance,
        armorPenetration: mods.armorPenetration,
      });
      // Combo：每一擊追加元素傷害
      for (const extra of mods.elementDamage) {
        if (!result || result.amount <= 0 || target.hp <= 0) break;
        const amount = result.amount * extra.value;
        pipeline.apply({ source: ctx.caster, target, min: amount, max: amount, element: extra.element, canCrit: false, noCounter: true });
      }
    }
  }
}

function conditionMet(when: NonNullable<DamageEffectDef['bonus']>['when'], target: Actor): boolean {
  if ('status' in when) return target.hasStatus(when.status);
  return target.maxHp > 0 && target.hp / target.maxHp < when.hpBelow;
}
