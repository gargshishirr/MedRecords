import { describe, expect, it } from 'vitest';
import { THROTTLE_KEY, clearThrottle, delayAfter, readThrottle, recordFailure, waitMs } from './throttle';

describe('unlock throttle', () => {
  it('allows two mistakes, then doubles the wait up to five minutes', () => {
    expect([1, 2, 3, 4, 5, 6].map(delayAfter)).toEqual([0, 0, 2000, 4000, 8000, 16000]);
    expect(delayAfter(20)).toBe(5 * 60_000);
  });

  it('remembers failures in storage until cleared', () => {
    const t0 = Date.now();
    recordFailure(localStorage, t0);
    recordFailure(localStorage, t0);
    const third = recordFailure(localStorage, t0);
    expect(third.failures).toBe(3);
    expect(waitMs(readThrottle(localStorage), t0)).toBe(2000);
    expect(waitMs(readThrottle(localStorage), t0 + 2500)).toBe(0);
    clearThrottle(localStorage);
    expect(localStorage.getItem(THROTTLE_KEY)).toBeNull();
    expect(readThrottle(localStorage)).toEqual({ failures: 0, until: 0 });
  });
});
