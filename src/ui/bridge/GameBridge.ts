import type { GameCommand } from '../../game/Commands';

let sender: ((command: GameCommand) => void) | null = null;

/**
 * UI 對遊戲的唯一寫入管道：送出 Command。由 main.ts 連接到 CommandQueue。
 */
export const gameBridge = {
  connect(send: (command: GameCommand) => void): void {
    sender = send;
  },
  send(command: GameCommand): void {
    sender?.(command);
  },
};
