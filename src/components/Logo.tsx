import { useId } from 'react';

/** The MedRecords mark: a calm teal tile with a heartbeat line and a coral pulse dot. */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#167f77" />
          <stop offset="1" stopColor="#0b4a47" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path
        d="M6.5 17.5h4.2l2.3-5.6 4 10.2 2.9-7.6 1.6 3h4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.6" cy="8.4" r="2.4" fill="#f28b6b" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <LogoMark size={compact ? 30 : 32} />
      {!compact && (
        <span
          className="display"
          style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1 }}
        >
          Med<span style={{ fontWeight: 400, color: 'var(--primary)' }}>Records</span>
        </span>
      )}
    </span>
  );
}
