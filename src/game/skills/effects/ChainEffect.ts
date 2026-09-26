import { distance, type Vec2 } from '../../../core/math/Vec2';
import type { ChainEffectDef } from '../../../data/schema/effects';
import type { Actor } from '../../entities/Actor';
import type { EffectContext, IEffect } from './IEffect';

/** 對目標執行效果後，跳到附近最近的下一個敵人（不重複） */
export class ChainEffect implements IEffect<'chain'> {
  readonly type = 'chain' as const;

  apply(def: ChainEffectDef, ctx: EffectContext): void {
    let current: Actor | null = ctx.target;
    if (!current) return;
    const hit = new Set<number>();
    const points: Vec2[] = [ctx.caster.position];
    const jumps = def.jumps + ctx.mods.chainCount;
    for (let jump = 0; jump <= jumps && current; jump++) {
      hit.add(current.id);
      points.push(current.position);
      const from: Actor = current;
      ctx.run(def.effects, { ...ctx, target: from, origin: from.position });
      current =
        ctx.services.targeting
          .hostilesWithin(ctx.caster, from.position, def.radius)
          .filter((a) => !hit.has(a.id) && a.hp > 0)
          .sort((a, b) => distance(a.position, from.position) - distance(b.position, from.position))[0] ?? null;
    }
    ctx.services.events.emit('ChainTriggered', { points, element: 'lightning' });
  }
}
