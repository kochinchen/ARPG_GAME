import { Container, Graphics } from 'pixi.js';
import { vec2 } from '../../core/math/Vec2';
import type { Rarity } from '../../data/schema/item';
import type { OutfitParts } from '../figure/gear/ArmorLooks';
import { HEROINE } from '../figure/Heroine';
import { PolyFigure } from '../figure/PolyFigure';
import { mountFor, type WeaponLook } from '../figure/weapons/WeaponLooks';
import { WeaponGlowView } from './WeaponGlowView';

/** 預覽區（畫面座標，CSS px）與方向（0～7，從正面開始） */
export interface HeroPreviewState {
  x: number;
  y: number;
  width: number;
  height: number;
  dir: number;
}

/** 八個方向（World 面向）：從正面開始，每次往同一個方向轉 45° */
const FACINGS = [vec2(1, 1), vec2(1, 0), vec2(1, -1), vec2(0, -1), vec2(-1, -1), vec2(-1, 0), vec2(-1, 1), vec2(0, 1)];
/** 主角模型的高度（px，縮放 1 時）：用來把模型放大到預覽區 */
const MODEL_HEIGHT = 62;

/**
 * 角色頁的大尺寸人物預覽：在主畫面上（畫面座標）畫出放大的主角，
 * 與遊戲同一個模型、換裝、手上武器與武器微光，待機動畫即時播放。
 * 不另外建立 PixiJS 應用程式（每多一個 WebGL 環境，瀏覽器可能會丟掉遊戲畫面的環境）。
 */
export class HeroPreviewView {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly body = new Container();
  private readonly figure = new PolyFigure(HEROINE, 1);
  private readonly glow = new WeaponGlowView();
  private state: HeroPreviewState | null = null;
  private outfit: OutfitParts | null = null;
  private weapon: WeaponLook | null | undefined = undefined;

  constructor() {
    const shadow = new Graphics().ellipse(0, 0, 14, 6.5).fill({ color: 0x000000, alpha: 0.45 });
    this.body.addChild(shadow, this.glow.back, this.figure.graphics, this.glow.front);
    this.container.addChild(this.background, this.body);
    this.container.visible = false;
  }

  set(state: HeroPreviewState | null): void {
    this.state = state;
    this.container.visible = state !== null;
    if (!state) return;
    this.background
      .clear()
      .rect(state.x, state.y, state.width, state.height)
      .fill({ color: 0x110e0b })
      .ellipse(state.x + state.width / 2, state.y + state.height * 0.7, state.width * 0.55, state.height * 0.45)
      .fill({ color: 0x2a231d, alpha: 0.7 });
    const scale = (state.height * 0.78) / MODEL_HEIGHT;
    this.body.position.set(state.x + state.width / 2, state.y + state.height - 48);
    this.body.scale.set(scale);
  }

  /** 身上的外觀（與遊戲畫面的主角相同） */
  setLook(outfit: OutfitParts, weapon: WeaponLook | null, rarity: Rarity): void {
    if (outfit !== this.outfit) {
      this.outfit = outfit;
      this.figure.setOutfit(outfit.size > 0 ? outfit : null);
    }
    if (weapon !== this.weapon) {
      this.weapon = weapon;
      this.figure.setWeapon(weapon ? mountFor(weapon) : null);
    }
    this.glow.set(weapon ? rarity : 'normal', weapon?.glow ?? null);
  }

  update(dt: number): void {
    if (!this.state) return;
    this.figure.update(dt, { facing: FACINGS[((this.state.dir % 8) + 8) % 8]!, moving: false, alive: true });
    this.glow.update(dt, this.figure.weaponAxis, true);
  }
}
