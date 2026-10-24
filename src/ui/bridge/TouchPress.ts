/** 按住多久算長按（毫秒） */
export const LONG_PRESS_MS = 450;
/** 手指移動超過這個距離就不算輕點或長按（px） */
const MOVE_PX = 12;

/**
 * 觸控的輕點與長按（滑鼠不經過這裡，照舊用 click）。一次只追蹤一根手指。
 * 用法：pointerdown 呼叫 down（帶入輕點、長按要做的事），pointermove / pointerup / pointercancel 呼叫對應的方法。
 */
export function createPress() {
  let timer = 0;
  let start: { x: number; y: number; id: number } | null = null;
  let onTap: (() => void) | null = null;

  const reset = () => {
    window.clearTimeout(timer);
    start = null;
    onTap = null;
  };

  return {
    down(e: PointerEvent, tap: () => void, long: () => void): void {
      reset();
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      onTap = tap;
      timer = window.setTimeout(() => {
        reset();
        long();
      }, LONG_PRESS_MS);
    },
    move(e: PointerEvent): void {
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) reset();
    },
    up(e: PointerEvent): void {
      if (!start || e.pointerId !== start.id) return;
      const tap = onTap;
      reset();
      tap?.();
    },
    cancel(): void {
      reset();
    },
  };
}

/** 這次點擊是手指（或觸控筆）按的，不是滑鼠 */
export function isFinger(e: PointerEvent): boolean {
  return e.pointerType !== 'mouse';
}
