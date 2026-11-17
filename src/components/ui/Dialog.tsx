import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content shown above the title, e.g. a badge. */
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** `sheet` slides in from the right on desktop (bottom on mobile). */
  variant?: 'center' | 'sheet';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Accessible modal built on the native <dialog> element: focus is moved into
 * the dialog and restored on close, Escape closes it, and the rest of the
 * page is inert while it is open.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  footer,
  variant = 'center',
  size = 'md',
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Let a form choose its first field instead of the close button.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        // Clicks on the ::backdrop target the dialog element itself.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      {open && (
        <div className={styles.inner}>
          <header className={styles.header}>
            <div className={styles.headings}>
              {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
              <h2 id={titleId} className={`${styles.title} display`}>
                {title}
              </h2>
              {description && (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close" className={styles.close} onClick={() => ref.current?.close()}>
              <X />
            </IconButton>
          </header>
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
