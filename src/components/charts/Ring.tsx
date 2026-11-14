import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Ring.module.css';

interface RingProps {
  /** 0–1, or null when there is no data. */
  value: number | null;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}

/** Circular progress ring that animates its fill on mount. */
export function Ring({ value, size = 132, stroke = 12, label, children }: RingProps) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value ?? 0));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = value === null ? 'none' : value >= 0.85 ? 'ok' : value >= 0.6 ? 'watch' : 'high';

  return (
    <div className={styles.ring} style={{ width: size, height: size }} data-tone={tone}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle className={styles.track} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className={styles.fill}
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, shown)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={styles.center} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
