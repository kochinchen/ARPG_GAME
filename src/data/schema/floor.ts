import { z } from 'zod';
import { IdSchema, RangeSchema } from './common';

/** 地牢風格（畫面配色與裝飾，由淺入深逐步變化） */
export const DungeonThemeSchema = z.enum(['crypt', 'tomb', 'sanctum', 'lava', 'fortress', 'abyss', 'temple']);
export type DungeonTheme = z.infer<typeof DungeonThemeSchema>;

/** 隨機產生地圖的參數（World 單位）：每一層由「世界種子 + 樓層」產生不同但固定的佈局 */
export const LayoutDefSchema = z.strictObject({
  width: z.int().positive(),
  height: z.int().positive(),
  /** 每一格的大小（World 單位）；0.5 = 牆與房間的形狀更細緻 */
  cellSize: z.number().positive().default(0.5),
  /** 房間數量範圍 */
  rooms: RangeSchema,
  /** 最小生成樹之外額外的通道數（形成迴圈，不會只有一條路） */
  loops: z.int().nonnegative().default(4),
});
export type LayoutDef = z.infer<typeof LayoutDefSchema>;

/**
 * 樓層設定：一段樓層區間共用的怪物池、密度、寶箱數與地圖清單。
 * 各層實際的怪物強度由 balance.difficulty 依樓層計算。
 */
export const FloorDefSchema = z.strictObject({
  id: IdSchema,
  /** 適用樓層區間 [from, to]（含兩端）；所有區間必須從 1 開始連續 */
  floors: z.tuple([z.int().positive(), z.int().positive()]).refine(([a, b]) => a <= b, 'from 必須 <= to'),
  /** 此區間輪替使用的固定地圖（必須有 S、M、X）；與 layout 擇一 */
  maps: z.array(IdSchema).min(1).optional(),
  /** 隨機產生地圖；與 maps 擇一 */
  layout: LayoutDefSchema.optional(),
  theme: DungeonThemeSchema.default('crypt'),
  /** minFloor：這種怪物從第幾層開始出現（預設區間第一層） */
  monsterPool: z
    .array(z.strictObject({ enemyId: IdSchema, weight: z.number().positive(), minFloor: z.int().positive().default(1) }))
    .min(1),
  /** 每 100 格地板的怪物數（第一層基準，之後依 balance.difficulty 增加）；0 = 沒有一般怪物 */
  density: z.number().nonnegative(),
  /** 一群怪物的隻數範圍 */
  packSize: RangeSchema.default([2, 4]),
  /** 每一群的隊長成為精英怪的機率（balance.elite.minFloor 之前不會出現） */
  eliteChance: z.number().min(0).max(1).default(0),
  /** Boss 層：樓層號是 every 的倍數時，在出口前生成 Boss；擊敗 Boss 後出口才開啟 */
  boss: z.strictObject({ enemyId: IdSchema, every: z.int().positive() }).optional(),
  /** 挑戰樓層的中途小王（依序輪流出現）；數量上限、空地大小與強度見 balance.endgame.miniBoss */
  miniBosses: z.array(IdSchema).min(1).optional(),
  /**
   * 最後一層（王座廳）：整層只有一個圓形大空間，魔王在中央，沒有出口。
   * bodies：空間直徑 = 魔王身體寬度的幾倍。寶箱沿外圈擺放（數量與掉落表用 chests / chestLootTable）
   */
  throne: z.strictObject({ enemyId: IdSchema, bodies: z.number().positive() }).optional(),
  /** 精英怪的詞綴數量範圍 */
  affixCount: RangeSchema.default([1, 1]),
  lootTier: z.int().positive(),
  /** 寶箱數量範圍 */
  chests: RangeSchema,
  chestLootTable: IdSchema,
  /** 擊敗此比例的怪物後出口開啟 */
  clearRatio: z.number().min(0).max(1),
}).refine((f) => (f.maps === undefined) !== (f.layout === undefined), '樓層必須設定 maps 或 layout（擇一）');

export type FloorDef = z.infer<typeof FloorDefSchema>;
