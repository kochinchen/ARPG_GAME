import type { Rng } from '../../core/Rng';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import { rankValue } from '../../data/schema/common';
import type { DelayedEffectDef, EffectDef, LeapEffectDef, ZoneEffectDef } from '../../data/schema/effects';
import type { Actor } from '../entities/Actor';
import type { NavGrid } from '../movement/NavGrid';
import type { TargetingService } from '../targeting/TargetingService';
import type { EffectContext, EffectSchedulerPort } from './effects/IEffect';

/** 目標在區域的扇形裡（圓形的區域一律算在裡面；站在正中心也算） */
function inSector(p: Vec2, zone: Pick<Zone, 'position' | 'angleDeg' | 'direction'>): boolean {
  if (zone.angleDeg >= 360) return true;
  const dx = p.x - zone.position.x;
  const dy = p.y - zone.position.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  return (dx * zone.direction.x + dy * zone.direction.y) / len >= Math.cos(((zone.angleDeg / 2) * Math.PI) / 180);
}

/** 地面持續區域（火牆、火焰區） */
export interface Zone {
  id: number;
  ctx: EffectContext;
  position: Vec2;
  radius: number;
  /** 扇形的角度與朝向（360 = 圓形） */
  angleDeg: number;
  direction: Vec2;
  remaining: number;
  interval: number;
  timer: number;
  /** 剩餘觸發次數（持續時間 ÷ 間隔），避免浮點誤差多觸發一次 */
  ticksLeft: number;
  /** 跟著施放者移動（劍刃旋舞） */
  followCaster: boolean;
  /** 不和同一個施放者的其他區域重疊 */
  exclusive: boolean;
  /** 外觀（Render 用） */
  look?: ZoneEffectDef['look'];
  /** 殺傷力的外觀階級（手動指定；Render 用） */
  fxTier?: ZoneEffectDef['fxTier'];
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

/** 跳到空中的角色（噬界足眼）：mark 是地上的印記，lockAt 之前追著目標 */
export interface Leap {
  ctx: EffectContext;
  def: LeapEffectDef;
  targetId: number | null;
  mark: Vec2;
  elapsed: number;
}

/** 跳起 / 落下的秒數：跳起後角色看不見，落下時才又出現 */
const LEAP_RISE = 0.35;
const LEAP_FALL = 0.3;

/**
 * 管理需要「之後」才發生的效果：延遲觸發、地面持續區域、跳到空中再落下。
 */
export class EffectScheduler implements EffectSchedulerPort {
  readonly zones: Zone[] = [];
  readonly pending: PendingEffect[] = [];
  readonly leaps: Leap[] = [];
  private nextId = 1;

  constructor(
    private readonly targeting: TargetingService,
    private readonly nav: NavGrid,
    private readonly rng: Rng,
  ) {}

  spawnZone(def: ZoneEffectDef, ctx: EffectContext): void {
    const duration = rankValue(def.duration, ctx.rank);
    const radius = def.radius * (1 + ctx.mods.aoeRadius);
    const position = def.exclusive ? this.freeSpot(ctx, radius) : ctx.origin;
    if (!position) return;
    this.zones.push({
      id: this.nextId++,
      ctx: { ...ctx, origin: position },
      position,
      radius,
      angleDeg: def.angleDeg ?? 360,
      direction: ctx.direction,
      // 第一跳延後時，最後一跳剛好在時間到的那一刻：多留一點，避免浮點誤差少打一跳
      remaining: def.delayFirstTick ? duration + 0.05 : duration,
      interval: def.interval,
      timer: def.delayFirstTick ? def.interval : 0,
      ticksLeft: Math.max(1, Math.round(duration / def.interval)),
      followCaster: def.followCaster,
      exclusive: def.exclusive,
      ...(def.look ? { look: def.look } : {}),
      ...(def.fxTier ? { fxTier: def.fxTier } : {}),
      effects: def.effects,
    });
  }

  /** 不和同一個施放者其他區域重疊的位置：原本的落點可以就用，否則就近找；都不行回傳 null */
  private freeSpot(ctx: EffectContext, radius: number): Vec2 | null {
    const free = (p: Vec2) => this.zones.every((z) => !z.exclusive || z.ctx.caster !== ctx.caster || Math.hypot(z.position.x - p.x, z.position.y - p.y) >= z.radius + radius);
    if (free(ctx.origin)) return ctx.origin;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const r = radius * (1 + this.rng.next() * 3);
      const p = vec2(ctx.origin.x + Math.cos(angle) * r, ctx.origin.y + Math.sin(angle) * r);
      if (this.nav.isWalkableAt(p.x, p.y) && free(p)) return p;
    }
    return null;
  }

