import { z } from 'zod';
import { IdSchema } from './common';

/**
 * 手繪地圖（ASCII）。第 y 列第 x 字元 = Tile (x, y)。
 *   '#' 牆壁   '.' 地板   'S' 玩家出生點（地板）
 */
export const MAP_TILES = { wall: '#', floor: '.', spawn: 'S' } as const;

export const MapDefSchema = z
  .strictObject({
    id: IdSchema,
    rows: z.array(z.string().min(1)).min(1),
  })
  .superRefine((map, ctx) => {
    const width = map.rows[0]?.length ?? 0;
    let spawns = 0;
    map.rows.forEach((row, y) => {
      if (row.length !== width) {
        ctx.addIssue({ code: 'custom', path: ['rows', y], message: `第 ${y} 列長度 ${row.length}，應為 ${width}` });
      }
      for (const [x, char] of [...row].entries()) {
        if (char === MAP_TILES.spawn) spawns++;
        else if (char !== MAP_TILES.wall && char !== MAP_TILES.floor) {
          ctx.addIssue({ code: 'custom', path: ['rows', y], message: `(${x}, ${y}) 不合法的字元 '${char}'` });
        }
      }
    });
    if (spawns !== 1) ctx.addIssue({ code: 'custom', path: ['rows'], message: `出生點 'S' 必須剛好 1 個，目前 ${spawns} 個` });
  });

export type MapDef = z.infer<typeof MapDefSchema>;
