import { z } from 'zod';
import { ElementSchema, RangeSchema, RankNumberSchema } from './common';

/**
 * 技能效果的資料格式。技能由多個 Effect 組合而成，Effect 可以巢狀
 * （例如投射物擊中後觸發範圍效果，範圍內每個目標再受到傷害）。
 * 執行邏輯在 game/skills/effects/，這裡只定義格式。
 */

export const StatusKindSchema = z.enum([
  /** 移動速度降低 magnitude */
  'slow',
  /** 無法行動 */
  'freeze',
  'stun',
  /** 燃燒：每秒受到 施放者 Spell Power × magnitude 的火焰傷害（magnitude 0 = 只有標記） */
  'burn',
  /** 防禦降低 magnitude */
  'armorBreak',
  /** 受到的暴擊傷害提高 magnitude */
  'weakPoint',
  /** 下一次受到的傷害降低 magnitude，觸發後消失 */
  'guard',
  /** 下一次受到近戰攻擊時，以 magnitude × 武器傷害反擊，觸發後消失 */
  'counter',
  /** 受到傷害降低 magnitude，並免疫擊退 */
  'ironWill',
  /** 只免疫擊退（Combo「守勢反擊」整組連段期間） */
  'unstoppable',
]);
export type StatusKind = z.infer<typeof StatusKindSchema>;

/** 對 ctx.target 造成傷害 */
export const DamageEffectSchema = z
  .strictObject({
    type: z.literal('damage'),
    element: ElementSchema,
    /** weapon：% 武器傷害；spell：% Spell Power；flat：使用 base */
    scaling: z.enum(['weapon', 'spell', 'flat']),
    base: RangeSchema.optional(),
    /** 每一擊的倍率（1.2 = 120%） */
    multiplier: RankNumberSchema.default(1),
    /** 連續命中次數（例如 65% × 2） */
    hits: z.int().positive().default(1),
    /** 條件加成：目標有某狀態、或 HP 低於某比例時 */
    bonus: z
      .strictObject({
        when: z.union([
          z.strictObject({ status: StatusKindSchema }),
          z.strictObject({ hpBelow: z.number().min(0).max(1) }),
        ]),
        damagePct: z.number().nonnegative().default(0),
        critChance: z.number().nonnegative().default(0),
      })
      .optional(),
  })
  .refine((e) => e.scaling !== 'flat' || e.base !== undefined, { message: "scaling 為 'flat' 時必須提供 base" });

/** 對目標（或自己）施加狀態 */
export const StatusEffectSchema = z.strictObject({
  type: z.literal('status'),
  status: StatusKindSchema,
  target: z.enum(['target', 'self']).default('target'),
  duration: RankNumberSchema,
  magnitude: RankNumberSchema.default(0),
  /** 觸發機率 */
  chance: RankNumberSchema.default(1),
});

/** 把目標往遠離效果中心的方向推開 */
export const KnockbackEffectSchema = z.strictObject({
  type: z.literal('knockback'),
  distance: z.number().positive(),
});

/** 施放者位移；之後的效果從新位置發出 */
export const DashEffectSchema = z.strictObject({
  type: z.literal('dash'),
  distance: z.number().positive(),
  /** forward：朝施放方向（對敵技能會停在目標前）；backward：反方向 */
  direction: z.enum(['forward', 'backward']),
});

/** 朝施放方向發射投射物，擊中敵人或牆壁時觸發 onHit */
export const ProjectileEffectSchema = z.strictObject({
  type: z.literal('projectile'),
  /** Tile / 秒 */
  speed: z.number().positive(),
  radius: z.number().positive(),
  /** 最大飛行距離（Tile） */
  range: z.number().positive(),
  count: z.int().positive().default(1),
  /** 多發時的總散射角度；≥ 360 為環狀平均分布 */
  spreadDeg: z.number().nonnegative().default(0),
  /** 可穿透的敵人數 */
  pierce: z.int().nonnegative().default(0),
  /** 自動修正方向：此角度內有敵人時改朝最近的敵人發射 */
  aimAssistDeg: z.number().nonnegative().default(0),
  get onHit() {
    return z.array(EffectDefSchema).default([]);
  },
});

/** 以 ctx.origin 為中心，對範圍內每個敵人執行 effects */
export const AreaEffectSchema = z.strictObject({
  type: z.literal('area'),
  radius: z.number().positive(),
  /** 中心點：origin = 效果發生位置（預設）；target = 目前目標所在位置 */
  at: z.enum(['origin', 'target']).default('origin'),
  /** 扇形角度（朝施放方向）；省略 = 360° */
  angleDeg: z.number().positive().max(360).optional(),
  /** 主要目標一定命中（近戰揮砍：目標在出招途中稍微移動也不會落空） */
  includeTarget: z.boolean().default(false),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 對目標執行 effects，再跳到附近下一個敵人（不重複） */
export const ChainEffectSchema = z.strictObject({
  type: z.literal('chain'),
  jumps: z.int().nonnegative(),
  radius: z.number().positive(),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 地面持續區域：每 interval 秒對範圍內敵人執行 effects */
export const ZoneEffectSchema = z.strictObject({
  type: z.literal('zone'),
  radius: z.number().positive(),
  duration: z.number().positive(),
  interval: z.number().positive(),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 延遲後執行 effects；可重複多次並隨機散布位置（例如箭雨、雷暴） */
export const DelayedEffectSchema = z.strictObject({
  type: z.literal('delayed'),
  delay: z.number().nonnegative(),
  repeat: z.int().positive().default(1),
  interval: z.number().nonnegative().default(0.3),
  /** 每次落點在中心點附近隨機偏移的半徑 */
  scatter: z.number().nonnegative().default(0),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 在施放者周圍召喚怪物（Boss 用）。召喚物不給經驗、不掉寶，也不計入樓層擊殺數 */
export const SummonEffectSchema = z.strictObject({
  type: z.literal('summon'),
  enemyId: z.string(),
  count: z.int().positive(),
  /** 同一個施放者的召喚物同時存在的上限 */
  maxAlive: z.int().positive(),
});

export const EffectDefSchema = z.discriminatedUnion('type', [
  DamageEffectSchema,
  StatusEffectSchema,
  KnockbackEffectSchema,
  DashEffectSchema,
  ProjectileEffectSchema,
  AreaEffectSchema,
  ChainEffectSchema,
  ZoneEffectSchema,
  DelayedEffectSchema,
  SummonEffectSchema,
]);

export type DamageEffectDef = z.infer<typeof DamageEffectSchema>;
export type StatusEffectDef = z.infer<typeof StatusEffectSchema>;
export type KnockbackEffectDef = z.infer<typeof KnockbackEffectSchema>;
export type DashEffectDef = z.infer<typeof DashEffectSchema>;
export type ProjectileEffectDef = z.infer<typeof ProjectileEffectSchema>;
export type AreaEffectDef = z.infer<typeof AreaEffectSchema>;
export type SummonEffectDef = z.infer<typeof SummonEffectSchema>;
export type ChainEffectDef = z.infer<typeof ChainEffectSchema>;
export type ZoneEffectDef = z.infer<typeof ZoneEffectSchema>;
export type DelayedEffectDef = z.infer<typeof DelayedEffectSchema>;
export type EffectDef = z.infer<typeof EffectDefSchema>;
export type EffectType = EffectDef['type'];
