import type { AppData } from './types';
import type { Envelope } from './crypto';
import { DecryptError, createVaultKey, encryptText, openEnvelope, parseEnvelope } from './crypto';
import type { ValidationResult } from './validate';
import { MAX_IMPORT_BYTES, TOO_BIG_MESSAGE, parseAppDataJson, safeJsonParse, validateAppData } from './validate';

/** Marks an encrypted backup file. The rest of the file is a normal envelope. */
export const BACKUP_FORMAT = 'medrecords-encrypted-backup';

export type BackupContents =
  { kind: 'plain'; data: AppData } | { kind: 'encrypted'; envelope: Envelope } | { kind: 'error'; error: string };

export function serialize(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/** Builds the text of a backup file: plain JSON, or encrypted when a passcode is given. */
export async function createBackup(data: AppData, passcode?: string): Promise<string> {
  if (!passcode) return serialize(data);
  const vault = await createVaultKey(passcode);
  const envelope = await encryptText(vault, JSON.stringify(data));
  return JSON.stringify({ format: BACKUP_FORMAT, ...envelope }, null, 2);
}

/** Works out what kind of backup a file holds, validating plain backups straight away. */
export function readBackup(text: string, now: Date = new Date()): BackupContents {
  if (text.length > MAX_IMPORT_BYTES) return { kind: 'error', error: TOO_BIG_MESSAGE };
  let parsed: unknown;
  try {
    parsed = safeJsonParse(text);
  } catch {
    return { kind: 'error', error: "That file isn't valid JSON, so it can't be a MedRecords backup." };
  }
  if (typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>).format === BACKUP_FORMAT) {
    const envelope = parseEnvelope(parsed);
    return envelope ? { kind: 'encrypted', envelope } : { kind: 'error', error: 'This encrypted backup is damaged.' };
  }
  const result = validateAppData(parsed, now);
  return result.ok ? { kind: 'plain', data: result.data } : { kind: 'error', error: result.error };
}

export async function decryptBackup(envelope: Envelope, passcode: string, now: Date = new Date()): Promise<ValidationResult> {
  try {
    const { text } = await openEnvelope(passcode, envelope);
    return parseAppDataJson(text, now);
  } catch (err) {
    if (err instanceof DecryptError) return { ok: false, error: 'Wrong backup passcode, or the file has been changed.' };
    return { ok: false, error: 'This encrypted backup could not be opened.' };
  }
}

/** Reads a file as text after checking its size. Uses FileReader where `Blob.text()` is missing. */
export async function readFileText(file: Blob): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: TOO_BIG_MESSAGE };
  try {
    const text =
      typeof file.text === 'function'
        ? await file.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.onerror = () => reject(reader.error ?? new Error('read failed'));
            reader.readAsText(file);
          });
    return { ok: true, text };
  } catch {
    return { ok: false, error: "That file couldn't be read." };
  }
}

/** Starts a browser download of `text`. */
export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
