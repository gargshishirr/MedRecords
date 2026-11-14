import { useEffect } from 'react';
import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · MedRecords`;
  }, [title]);
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`${styles.header} no-print`}>
      <div className={styles.text}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={`${styles.title} display`}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
