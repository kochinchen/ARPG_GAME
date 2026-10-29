import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Vec2 } from '../../core/math/Vec2';

/**
 * 主角身上的「燭光」亮區（不是真的火，只是亮區）：主角周圍明亮、由內向外漸暗，亮區以外都偏暗。
 * 亮區隨等級擴大。蓋在整個地圖畫面上方（地板、牆、角色、特效都會變暗），文字、小地圖不受影響。
 */
export const PLAYER_LIGHT = {
  /** 第 1 級的半徑（World 格） */
  radius: 8,
  /** 每升一級增加的半徑（格）與上限 */
  perLevel: 0.2,
  maxRadius: 18,
  /** 亮區以外的暗度（0 = 不變暗、1 = 全黑） */
  dark: 0.72,
  /** 半徑內這個比例以內完全明亮，之後漸暗到邊緣 */
  core: 0.3,
};

/** World 1 格在畫面上的寬度（等角 2:1：圓形亮區畫成寬 2、高 1 的橢圓） */
const PX_PER_CELL = 32 * Math.SQRT2;
const TEXTURE_SIZE = 256;

/** 圓形漸層：中心透明 → 邊緣 dark 的黑色；圓以外（正方形四角）同樣是 dark */
function gradientTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const r = TEXTURE_SIZE / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const { dark, core } = PLAYER_LIGHT;
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(core, 'rgba(0,0,0,0)');
  // 漸暗用 smoothstep 取樣，邊緣不會一圈很明顯
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const s = t * t * (3 - 2 * t);
    g.addColorStop(core + (1 - core) * t, `rgba(0,0,0,${(dark * s).toFixed(3)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  return Texture.from(canvas);
}

export class PlayerLightView {
  readonly container = new Container();
  private readonly glow = new Sprite(gradientTexture());
  /** 亮區以外的四塊暗色（畫面其他部分） */
  private readonly outside = new Graphics();

  constructor() {
    this.glow.anchor.set(0.5);
    this.container.addChild(this.glow, this.outside);
  }

  /** center：主角腳底的畫面座標；width / height：畫面大小 */
  update(center: Vec2, level: number, width: number, height: number): void {
    const { radius, perLevel, maxRadius, dark } = PLAYER_LIGHT;
    const r = Math.min(maxRadius, radius + perLevel * (level - 1)) * PX_PER_CELL;
    this.glow.position.set(center.x, center.y);
    this.glow.width = r * 2;
    this.glow.height = r;
    const [left, right, top, bottom] = [center.x - r, center.x + r, center.y - r / 2, center.y + r / 2];
    const fill = { color: 0x000000, alpha: dark };
    this.outside
      .clear()
      .rect(0, 0, width, Math.max(0, top))
      .fill(fill)
      .rect(0, bottom, width, Math.max(0, height - bottom))
      .fill(fill)
      .rect(0, top, Math.max(0, left), bottom - top)
      .fill(fill)
      .rect(right, top, Math.max(0, width - right), bottom - top)
      .fill(fill);
  }
}
