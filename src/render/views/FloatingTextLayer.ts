import { Container, Text } from 'pixi.js';
import type { Vec2 } from '../../core/math/Vec2';
import { PALETTE } from '../palette';

const LIFETIME = 0.8;
const RISE = 36;

interface FloatingText {
  text: Text;
  age: number;
  startY: number;
}

/** 傷害數字：往上飄並淡出 */
export class FloatingTextLayer {
  readonly container = new Container();
  private readonly items: FloatingText[] = [];

  /** screen：World 圖層內的畫面座標（腳底） */
  spawn(screen: Vec2, value: number, isCrit: boolean): void {
    const text = new Text({
      text: isCrit ? `${value}!` : `${value}`,
      style: {
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        fontSize: isCrit ? 22 : 16,
        fill: isCrit ? PALETTE.critText : PALETTE.damageText,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    text.anchor.set(0.5, 1);
    // 稍微錯開，連續命中時數字不會完全重疊
    const startY = screen.y - 60;
    text.position.set(screen.x + (Math.random() - 0.5) * 16, startY);
    this.container.addChild(text);
    this.items.push({ text, age: 0, startY });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!;
      item.age += dt;
      const t = item.age / LIFETIME;
      if (t >= 1) {
        item.text.destroy();
        this.items.splice(i, 1);
        continue;
      }
      item.text.y = item.startY - RISE * (1 - (1 - t) ** 2);
      item.text.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }
  }
}
