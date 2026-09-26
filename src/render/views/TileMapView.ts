import { Container, Graphics } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { NavGrid } from '../../game/movement/NavGrid';
import { PALETTE } from '../palette';

const WALL_HEIGHT = 28;
/** 擋住玩家的牆改為半透明 */
const FADE_ALPHA = 0.35;
/** 玩家身體在畫面上的範圍（相對腳底，px），用來判斷是否被牆遮住 */
const OCCLUDE_HALF_WIDTH = 48;
const OCCLUDE_BELOW = 72;

interface WallView {
  graphics: Graphics;
  /** 牆中心的畫面座標（未加鏡頭位移） */
  screen: Vec2;
  depth: number;
}

/**
 * 地板畫在 floorLayer；牆壁是立體方塊，放進與角色共用的 objectLayer 依深度排序。
 */
export class TileMapView {
  readonly floor = new Graphics();
  private readonly walls: WallView[] = [];

  constructor(
    private readonly projection: IsoProjection,
    nav: NavGrid,
    objectLayer: Container,
  ) {
    for (let y = 0; y < nav.height; y++) {
      for (let x = 0; x < nav.width; x++) {
        // 牆底下也畫地板，牆變半透明時才不會露出背景
        this.floor.poly(this.corners(x, y));
        this.floor.fill({ color: (x + y) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB });
        this.floor.stroke({ color: PALETTE.floorLine, width: 1, alpha: 0.6 });
        if (!nav.isWalkable(x, y)) {
          const graphics = this.drawWall(x, y);
          // 牆佔 [x, x+1) × [y, y+1)，以中心深度排序
          const depth = x + y + 1;
          graphics.zIndex = depth;
          objectLayer.addChild(graphics);
          this.walls.push({ graphics, screen: projection.toScreen(vec2(x + 0.5, y + 0.5)), depth });
        }
      }
    }
  }

  /** 在玩家前方、且畫面上蓋住玩家身體的牆改為半透明 */
  update(playerPos: Vec2): void {
    const playerDepth = this.projection.depth(playerPos);
    const p = this.projection.toScreen(playerPos);
    for (const wall of this.walls) {
      const dy = wall.screen.y - p.y;
      const occludes =
        wall.depth > playerDepth &&
        Math.abs(wall.screen.x - p.x) < OCCLUDE_HALF_WIDTH &&
        dy > 0 &&
        dy < OCCLUDE_BELOW;
      wall.graphics.alpha = occludes ? FADE_ALPHA : 1;
    }
  }

  private drawWall(x: number, y: number): Graphics {
    const g = new Graphics();
    const [top, right, bottom, left] = this.cornerPoints(x, y);
    const up = (p: Vec2) => vec2(p.x, p.y - WALL_HEIGHT);
    const flat = (...ps: Vec2[]) => ps.flatMap((p) => [p.x, p.y]);

    g.poly(flat(left, bottom, up(bottom), up(left))).fill({ color: PALETTE.wallLeft });
    g.poly(flat(bottom, right, up(right), up(bottom))).fill({ color: PALETTE.wallRight });
    g.poly(flat(up(top), up(right), up(bottom), up(left)))
      .fill({ color: PALETTE.wallTop })
      .stroke({ color: PALETTE.wallEdge, width: 1 });
    return g;
  }

  /** Tile 的四個角（上、右、下、左）的畫面座標 */
  private cornerPoints(x: number, y: number): [Vec2, Vec2, Vec2, Vec2] {
    const p = this.projection;
    return [p.toScreen(vec2(x, y)), p.toScreen(vec2(x + 1, y)), p.toScreen(vec2(x + 1, y + 1)), p.toScreen(vec2(x, y + 1))];
  }

  private corners(x: number, y: number): number[] {
    return this.cornerPoints(x, y).flatMap((c) => [c.x, c.y]);
  }
}
