type Handler<T> = (payload: T) => void;

/**
 * 型別安全的 publish / subscribe。
 * EventMap 由使用端定義（遊戲事件見 game/GameEvents.ts），core 本身不含遊戲知識。
 */
export class EventBus<EventMap extends object> {
  private readonly handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  /** 回傳取消訂閱函式 */
  on<K extends keyof EventMap>(type: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof EventMap>(type: K, handler: Handler<EventMap[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // 複製一份，允許 handler 在執行中取消訂閱或新增訂閱
    for (const handler of [...set]) {
      (handler as Handler<EventMap[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
