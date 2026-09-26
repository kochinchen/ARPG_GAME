import { vec2, type Vec2 } from './Vec2';

/**
 * 2:1 等角投影（Diablo 2 式）。
 * 遊戲邏輯只用 World 座標；只有 render / input 需要與 Screen 座標互轉。
 *
 *   World +x → 畫面右下
 *   World +y → 畫面左下
 */
export class IsoProjection {
  private readonly halfW: number;
  private readonly halfH: number;

  constructor(
    readonly tileWidth = 64,
    readonly tileHeight = 32,
  ) {
    this.halfW = tileWidth / 2;
    this.halfH = tileHeight / 2;
  }

  toScreen(world: Vec2): Vec2 {
    return vec2((world.x - world.y) * this.halfW, (world.x + world.y) * this.halfH);
  }

  toWorld(screen: Vec2): Vec2 {
    const a = screen.x / this.halfW;
    const b = screen.y / this.halfH;
    return vec2((a + b) / 2, (b - a) / 2);
  }

  /** 深度排序鍵：值越大越靠近鏡頭，越晚繪製 */
  depth(world: Vec2): number {
    return world.x + world.y;
  }
}
