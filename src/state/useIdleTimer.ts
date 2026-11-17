import { useEffect, useRef } from 'react';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
const CHECK_EVERY_MS = 5_000;

/**
 * Calls `onIdle` once nobody has used the page for `minutes`. It checks on a
 * timer and again when the tab becomes visible, because browsers slow down
 * timers in background tabs.
 */
export function useIdleTimer(enabled: boolean, minutes: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const check = () => {
      if (Date.now() - last >= limit) onIdleRef.current();
    };
    const options = { passive: true, capture: true } as const;
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, bump, options);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    const id = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, bump, options);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.clearInterval(id);
    };
  }, [enabled, minutes]);
}
