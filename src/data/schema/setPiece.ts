import { z } from 'zod';
import { IdSchema } from './common';

/**
 * 固定場景（data/setPieces.ts）：隨機地圖產生後，放進主路旁的小說場景。
 * 只有地形與遺物位置是遊戲邏輯；場景裡的擺設只是畫面（render/figure/SetPieceProps）。
 */
export const SetPieceDefSchema = z.strictObject({
  id: IdSchema,
  floor: z.int().positive(),
  /** wall：貼著一面補平的長牆（只放在鏡頭看得到的北、西兩面）；room：從岩壁挖出來、只有一道門的房間 */
  kind: z.enum(['wall', 'room']),
  /** 沿牆方向的寬度（Tile） */
  width: z.number().positive(),
  /** 離牆的深度（Tile）；room 是從門到後牆 */
  depth: z.number().positive(),
  /** 這一層的遺物固定放在場景裡；u 沿牆（0～1）、v 從後牆到前方（0～1） */
  relic: z.strictObject({ loreId: IdSchema, u: z.number().min(0).max(1), v: z.number().min(0).max(1) }).optional(),
});
export type SetPieceDef = z.infer<typeof SetPieceDefSchema>;
