import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';

interface TestEvents {
  hit: { amount: number };
  died: { id: number };
}

describe('EventBus', () => {
  it('送出事件給所有訂閱者', () => {
    const bus = new EventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('hit', a);
    bus.on('hit', b);
    bus.emit('hit', { amount: 5 });
    expect(a).toHaveBeenCalledWith({ amount: 5 });
    expect(b).toHaveBeenCalledWith({ amount: 5 });
  });

  it('只送給對應事件的訂閱者', () => {
    const bus = new EventBus<TestEvents>();
    const onDied = vi.fn();
    bus.on('died', onDied);
    bus.emit('hit', { amount: 1 });
    expect(onDied).not.toHaveBeenCalled();
  });

  it('取消訂閱後不再收到事件', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on('hit', handler);
    unsubscribe();
    bus.emit('hit', { amount: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handler 執行中取消其他訂閱，本輪仍完整送出', () => {
    const bus = new EventBus<TestEvents>();
    const second = vi.fn();
    let offSecond = () => {};
    bus.on('hit', () => offSecond());
    offSecond = bus.on('hit', second);
    bus.emit('hit', { amount: 1 });
    expect(second).toHaveBeenCalledTimes(1);
    bus.emit('hit', { amount: 1 });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
