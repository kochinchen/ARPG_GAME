import { rankValue } from '../../../data/schema/common';
import type { StatusEffectDef } from '../../../data/schema/effects';
import type { EffectContext, IEffect } from './IEffect';

export class StatusEffect implements IEffect<'status'> {
  readonly type = 'status' as const;

  apply(def: StatusEffectDef, ctx: EffectContext): void {
    const who = def.target === 'self' ? ctx.caster : ctx.target;
    if (!who) return;
    const mods = ctx.mods;
    const isFreeze = def.status === 'freeze';
    const isBurn = def.status === 'burn';
    // Combo：機率加百分點；時間 / 強度依比例
    const chance = rankValue(def.chance, ctx.rank) + mods.statusChance + (isFreeze ? mods.freezeChance : 0);
    if (!ctx.services.rng.chance(chance)) return;
    const duration = rankValue(def.duration, ctx.rank) * (1 + (isFreeze ? mods.freezeDuration : 0) + (isBurn ? mods.burn : 0));
    const magnitude = rankValue(def.magnitude, ctx.rank) * (1 + (isBurn ? mods.burn : 0));
    ctx.services.statuses.apply(who, def.status, duration, magnitude, ctx.caster);
  }
}
