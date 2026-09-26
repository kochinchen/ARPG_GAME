/**
 * Composition Root：唯一可以 import 所有模組並把它們接在一起的地方。
 * 初始化順序見 docs/ARCHITECTURE.md 第 J 節。
 */
import { Application } from 'pixi.js';
import { createApp } from 'vue';
import { DataRegistry } from './data/DataRegistry';
import { gameData } from './data';
import { GameLoop } from './core/GameLoop';
import { IsoProjection } from './core/math/IsoProjection';
import { vec2 } from './core/math/Vec2';
import { DebugGridView } from './render/DebugGridView';
import { debugView } from './ui/bridge/DebugView';
import App from './ui/App.vue';

const GRID_SIZE = 12;

async function bootstrap(): Promise<void> {
  // 1. 資料驗證失敗就停止
  DataRegistry.load(gameData);

  // 6. Render
  const host = document.getElementById('game');
  if (!host) throw new Error('#game not found');
  const app = new Application();
  await app.init({ resizeTo: host, background: 0x0b0a09, antialias: true });
  host.appendChild(app.canvas);

  const projection = new IsoProjection();
  const grid = new DebugGridView(projection, GRID_SIZE);
  app.stage.addChild(grid.container);

  const center = projection.toScreen(vec2(GRID_SIZE / 2, GRID_SIZE / 2));
  const layout = () => {
    grid.container.position.set(app.screen.width / 2 - center.x, app.screen.height / 2 - center.y);
  };
  layout();
  app.renderer.on('resize', layout);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointermove', (e) => {
    const local = grid.container.toLocal(e.global);
    debugView.hoverTile = grid.setHover(projection.toWorld(vec2(local.x, local.y)));
  });

  // 7. UI
  createApp(App).mount('#ui');

  // 9. Loop
  const loop = new GameLoop({
    update: () => {},
    render: () => {
      debugView.tick = loop.tick;
      debugView.fps = Math.round(app.ticker.FPS);
    },
  });
  loop.start({ now: () => performance.now() / 1000 }, (cb) => requestAnimationFrame(cb));
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;color:#f88;white-space:pre-wrap';
  pre.textContent = error instanceof Error ? error.message : String(error);
  document.body.appendChild(pre);
});
