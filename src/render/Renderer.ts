import { Container, Graphics, type Application } from 'pixi.js';
import type { IsoProjection } from '../core/math/IsoProjection';
import { lerp, type Vec2 } from '../core/math/Vec2';
import type { GameWorld } from '../game/GameWorld';
import type { Camera } from './Camera';
import { PALETTE } from './palette';
import { ActorView } from './views/ActorView';
import { TileMapView } from './views/TileMapView';

/**
 * 每幀唯讀讀取 GameWorld，同步 PixiJS 畫面。不修改任何遊戲狀態。
 */
export class Renderer {
  private readonly worldLayer = new Container();
  private readonly objectLayer = new Container({ sortableChildren: true });
  private readonly marker = new Graphics();
  private readonly tileMap: TileMapView;
  private readonly playerView: ActorView;

  constructor(
    private readonly app: Application,
    private readonly projection: IsoProjection,
    private readonly world: GameWorld,
    private readonly camera: Camera,
  ) {
    this.tileMap = new TileMapView(projection, world.nav, this.objectLayer);
    this.playerView = new ActorView(projection, world.player.radius);
    this.objectLayer.addChild(this.playerView.container);

    this.marker
      .poly([0, -6, 12, 0, 0, 6, -12, 0])
      .stroke({ color: PALETTE.marker, width: 2 });

    this.worldLayer.addChild(this.tileMap.floor, this.marker, this.objectLayer);
    app.stage.addChild(this.worldLayer);

    const resize = () => camera.setViewport(app.screen.width, app.screen.height);
    resize();
    app.renderer.on('resize', resize);
  }

  /** alpha：本幀在兩個邏輯 Tick 之間的比例，用於位置插值 */
  render(alpha: number): void {
    const player = this.world.player;
    const playerPos = lerp(player.prevPosition, player.position, alpha);

    this.camera.follow(playerPos);
    this.worldLayer.position.set(this.camera.offset.x, this.camera.offset.y);

    this.playerView.update(playerPos, player.facing);
    this.tileMap.update(playerPos);
    this.updateMarker(player.path[player.path.length - 1]);
  }

  private updateMarker(destination: Vec2 | undefined): void {
    this.marker.visible = destination !== undefined;
    if (!destination) return;
    const s = this.projection.toScreen(destination);
    this.marker.position.set(s.x, s.y);
    const pulse = 0.75 + 0.25 * Math.sin(this.app.ticker.lastTime / 120);
    this.marker.scale.set(pulse);
  }
}
