import { Rng } from '../../core/Rng';
import type { NoteDef } from '../../data/schema/story';

/**
 * 挑戰者的筆記：這個寶箱有沒有夾著一頁（純函式）。
 * 每一頁屬於某一層（data/notebook.json）。在那一層，只有由世界種子選中的那個寶箱有；
 * 錯過了（或舊存檔已經開過那個寶箱），之後更深樓層開的下一個寶箱會補上，所以每一頁都拿得到。
 * 一個寶箱最多一頁。
 */
export function notePageInChest(
  notes: readonly NoteDef[],
  chest: { floor: number; spawnIndex: number; floorChests: number },
  seed: number,
  owned: ReadonlySet<string>,
): NoteDef | null {
  const next = notes.filter((n) => !owned.has(n.id) && n.floor <= chest.floor).sort((a, b) => a.floor - b.floor)[0];
  if (!next) return null;
  if (next.floor < chest.floor) return next;
  const chosen = new Rng(seed).fork(`note-${next.id}`).int(0, Math.max(0, chest.floorChests - 1));
  return chest.spawnIndex === chosen ? next : null;
}
