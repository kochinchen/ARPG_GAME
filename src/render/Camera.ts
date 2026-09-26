import type { IsoProjection } from '../core/math/IsoProjection';
import { vec2, type Vec2 } from '../core/math/Vec2';

/**
 * 鏡頭：把 World 中的某一點放在畫面正中央。
 * 不依賴 PixiJS，Screen ⇄ World 換算可直接單元測試。
 */
export class Camera {
  private center: Vec2 = vec2(0, 0);
  private viewport = { width: 0, height: 0 };
  private _offset: Vec2 = vec2(0, 0);

  constructor(private readonly projection: IsoProjection) {}

  setViewport(width: number, height: number): void {
    this.viewport = { width, height };
    this.recompute();
  }

  /** 鏡頭中心（World 座標） */
  follow(world: Vec2): void {
    this.center = world;
    this.recompute();
  }

  /** World 圖層在畫面上的位移（取整數像素，避免畫面抖動） */
  get offset(): Vec2 {
    return this._offset;
  }

  worldToScreen(world: Vec2): Vec2 {
    const s = this.projection.toScreen(world);
    return vec2(s.x + this._offset.x, s.y + this._offset.y);
  }

  screenToWorld(screen: Vec2): Vec2 {
    return this.projection.toWorld(vec2(screen.x - this._offset.x, screen.y - this._offset.y));
  }

  private recompute(): void {
    const s = this.projection.toScreen(this.center);
    this._offset = vec2(
      Math.round(this.viewport.width / 2 - s.x),
      Math.round(this.viewport.height / 2 - s.y),
    );
  }
}
