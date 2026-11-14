import { useId } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** Remove body padding (e.g. for edge-to-edge lists). */
  flush?: boolean;
  as?: 'section' | 'article' | 'div';
  headingLevel?: 2 | 3;
}

export function Card({
  title,
  description,
  icon,
  action,
  flush,
  as: Tag = 'section',
  headingLevel = 2,
  className,
  children,
  ...rest
}: CardProps) {
  const id = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Tag
      className={[styles.card, className].filter(Boolean).join(' ')}
      aria-labelledby={title ? id : undefined}
      {...rest}
    >
      {title && (
        <header className={styles.header}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <div className={styles.headings}>
            <Heading id={id} className={styles.title}>
              {title}
            </Heading>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {action && <div className={styles.action}>{action}</div>}
        </header>
      )}
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </Tag>
  );
}
