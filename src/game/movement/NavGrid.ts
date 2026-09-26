import { vec2, type Vec2 } from '../../core/math/Vec2';
import { MAP_TILES, type MapDef } from '../../data/schema/map';

/**
 * 可行走網格。Tile (x, y) 佔 World 範圍 [x, x+1) × [y, y+1)。
 * 換樓層時以 load() 就地替換地圖，持有此物件的系統不需要重建。
 */
export class NavGrid {
  private _width = 0;
  private _height = 0;
  private walkable = new Uint8Array(0);

  private constructor() {}

  static fromMap(map: Pick<MapDef, 'rows'>): NavGrid {
    const nav = new NavGrid();
    nav.load(map);
    return nav;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  load(map: Pick<MapDef, 'rows'>): void {
    this._height = map.rows.length;
    this._width = map.rows[0]?.length ?? 0;
    this.walkable = new Uint8Array(this._width * this._height);
    map.rows.forEach((row, y) => {
      for (let x = 0; x < this._width; x++) {
        this.walkable[y * this._width + x] = row[x] === MAP_TILES.wall ? 0 : 1;
      }
    });
  }

  /** 所有可走的 Tile */
  walkableTiles(): Vec2[] {
    const tiles: Vec2[] = [];
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) if (this.walkable[y * this._width + x] === 1) tiles.push(vec2(x, y));
    }
    return tiles;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /** Tile 座標是否可走；超出地圖視為牆 */
  isWalkable(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && this.walkable[ty * this.width + tx] === 1;
  }

  /** World 座標所在的 Tile 是否可走 */
  isWalkableAt(x: number, y: number): boolean {
    return this.isWalkable(Math.floor(x), Math.floor(y));
  }

  /** 半徑為 radius 的圓（以方形近似）放在 p 是否不碰牆 */
  isClearAt(p: Vec2, radius: number): boolean {
    return (
      this.isWalkableAt(p.x - radius, p.y - radius) &&
      this.isWalkableAt(p.x + radius, p.y - radius) &&
      this.isWalkableAt(p.x - radius, p.y + radius) &&
      this.isWalkableAt(p.x + radius, p.y + radius)
    );
  }

  /** a → b 的直線上，半徑 radius 的角色是否都不會碰牆 */
  hasLineOfSight(a: Vec2, b: Vec2, radius: number): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isClearAt(vec2(a.x + dx * t, a.y + dy * t), radius)) return false;
    }
    return true;
  }

  /** 把點推離相鄰的牆，確保半徑 radius 的角色站得下 */
  clampInside(p: Vec2, radius: number): Vec2 {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    let { x, y } = p;
    if (!this.isWalkable(tx - 1, ty)) x = Math.max(x, tx + radius);
    if (!this.isWalkable(tx + 1, ty)) x = Math.min(x, tx + 1 - radius);
    if (!this.isWalkable(tx, ty - 1)) y = Math.max(y, ty + radius);
    if (!this.isWalkable(tx, ty + 1)) y = Math.min(y, ty + 1 - radius);
    return vec2(x, y);
  }

  /**
   * 從 tile 往外一圈一圈找最近的可走 Tile。
   * 同距離時選離 prefer 較近的（通常是玩家位置），避免跑到牆的另一側。
   */
  nearestWalkable(tile: Vec2, maxRadius: number, prefer: Vec2): Vec2 | null {
    if (this.isWalkable(tile.x, tile.y)) return tile;
    for (let r = 1; r <= maxRadius; r++) {
      let best: Vec2 | null = null;
      let bestScore = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = tile.x + dx;
          const ty = tile.y + dy;
          if (!this.isWalkable(tx, ty)) continue;
          const toTarget = Math.hypot(dx, dy);
          const toPrefer = Math.hypot(tx + 0.5 - prefer.x, ty + 0.5 - prefer.y);
          const score = toTarget * 1000 + toPrefer;
          if (score < bestScore) {
            bestScore = score;
            best = vec2(tx, ty);
          }
        }
      }
      if (best) return best;
    }
    return null;
  }
}

export const tileOf = (p: Vec2): Vec2 => vec2(Math.floor(p.x), Math.floor(p.y));
export const tileCenter = (tile: Vec2): Vec2 => vec2(tile.x + 0.5, tile.y + 0.5);
