import type { RangeStatus } from '../../lib/types';
import { STATUS_LABEL } from '../../lib/ranges';
import styles from './Pill.module.css';

export function StatusPill({ status, label, size = 'md' }: { status: RangeStatus; label?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={styles.pill} data-status={status} data-size={size}>
      <span className={styles.dot} aria-hidden="true" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
