/**
 * Composition Root：唯一可以 import 所有模組並把它們接在一起的地方。
 * 初始化順序見 docs/ARCHITECTURE.md 第 J 節。
 */
import { Application } from 'pixi.js';
import { createApp } from 'vue';
import { DataRegistry } from './data/DataRegistry';
import { gameData } from './data';
import { CommandQueue } from './core/CommandQueue';
import { EventBus } from './core/EventBus';
import { GameLoop } from './core/GameLoop';
import { IsoProjection } from './core/math/IsoProjection';
import type { GameCommand } from './game/Commands';
import type { GameEvents } from './game/GameEvents';
import { GameWorld } from './game/GameWorld';
import { Camera } from './render/Camera';
import { Renderer } from './render/Renderer';
import { PALETTE } from './render/palette';
import { InputManager } from './input/InputManager';
import { debugView } from './ui/bridge/DebugView';
import App from './ui/App.vue';

const START_MAP = 'map.test_1';

async function bootstrap(): Promise<void> {
  // 1. 資料驗證失敗就停止
  const data = DataRegistry.load(gameData);

  // 2. 基礎設施
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const seed = Date.now() >>> 0;

  // 4. GameWorld
  const world = new GameWorld({ data, mapId: START_MAP, commands, events, seed });

  // 6. Render
  const host = document.getElementById('game');
  if (!host) throw new Error('#game not found');
  const app = new Application();
  await app.init({
    resizeTo: host,
    background: PALETTE.background,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  host.appendChild(app.canvas);

  const projection = new IsoProjection();
  const camera = new Camera(projection);
  const renderer = new Renderer(app, projection, world, camera);

  // 7. UI
  createApp(App).mount('#ui');

  // 8. Input（最後才開始接受輸入）
  const input = new InputManager(app.canvas, commands, {
    screenToWorld: (screen) => camera.screenToWorld(screen),
    pickActor: (screen) => renderer.pickActorAt(screen),
  });

  // 9. Loop
  const now = () => performance.now() / 1000;
  const loop = new GameLoop({
    update: (dt) => world.update(dt),
    render: (alpha) => {
      renderer.setHovered(renderer.pickActorAt(input.pointerScreen));
      renderer.render(alpha);
      input.poll(now());
      debugView.tick = loop.tick;
      debugView.fps = Math.round(app.ticker.FPS);
      debugView.player.x = world.player.position.x;
      debugView.player.y = world.player.position.y;
      debugView.waypoints = world.player.path.length;
      const player = world.player;
      debugView.playerHp = `${Math.ceil(player.hp)} / ${Math.ceil(player.maxHp)}`;
      debugView.enemies = world.actors.filter((a) => a.faction === 'enemy' && a.ai !== null).length;
      debugView.respawnIn = world.deathHandler.secondsUntilRespawn;
      const hovered = renderer.hovered === null ? undefined : world.targeting.getActor(renderer.hovered);
      debugView.target = hovered ? `${hovered.name} ${Math.ceil(hovered.hp)} / ${Math.ceil(hovered.maxHp)}` : '—';
    },
  });
  loop.start({ now }, (cb) => requestAnimationFrame(cb));
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;color:#f88;white-space:pre-wrap';
  pre.textContent = error instanceof Error ? error.message : String(error);
  document.body.appendChild(pre);
});
