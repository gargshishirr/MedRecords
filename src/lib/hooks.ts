import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Things other pages ask this page to do, like "open this record". They travel
 * in the router's history state rather than the URL, so no health data (not
 * even an id or a test name) ends up in the address bar or browser history.
 */
export interface NavIntent {
  /** Record id to open on the Records page. */
  open?: string;
  /** Open the "add" form on the target page. */
  add?: boolean;
  /** Lab test to show on the Lab trends page. */
  test?: string;
  /** Medication id to highlight on the Medications page. */
  med?: string;
}

/** Runs `handler` once for each intent sent to this page, then clears it from history. */
export function useNavIntent(handler: (intent: NavIntent) => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const intent = location.state as NavIntent | null;
    if (!intent || typeof intent !== 'object') return;
    handlerRef.current(intent);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Tracks an element's content width via ResizeObserver. */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Animates from 0 to `target` once on mount (or jumps straight there under reduced motion). */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const fromRef = useRef(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reduced]);

  return value;
}
