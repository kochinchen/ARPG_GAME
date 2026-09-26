/**
 * Input / UI 送出的 Command 暫存區。
 * 每個邏輯 Tick 開頭由 GameWorld 一次取出處理，確保所有狀態變更都發生在 Tick 內。
 */
export class CommandQueue<Command> {
  private pending: Command[] = [];

  push(...commands: Command[]): void {
    this.pending.push(...commands);
  }

  /** 取出目前所有 Command 並清空佇列 */
  drain(): Command[] {
    const commands = this.pending;
    this.pending = [];
    return commands;
  }

  get size(): number {
    return this.pending.length;
  }
}
