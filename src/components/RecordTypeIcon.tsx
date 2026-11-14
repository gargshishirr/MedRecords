import type { CSSProperties } from 'react';
import { FileText, FlaskConical, Pill, ScanLine, Stethoscope, Syringe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RecordType } from '../lib/types';
import { RECORD_TYPE_META } from '../lib/recordMeta';
import styles from './RecordTypeIcon.module.css';

export const RECORD_ICONS: Record<RecordType, LucideIcon> = {
  visit: Stethoscope,
  lab: FlaskConical,
  prescription: Pill,
  imaging: ScanLine,
  vaccination: Syringe,
  document: FileText,
};

export const typeColorStyle = (type: RecordType) =>
  ({ '--cat': `var(--cat-${type})`, '--cat-bg': `var(--cat-${type}-bg)` }) as CSSProperties;

export function RecordTypeIcon({ type, size = 40 }: { type: RecordType; size?: number }) {
  const Icon = RECORD_ICONS[type];
  return (
    <span className={styles.tile} style={{ ...typeColorStyle(type), width: size, height: size }} aria-hidden="true">
      <Icon size={Math.round(size * 0.46)} />
    </span>
  );
}

export function RecordTypeBadge({ type }: { type: RecordType }) {
  const Icon = RECORD_ICONS[type];
  return (
    <span className={styles.badge} style={typeColorStyle(type)}>
      <Icon size={13} aria-hidden="true" />
      {RECORD_TYPE_META[type].label}
    </span>
  );
}
