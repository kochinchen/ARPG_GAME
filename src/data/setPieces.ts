import type { z } from 'zod';
import type { SetPieceDefSchema } from './schema/setPiece';

/** 小說《井誌》的固定場景（docs/地圖設計V6_小說樓層場景.md）：第一批，都放在主路旁 */
export const setPieces: z.input<typeof SetPieceDefSchema>[] = [
  { id: 'piece.dead_supper', floor: 2, kind: 'room', width: 10, depth: 8 },
  { id: 'piece.chalk_wall', floor: 4, kind: 'wall', width: 6, depth: 4, relic: { loreId: 'lore.f4', u: 0.5, v: 0.35 } },
  { id: 'piece.captain_room', floor: 9, kind: 'room', width: 8, depth: 8, relic: { loreId: 'lore.f9', u: 0.5, v: 0.5 } },
  { id: 'piece.hand_wall', floor: 19, kind: 'wall', width: 20, depth: 6, relic: { loreId: 'lore.f19', u: 0.5, v: 0.45 } },
  { id: 'piece.master_room', floor: 23, kind: 'room', width: 6, depth: 6, relic: { loreId: 'lore.f23', u: 0.5, v: 0.55 } },
];
