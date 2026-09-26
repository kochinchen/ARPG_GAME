import type { CommandQueue } from '../core/CommandQueue';
import { vec2, type Vec2 } from '../core/math/Vec2';
import type { GameCommand } from '../game/Commands';

/** 按住左鍵時，重新送出指令的間隔（秒） */
const HOLD_REPEAT_INTERVAL = 0.1;

const RIGHT_SLOT_KEYS: Record<string, 0 | 1 | 2> = { KeyQ: 0, KeyW: 1, KeyE: 2 };

export interface InputAdapters {
  /** 畫面座標 → World 座標（Camera） */
  screenToWorld: (screen: Vec2) => Vec2;
  /** 游標下的角色 ID（Renderer 以畫面空間判定），沒有則 null */
  pickActor: (screen: Vec2) => number | null;
  /** 游標下的地上物品 / 寶箱 ID，沒有則 null */
  pickInteractable: (screen: Vec2) => number | null;
  /** 開發用快捷鍵：B 重置、N 升一級、M 生成寶箱 */
  debugKeys?: boolean;
  /** B：重置遊戲（由 main.ts 決定如何重置） */
  onDebugReset?: () => void;
}

/**
 * 把滑鼠 / 鍵盤事件轉成 GameCommand。不知道任何遊戲規則。
 * 座標換算與點選由外部注入，Input 不需要知道投影方式或角色外觀。
 */
export class InputManager {
  private leftHeld = false;
  private rightHeld = false;
  private pointer: Vec2 = vec2(0, 0);
  private lastRepeat = 0;
  private lastRightRepeat = 0;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly target: HTMLElement,
    private readonly commands: CommandQueue<GameCommand>,
    private readonly adapters: InputAdapters,
  ) {
    this.listen(target, 'pointerdown', (e) => this.onPointerDown(e));
    this.listen(target, 'pointermove', (e) => this.updatePointer(e));
    this.listen(window, 'pointerup', (e) => {
      if (e.button === 0) this.releaseLeft();
      if (e.button === 2) this.rightHeld = false;
    });
    this.listen(window, 'blur', () => {
      this.releaseLeft();
      this.rightHeld = false;
    });
    this.listen(window, 'keydown', (e) => this.onKeyDown(e));
    this.listen(target, 'contextmenu', (e) => e.preventDefault());
  }

  /** 目前游標的畫面座標 */
  get pointerScreen(): Vec2 {
    return this.pointer;
  }

  /** 每幀呼叫：按住左鍵 / 右鍵時持續送出指令 */
  poll(now: number): void {
    if (this.leftHeld && now - this.lastRepeat >= HOLD_REPEAT_INTERVAL) {
      this.lastRepeat = now;
      this.commands.push({ type: 'PrimaryAction', ...this.pointerTarget(), held: true });
    }
    if (this.rightHeld && now - this.lastRightRepeat >= HOLD_REPEAT_INTERVAL) {
      this.lastRightRepeat = now;
      this.commands.push({ type: 'CastRight', ...this.pointerTarget() });
    }
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
  }

  private onPointerDown(e: PointerEvent): void {
    this.updatePointer(e);
    if (e.button === 0) {
      this.leftHeld = true;
      this.lastRepeat = e.timeStamp / 1000;
      this.commands.push({ type: 'PrimaryAction', ...this.primaryTarget(), held: false });
    } else if (e.button === 2) {
      this.rightHeld = true;
      this.lastRightRepeat = e.timeStamp / 1000;
      this.commands.push({ type: 'CastRight', ...this.pointerTarget() });
    }
  }

  private releaseLeft(): void {
    if (!this.leftHeld) return;
    this.leftHeld = false;
    this.commands.push({ type: 'PrimaryRelease' });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const slot = RIGHT_SLOT_KEYS[e.code];
    if (slot !== undefined) {
      this.commands.push({ type: 'SelectRightSlot', slot });
    } else if (e.code === 'Space') {
      e.preventDefault();
      this.commands.push({ type: 'UsePotion' });
    } else if (this.adapters.debugKeys) {
      this.onDebugKey(e.code);
    }
  }

  private onDebugKey(code: string): void {
    switch (code) {
      case 'KeyB':
        this.adapters.onDebugReset?.();
        break;
      case 'KeyN':
        this.commands.push({ type: 'DebugLevelUp' });
        break;
      case 'KeyM':
        this.commands.push({ type: 'DebugSpawnChests', count: 3 });
        break;
    }
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.target.getBoundingClientRect();
    this.pointer = vec2(e.clientX - rect.left, e.clientY - rect.top);
  }

  private pointerTarget(): { worldPos: Vec2; targetId: number | null } {
    return { worldPos: this.adapters.screenToWorld(this.pointer), targetId: this.adapters.pickActor(this.pointer) };
  }

  /** 左鍵按下：物品 / 寶箱優先於角色 */
  private primaryTarget(): { worldPos: Vec2; targetId: number | null; interactId: number | null } {
    const interactId = this.adapters.pickInteractable(this.pointer);
    return {
      worldPos: this.adapters.screenToWorld(this.pointer),
      targetId: interactId === null ? this.adapters.pickActor(this.pointer) : null,
      interactId,
    };
  }

  private listen<K extends keyof HTMLElementEventMap & keyof WindowEventMap>(
    source: HTMLElement | Window,
    type: K,
    handler: (e: HTMLElementEventMap[K] & WindowEventMap[K]) => void,
  ): void {
    const listener = handler as EventListener;
    source.addEventListener(type, listener);
    this.disposers.push(() => source.removeEventListener(type, listener));
  }
}
