import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../core/math/IsoProjection';
import { vec2, type Vec2 } from '../core/math/Vec2';

/**
 * M0 用的等角格線，用來目視確認 IsoProjection 正確。M1 會由 TileMapView 取代。
 */
export class DebugGridView {
  readonly container = new Container();
  private readonly highlight = new Graphics();

  constructor(
    private readonly projection: IsoProjection,
    private readonly size: number,
  ) {
    const grid = new Graphics();
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        this.drawTile(grid, x, y);
        grid.fill({ color: (x + y) % 2 === 0 ? 0x2a2420 : 0x221d19 });
        grid.stroke({ color: 0x3d342c, width: 1 });
      }
    }
    this.container.addChild(grid, this.highlight);
  }

  /** 高亮 World 座標所在的 Tile；回傳 Tile 座標（超出範圍回傳 null） */
  setHover(world: Vec2 | null): Vec2 | null {
    this.highlight.clear();
    if (!world) return null;
    const tx = Math.floor(world.x);
    const ty = Math.floor(world.y);
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return null;
    this.drawTile(this.highlight, tx, ty);
    this.highlight.fill({ color: 0xc8a25a, alpha: 0.35 });
    this.highlight.stroke({ color: 0xe8c47a, width: 2 });
    return vec2(tx, ty);
  }

  private drawTile(g: Graphics, x: number, y: number): void {
    const corners = [vec2(x, y), vec2(x + 1, y), vec2(x + 1, y + 1), vec2(x, y + 1)].map((p) =>
      this.projection.toScreen(p),
    );
    g.poly(corners.flatMap((p) => [p.x, p.y]));
  }
}
