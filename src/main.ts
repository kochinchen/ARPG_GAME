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
import { gameBridge } from './ui/bridge/GameBridge';
import { gameView } from './ui/bridge/GameViewStore';
import { systemBridge } from './ui/bridge/SystemBridge';
import { ViewSync } from './ui/bridge/ViewSync';
import App from './ui/App.vue';
import { AutoSaver } from './save/AutoSaver';
import { decodeSave, encodeSave } from './save/Envelope';
import { acquireSaveLock } from './save/SaveLock';
import { SaveMapper, saveSignature } from './save/SaveMapper';
import { repairSave } from './save/SaveRepair';
import { SaveService, type SyncStore } from './save/SaveService';
import { IndexedDbStorage } from './save/storage/IndexedDbStorage';

async function bootstrap(): Promise<void> {
  // 1. 資料驗證失敗就停止
  const data = DataRegistry.load(gameData);

  // 2. 基礎設施
  const commands = new CommandQueue<GameCommand>();
  const events = new EventBus<GameEvents>();

  // 3. 存檔：同一個存檔只能在一個分頁中遊玩
  if (!(await acquireSaveLock())) {
    showMessage('遊戲已在其他分頁開啟', '請關閉這個分頁，回到原本的分頁繼續遊戲（兩邊同時遊玩會互相覆蓋存檔）。');
    return;
  }
  void navigator.storage?.persist?.().catch(() => false);
  const saves = new SaveService(new IndexedDbStorage(), browserStorage());
  const loaded = await saves.load();
  if (loaded.status === 'corrupt') {
    // 讀不進來時絕不自動開新角色覆蓋存檔：讓玩家決定
    console.error('存檔全部無法讀取', loaded.failures);
    showCorruptSave(saves);
    return;
  }

  // 4. GameWorld（有存檔時用存檔的世界種子，樓層佈局才會相同）
  const seed = loaded.status === 'ok' ? loaded.data.meta.runSeed : Date.now() >>> 0;
  const createdAt = loaded.status === 'ok' ? loaded.data.meta.createdAt : new Date().toISOString();
  const world = new GameWorld({ data, floor: 1, commands, events, seed });
  const saveNotices: string[] = [];
  if (loaded.status === 'ok') {
    if (loaded.failures.length > 0) console.warn('部分存檔無法讀取', loaded.failures);
    if (loaded.fellBack) saveNotices.push(`最新的存檔已損毀，已從備份還原（${formatTime(loaded.savedAt)}）`);
    const repaired = repairSave(loaded.data, data);
    saveNotices.push(...repaired.notes, ...SaveMapper.restore(world, repaired));
  }

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

  // 自動存檔：倒地中不存（關閉分頁時例外，存成已重生的狀態）
  const autoSaver = new AutoSaver(
    saves,
    () => (world.player.alive ? SaveMapper.capture(world, createdAt) : null),
    () => SaveMapper.capture(world, createdAt),
    {
      onSaved: (savedAt) => {
        gameView.save.lastSavedAt = formatTime(savedAt);
        gameView.save.error = null;
      },
      onError: (error) => {
        console.error('存檔失敗', error);
        gameView.save.error = error instanceof Error ? error.message : String(error);
      },
    },
  );
  // 新角色：立即建立第一份存檔
  if (loaded.status === 'empty') autoSaver.markDirty(true);
  window.addEventListener('pagehide', () => autoSaver.flushSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autoSaver.flushSync();
  });
  let saveSig = saveSignature(world);
  /** 刪除所有存檔並重新載入 = 全新角色（先停止自動存檔，避免舊狀態被寫回去） */
  const newCharacter = () => {
    void autoSaver
      .disable()
      .then(() => saves.clear())
      .then(() => window.location.reload());
  };

  // 9. Loop（先建立，UI 的暫停需要它；最後才開始）
  const now = () => performance.now() / 1000;
  let viewSync: ViewSync | null = null;
  let input: InputManager | null = null;
  const loop = new GameLoop({
    update: (dt) => world.update(dt),
    render: (alpha) => {
      const pointer = input!.pointerScreen;
      const hoveredInteractable = renderer.pickInteractableAt(pointer);
      renderer.setHovered(hoveredInteractable === null ? renderer.pickActorAt(pointer) : null, hoveredInteractable);
      renderer.render(alpha);
      input!.poll(now());
      viewSync!.update({ tick: loop.tick, fps: Math.round(app.ticker.FPS), hoveredActor: renderer.hovered });
      // 存檔在 Tick 完整結束後判斷，不會拿到換層到一半的狀態
      const sig = saveSignature(world);
      if (sig.immediate !== saveSig.immediate) autoSaver.markDirty(true);
      else if (sig.normal !== saveSig.normal) autoSaver.markDirty();
      saveSig = sig;
      autoSaver.update(now());
    },
  });

  // 7. UI：讀取唯讀快照（gameView），遊戲操作一律送 Command，系統操作走 systemBridge
  gameBridge.connect((command) => commands.push(command));
  systemBridge.connect({
    setPaused: (paused) => (loop.paused = paused),
    exportSave: () => downloadText(exportFileName(), encodeSave(SaveMapper.capture(world, createdAt), new Date())),
    importSave: (file) => {
      void file.text().then(async (text) => {
        const decoded = decodeSave(text);
        if (!decoded.ok) {
          window.alert(`無法匯入：這不是有效的存檔檔案（${decoded.reason}）。目前的存檔沒有變動。`);
          return;
        }
        const d = decoded.data;
        const ok = window.confirm(
          `匯入存檔：Lv ${d.character.level}・第 ${d.floor.current} 層（存檔時間 ${formatTime(decoded.savedAt)}）\n\n` +
            '目前的進度會被覆蓋。覆蓋前會先下載一份目前存檔作為備份。',
        );
        if (!ok) return;
        downloadText(exportFileName('備份'), encodeSave(SaveMapper.capture(world, createdAt), new Date()));
        await autoSaver.disable();
        await saves.write(d);
        window.location.reload();
      });
    },
    newCharacter,
  });
  viewSync = new ViewSync(world, data);
  if (saveNotices.length > 0) {
    gameView.saveNotices = saveNotices;
    window.setTimeout(() => (gameView.saveNotices = []), 8000);
  }
  createApp(App, { devAvailable: import.meta.env.DEV }).mount('#ui');

  // 8. Input（最後才開始接受輸入）
  input = new InputManager(app.canvas, commands, {
    screenToWorld: (screen) => camera.screenToWorld(screen),
    pickActor: (screen) => renderer.pickActorAt(screen),
    pickInteractable: (screen) => renderer.pickInteractableAt(screen),
    // 選單開啟（暫停）時不接受遊戲操作
    isPaused: () => loop.paused,
    // 開發用快捷鍵（B 重置、N 升一級、M 生成寶箱）：只在開發模式啟用
    debugKeys: import.meta.env.DEV,
    onDebugReset: () => {
      if (window.confirm('重置遊戲？目前的角色進度與存檔會全部刪除。')) newCharacter();
    },
  });

  loop.start({ now }, (cb) => requestAnimationFrame(cb));
}

