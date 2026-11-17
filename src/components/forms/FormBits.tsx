import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { CircleAlert, Eye, EyeOff, Trash2, TriangleAlert } from 'lucide-react';
import type { FormErrors } from '../../lib/forms';
import { Button, IconButton } from '../ui/Button';
import { inputClass } from '../ui/Field';
import styles from './Form.module.css';

export { styles as formStyles };

/** Form values, errors and validate-on-submit. After the first submit, errors update as the user types. */
export function useFormState<V>(initial: V | (() => V), validate: (values: V) => FormErrors) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const set = (next: V) => {
    setValues(next);
    if (submitted) setErrors(validate(next));
  };

  const update = <K extends keyof V>(key: K, value: V[K]) => set({ ...values, [key]: value });

  /** Validates all fields. On errors, focuses the first invalid field (in `order`) and returns false. */
  const check = (order: string[], idFor: (key: string) => string): boolean => {
    setSubmitted(true);
    const found = validate(values);
    setErrors(found);
    const first = order.find((k) => found[k]) ?? Object.keys(found)[0];
    if (first) {
      document.getElementById(idFor(first))?.focus();
      return false;
    }
    return true;
  };

  return { values, errors, set, update, check };
}

export function ErrorSummary({ id, count }: { id: string; count: number }) {
  if (count === 0) return null;
  return (
    <div id={id} className={styles.summary} role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <span>Please fix {count === 1 ? '1 field' : `${count} fields`} before saving.</span>
    </div>
  );
}

/** Sticky footer for dialog forms. `onDelete` adds a Delete button that asks to confirm in place. */
export function FormActions({
  submitLabel,
  onCancel,
  onDelete,
  confirmText = 'Delete this? This cannot be undone.',
  busy = false,
}: {
  submitLabel: string;
  onCancel: () => void;
  onDelete?: () => void;
  confirmText?: string;
  busy?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const textId = useId();
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  if (confirming && onDelete) {
    return (
      <div className={styles.actions}>
        <div className={styles.confirm} role="group" aria-labelledby={textId}>
          <p id={textId} className={styles.confirmText}>
            {confirmText}
          </p>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
          <Button ref={confirmRef} variant="danger" icon={<Trash2 />} onClick={onDelete}>
            Yes, delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      {onDelete && (
        <Button
          ref={deleteRef}
          variant="danger"
          icon={<Trash2 />}
          className={styles.actionsStart}
          onClick={() => setConfirming(true)}
        >
          Delete
        </Button>
      )}
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" disabled={busy} aria-busy={busy || undefined}>
        {submitLabel}
      </Button>
    </div>
  );
}

type PasscodeInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'id'>;

/** Password-style input with a show/hide toggle. Browsers are asked not to save it. */
export const PasscodeInput = forwardRef<HTMLInputElement, PasscodeInputProps>(function PasscodeInput(
  { id, value, onChange, error, hint, autoFocus, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.passcode}>
      <input
        {...rest}
        ref={ref}
        id={id}
        className={inputClass}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        data-autofocus={autoFocus ? '' : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <IconButton label="Show passcode" aria-pressed={visible} className={styles.reveal} onClick={() => setVisible((v) => !v)}>
        {visible ? <EyeOff /> : <Eye />}
      </IconButton>
    </div>
  );
});

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className={styles.warning}>
      <TriangleAlert size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
