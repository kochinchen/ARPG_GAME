import { describe, expect, it } from 'vitest';
import { IsoProjection } from '../../src/core/math/IsoProjection';
import { vec2 } from '../../src/core/math/Vec2';
import { Camera, ZOOM_RANGE } from '../../src/render/Camera';

describe('Camera', () => {
  const camera = new Camera(new IsoProjection(64, 32));
  camera.setViewport(800, 600);
  camera.follow(vec2(10, 5));

  it('跟隨的點位於畫面正中央', () => {
    expect(camera.worldToScreen(vec2(10, 5))).toEqual(vec2(400, 300));
  });

  it('畫面中央換算回 World 座標等於跟隨的點', () => {
    const w = camera.screenToWorld(vec2(400, 300));
    expect(w.x).toBeCloseTo(10);
    expect(w.y).toBeCloseTo(5);
  });

  it('screenToWorld 與 worldToScreen 互為反函數', () => {
    const p = vec2(13.25, 2.75);
    const back = camera.screenToWorld(camera.worldToScreen(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('放大後跟隨的點仍在中央、換算互為反函數、倍率限制在範圍內', () => {
    const zoomed = new Camera(new IsoProjection(64, 32));
    zoomed.setViewport(800, 600);
    zoomed.setZoom(2);
    zoomed.follow(vec2(10, 5));
    expect(zoomed.worldToScreen(vec2(10, 5))).toEqual(vec2(400, 300));
    const p = vec2(11, 4);
    const back = zoomed.screenToWorld(zoomed.worldToScreen(p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
    // 同樣的 World 距離，畫面上是 2 倍
    const a = zoomed.worldToScreen(vec2(11, 5));
    expect(a.x - 400).toBeCloseTo(2 * (camera.worldToScreen(vec2(11, 5)).x - 400));
    zoomed.setZoom(10);
    expect(zoomed.zoom).toBe(ZOOM_RANGE.max);
    zoomed.setZoom(0.1);
    expect(zoomed.zoom).toBe(ZOOM_RANGE.min);
  });
});
