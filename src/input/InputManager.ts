import type { CommandQueue } from '../core/CommandQueue';
import { vec2, type Vec2 } from '../core/math/Vec2';
import type { GameCommand } from '../game/Commands';

/** 按住左鍵時，重新送出移動指令的間隔（秒） */
const HOLD_REPEAT_INTERVAL = 0.1;

const RIGHT_SLOT_KEYS: Record<string, 0 | 1 | 2> = { KeyQ: 0, KeyW: 1, KeyE: 2 };

/**
 * 把滑鼠 / 鍵盤事件轉成 GameCommand。不知道任何遊戲規則。
 * screenToWorld 由外部注入（Camera），Input 不需要知道投影方式。
 */
export class InputManager {
  private leftHeld = false;
  private pointer: Vec2 = vec2(0, 0);
  private lastRepeat = 0;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly target: HTMLElement,
    private readonly commands: CommandQueue<GameCommand>,
    private readonly screenToWorld: (screen: Vec2) => Vec2,
  ) {
    this.listen(target, 'pointerdown', (e) => this.onPointerDown(e));
    this.listen(target, 'pointermove', (e) => this.updatePointer(e));
    this.listen(window, 'pointerup', (e) => {
      if (e.button === 0) this.leftHeld = false;
    });
    this.listen(window, 'blur', () => {
      this.leftHeld = false;
    });
    this.listen(window, 'keydown', (e) => this.onKeyDown(e));
    this.listen(target, 'contextmenu', (e) => e.preventDefault());
  }

  /** 每幀呼叫：按住左鍵時持續更新目的地 */
  poll(now: number): void {
    if (!this.leftHeld || now - this.lastRepeat < HOLD_REPEAT_INTERVAL) return;
    this.lastRepeat = now;
    this.commands.push({ type: 'PrimaryAction', worldPos: this.pointerWorld(), held: true });
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
      this.commands.push({ type: 'PrimaryAction', worldPos: this.pointerWorld(), held: false });
    } else if (e.button === 2) {
      this.commands.push({ type: 'CastRight', worldPos: this.pointerWorld() });
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const slot = RIGHT_SLOT_KEYS[e.code];
    if (slot !== undefined) {
      this.commands.push({ type: 'SelectRightSlot', slot });
    } else if (e.code === 'Space') {
      e.preventDefault();
      this.commands.push({ type: 'UsePotion' });
    }
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.target.getBoundingClientRect();
    this.pointer = vec2(e.clientX - rect.left, e.clientY - rect.top);
  }

  private pointerWorld(): Vec2 {
    return this.screenToWorld(this.pointer);
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
