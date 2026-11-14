import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import styles from './Field.module.css';

export const hintId = (id: string) => `${id}-hint`;
export const errorId = (id: string) => `${id}-error`;

/** ARIA wiring for an input rendered inside <Field>. */
export function fieldProps(id: string, { error, hint }: { error?: string; hint?: string }) {
  // <Field> shows the hint only when there is no error, so reference whichever is rendered.
  const describedBy = error ? errorId(id) : hint ? hintId(id) : undefined;
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  } as const;
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')} data-invalid={error ? '' : undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className={styles.optional}>Optional</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId(id)} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId(id)} className={styles.error}>
          <CircleAlert size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = styles.input;
export const selectClass = `${styles.input} ${styles.select}`;
export const textareaClass = `${styles.input} ${styles.textarea}`;
