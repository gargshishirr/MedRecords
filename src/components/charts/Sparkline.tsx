import { useId } from 'react';
import type { RangeStatus } from '../../lib/types';
import { useElementWidth } from '../../lib/hooks';
import { linearScale, smoothPath } from './scale';
import styles from './Sparkline.module.css';

interface SparklineProps {
  /** One or two series (e.g. systolic + diastolic). */
  series: number[][];
  status?: RangeStatus;
  height?: number;
  /** Text alternative describing the trend. */
  label: string;
}

const STATUS_COLOR: Record<RangeStatus, string> = {
  normal: 'var(--primary)',
  watch: 'var(--watch)',
  high: 'var(--high)',
  low: 'var(--high)',
};

export function Sparkline({ series, status = 'normal', height = 44, label }: SparklineProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(160);
  const gradientId = useId();
  const all = series.flat();
  if (all.length < 2) return <div ref={ref} className={styles.wrap} style={{ height }} />;

  const pad = 4;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const spread = max - min || 1;
  const y = linearScale(min - spread * 0.15, max + spread * 0.15, height - pad, pad);
  const color = STATUS_COLOR[status];

  const paths = series.map((values) => {
    const x = linearScale(0, Math.max(1, values.length - 1), pad, width - pad);
    return values.map((v, i) => [x(i), y(v)] as [number, number]);
  });
  const main = paths[0] ?? [];
  const last = main[main.length - 1];
  const area = `${smoothPath(main)} L${(width - pad).toFixed(2)},${height} L${pad},${height} Z`;

  return (
    <div ref={ref} className={styles.wrap} style={{ height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        {paths.map((pts, i) => (
          <path
            key={i}
            d={smoothPath(pts)}
            fill="none"
            stroke={color}
            strokeOpacity={i === 0 ? 1 : 0.45}
            strokeWidth={i === 0 ? 2 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.line}
          />
        ))}
        {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={2} />}
      </svg>
    </div>
  );
}
