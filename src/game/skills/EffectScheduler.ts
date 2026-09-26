import type { Rng } from '../../core/Rng';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { DelayedEffectDef, EffectDef, ZoneEffectDef } from '../../data/schema/effects';
import type { NavGrid } from '../movement/NavGrid';
import type { TargetingService } from '../targeting/TargetingService';
import type { EffectContext, EffectSchedulerPort } from './effects/IEffect';

/** 地面持續區域（火牆、火焰區） */
export interface Zone {
  id: number;
  ctx: EffectContext;
  position: Vec2;
  radius: number;
  remaining: number;
  interval: number;
  timer: number;
  /** 剩餘觸發次數（持續時間 ÷ 間隔），避免浮點誤差多觸發一次 */
  ticksLeft: number;
  effects: readonly EffectDef[];
}

/** 等待觸發的延遲效果；Render 用 position 顯示預警 */
export interface PendingEffect {
  id: number;
  ctx: EffectContext;
  position: Vec2;
  remaining: number;
  /** true：觸發時從施放者當下位置發出（連射）；false：固定在排程時的位置（落雷、殘影） */
  followCaster: boolean;
  effects: readonly EffectDef[];
}

/**
 * 管理需要「之後」才發生的效果：延遲觸發與地面持續區域。
 */
export class EffectScheduler implements EffectSchedulerPort {
  readonly zones: Zone[] = [];
  readonly pending: PendingEffect[] = [];
  private nextId = 1;

  constructor(
    private readonly targeting: TargetingService,
    private readonly nav: NavGrid,
    private readonly rng: Rng,
  ) {}

  spawnZone(def: ZoneEffectDef, ctx: EffectContext): void {
    this.zones.push({
      id: this.nextId++,
      ctx: { ...ctx },
      position: ctx.origin,
      radius: def.radius * (1 + ctx.mods.aoeRadius),
      remaining: def.duration,
      interval: def.interval,
      timer: 0,
      ticksLeft: Math.max(1, Math.round(def.duration / def.interval)),
      effects: def.effects,
    });
  }

  schedule(def: DelayedEffectDef, ctx: EffectContext): void {
    // 連射這類「從施放者發射的投射物」跟著施放者；落點類固定在地面
    const followCaster = def.scatter === 0 && def.effects.every((e) => e.type === 'projectile') && def.delay === 0;
    for (let i = 0; i < def.repeat; i++) {
      this.pending.push({
        id: this.nextId++,
        ctx: { ...ctx },
        position: this.scatter(ctx.origin, def.scatter),
        remaining: def.delay + i * def.interval,
        followCaster,
        effects: def.effects,
      });
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.pending.length; ) {
      const p = this.pending[i]!;
      p.remaining -= dt;
      if (p.remaining > 0) {
        i++;
        continue;
      }
      this.pending.splice(i, 1);
      if (p.followCaster && !p.ctx.caster.alive) continue;
      const origin = p.followCaster ? p.ctx.caster.position : p.position;
      const ctx = { ...p.ctx, origin, target: null };
      ctx.run(p.effects, ctx);
    }

    for (let i = 0; i < this.zones.length; ) {
      const zone = this.zones[i]!;
      zone.timer -= dt;
      while (zone.timer <= 0 && zone.ticksLeft > 0) {
        zone.timer += zone.interval;
        zone.ticksLeft--;
        for (const target of this.targeting.hostilesWithin(zone.ctx.caster, zone.position, zone.radius)) {
          zone.ctx.run(zone.effects, { ...zone.ctx, target, origin: zone.position });
        }
      }
      zone.remaining -= dt;
      if (zone.remaining <= 0) this.zones.splice(i, 1);
      else i++;
    }
  }

  /** 在中心附近隨機取一個地板上的點 */
  private scatter(center: Vec2, radius: number): Vec2 {
    if (radius <= 0) return center;
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng.next()) * radius;
      const p = vec2(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r);
      if (this.nav.isWalkableAt(p.x, p.y)) return p;
    }
    return center;
  }
}
