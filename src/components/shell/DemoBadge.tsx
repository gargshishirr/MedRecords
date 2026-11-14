import { Lock } from 'lucide-react';
import styles from './DemoBadge.module.css';

export function DemoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={styles.badge}
      data-compact={compact || undefined}
      title="All data is fictional demo data, stored only in this browser (localStorage)."
    >
      <Lock size={compact ? 12 : 14} aria-hidden="true" />
      {compact ? (
        <>
          <span aria-hidden="true">Demo</span>
          <span className="visually-hidden">Demo data · stored only in this browser</span>
        </>
      ) : (
        <span>
          <strong>Demo data</strong> · stored only in this browser
        </span>
      )}
    </p>
  );
}
