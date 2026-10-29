import type { IsoProjection } from '../core/math/IsoProjection';
import { vec2, type Vec2 } from '../core/math/Vec2';

/** 滑鼠滾輪縮放的範圍：1 = 原本的大小，3 = 最近（畫面只看得到原本高度的 1/3） */
export const ZOOM_RANGE = { min: 1, max: 3 };

/**
 * 鏡頭：把 World 中的某一點放在畫面正中央，可放大（zoom）。
 * 不依賴 PixiJS，Screen ⇄ World 換算可直接單元測試。
 */
export class Camera {
  private center: Vec2 = vec2(0, 0);
  private _zoom = 1;
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

  /** 放大倍率（World 圖層的縮放） */
  get zoom(): number {
    return this._zoom;
  }

  setZoom(zoom: number): void {
    this._zoom = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, zoom));
    this.recompute();
  }

  /** World 圖層在畫面上的位移（取整數像素，避免畫面抖動） */
  get offset(): Vec2 {
    return this._offset;
  }

  worldToScreen(world: Vec2): Vec2 {
    const s = this.projection.toScreen(world);
    return vec2(s.x * this._zoom + this._offset.x, s.y * this._zoom + this._offset.y);
  }

  screenToWorld(screen: Vec2): Vec2 {
    return this.projection.toWorld(this.toLayer(screen));
  }

  /** 畫面座標 → World 圖層內的座標（扣掉位移與縮放） */
  toLayer(screen: Vec2): Vec2 {
    return vec2((screen.x - this._offset.x) / this._zoom, (screen.y - this._offset.y) / this._zoom);
  }

  private recompute(): void {
    const s = this.projection.toScreen(this.center);
    this._offset = vec2(
      Math.round(this.viewport.width / 2 - s.x * this._zoom),
      Math.round(this.viewport.height / 2 - s.y * this._zoom),
    );
  }
}
