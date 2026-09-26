import { z } from 'zod';
import { ElementSchema, RangeSchema } from './common';

/**
 * 技能效果的資料格式。技能由多個 Effect 組合而成，Effect 可以巢狀
 * （例如投射物擊中後觸發範圍效果，範圍內每個目標再受到傷害）。
 * 執行邏輯在 game/skills/effects/，這裡只定義格式。
 */

/** 對 ctx.target 造成傷害 */
export const DamageEffectSchema = z
  .strictObject({
    type: z.literal('damage'),
    element: ElementSchema,
    /** weapon：使用施放者的武器傷害（damageMin～damageMax）；flat：使用 base */
    source: z.enum(['weapon', 'flat']),
    base: RangeSchema.optional(),
    multiplier: z.number().positive().default(1),
    /** 每提升一級增加的傷害比例（Lv5 = 1 + 4 × perRankPct） */
    perRankPct: z.number().nonnegative().default(0),
  })
  .refine((e) => e.source !== 'flat' || e.base !== undefined, { message: "source 為 'flat' 時必須提供 base" });

/** 朝施放方向發射投射物，擊中敵人或牆壁時觸發 onHit */
export const ProjectileEffectSchema = z.strictObject({
  type: z.literal('projectile'),
  /** Tile / 秒 */
  speed: z.number().positive(),
  radius: z.number().positive(),
  /** 最大飛行距離（Tile） */
  range: z.number().positive(),
  count: z.int().positive().default(1),
  /** 多發時的總散射角度 */
  spreadDeg: z.number().nonnegative().default(0),
  /** 可穿透的敵人數 */
  pierce: z.int().nonnegative().default(0),
  get onHit() {
    return z.array(EffectDefSchema).default([]);
  },
});

/** 以 ctx.origin 為中心，對範圍內每個敵人執行 effects */
export const AreaEffectSchema = z.strictObject({
  type: z.literal('area'),
  radius: z.number().positive(),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

export const EffectDefSchema = z.discriminatedUnion('type', [
  DamageEffectSchema,
  ProjectileEffectSchema,
  AreaEffectSchema,
]);

export type DamageEffectDef = z.infer<typeof DamageEffectSchema>;
export type ProjectileEffectDef = z.infer<typeof ProjectileEffectSchema>;
export type AreaEffectDef = z.infer<typeof AreaEffectSchema>;
export type EffectDef = z.infer<typeof EffectDefSchema>;
export type EffectType = EffectDef['type'];
