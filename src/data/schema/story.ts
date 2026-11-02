import { z } from 'zod';
import { IdSchema } from './common';

/** 散落在地圖上的遺物（data/lore.json）：每層固定內容、位置隨機 */
export const LoreDefSchema = z.object({
  id: IdSchema,
  floor: z.number().int().min(1),
  /** 物件名稱（地上的標籤、舊紙頁的標題） */
  object: z.string().min(1),
  en: z.string().min(1),
  zh: z.string().min(1),
  /** 隱藏遺物（data/hiddenLore.json）：打完隱藏難關才出現，不算在井誌的總頁數與獎勵裡 */
  hidden: z.boolean().optional(),
});
export type LoreDef = z.infer<typeof LoreDefSchema>;

/** 挑戰者的筆記（data/notebook.json）：夾在寶箱裡的一頁；floor 是這一頁所在的樓層（頁碼由 data/book.ts 推導） */
export const NoteDefSchema = z.object({
  id: IdSchema,
  floor: z.number().int().min(1),
  en: z.string().min(1),
  zh: z.string().min(1),
});
export type NoteDef = z.infer<typeof NoteDefSchema>;

/** 魔王第一次倒下時飄出的魂魄（data/souls.json）；清白：解脫的守門人、黑：深淵魔王、灰：回聲、金：艾希琳 */
export const SoulSmokeSchema = z.enum(['clear', 'black', 'grey', 'gold']);
export type SoulSmoke = z.infer<typeof SoulSmokeSchema>;

export const SoulDefSchema = z.object({
  id: IdSchema,
  floor: z.number().int().min(1),
  name: z.string().min(1),
  smoke: SoulSmokeSchema,
  lines: z.array(z.object({ en: z.string().min(1), zh: z.string().min(1) })).min(1),
});
export type SoulDef = z.infer<typeof SoulDefSchema>;
