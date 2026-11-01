import { Container, Graphics } from 'pixi.js';
import type { Vec2 } from '../../core/math/Vec2';
import type { SoulSmoke } from '../../data/schema/story';

/** 魂魄的煙：顏色、每團煙的濃度；黑煙不用疊加（疊加後看不見），濃一點才蓋得住暗處的地板 */
const SMOKE: Record<SoulSmoke, { color: number; add: boolean; alpha: number }> = {
  clear: { color: 0xdfe8ea, add: true, alpha: 0.2 },
  black: { color: 0x0a0810, add: false, alpha: 0.6 },
  grey: { color: 0x8c8c8c, add: true, alpha: 0.2 },
  gold: { color: 0xf2d68c, add: true, alpha: 0.2 },
};
/** 一縷煙持續的秒數、升起的高度（px）、由幾團煙組成 */
const LIFE = 10;
const RISE = 210;
const PUFFS = 22;

interface Wisp {
  g: Graphics;
  t: number;
  color: number;
  alpha: number;
}

/** 魔王第一次倒下時，從身上飄出的一縷煙：細長地往上升、左右搖擺、慢慢散開 */
export class SoulWispLayer {
  readonly container = new Container();
  private readonly wisps: Wisp[] = [];

  spawn(at: Vec2, smoke: SoulSmoke): void {
    const { color, add, alpha } = SMOKE[smoke];
    const g = new Graphics();
    g.position.set(at.x, at.y);
    if (add) g.blendMode = 'add';
    this.container.addChild(g);
    this.wisps.push({ g, t: 0, color, alpha });
  }

  update(dt: number): void {
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i]!;
      w.t += dt;
      if (w.t >= LIFE) {
        w.g.destroy();
        this.wisps.splice(i, 1);
        continue;
      }
      this.draw(w);
    }
  }

  private draw(w: Wisp): void {
    // 頭尾淡入淡出
    const fade = Math.min(1, w.t / 1.2) * Math.min(1, (LIFE - w.t) / 3);
    w.g.clear();
    for (let i = 0; i < PUFFS; i++) {
      const k = i / (PUFFS - 1);
      // 越上面越散、越淡；整縷煙隨時間拉長
      const height = k * RISE * Math.min(1, w.t / 3);
      const sway = Math.sin(k * 7 + w.t * 1.1) * (5 + k * 20);
      const radius = 4 + k * 13;
      w.g.circle(sway, -height, radius).fill({ color: w.color, alpha: fade * w.alpha * (1 - k * 0.8) });
    }
  }

  clear(): void {
    for (const w of this.wisps) w.g.destroy();
    this.wisps.length = 0;
  }
}
