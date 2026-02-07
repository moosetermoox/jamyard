import { describe, it, expect, vi } from 'vitest';
import { eventBus } from '../../engine/event-bus.js';

describe('eventBus', () => {
  it('can emit an event', () => {
    const handler = vi.fn();
    eventBus.on('test-emit', handler);
    eventBus.emit('test-emit');
    expect(handler).toHaveBeenCalled();
    eventBus.off('test-emit', handler);
  });

  it('can listen for an event and receive data', () => {
    const handler = vi.fn();
    eventBus.on('test-data', handler);
    eventBus.emit('test-data', { message: 'hello', count: 42 });
    expect(handler).toHaveBeenCalledWith({ message: 'hello', count: 42 });
    eventBus.off('test-data', handler);
  });
});
