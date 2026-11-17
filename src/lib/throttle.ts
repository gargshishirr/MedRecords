import type { StorageLike } from './store';

/**
 * Slows down repeated wrong passcodes. The counter lives in localStorage so a
 * reload doesn't reset it. It holds no health data. This is a speed bump in
 * the app; the real protection is the slow key derivation and a good passcode.
 */
export const THROTTLE_KEY = 'medrecords:unlock-attempts';

/** Wrong attempts allowed before delays start. */
const FREE_ATTEMPTS = 2;
const MAX_DELAY_MS = 5 * 60_000;

export interface ThrottleState {
  failures: number;
  /** Epoch ms before which no new attempt is allowed. */
  until: number;
}

/** 3rd wrong attempt waits 2 s, then 4 s, 8 s, 16 s … up to 5 minutes. */
export function delayAfter(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0;
  return Math.min(1000 * 2 ** (failures - FREE_ATTEMPTS), MAX_DELAY_MS);
}

export function readThrottle(storage: StorageLike | undefined): ThrottleState {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(THROTTLE_KEY) ?? 'null');
    if (typeof parsed === 'object' && parsed !== null) {
      const { failures, until } = parsed as Record<string, unknown>;
      if (typeof failures === 'number' && typeof until === 'number' && failures >= 0) {
        // Never trust a wait longer than the maximum (e.g. a clock change).
        return { failures, until: Math.min(until, Date.now() + MAX_DELAY_MS) };
      }
    }
  } catch {
    /* fall through */
  }
  return { failures: 0, until: 0 };
}

export function waitMs(state: ThrottleState, now: number = Date.now()): number {
  return Math.max(0, state.until - now);
}

export function recordFailure(storage: StorageLike | undefined, now: number = Date.now()): ThrottleState {
  const failures = readThrottle(storage).failures + 1;
  const next = { failures, until: now + delayAfter(failures) };
  try {
    storage?.setItem(THROTTLE_KEY, JSON.stringify(next));
  } catch {
    /* storage full: the in-memory result still applies */
  }
  return next;
}

export function clearThrottle(storage: StorageLike | undefined): void {
  try {
    storage?.removeItem(THROTTLE_KEY);
  } catch {
    /* ignore */
  }
}
