import type { AppData } from './types';
import type { Envelope } from './crypto';
import { DecryptError, createVaultKey, encryptText, openEnvelope, parseEnvelope } from './crypto';
import type { BackupFile } from './files';
import { MAX_FILE_BYTES, isFileType } from './files';
import { referencedFileIds } from './store';
import { isSafeId, safeJsonParse, validateAppData } from './validate';

/** Marks an encrypted backup file. The rest of the file is a normal envelope. */
export const BACKUP_FORMAT = 'medrecords-encrypted-backup';
/** Backups can hold attached photos and PDFs, so they may be much larger than the app data itself. */
export const MAX_BACKUP_BYTES = 250 * 1024 * 1024;
export const BACKUP_TOO_BIG = 'That file is too big. MedRecords backups must be under 250 MB.';
const MAX_BACKUP_FILES = 5_000;
const NOT_JSON = "That file isn't valid JSON, so it can't be a MedRecords backup.";

export type BackupContents =
  | { kind: 'plain'; data: AppData; files: BackupFile[] }
  | { kind: 'encrypted'; envelope: Envelope }
  | { kind: 'error'; error: string };

export type OpenedBackup = { ok: true; data: AppData; files: BackupFile[] } | { ok: false; error: string };

/** The data as it goes into a backup: with its files, but never with this browser's file key. */
function backupBody(data: AppData, files: BackupFile[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fileKey, ...rest } = data;
  return files.length ? { ...rest, files } : rest;
}

export function serialize(data: AppData, files: BackupFile[] = []): string {
  return JSON.stringify(backupBody(data, files), null, 2);
}

/** Builds the text of a backup file: plain JSON, or encrypted when a passcode is given. */
export async function createBackup(data: AppData, passcode?: string, files: BackupFile[] = []): Promise<string> {
  if (!passcode) return serialize(data, files);
  const vault = await createVaultKey(passcode);
  const envelope = await encryptText(vault, JSON.stringify(backupBody(data, files)));
  return JSON.stringify({ format: BACKUP_FORMAT, ...envelope }, null, 2);
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function readFiles(value: unknown): { ok: true; files: BackupFile[] } | { ok: false; error: string } {
  const damaged = { ok: false as const, error: 'This backup is damaged: its attached files are not valid.' };
  if (typeof value !== 'object' || value === null || !Object.prototype.hasOwnProperty.call(value, 'files')) {
    return { ok: true, files: [] };
  }
  const list = (value as Record<string, unknown>).files;
  if (!Array.isArray(list)) return damaged;
  if (list.length > MAX_BACKUP_FILES) return { ok: false, error: 'This backup has too many attached files.' };
  const files: BackupFile[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return damaged;
    const { id, name, type, data } = item as Record<string, unknown>;
    if (!isSafeId(id) || seen.has(id) || !isFileType(type)) return damaged;
    if (typeof name !== 'string' || name.length > 200) return damaged;
    if (typeof data !== 'string' || data.length % 4 !== 0 || !BASE64_RE.test(data)) return damaged;
    if ((data.length / 4) * 3 > MAX_FILE_BYTES + 2) return damaged;
    seen.add(id);
    files.push({ id, name, type, data });
  }
  return { ok: true, files };
}

/** Validates parsed backup JSON: the data, plus any attached files it points to. */
function openParsed(parsed: unknown, now: Date): OpenedBackup {
  const read = readFiles(parsed);
  if (!read.ok) return read;
  const result = validateAppData(parsed, now);
  if (!result.ok) return result;
  const ids = new Set(read.files.map((f) => f.id));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { fileKey, ...rest } = result.data;
  const data: AppData = {
    ...rest,
    // Attachments whose file isn't in the backup keep only their name.
    records: rest.records.map((r) =>
      r.attachments.some((a) => a.fileId && !ids.has(a.fileId))
        ? { ...r, attachments: r.attachments.map((a) => (a.fileId && !ids.has(a.fileId) ? { name: a.name, sizeKb: a.sizeKb } : a)) }
        : r,
    ),
  };
  const used = referencedFileIds(data);
  return { ok: true, data, files: read.files.filter((f) => used.has(f.id)) };
}

/** Works out what kind of backup a file holds, validating plain backups straight away. */
export function readBackup(text: string, now: Date = new Date()): BackupContents {
  if (text.length > MAX_BACKUP_BYTES) return { kind: 'error', error: BACKUP_TOO_BIG };
  let parsed: unknown;
  try {
    parsed = safeJsonParse(text);
  } catch {
    return { kind: 'error', error: NOT_JSON };
  }
  if (typeof parsed === 'object' && parsed !== null && (parsed as Record<string, unknown>).format === BACKUP_FORMAT) {
    const envelope = parseEnvelope(parsed);
    return envelope ? { kind: 'encrypted', envelope } : { kind: 'error', error: 'This encrypted backup is damaged.' };
  }
  const opened = openParsed(parsed, now);
  return opened.ok ? { kind: 'plain', data: opened.data, files: opened.files } : { kind: 'error', error: opened.error };
}

export async function decryptBackup(envelope: Envelope, passcode: string, now: Date = new Date()): Promise<OpenedBackup> {
  let text: string;
  try {
    ({ text } = await openEnvelope(passcode, envelope));
  } catch (err) {
    if (err instanceof DecryptError) return { ok: false, error: 'Wrong backup passcode, or the file has been changed.' };
    return { ok: false, error: 'This encrypted backup could not be opened.' };
  }
  let parsed: unknown;
  try {
    parsed = safeJsonParse(text);
  } catch {
    return { ok: false, error: NOT_JSON };
  }
  return openParsed(parsed, now);
}

/** Reads a file as text after checking its size. Uses FileReader where `Blob.text()` is missing. */
export async function readFileText(file: Blob): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (file.size > MAX_BACKUP_BYTES) return { ok: false, error: BACKUP_TOO_BIG };
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
export function downloadText(text: string, filename: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
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