  schedule(def: DelayedEffectDef, ctx: EffectContext): void {
    // 連射這類「從施放者發射的投射物」跟著施放者；落點類固定在地面
    const followCaster = def.scatter === 0 && def.effects.every((e) => e.type === 'projectile') && def.delay === 0;
    const placed: Vec2[] = [];
    for (let i = 0; i < def.repeat; i++) {
      const spin = (def.spinDeg * i * Math.PI) / 180;
      const c = Math.cos(spin);
      const s = Math.sin(spin);
      const direction = spin === 0 ? ctx.direction : vec2(ctx.direction.x * c - ctx.direction.y * s, ctx.direction.x * s + ctx.direction.y * c);
      const center =
        def.advance > 0
          ? vec2(ctx.origin.x + ctx.direction.x * (i + 0.5) * def.advance, ctx.origin.y + ctx.direction.y * (i + 0.5) * def.advance)
          : def.spacing > 0
            ? this.inLine(ctx.origin, ctx.direction, (i - (def.repeat - 1) / 2) * def.spacing)
            : ctx.origin;
      let position = this.scatter(center, def.scatter);
      for (let attempt = 0; def.minApart > 0 && attempt < 12 && placed.some((p) => Math.hypot(p.x - position.x, p.y - position.y) < def.minApart); attempt++) position = this.scatter(center, def.scatter);
      placed.push(position);
      this.pending.push({
        id: this.nextId++,
        ctx: { ...ctx, direction },
        position,
        remaining: def.delay + i * def.interval,
        followCaster,
        effects: def.effects,
      });
    }
  }

  leap(def: LeapEffectDef, ctx: EffectContext): void {
    const caster = ctx.caster;
    caster.vanished = true;
    caster.untouchable = true;
    caster.underground = def.underground;
    caster.cast = null;
    caster.intent = null;
    caster.path = [];
    const mark = ctx.target ? this.leapGoal(caster, ctx.target, def) : caster.position;
    this.leaps.push({ ctx, def, targetId: ctx.target?.id ?? caster.ai?.targetId ?? null, mark, elapsed: 0 });
    ctx.services.events.emit('ActorLeapt', { actorId: caster.id, duration: def.duration, radius: def.radius });
  }

  /** 印記要追的地方：目標本身，或目標背後 behind 格（那裡站不下就追目標本身） */
  private leapGoal(caster: Actor, target: Actor, def: LeapEffectDef): Vec2 {
    if (def.behind <= 0) return target.position;
    const back = vec2(target.position.x - target.facing.x * def.behind, target.position.y - target.facing.y * def.behind);
    return this.nav.isClearAt(back, caster.radius) ? back : target.position;
  }

  /** 這個角色地上的印記（沒有在跳就是 null） */
  leapMark(actorId: number): Vec2 | null {
    return this.leaps.find((l) => l.ctx.caster.id === actorId)?.mark ?? null;
  }

  /** 換樓層時清除所有地面區域與延遲效果 */
  clear(): void {
    this.zones.length = 0;
    this.pending.length = 0;
    this.leaps.length = 0;
  }

  private updateLeaps(dt: number): void {
    for (let i = this.leaps.length - 1; i >= 0; i--) {
      const leap = this.leaps[i]!;
      const { ctx, def } = leap;
      const caster = ctx.caster;
      leap.elapsed += dt;
      if (leap.elapsed < def.lockAt && leap.targetId !== null) {
        const target = this.targeting.getValidTarget(caster, leap.targetId);
        if (target) {
          const goal = this.leapGoal(caster, target, def);
          const dx = goal.x - leap.mark.x;
          const dy = goal.y - leap.mark.y;
          const d = Math.hypot(dx, dy);
          const step = Math.min(d, def.followSpeed * dt);
          if (d > 1e-6) leap.mark = vec2(leap.mark.x + (dx / d) * step, leap.mark.y + (dy / d) * step);
        }
      }
      const remaining = def.duration - leap.elapsed;
      // 鑽地：一直待在地下，時間到才一口氣竄出來（畫面的 ActorEmerged）
      caster.air = def.underground ? Math.min(1, leap.elapsed / LEAP_RISE) : Math.min(1, Math.min(leap.elapsed / LEAP_RISE, remaining / LEAP_FALL));
      // 跳起之後角色就在印記正上方（落下時位置就對了）
      if (leap.elapsed >= LEAP_RISE) caster.position = leap.mark;
      if (remaining > 0) continue;
      this.leaps.splice(i, 1);
      caster.air = 0;
      caster.vanished = false;
      caster.untouchable = false;
      caster.underground = false;
      if (def.underground) ctx.services.events.emit('ActorEmerged', { actorId: caster.id, radius: def.radius });
      const landed = { ...ctx, origin: leap.mark, target: null };
      landed.run(def.effects, landed);
    }
  }

  update(dt: number): void {
    this.updateLeaps(dt);
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
      if (zone.followCaster) {
        if (!zone.ctx.caster.alive) {
          this.zones.splice(i, 1);
          continue;
        }
        zone.position = zone.ctx.caster.position;
      }
      zone.timer -= dt;
      while (zone.timer <= 0 && zone.ticksLeft > 0) {
        zone.timer += zone.interval;
        zone.ticksLeft--;
        for (const target of this.targeting.hostilesWithin(zone.ctx.caster, zone.position, zone.radius)) {
          if (!inSector(target.position, zone)) continue;
          zone.ctx.run(zone.effects, { ...zone.ctx, target, origin: zone.position });
        }
      }
      zone.remaining -= dt;
      if (zone.remaining <= 0) this.zones.splice(i, 1);
      else i++;
    }
  }

  /** 與方向垂直、離中心 offset 格的位置（排成一排用） */
  private inLine(center: Vec2, direction: Vec2, offset: number): Vec2 {
    const len = Math.hypot(direction.x, direction.y) || 1;
    return vec2(center.x - (direction.y / len) * offset, center.y + (direction.x / len) * offset);
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
