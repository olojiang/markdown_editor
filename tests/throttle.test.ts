import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThrottle } from '@/renderer/lib/throttle';

describe('createThrottle', () => {
  afterEach(() => vi.useRealTimers());

  it('runs immediately and once more with the latest value after the interval', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const throttled = createThrottle(callback, 48);

    throttled(1);
    throttled(2);
    throttled(3);
    expect(callback).toHaveBeenCalledExactlyOnceWith(1);

    vi.advanceTimersByTime(48);
    expect(callback).toHaveBeenNthCalledWith(2, 3);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending trailing call', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const throttled = createThrottle(callback, 48);

    throttled(1);
    throttled(2);
    throttled.cancel();
    vi.advanceTimersByTime(48);

    expect(callback).toHaveBeenCalledExactlyOnceWith(1);
  });
});
