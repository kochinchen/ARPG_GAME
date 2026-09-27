import { Container, Graphics, type Application } from 'pixi.js';
import { vec2 } from '../core/math/Vec2';
import { DEFAULT_MONSTER_MODEL, MONSTER_MODELS } from './figure/Monsters';
import { PolyFigure } from './figure/PolyFigure';

/** 頭像的大小（px） */
const SIZE = 160;

/**
 * 怪物圖鑑的頭像：把多面體模型以待機姿勢畫成圖片（data URL），同一隻怪物只畫一次。
 * 大小統一縮放到頭像框內（圖鑑另外顯示實際體型）。
 */
export class Portraits {
  private readonly cache = new Map<string, string>();

  constructor(private readonly app: Application) {}

  get(enemyId: string): string {
    const cached = this.cache.get(enemyId);
    if (cached) return cached;
    const model = MONSTER_MODELS[enemyId] ?? DEFAULT_MONSTER_MODEL;
    const figure = new PolyFigure(model, 1);
    figure.showPose(model.poses.ready(0.4), vec2(1, 0.35));
    const stage = new Container();
    stage.addChild(new Graphics().rect(0, 0, SIZE, SIZE).fill({ color: 0x000000, alpha: 0 }));
    stage.addChild(figure.graphics);
    // 模型置中並縮放到框內
    const b = figure.graphics.getLocalBounds();
    const k = Math.min((SIZE * 0.86) / Math.max(1, b.width), (SIZE * 0.86) / Math.max(1, b.height));
    figure.graphics.scale.set(k);
    figure.graphics.position.set(SIZE / 2 - (b.x + b.width / 2) * k, SIZE / 2 - (b.y + b.height / 2) * k);
    const canvas = this.app.renderer.extract.canvas({ target: stage, resolution: 2 }) as HTMLCanvasElement;
    const url = canvas.toDataURL('image/png');
    stage.destroy({ children: true });
    this.cache.set(enemyId, url);
    return url;
  }
}
