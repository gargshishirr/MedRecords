import { Lock, LockKeyhole, Sparkles } from 'lucide-react';
import { useStore, useVault } from '../../state/store';
import styles from './DemoBadge.module.css';

/** Says what kind of data this is and where it lives: demo, plain or encrypted. */
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const { data } = useStore();
  const { lockEnabled } = useVault();

  const [Icon, short, strong, rest, title] = data.demo
    ? [
        Sparkles,
        'Demo',
        'Demo data',
        'stored only in this browser',
        'All data is fictional demo data, stored only in this browser.',
      ]
    : lockEnabled
      ? [
          LockKeyhole,
          'Locked',
          'Encrypted',
          'locks with your passcode',
          'Your data is encrypted in this browser and locks with your passcode.',
        ]
      : [
          Lock,
          'Private',
          'Private',
          'stored only in this browser',
          'Your data is stored only in this browser. Add a passcode in Settings to encrypt it.',
        ];

  return (
    <p className={styles.badge} data-compact={compact || undefined} title={title}>
      <Icon size={compact ? 12 : 14} aria-hidden="true" />
      {compact ? (
        <>
          <span aria-hidden="true">{short}</span>
          <span className="visually-hidden">
            {strong} · {rest}
          </span>
        </>
      ) : (
        <span>
          <strong>{strong}</strong> · {rest}
        </span>
      )}
    </p>
  );
}
