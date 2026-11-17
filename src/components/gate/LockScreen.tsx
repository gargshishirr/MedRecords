import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert, Info, LockKeyhole, Trash2 } from 'lucide-react';
import { tooManyAttempts, useVault } from '../../state/store';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field } from '../ui/Field';
import { PasscodeInput } from '../forms/FormBits';
import styles from './Gate.module.css';

/** Shown while the data is encrypted and the key is not in memory. */
export function LockScreen() {
  const { unlock, eraseAll, attemptWaitMs, notice } = useVault();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Read out once per attempt; the visible countdown below is not. */
  const [announcement, setAnnouncement] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitLeft, setWaitLeft] = useState(() => attemptWaitMs());
  const [confirmErase, setConfirmErase] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    document.title = 'Locked · MedRecords';
  }, []);

  // Count down while further attempts are paused.
  useEffect(() => {
    if (waitLeft <= 0) return;
    const timer = window.setInterval(() => {
      const left = attemptWaitMs();
      setWaitLeft(left);
      if (left <= 0) inputRef.current?.focus();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [waitLeft, attemptWaitMs]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || waitLeft > 0) return;
    if (!passcode) {
      setError('Enter your passcode.');
      setAnnouncement('Enter your passcode.');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setAnnouncement('');
    const result = await unlock(passcode);
    if (result.ok) return;
    setBusy(false);
    setError(result.waitMs > 0 ? 'Wrong passcode.' : result.error);
    setAnnouncement(result.error);
    setWaitLeft(result.waitMs);
    setPasscode('');
    inputRef.current?.focus();
  };

  const waiting = waitLeft > 0;

  return (
    <main className={styles.screen}>
      <div className={`${styles.panel} ${styles.narrow}`}>
        <div className={styles.head}>
          <span className={styles.lockIcon} aria-hidden="true">
            <LockKeyhole size={26} />
          </span>
          <h1 className={`${styles.title} display`}>MedRecords is locked</h1>
          <p className={styles.lead}>Enter your passcode to open your family&apos;s records.</p>
        </div>

        {notice && (
          <p className={styles.notice} role="status">
            <Info size={16} aria-hidden="true" />
            {notice}
          </p>
        )}

        <form className={styles.form} onSubmit={(e) => void onSubmit(e)} noValidate>
          <Field id={`${id}-passcode`} label="Passcode" error={error ?? undefined}>
            <PasscodeInput
              id={`${id}-passcode`}
              ref={inputRef}
              value={passcode}
              onChange={setPasscode}
              error={error ?? undefined}
              autoFocus
              readOnly={busy}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            disabled={busy || waiting}
            aria-busy={busy || undefined}
          >
            {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
          <p className="visually-hidden" aria-live="assertive">
            {announcement}
          </p>
          {waiting && (
            <p className={styles.error} aria-hidden="true">
              <CircleAlert size={14} />
              {tooManyAttempts(waitLeft)}
            </p>
          )}
        </form>

        <details className={styles.forgot}>
          <summary>Forgot your passcode?</summary>
          <div className={styles.forgotBody}>
            <p>
              The passcode is the only key to your data, so it cannot be recovered or reset. If you have a backup, you can erase
              the data in this browser, start again and import the backup.
            </p>
            <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirmErase(true)}>
              Erase all data in this browser
            </Button>
          </div>
        </details>
      </div>

      <Dialog
        open={confirmErase}
        onClose={() => setConfirmErase(false)}
        size="sm"
        title="Erase all data?"
        description="This deletes every person and record stored in this browser. It cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmErase(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 />}
              onClick={() => {
                setConfirmErase(false);
                eraseAll();
              }}
            >
              Erase everything
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>Your theme setting is kept. Backup files you saved are not affected.</p>
      </Dialog>
    </main>
  );
}
