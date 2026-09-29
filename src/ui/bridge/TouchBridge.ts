import { vec2, type Vec2 } from '../../core/math/Vec2';

let toWorld: ((dx: number, dy: number) => Vec2) | null = null;

/**
 * 觸控搖桿：把畫面上的方向換成 World 方向。投影只存在 render，由 main.ts 以 Camera 連接。
 */
export const touchBridge = {
  connect(screenDirToWorld: (dx: number, dy: number) => Vec2): void {
    toWorld = screenDirToWorld;
  },
  screenDirToWorld(dx: number, dy: number): Vec2 {
    return toWorld?.(dx, dy) ?? vec2(dx, dy);
  },
};

/**
 * iPad / 手機等觸控裝置（iPadOS 的 Safari 會自稱 Mac，要看觸控點數）。
 * 網址加 ?touch=1 / ?touch=0 可以強制開 / 關觸控按鈕。
 */
export function isTouchDevice(): boolean {
  return touchOverride() ?? (navigator.maxTouchPoints > 1 || window.matchMedia('(any-pointer: coarse)').matches);
}

/** 網址指定的觸控模式；沒指定為 null */
export function touchOverride(): boolean | null {
  const force = new URLSearchParams(window.location.search).get('touch');
  return force === null ? null : force === '1';
}
