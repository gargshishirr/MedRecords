import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Download, KeyRound, LockKeyhole, LockOpen, ShieldCheck } from 'lucide-react';
import { AUTO_LOCK_MINUTES } from '../../lib/types';
import { PASSCODE_MIN, validateNewPasscode } from '../../lib/forms';
import type { FormErrors } from '../../lib/forms';
import { useStore, useVault } from '../../state/store';
import type { PasscodeResult } from '../../state/store';
import { useToast } from '../../state/toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, selectClass } from '../../components/ui/Field';
import { ErrorSummary, PasscodeInput, Warning, formStyles } from '../../components/forms/FormBits';
import styles from './Settings.module.css';

const PASSCODE_HINT = `At least ${PASSCODE_MIN} characters. A short phrase is easy to remember and hard to guess.`;

type Mode = 'enable' | 'change' | 'remove';

/** Settings card for the optional passcode lock. */
export function LockCard({ onExport }: { onExport: () => void }) {
  const { lockEnabled, canEncrypt, lockNow } = useVault();
  const { data, setAutoLockMinutes } = useStore();
  const [mode, setMode] = useState<Mode | null>(null);
  const selectId = useId();

  return (
    <Card
      title="Lock with a passcode"
      description="Encrypts everything in this browser. Optional, and off until you turn it on."
      icon={<LockKeyhole />}
    >
      {!canEncrypt ? (
        <p className={styles.actionText}>
          This browser can&apos;t encrypt data here. Open MedRecords over HTTPS in an up-to-date browser to use the lock.
        </p>
      ) : lockEnabled ? (
        <div className={styles.lockOn}>
          <p className={styles.lockStatus}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>Lock is on.</strong> Your data is encrypted in this browser. It is only readable after you unlock.
            </span>
          </p>
          <div className={styles.lockRow}>
            <label htmlFor={selectId} className={styles.lockLabel}>
              Lock after
            </label>
            <select
              id={selectId}
              className={`${selectClass} ${styles.lockSelect}`}
              value={data.settings.autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
            >
              {AUTO_LOCK_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m === 60 ? '1 hour' : `${m} ${m === 1 ? 'minute' : 'minutes'}`} without activity
                </option>
              ))}
            </select>
          </div>
          <div className={styles.buttonRow}>
            <Button variant="primary" icon={<LockKeyhole />} onClick={lockNow}>
              Lock now
            </Button>
            <Button icon={<KeyRound />} onClick={() => setMode('change')}>
              Change passcode
            </Button>
            <Button variant="danger" icon={<LockOpen />} onClick={() => setMode('remove')}>
              Remove lock
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.lockOn}>
          <ul className={styles.lockPoints}>
            <li>Data is encrypted on this device with a key made from your passcode.</li>
            <li>The app locks itself after a few minutes without activity.</li>
            <li>Best for shared or family devices.</li>
          </ul>
          <Warning>
            <strong>If you forget the passcode, your data cannot be recovered.</strong> Export a backup first and keep it
            somewhere safe.
          </Warning>
          <div className={styles.buttonRow}>
            <Button variant="primary" icon={<LockKeyhole />} onClick={() => setMode('enable')}>
              Lock with a passcode
            </Button>
            <Button icon={<Download />} onClick={onExport}>
              Export a backup first
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={mode === 'enable'}
        onClose={() => setMode(null)}
        title="Lock with a passcode"
        description="You'll need it every time you open MedRecords in this browser."
      >
        <EnableForm onDone={() => setMode(null)} onExport={onExport} />
      </Dialog>
      <Dialog open={mode === 'change'} onClose={() => setMode(null)} title="Change passcode">
        <ChangeForm onDone={() => setMode(null)} />
      </Dialog>
      <Dialog open={mode === 'remove'} onClose={() => setMode(null)} title="Remove the lock?" size="sm">
        <RemoveForm onDone={() => setMode(null)} />
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog forms                                                        */
/* ------------------------------------------------------------------ */

function PasscodeField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <Field id={id} label={label} required error={error} hint={hint}>
      <PasscodeInput
        id={id}
        value={value}
        onChange={onChange}
        error={error}
        hint={hint}
        autoFocus={autoFocus}
        aria-required="true"
      />
    </Field>
  );
}

