import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';

/**
 * 樓層設定：一段樓層區間共用的怪物池、密度、寶箱數與地圖清單。
 * 各層實際的怪物強度由 balance.difficulty 依樓層計算。
 */
export const FloorDefSchema = z.strictObject({
  id: IdSchema,
  /** 適用樓層區間 [from, to]（含兩端）；所有區間必須從 1 開始連續 */
  floors: z.tuple([z.int().positive(), z.int().positive()]).refine(([a, b]) => a <= b, 'from 必須 <= to'),
  /** 此區間輪替使用的地圖（必須有 S、M、X） */
  maps: z.array(IdSchema).min(1),
  /** minFloor：這種怪物從第幾層開始出現（預設區間第一層） */
  monsterPool: z
    .array(z.strictObject({ enemyId: IdSchema, weight: z.number().positive(), minFloor: z.int().positive().default(1) }))
    .min(1),
  /** 每 100 格地板的怪物數（第一層基準，之後依 balance.difficulty 增加） */
  density: z.number().positive(),
  /** 一群怪物的隻數範圍 */
  packSize: RangeSchema.default([2, 4]),
  /** Elite 機制尚未實作，先保留欄位 */
  eliteChance: z.number().min(0).max(1).default(0),
  affixCount: RangeSchema.default([0, 0]),
  lootTier: z.int().positive(),
  /** 寶箱數量範圍 */
  chests: RangeSchema,
  chestLootTable: IdSchema,
  /** 擊敗此比例的怪物後出口開啟 */
  clearRatio: z.number().min(0).max(1),
});

export type FloorDef = z.infer<typeof FloorDefSchema>;
