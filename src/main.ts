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
import { gameBridge } from './ui/bridge/GameBridge';
import { buildInventoryView } from './ui/bridge/InventoryView';
import { buildSkillTreeView, skillTreeSignature } from './ui/bridge/SkillTreeView';
import App from './ui/App.vue';

async function bootstrap(): Promise<void> {
  // 1. 資料驗證失敗就停止
  const data = DataRegistry.load(gameData);

  // 2. 基礎設施
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();
  const seed = Date.now() >>> 0;

  // 4. GameWorld
  // 從第 1 層開始；測試地圖只給單元測試使用
  const world = new GameWorld({ data, floor: 1, commands, events, seed });

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
  const renderer = new Renderer(app, projection, world, camera, data);

  // 7. UI：讀取唯讀快照，寫入一律送 Command
  gameBridge.connect((command) => commands.push(command));
  // 背包 / 裝備 / 手上物品有變動時才重建快照（在 Tick 完整結束後，避免讀到處理到一半的狀態）
  let inventoryVersion = -1;
  const refreshInventory = () => {
    if (world.itemsVersion === inventoryVersion) return;
    inventoryVersion = world.itemsVersion;
    debugView.inventory = buildInventoryView(world, data);
  };
  refreshInventory();
  let skillTreeSig = '';
  const refreshSkillTree = () => {
    const sig = skillTreeSignature(world);
    if (sig === skillTreeSig) return;
    skillTreeSig = sig;
    debugView.skillTree = buildSkillTreeView(world, data);
  };
  refreshSkillTree();
  debugView.devKeys = import.meta.env.DEV;
  let floorTimer = 0;
  const showFloorBanner = (floor: number) => {
    debugView.floorBanner = floor;
    window.clearTimeout(floorTimer);
    floorTimer = window.setTimeout(() => (debugView.floorBanner = null), 2500);
  };
  showFloorBanner(world.floors.floor);
  events.on('FloorEntered', (e) => showFloorBanner(e.floor));
  let discoveryTimer = 0;
  events.on('ComboDiscovered', (e) => {
    debugView.discovery = { name: e.name, description: e.description };
    window.clearTimeout(discoveryTimer);
    discoveryTimer = window.setTimeout(() => (debugView.discovery = null), 4500);
  });
  createApp(App).mount('#ui');

  // 8. Input（最後才開始接受輸入）
  const input = new InputManager(app.canvas, commands, {
    screenToWorld: (screen) => camera.screenToWorld(screen),
    pickActor: (screen) => renderer.pickActorAt(screen),
    pickInteractable: (screen) => renderer.pickInteractableAt(screen),
    // 開發用快捷鍵（B 重置、N 升一級、M 生成寶箱）：只在開發模式啟用
    debugKeys: import.meta.env.DEV,
    // 目前沒有存檔，重新載入即為全新角色；M9 加入存檔後需一併清除存檔
    onDebugReset: () => {
      if (window.confirm('重置遊戲？目前的角色進度會全部消失。')) window.location.reload();
    },
  });

  // 9. Loop
  const now = () => performance.now() / 1000;
  const loop = new GameLoop({
    update: (dt) => world.update(dt),
    render: (alpha) => {
      const hoveredInteractable = renderer.pickInteractableAt(input.pointerScreen);
      renderer.setHovered(
        hoveredInteractable === null ? renderer.pickActorAt(input.pointerScreen) : null,
        hoveredInteractable,
      );
      renderer.render(alpha);
      input.poll(now());
      debugView.tick = loop.tick;
      debugView.fps = Math.round(app.ticker.FPS);
      debugView.player.x = world.player.position.x;
      debugView.player.y = world.player.position.y;
      debugView.waypoints = world.player.path.length;
      const player = world.player;
      debugView.hp.value = player.hp;
      debugView.hp.max = player.maxHp;
      debugView.mp.value = player.mana;
      debugView.mp.max = player.maxMana;
      debugView.potions = `${world.potions.count}`;
      refreshInventory();
      refreshSkillTree();
      debugView.xp.level = world.progress.level;
      debugView.xp.value = world.progress.xp;
      debugView.xp.next = world.experience.xpForNextLevel;
      debugView.skillPoints = world.progress.skillPoints;
      debugView.gold = world.wallet.gold;
      debugView.leftSkill = data.skills.get(world.loadout.left).name;
      const running = world.combos.currentStep(player);
      debugView.combos = world.loadout.combos.map((steps, i) => ({
        key: 'QWE'[i]!,
        steps: steps.map((id, step) =>
          step >= world.comboSlotsUnlocked ? '🔒' : id === null ? '' : data.skills.get(id).name,
        ),
        active: world.loadout.activeCombo === i,
        running: world.loadout.activeCombo === i ? running : 0,
      }));
      debugView.supports = world.loadout.supports.flatMap((id) => (id === null ? [] : [data.skills.get(id).name]));
      debugView.enemies = world.actors.filter((a) => a.faction === 'enemy' && a.ai !== null).length;
      debugView.respawnIn = world.deathHandler.secondsUntilRespawn;
      debugView.respawnAt = world.checkpoints.respawn.kind === 'midway' ? '中途存檔點' : '樓梯口';
      const floors = world.floors;
      debugView.floor.floor = floors.floor;
      debugView.floor.killed = floors.killed;
      debugView.floor.total = floors.total;
      debugView.floor.remaining = floors.remainingToOpen;
      debugView.floor.exitOpen = floors.exitOpen;
      const hovered = renderer.hovered === null ? undefined : world.targeting.getActor(renderer.hovered);
      debugView.target = hovered ? `${hovered.name} ${Math.ceil(hovered.hp - 1e-6)} / ${Math.round(hovered.maxHp)}` : '—';
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