/** localStorage（緊急副本）；隱私模式等無法使用時回傳 null */
function browserStorage(): SyncStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false });
}

function exportFileName(suffix = ''): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `arpg-save-${stamp}${suffix ? `-${suffix}` : ''}.json`;
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 遊戲無法開始時的全畫面訊息 */
function showMessage(title: string, body: string): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;' +
    'padding:24px;color:#d8cbb4;background:#120e0b;font:15px/1.7 sans-serif;text-align:center';
  const h = document.createElement('h2');
  h.textContent = title;
  h.style.cssText = 'margin:0;color:#e8c47a';
  const p = document.createElement('p');
  p.textContent = body;
  p.style.cssText = 'max-width:520px;margin:0';
  box.append(h, p);
  document.body.appendChild(box);
  return box;
}

function showCorruptSave(saves: SaveService): void {
  const box = showMessage(
    '存檔無法讀取',
    '所有存檔與備份都已損毀，存檔沒有被覆蓋。你可以先匯出損毀的存檔檔案保留下來，再決定是否開新角色。',
  );
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px';
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:6px 14px;font:inherit;color:#d8cbb4;background:#2a231d;border:1px solid #8a6a3a;cursor:pointer';
    b.onclick = onClick;
    row.appendChild(b);
  };
  button('匯出損毀的存檔', () => {
    void saves.dumpRaw().then((raw) => downloadText(exportFileName('損毀'), JSON.stringify(raw, null, 2)));
  });
  button('開新角色（刪除損毀的存檔）', () => {
    if (!window.confirm('確定刪除所有存檔並開始新角色？這個動作無法復原。')) return;
    void saves.clear().then(() => window.location.reload());
  });
  box.appendChild(row);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;color:#f88;white-space:pre-wrap';
  pre.textContent = error instanceof Error ? error.message : String(error);
  document.body.appendChild(pre);
});
