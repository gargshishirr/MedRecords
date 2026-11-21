import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, FileLock2, FileJson, LockKeyhole } from 'lucide-react';
import type { AppData } from '../../lib/types';
import type { Envelope } from '../../lib/crypto';
import type { BackupFile } from '../../lib/files';
import { collectBackupFiles, fileStore } from '../../lib/files';
import { referencedFileIds } from '../../lib/store';
import { pluralize } from '../../lib/format';
import { MAX_BACKUP_BYTES, createBackup, decryptBackup, downloadText } from '../../lib/backup';
import { toISODate } from '../../lib/date';
import { validateNewPasscode } from '../../lib/forms';
import type { FormErrors } from '../../lib/forms';
import { useStore, useVault } from '../../state/store';
import { useToast } from '../../state/toast';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { ErrorSummary, PasscodeInput, Warning, formStyles } from '../../components/forms/FormBits';

/** Choose an encrypted (passcode) or plain JSON backup and download it. */
export function ExportForm({ onDone }: { onDone: () => void }) {
  const { data, now } = useStore();
  const { canEncrypt } = useVault();
  const { notify } = useToast();
  const uid = useId();
  const [kind, setKind] = useState<'encrypted' | 'plain'>(canEncrypt ? 'encrypted' : 'plain');
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const count = Object.keys(errors).length;
  const fileCount = referencedFileIds(data).size;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (kind === 'encrypted') {
      const found = validateNewPasscode(passcode, confirm);
      setErrors(found);
      const first = found.passcode ? `${uid}-p` : found.confirm ? `${uid}-c` : null;
      if (first) return document.getElementById(first)?.focus();
    }
    setBusy(true);
    setTooBig(null);
    try {
      const files = await collectBackupFiles(fileStore(), data);
      const text = await createBackup(data, kind === 'encrypted' ? passcode : undefined, files);
      if (text.length > MAX_BACKUP_BYTES) {
        const mb = Math.ceil(text.length / 1024 / 1024);
        setTooBig(
          `This backup would be ${mb} MB, too big to import again (the limit is ${MAX_BACKUP_BYTES / 1024 / 1024} MB). ${
            kind === 'encrypted' ? 'Plain JSON is smaller, or remove some large files.' : 'Remove some large files first.'
          }`,
        );
        return;
      }
      const stamp = toISODate(now);
      downloadText(text, kind === 'encrypted' ? `medrecords-backup-${stamp}.encrypted.json` : `medrecords-backup-${stamp}.json`);
      notify(kind === 'encrypted' ? 'Encrypted backup downloaded' : 'Backup downloaded');
      onDone();
    } catch {
      setErrors({ passcode: "The backup couldn't be created. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={formStyles.form}
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-describedby={count ? `${uid}-sum` : undefined}
    >
      <ErrorSummary id={`${uid}-sum`} count={count} />
      {fileCount > 0 && <p className={formStyles.help}>Includes {pluralize(fileCount, 'attached file')}.</p>}
      <fieldset className={formStyles.choice}>
        <legend className="visually-hidden">Backup type</legend>
        <label className={formStyles.choiceOption}>
          <input
            type="radio"
            name={`${uid}-kind`}
            value="encrypted"
            checked={kind === 'encrypted'}
            disabled={!canEncrypt}
            onChange={() => setKind('encrypted')}
          />
          <span className={formStyles.choiceTitle}>
            <FileLock2 size={16} aria-hidden="true" /> Encrypted
          </span>
          <span className={formStyles.choiceText}>Recommended. Needs a passcode to open.</span>
        </label>
        <label className={formStyles.choiceOption}>
          <input type="radio" name={`${uid}-kind`} value="plain" checked={kind === 'plain'} onChange={() => setKind('plain')} />
          <span className={formStyles.choiceTitle}>
            <FileJson size={16} aria-hidden="true" /> Plain JSON
          </span>
          <span className={formStyles.choiceText}>Anyone with the file can read it.</span>
        </label>
      </fieldset>

      {kind === 'encrypted' ? (
        <>
          <Field
            id={`${uid}-p`}
            label="Backup passcode"
            required
            error={errors.passcode}
            hint="It can differ from your app passcode."
          >
            <PasscodeInput
              id={`${uid}-p`}
              value={passcode}
              onChange={setPasscode}
              error={errors.passcode}
              hint="It can differ from your app passcode."
              aria-required="true"
            />
          </Field>
          <Field id={`${uid}-c`} label="Type it again" required error={errors.confirm}>
            <PasscodeInput id={`${uid}-c`} value={confirm} onChange={setConfirm} error={errors.confirm} aria-required="true" />
          </Field>
          <Warning>
            <strong>Without this passcode the backup cannot be opened.</strong> Write it down somewhere safe.
          </Warning>
        </>
      ) : (
        <Warning>
          <strong>This file contains your health data in plain text.</strong> Keep it somewhere private and don&apos;t email it
          unprotected.
        </Warning>
      )}

      {tooBig && (
        <div role="alert">
          <Warning>{tooBig}</Warning>
        </div>
      )}

      <div className={formStyles.actions}>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" icon={<Download />} disabled={busy} aria-busy={busy || undefined}>
          {busy ? 'Preparing…' : 'Download backup'}
        </Button>
      </div>
    </form>
  );
}

/** Asks for the passcode of an encrypted backup file, then hands back the decrypted data. */
export function BackupPasscodeForm({
  envelope,
  onOpened,
  onCancel,
}: {
  envelope: Envelope;
  onOpened: (data: AppData, files: BackupFile[]) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!passcode) {
      setError('Enter the backup passcode.');
      return document.getElementById(`${uid}-p`)?.focus();
    }
    setBusy(true);
    const result = await decryptBackup(envelope, passcode);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setPasscode('');
      return document.getElementById(`${uid}-p`)?.focus();
    }
    onOpened(result.data, result.files);
  };

  return (
    <form className={formStyles.form} onSubmit={(e) => void submit(e)} noValidate>
      <p className="visually-hidden" aria-live="assertive">
        {error ?? ''}
      </p>
      <Field id={`${uid}-p`} label="Backup passcode" required error={error}>
        <PasscodeInput id={`${uid}-p`} value={passcode} onChange={setPasscode} error={error} autoFocus aria-required="true" />
      </Field>
      <div className={formStyles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" icon={<LockKeyhole />} disabled={busy} aria-busy={busy || undefined}>
          {busy ? 'Opening…' : 'Open backup'}
        </Button>
      </div>
    </form>
  );
}
