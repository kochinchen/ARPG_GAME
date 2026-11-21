import { Container } from 'pixi.js';
import type { IsoProjection } from '../../core/math/IsoProjection';
import { vec2, type Vec2 } from '../../core/math/Vec2';
import type { PlacedSetPiece } from '../../data/schema/map';
import { setPieceForward, setPieceSpot } from '../../game/world/SetPieces';
import { PolyFigure } from '../figure/PolyFigure';
import { CORPSE_PROPS, SET_PIECE_PROPS, type SetPieceProp } from '../figure/SetPieceProps';
import type { ThreeFigure, ThreeWorld } from '../three/ThreeWorld';

interface PropView {
  container: Container;
  figure: PolyFigure;
  position: Vec2;
  three: ThreeFigure | null;
  redraw: () => void;
  shown: boolean;
}

/**
 * 小說固定場景的擺設（只有畫面）：換層時依地圖重建，模型不會動，只畫一次。
 */
export class SetPieceLayer {
  private views: PropView[] = [];
  private three: ThreeWorld | null = null;
  private readonly containers = new Set<Container>();

  constructor(
    private readonly projection: IsoProjection,
    private readonly objectLayer: Container,
  ) {}

  /** 有 Three.js 模型的物件：Renderer 不幫它放深度板 */
  hasModel(container: Container): boolean {
    return this.containers.has(container);
  }

  /** corpses：靠牆坐著的屍體（隱藏遺物），不是地圖的一部分，只在條件達成時才有 */
  rebuild(pieces: readonly PlacedSetPiece[], corpses: readonly { position: Vec2; forward: Vec2 }[] = []): void {
    this.clear();
    for (const piece of pieces) {
      const forward = setPieceForward(piece);
      const side = vec2(-forward.y, forward.x);
      for (const prop of SET_PIECE_PROPS[piece.id] ?? []) this.addProp(prop, setPieceSpot(piece, prop.u, prop.v), prop.turn === 'side' ? side : forward);
    }
    for (const { position, forward } of corpses) {
      const side = vec2(-forward.y, forward.x);
      for (const prop of CORPSE_PROPS) {
        this.addProp(prop, vec2(position.x + side.x * prop.u + forward.x * prop.v, position.y + side.y * prop.u + forward.y * prop.v), forward);
      }
    }
  }

  private addProp(prop: SetPieceProp, position: Vec2, facing: Vec2): void {
    const s = this.projection.toScreen(position);
    const container = new Container();
    container.position.set(s.x, s.y);
    // 牆上的東西貼在牆前，排在角色後面
    container.zIndex = this.projection.depth(position) - 0.6;
    const figure = new PolyFigure(prop.model, prop.scale ?? 1);
    container.addChild(figure.graphics);
    this.objectLayer.addChild(container);
    const pose = prop.pose ?? { rootY: 0, angles: {} };
    const view: PropView = { container, figure, position, three: null, redraw: () => figure.showPose(pose, facing), shown: true };
    view.redraw();
    this.containers.add(container);
    this.views.push(view);
    this.attach(view);
  }

  /** 視線：看過的地方才顯示擺設（沒看過的地方全黑，擺設不能自己浮在黑暗裡） */
  reveal(wasSeen: (p: Vec2) => boolean): void {
    for (const view of this.views) {
      const shown = wasSeen(view.position);
      if (shown === view.shown) continue;
      view.shown = shown;
      view.container.visible = shown;
      view.three?.place(view.position, { x: 0, y: 0 }, 0, 0xffffff, 1, shown);
    }
  }

  setThree(world: ThreeWorld | null): void {
    this.three = world;
    for (const view of this.views) this.attach(view);
  }

  private attach(view: PropView): void {
    if (!!view.three === !!this.three) return;
    view.three?.dispose();
    view.three = this.three?.createFigure() ?? null;
    view.figure.sink = view.three;
    view.redraw();
    view.three?.place(view.position, { x: 0, y: 0 }, 0, 0xffffff, 1, view.shown);
  }

  private clear(): void {
    for (const view of this.views) {
      view.three?.dispose();
      view.container.destroy({ children: true });
    }
    this.views = [];
    this.containers.clear();
  }
}
