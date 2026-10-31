import { Container } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import type { Vec2 } from '../../core/math/Vec2';
import type { Corpse } from '../../game/GameWorld';
import { figureScale } from '../figure/FigureModel';
import { DEFAULT_MONSTER_MODEL, MONSTER_MODELS } from '../figure/Monsters';
import { PolyFigure, type FigureState } from '../figure/PolyFigure';
import type { ThreeFigure, ThreeWorld } from '../three/ThreeWorld';

/** 屍體整體變暗（像打開的寶箱，一看就知道已經處理過） */
const CORPSE_TINT = 0x6a6660;
/** 倒地動作播多久之後固定不動（PolyFigure 的死亡過程是 1.25 秒） */
const FALL_TIME = 1.3;

interface View {
  container: Container;
  figure: PolyFigure;
  three: ThreeFigure | null;
  /** 倒地動作還剩幾秒（0 = 已經躺好，不再重畫） */
  falling: number;
  state: FigureState;
}

/**
 * 屍體（GameWorld.corpses）：每隻怪都是同一種倒地動作，播完就固定不動、整體變暗，換樓層才消失。
 * 躺好之後不再重畫；Three.js 畫法是靜態網格、不投也不收影子。畫在地面層（不擋住站著的角色與物件）。
 */
export class CorpseLayer {
  readonly container = new Container({ sortableChildren: true });
  private readonly views = new Map<Corpse, View>();
  private three: ThreeWorld | null = null;

  constructor(private readonly projection: IsoProjection) {}

  /** 切換 Three.js 畫法：重建模型並畫出目前的姿勢 */
  setThree(world: ThreeWorld | null): void {
    this.three = world;
    for (const [corpse, view] of this.views) {
      view.three?.dispose();
      view.three = null;
      this.attachThree(corpse, view);
      view.figure.update(0, view.state);
      this.place(corpse, view);
    }
  }

  update(corpses: readonly Corpse[], dt: number, onScreen: (p: Vec2) => boolean): void {
    const seen = new Set<Corpse>();
    for (const corpse of corpses) {
      seen.add(corpse);
      let view = this.views.get(corpse);
      if (!view) view = this.create(corpse);
      if (view.falling > 0) {
        view.falling = Math.max(0, view.falling - dt);
        view.figure.update(dt, view.state);
      }
      // 畫面外的移出圖層（不只是隱藏）：圖層每幀排序，一層可能有幾百具
      const shown = onScreen(corpse.position);
      if (!shown) view.container.removeFromParent();
      else if (!view.container.parent) this.container.addChild(view.container);
    }
    for (const [corpse, view] of this.views) {
      if (seen.has(corpse)) continue;
      view.three?.dispose();
      view.container.destroy({ children: true });
      this.views.delete(corpse);
    }
  }

  private create(corpse: Corpse): View {
    const model = MONSTER_MODELS[corpse.defId] ?? DEFAULT_MONSTER_MODEL;
    const figure = new PolyFigure(model, figureScale(model, corpse.visualRadius));
    const container = new Container();
    const s = this.projection.toScreen(corpse.position);
    container.position.set(s.x, s.y);
    container.zIndex = this.projection.depth(corpse.position);
    container.tint = CORPSE_TINT;
    container.addChild(figure.graphics);
    const view: View = { container, figure, three: null, falling: corpse.restored ? 0 : FALL_TIME, state: { facing: corpse.facing, moving: false, alive: false } };
    this.attachThree(corpse, view);
    // 讀檔還原的直接躺好（一次走完死亡過程）
    figure.update(corpse.restored ? FALL_TIME : 0, view.state);
    this.place(corpse, view);
    this.views.set(corpse, view);
    return view;
  }

  private attachThree(corpse: Corpse, view: View): void {
    if (!this.three) {
      view.figure.sink = null;
      return;
    }
    view.three = this.three.createFigure(false, true);
    view.figure.sink = view.three;
    this.place(corpse, view);
  }

  private place(corpse: Corpse, view: View): void {
    view.three?.place(corpse.position, { x: 0, y: 0 }, 0, CORPSE_TINT, 1, true);
  }
}
