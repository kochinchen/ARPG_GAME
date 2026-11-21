/**
 * 遊戲的滑鼠游標（設計者 2026-11-21：要更有遊戲感）：
 * 平常是鐵灰色、金邊的箭頭；指著敵人變成帶血光的劍；指著寶箱、地上的裝備、商人等可以互動的東西變成金色箭頭。
 * 只換畫面區（#game）與整頁的預設游標，面板上的按鈕照舊用各自的手指游標。
 */
export type CursorKind = 'normal' | 'attack' | 'interact';

const ARROW = 'M2 2 L23 12.5 L13.5 14.5 L19.5 27 L15.5 29 L9.5 16.5 L3 23 Z';

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;

const SVGS: Record<CursorKind, string> = {
  normal: svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9ad98"/><stop offset="0.55" stop-color="#5d554b"/><stop offset="1" stop-color="#2b2621"/></linearGradient></defs>` +
      `<path d="${ARROW}" fill="#000" opacity="0.55" transform="translate(1.5 1.5)"/>` +
      `<path d="${ARROW}" fill="url(#g)" stroke="#120f0c" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="${ARROW}" fill="none" stroke="#c9963f" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<path d="M4.5 5 L17 11.6 L11 13" fill="none" stroke="#f1e3c4" stroke-width="0.8" opacity="0.7"/>`,
  ),
  interact: svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset="0.5" stop-color="#d9a640"/><stop offset="1" stop-color="#7a5418"/></linearGradient></defs>` +
      `<path d="${ARROW}" fill="#ffcf5a" opacity="0.35" stroke="#ffcf5a" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="${ARROW}" fill="url(#g)" stroke="#2a1a06" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M4.5 5 L17 11.6 L11 13" fill="none" stroke="#fffbe8" stroke-width="0.9" opacity="0.85"/>`,
  ),
  attack: svg(
    `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#b8b4ac"/><stop offset="1" stop-color="#6e6a63"/></linearGradient></defs>` +
      // 血光
      `<path d="M2 2 L6.5 3.2 L21 17.5 L17.5 21 L3.2 6.5 Z" fill="#ff2a1a" opacity="0.35" stroke="#ff2a1a" stroke-width="3.5" stroke-linejoin="round"/>` +
      // 劍身
      `<path d="M2 2 L6.5 3.2 L21 17.5 L17.5 21 L3.2 6.5 Z" fill="url(#b)" stroke="#1a0504" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M3.5 3.5 L19.2 19.2" stroke="#7a1410" stroke-width="0.9"/>` +
      // 護手、握柄、柄頭
      `<path d="M14.5 24.5 L24.5 14.5" stroke="#1a0f06" stroke-width="4.2" stroke-linecap="round"/>` +
      `<path d="M14.5 24.5 L24.5 14.5" stroke="#c9963f" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M21 21 L27 27" stroke="#1a0f06" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M21 21 L27 27" stroke="#6b3b1d" stroke-width="2" stroke-linecap="round"/>` +
      `<circle cx="28" cy="28" r="2.4" fill="#c9963f" stroke="#1a0f06" stroke-width="1"/>`,
  ),
};

const css = (kind: CursorKind) => `url("data:image/svg+xml,${encodeURIComponent(SVGS[kind])}") 2 2, ${kind === 'normal' ? 'default' : 'pointer'}`;

/** 套用到整頁與畫面區；回傳切換游標的函式（同一種不重複設定） */
export function installGameCursor(game: HTMLElement): (kind: CursorKind) => void {
  document.body.style.cursor = css('normal');
  let current: CursorKind | null = null;
  const set = (kind: CursorKind) => {
    if (kind === current) return;
    current = kind;
    game.style.cursor = css(kind);
  };
  set('normal');
  return set;
}