function DialogForm({
  onSubmit,
  errors,
  busy,
  submitLabel,
  busyLabel,
  onCancel,
  danger,
  children,
}: {
  onSubmit: () => void;
  errors: FormErrors;
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  onCancel: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const count = Object.keys(errors).length;
  return (
    <form
      className={formStyles.form}
      noValidate
      aria-describedby={count ? id : undefined}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <ErrorSummary id={id} count={count} />
      {children}
      <div className={formStyles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} type="submit" disabled={busy} aria-busy={busy || undefined}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function focusFirst(ids: Record<string, string>, errors: FormErrors) {
  const first = Object.keys(ids).find((k) => errors[k]);
  if (first) document.getElementById(ids[first]!)?.focus();
}

function EnableForm({ onDone, onExport }: { onDone: () => void; onExport: () => void }) {
  const { enableLock } = useVault();
  const { notify } = useToast();
  const uid = useId();
  const ids = { passcode: `${uid}-p`, confirm: `${uid}-c`, understood: `${uid}-u` };
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const found = validateNewPasscode(passcode, confirm);
    if (!understood) found.understood = 'Tick the box to confirm you understand.';
    setErrors(found);
    if (Object.keys(found).length) return focusFirst(ids, found);
    setBusy(true);
    const result = await enableLock(passcode);
    setBusy(false);
    if (!result.ok) {
      setErrors({ passcode: result.error });
      return;
    }
    notify('Lock is on. Your data is now encrypted in this browser.');
    onDone();
  };

  return (
    <DialogForm
      onSubmit={() => void submit()}
      errors={errors}
      busy={busy}
      submitLabel="Turn on the lock"
      busyLabel="Encrypting…"
      onCancel={onDone}
    >
      <Warning>
        <strong>If you forget this passcode, your data cannot be recovered.</strong> Nobody can reset it, not even the maker of
        MedRecords. Export a backup first.
      </Warning>
      <Button icon={<Download />} className={formStyles.addRow} onClick={onExport}>
        Export a backup first
      </Button>
      <PasscodeField
        id={ids.passcode}
        label="New passcode"
        value={passcode}
        onChange={setPasscode}
        error={errors.passcode}
        hint={PASSCODE_HINT}
        autoFocus
      />
      <PasscodeField id={ids.confirm} label="Type it again" value={confirm} onChange={setConfirm} error={errors.confirm} />
      <div>
        <label className={styles.understand}>
          <input
            id={ids.understood}
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            aria-invalid={errors.understood ? true : undefined}
            aria-describedby={errors.understood ? `${ids.understood}-error` : undefined}
          />
          I understand that a forgotten passcode means this data is lost.
        </label>
        {errors.understood && (
          <p id={`${ids.understood}-error`} className={styles.error}>
            {errors.understood}
          </p>
        )}
      </div>
    </DialogForm>
  );
}

function ChangeForm({ onDone }: { onDone: () => void }) {
  const { changePasscode } = useVault();
  const { notify } = useToast();
  const uid = useId();
  const ids = { current: `${uid}-cur`, passcode: `${uid}-p`, confirm: `${uid}-c` };
  const [current, setCurrent] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const found = validateNewPasscode(passcode, confirm);
    if (!current) found.current = 'Enter your current passcode.';
    setErrors(found);
    if (Object.keys(found).length) return focusFirst(ids, found);
    setBusy(true);
    const result: PasscodeResult = await changePasscode(current, passcode);
    setBusy(false);
    if (!result.ok) {
      setErrors({ current: result.error });
      setCurrent('');
      focusFirst(ids, { current: result.error });
      return;
    }
    notify('Passcode changed');
    onDone();
  };

  return (
    <DialogForm
      onSubmit={() => void submit()}
      errors={errors}
      busy={busy}
      submitLabel="Change passcode"
      busyLabel="Saving…"
      onCancel={onDone}
    >
      <PasscodeField
        id={ids.current}
        label="Current passcode"
        value={current}
        onChange={setCurrent}
        error={errors.current}
        autoFocus
      />
      <PasscodeField
        id={ids.passcode}
        label="New passcode"
        value={passcode}
        onChange={setPasscode}
        error={errors.passcode}
        hint={PASSCODE_HINT}
      />
      <PasscodeField
        id={ids.confirm}
        label="Type the new one again"
        value={confirm}
        onChange={setConfirm}
        error={errors.confirm}
      />
    </DialogForm>
  );
}

function RemoveForm({ onDone }: { onDone: () => void }) {
  const { removeLock } = useVault();
  const { notify } = useToast();
  const uid = useId();
  const ids = { current: `${uid}-cur` };
  const [current, setCurrent] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!current) {
      setErrors({ current: 'Enter your current passcode.' });
      return focusFirst(ids, { current: 'missing' });
    }
    setBusy(true);
    const result = await removeLock(current);
    setBusy(false);
    if (!result.ok) {
      setErrors({ current: result.error });
      setCurrent('');
      focusFirst(ids, { current: result.error });
      return;
    }
    notify('Lock removed. Data is stored without encryption.', 'info');
    onDone();
  };

  return (
    <DialogForm
      onSubmit={() => void submit()}
      errors={errors}
      busy={busy}
      submitLabel="Remove lock"
      busyLabel="Removing…"
      onCancel={onDone}
      danger
    >
      <p className={styles.confirmText}>
        Your data will be stored in this browser without encryption. Anyone using this browser can read it.
      </p>
      <PasscodeField
        id={ids.current}
        label="Current passcode"
        value={current}
        onChange={setCurrent}
        error={errors.current}
        autoFocus
      />
    </DialogForm>
  );
}
