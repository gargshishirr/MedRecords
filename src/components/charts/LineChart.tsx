import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { RangeStatus } from '../../lib/types';
import type { RefRange } from '../../lib/ranges';
import { STATUS_LABEL } from '../../lib/ranges';
import { formatDate, monthShort, parseISODate } from '../../lib/date';
import { useElementWidth } from '../../lib/hooks';
import { linePath, linearScale, niceDomain } from './scale';
import styles from './LineChart.module.css';

export interface ChartPoint {
  id: string;
  date: string;
  value: number;
  status: RangeStatus;
}

interface LineChartProps {
  points: ChartPoint[];
  range: RefRange;
  unit: string;
  decimals: number;
  title: string;
  height?: number;
}

const MARGIN = { top: 32, right: 24, bottom: 40, left: 52 };

export function LineChart({ points, range, unit, decimals, title, height = 320 }: LineChartProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(720);
  const [active, setActive] = useState<number | null>(null);
  const pointRefs = useRef<(SVGGElement | null)[]>([]);
  const gradientId = useId();
  const clipId = useId();
  const titleId = useId();

  const plotW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const compact = width < 480;

  // ---- Scales -------------------------------------------------------------
  const times = points.map((p) => parseISODate(p.date).getTime());
  const firstT = Math.min(...times);
  const lastT = Math.max(...times);
  const spanT = lastT - firstT || 30 * 86_400_000;
  const padT = spanT * 0.05;
  const x = linearScale(firstT - padT, lastT + padT, 0, plotW);

  const values = points.map((p) => p.value);
  const bandLow = range.low > 0 ? range.low : Infinity;
  const yMinRaw = Math.min(...values, bandLow);
  const yMaxRaw = Math.max(...values, range.high);
  const spread = yMaxRaw - yMinRaw || Math.abs(yMaxRaw) * 0.2 || 1;
  const domain = niceDomain(Math.max(0, yMinRaw - spread * 0.12), yMaxRaw + spread * 0.12, compact ? 4 : 5);
  const y = linearScale(domain.min, domain.max, plotH, 0);

  const bandTop = y(Math.min(range.high, domain.max));
  const bandBottom = y(Math.max(range.low, domain.min));

  // Month ticks, thinned so labels never collide.
  const monthStarts: Date[] = [];
  const startDate = new Date(firstT - padT);
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  while (cursor.getTime() <= lastT + padT) {
    monthStarts.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (monthStarts.length === 0) monthStarts.push(new Date(firstT));
  const maxLabels = Math.max(2, Math.floor(plotW / (compact ? 64 : 84)));
  const stride = Math.max(1, Math.ceil(monthStarts.length / maxLabels));
  // Show the year on the first tick and whenever it changes.
  const xTicks = monthStarts
    .filter((_, i) => i % stride === 0)
    .map((d, i, arr) => {
      const prev = arr[i - 1];
      const showYear = !prev || prev.getFullYear() !== d.getFullYear();
      return {
        t: d.getTime(),
        label: showYear ? `${monthShort(d)} ’${String(d.getFullYear()).slice(2)}` : monthShort(d),
      };
    });

  const coords = points.map((p, i) => [x(times[i]!), y(p.value)] as [number, number]);
  const line = linePath(coords);
  const area = coords.length > 1 ? `${line} L${coords[coords.length - 1]![0]},${plotH} L${coords[0]![0]},${plotH} Z` : '';

  // Place the band label where it won't collide with a data point (left, then right, else omit).
  const LABEL_W = 110;
  const collides = (x0: number) =>
    coords.some(([cx, cy]) => cx > x0 - 10 && cx < x0 + LABEL_W + 10 && cy > bandTop - 8 && cy < bandTop + 28);
  const bandLabel =
    bandBottom - bandTop <= 22
      ? null
      : !collides(8)
        ? { x: 8, anchor: 'start' as const }
        : !collides(plotW - 8 - LABEL_W)
          ? { x: plotW - 8, anchor: 'end' as const }
          : null;

  const fmt = (v: number) => v.toFixed(decimals);
  const describe = (p: ChartPoint) => `${formatDate(p.date)}: ${fmt(p.value)} ${unit}, ${STATUS_LABEL[p.status]}`;

  const focusPoint = (i: number) => {
    const clamped = Math.max(0, Math.min(points.length - 1, i));
    pointRefs.current[clamped]?.focus();
  };

  const onPointKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusPoint(i + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusPoint(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusPoint(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusPoint(points.length - 1);
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const activePoint = active !== null ? points[active] : undefined;
  const activeCoord = active !== null ? coords[active] : undefined;
  const tooltipLeft = activeCoord ? MARGIN.left + activeCoord[0] : 0;
  const tooltipTop = activeCoord ? MARGIN.top + activeCoord[1] : 0;
  const flip = activeCoord ? activeCoord[0] > plotW - 150 : false;
  const flipStart = activeCoord ? activeCoord[0] < 90 : false;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={styles.svg}
        role="group"
        aria-labelledby={titleId}
        onMouseLeave={() => setActive(null)}
      >
        <title id={titleId}>{`${title} — ${points.length} results. Use Tab or arrow keys to move between points.`}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.1" />
            <stop offset="70%" stopColor="var(--chart-line)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Grid + y axis */}
          <g aria-hidden="true">
            {domain.ticks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x1={0} x2={plotW} className={styles.grid} />
                <text x={-12} dy="0.32em" className={styles.yLabel}>
                  {Number.isInteger(domain.step) ? t.toFixed(0) : t.toFixed(Math.min(2, decimals || 1))}
                </text>
              </g>
            ))}
            <text x={-MARGIN.left + 4} y={-20} className={styles.unitLabel}>
              {unit}
            </text>
          </g>

          {/* Reference band */}
          <g aria-hidden="true" clipPath={`url(#${clipId})`}>
            <rect x={0} y={bandTop} width={plotW} height={Math.max(0, bandBottom - bandTop)} className={styles.band} />
            <line x1={0} x2={plotW} y1={bandTop} y2={bandTop} className={styles.bandEdge} />
            {range.low > domain.min && <line x1={0} x2={plotW} y1={bandBottom} y2={bandBottom} className={styles.bandEdge} />}
          </g>
          {bandLabel && (
            <text
              x={bandLabel.x}
              y={bandTop + 15}
              className={styles.bandLabel}
              style={{ textAnchor: bandLabel.anchor }}
              aria-hidden="true"
            >
              Reference range
            </text>
          )}

          {/* X axis */}
          <g aria-hidden="true" transform={`translate(0,${plotH})`}>
            <line x1={0} x2={plotW} className={styles.axis} />
            {xTicks.map((tick) => (
              <g key={tick.t} transform={`translate(${x(tick.t)},0)`}>
                <line y1={0} y2={5} className={styles.axis} />
                <text y={22} className={styles.xLabel}>
                  {tick.label}
                </text>
              </g>
            ))}
          </g>

          {/* Series */}
          {area && <path d={area} fill={`url(#${gradientId})`} aria-hidden="true" />}
          <path d={line} className={styles.line} aria-hidden="true" />

          {activeCoord && (
            <line x1={activeCoord[0]} x2={activeCoord[0]} y1={0} y2={plotH} className={styles.guide} aria-hidden="true" />
          )}

          {points.map((p, i) => {
            const [cx, cy] = coords[i]!;
            const isActive = active === i;
            return (
              <g
                key={p.id}
                ref={(el) => {
                  pointRefs.current[i] = el;
                }}
                className={styles.point}
                data-status={p.status}
                data-active={isActive || undefined}
                tabIndex={0}
                role="img"
                aria-label={describe(p)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                onMouseEnter={() => setActive(i)}
                onKeyDown={(e) => onPointKey(e, i)}
              >
                <circle cx={cx} cy={cy} r={16} className={styles.hit} />
                {isActive && <circle cx={cx} cy={cy} r={11} className={styles.halo} />}
                <circle cx={cx} cy={cy} r={p.status === 'normal' ? 4.5 : 5.5} className={styles.dot} />
              </g>
            );
          })}
        </g>
      </svg>

      {activePoint && (
        <div
          className={styles.tooltip}
          data-flip={flip || undefined}
          data-flip-start={flipStart || undefined}
          style={{ left: tooltipLeft, top: tooltipTop }}
          aria-hidden="true"
        >
          <span className={styles.ttDate}>{formatDate(activePoint.date)}</span>
          <span className={styles.ttValue}>
            <strong className="num">{fmt(activePoint.value)}</strong> {unit}
          </span>
          <span className={styles.ttStatus} data-status={activePoint.status}>
            {STATUS_LABEL[activePoint.status]}
          </span>
        </div>
      )}
    </div>
  );
}
