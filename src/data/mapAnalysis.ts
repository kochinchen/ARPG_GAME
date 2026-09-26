import { MAP_TILES, type MapDef } from './schema/map';

export type Tile = { x: number; y: number };

/** 地圖上某個記號（S / M / X）的位置 */
export function findMarker(map: Pick<MapDef, 'rows'>, marker: string): Tile | null {
  for (const [y, row] of map.rows.entries()) {
    const x = row.indexOf(marker);
    if (x >= 0) return { x, y };
  }
  return null;
}

/** 從 start 出發可以走到的所有地板格（4 方向） */
export function reachableTiles(map: Pick<MapDef, 'rows'>, start: Tile): Set<string> {
  const key = (x: number, y: number) => `${x},${y}`;
  const walkable = (x: number, y: number) => {
    const c = map.rows[y]?.[x];
    return c !== undefined && c !== MAP_TILES.wall;
  };
  const seen = new Set([key(start.x, start.y)]);
  const queue: Tile[] = [start];
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(nx, ny) || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}
