/**
 * Attached files (photos and PDFs of reports, prescriptions and scans).
 *
 * - Files are checked by their first bytes, not just their name, and only
 *   JPEG, PNG, WebP and PDF are kept. Nothing that a browser could run as a
 *   page (HTML, SVG) is ever stored.
 * - Photos are re-encoded: large ones are shrunk, and camera metadata such as
 *   GPS location is dropped.
 * - Every file is encrypted with AES-GCM using `AppData.fileKey`. That key is
 *   saved inside the app data, so when the passcode lock is on, the files are
 *   only readable after unlocking.
 * - The encrypted bytes live in IndexedDB (localStorage is far too small).
 */
import { fromBase64, randomBytes, toBase64 } from './crypto';

export const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type FileType = (typeof FILE_TYPES)[number];
export const isFileType = (v: unknown): v is FileType => typeof v === 'string' && (FILE_TYPES as readonly string[]).includes(v);

/** For `<input accept>`. `image/*` lets phones offer the camera; other formats are refused after picking. */
export const FILE_ACCEPT = 'image/*,application/pdf,.pdf';
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Most files one record can hold. */
export const MAX_ATTACHMENTS = 20;
/** Photos straight off a phone can be large; they are shrunk before the size check. */
const MAX_PHOTO_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2400;
const KEEP_LOSSLESS_BYTES = 2 * 1024 * 1024;
const JPEG_QUALITY = 0.85;
const FILE_KEY_BYTES = 32;
const IV_BYTES = 12;

/* ------------------------------------------------------------------ */
/* Checking and preparing a picked file                                */
/* ------------------------------------------------------------------ */

/** Works out the real type from the first bytes. */
export function sniffType(bytes: Uint8Array): FileType | null {
  const at = (i: number, ...values: number[]) => values.every((v, j) => bytes[i + j] === v);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'; // RIFF....WEBP
  return null;
}

export interface PreparedFile {
  name: string;
  type: FileType;
  bytes: Uint8Array<ArrayBuffer>;
}

export type PrepareResult = { ok: true; file: PreparedFile } | { ok: false; error: string };

const UNSUPPORTED = 'only photos (JPEG, PNG, WebP) and PDFs can be attached.';

function cleanName(name: string, type: FileType): string {
  const printable = [...name].filter((ch) => ch.charCodeAt(0) >= 32).join('');
  const base = printable.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120) || 'file';
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base.replace(/\.[a-z0-9]{2,5}$/i, `.${ext}`) : `${base}.${ext}`;
}

async function readBytes(file: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Re-draws a photo as JPEG, shrinking it if needed (this also drops camera
 * metadata such as GPS location). Small PNG and WebP images, like screenshots
 * of reports, are kept as they are. Returns null where the browser can't
 * decode the image.
 */
async function reencodePhoto(
  file: Blob,
  type: FileType | null,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: FileType } | 'keep' | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return type ? 'keep' : null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const big = Math.max(bitmap.width, bitmap.height) > MAX_IMAGE_SIDE;
    if ((type === 'image/png' || type === 'image/webp') && !big && file.size <= KEEP_LOSSLESS_BYTES) return 'keep';
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return type ? 'keep' : null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    return blob ? { bytes: await readBytes(blob), type: 'image/jpeg' } : type ? 'keep' : null;
  } finally {
    bitmap.close();
  }
}

/** Checks a picked file and gets it ready to store. */
export async function prepareFile(file: File): Promise<PrepareResult> {
  const label = file.name || 'This file';
  const looksLikePhoto = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (file.size > (looksLikePhoto ? MAX_PHOTO_INPUT_BYTES : MAX_FILE_BYTES)) {
    return { ok: false, error: `${label} is too big. Files must be under ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await readBytes(file);
  } catch {
    return { ok: false, error: `${label} couldn't be read.` };
  }
  let type = sniffType(bytes);

  if (type !== 'application/pdf') {
    // HEIC photos from iPhones can often be decoded by the browser and saved as JPEG.
    const isPhoto = type !== null || /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
    if (!isPhoto) return { ok: false, error: `${label} can't be attached: ${UNSUPPORTED}` };
    const redrawn = await reencodePhoto(new Blob([bytes], { type: type ?? file.type }), type);
    if (redrawn === null) {
      return {
        ok: false,
        error: type
          ? `${label} couldn't be opened as an image.`
          : `${label} can't be attached: this browser can't open HEIC photos. Use JPEG or PNG.`,
      };
    }
    if (redrawn !== 'keep') {
      bytes = redrawn.bytes;
      type = redrawn.type;
    }
  }
  if (!type) return { ok: false, error: `${label} can't be attached: ${UNSUPPORTED}` };
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: `${label} is too big. Files must be under ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
  }
  return { ok: true, file: { name: cleanName(file.name, type), type, bytes } };
}

/* ------------------------------------------------------------------ */
/* Encryption                                                          */
/* ------------------------------------------------------------------ */

export interface StoredFile {
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
  type: FileType;
  /** Epoch ms, used to avoid cleaning up files another tab has only just added. */
  createdAt: number;
}

export function newFileId(): string {
  return `file-${Date.now().toString(36)}-${toBase64(randomBytes(6)).replace(/[+/=]/g, '').slice(0, 8)}`;
}

export function newFileKey(): string {
  return toBase64(randomBytes(FILE_KEY_BYTES));
}

export function isFileKey(v: unknown): v is string {
  if (typeof v !== 'string' || v.length !== 44) return false;
  try {
    return fromBase64(v).length === FILE_KEY_BYTES;
  } catch {
    return false;
  }
}

function importFileKey(fileKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(fileKey), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptFile(fileKey: string, bytes: Uint8Array<ArrayBuffer>, type: FileType, now = Date.now()): Promise<StoredFile> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importFileKey(fileKey), bytes);
  return { iv, ct, type, createdAt: now };
}

export async function decryptFile(fileKey: string, stored: StoredFile): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: stored.iv }, await importFileKey(fileKey), stored.ct);
  return new Uint8Array(plain);
}

/** A Blob whose type always comes from the allow-list, so a blob: URL can never be opened as a web page. */
export function toBlob(bytes: Uint8Array<ArrayBuffer>, type: FileType): Blob {
  return new Blob([bytes], { type });
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

export interface FileStore {
  put(id: string, file: StoredFile): Promise<void>;
  get(id: string): Promise<StoredFile | undefined>;
  remove(ids: Iterable<string>): Promise<void>;
  /** Ids and creation times only; never loads the file bytes. */
  list(): Promise<{ id: string; createdAt: number }[]>;
  clear(): Promise<void>;
}

export function memoryFileStore(): FileStore {
  const map = new Map<string, StoredFile>();
  return {
    put: async (id, file) => void map.set(id, file),
    get: async (id) => map.get(id),
    remove: async (ids) => {
      for (const id of ids) map.delete(id);
    },
    list: async () => [...map].map(([id, f]) => ({ id, createdAt: f.createdAt })),
    clear: async () => map.clear(),
  };
}

const DB_NAME = 'medrecords-files';
const STORE = 'files';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function idbFileStore(): FileStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const open = () => {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE);
        store.createIndex('createdAt', 'createdAt');
      };
      req.onsuccess = () => {
        const db = req.result;
        // Let a newer version in another tab upgrade the database.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error('IndexedDB unavailable'));
      };
    });
    return dbPromise;
  };
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode);
  const done = (t: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
    });

  return {
    async put(id, file) {
      const t = await tx('readwrite');
      t.objectStore(STORE).put(file, id);
      await done(t);
    },
    async get(id) {
      const t = await tx('readonly');
      return (await request(t.objectStore(STORE).get(id))) as StoredFile | undefined;
    },
    async remove(ids) {
      const list = [...ids];
      if (!list.length) return;
      const t = await tx('readwrite');
      const store = t.objectStore(STORE);
      for (const id of list) store.delete(id);
      await done(t);
    },
    async list() {
      const t = await tx('readonly');
      const out: { id: string; createdAt: number }[] = [];
      await new Promise<void>((resolve, reject) => {
        const req = t.objectStore(STORE).index('createdAt').openKeyCursor();
        req.onerror = () => reject(req.error ?? new Error('IndexedDB cursor failed'));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return resolve();
          out.push({ id: String(cursor.primaryKey), createdAt: Number(cursor.key) });
          cursor.continue();
        };
      });
      return out;
    },
    async clear() {
      const t = await tx('readwrite');
      t.objectStore(STORE).clear();
      await done(t);
    },
  };
}

let shared: FileStore | null = null;

/** The file store for this browser (in memory where IndexedDB is missing, as in tests). */
export function fileStore(): FileStore {
  shared ??= typeof indexedDB !== 'undefined' ? idbFileStore() : memoryFileStore();
  return shared;
}

/** Tests can swap in their own store. */
export function setFileStore(store: FileStore | null): void {
  shared = store;
}

/** Asks the browser not to clear MedRecords' storage when the disk gets full. Best effort. */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* not supported */
  }
}

/** Deletes stored files nothing points to. Recent files are kept in case another tab is still saving them. */
export async function collectGarbage(store: FileStore, referenced: Set<string>, now = Date.now(), graceMs = 10 * 60_000) {
  const all = await store.list();
  const unused = all.filter((f) => !referenced.has(f.id) && now - f.createdAt > graceMs).map((f) => f.id);
  await store.remove(unused);
  return unused.length;
}

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

/** An attached file inside a backup: decrypted, as base64. The backup itself may be encrypted. */
export interface BackupFile {
  id: string;
  name: string;
  type: FileType;
  data: string;
}

/** Decrypts every attached file the data points to, for a backup. Missing files are skipped. */
export async function collectBackupFiles(
  store: FileStore,
  data: { fileKey?: string; records: { attachments: { fileId?: string; name: string; type?: string }[] }[] },
): Promise<BackupFile[]> {
  const { fileKey } = data;
  if (!fileKey) return [];
  const out: BackupFile[] = [];
  const seen = new Set<string>();
  for (const record of data.records) {
    for (const a of record.attachments) {
      if (!a.fileId || seen.has(a.fileId)) continue;
      seen.add(a.fileId);
      try {
        const stored = await store.get(a.fileId);
        if (!stored) continue;
        out.push({ id: a.fileId, name: a.name, type: stored.type, data: toBase64(await decryptFile(fileKey, stored)) });
      } catch {
        /* unreadable files are left out; the attachment keeps its name */
      }
    }
  }
  return out;
}

/**
 * Encrypts a backup's files with a new key and stores them under new ids, so
 * the files the current data points to are never touched. Files whose bytes
 * don't match their stated type are skipped. If storing fails, everything
 * written so far is removed and the error is thrown.
 */
export async function restoreBackupFiles(
  store: FileStore,
  files: BackupFile[],
): Promise<{ fileKey: string; ids: Map<string, string> }> {
  const fileKey = newFileKey();
  const ids = new Map<string, string>();
  try {
    for (const f of files) {
      const bytes = fromBase64(f.data);
      if (sniffType(bytes) !== f.type || bytes.byteLength > MAX_FILE_BYTES) continue;
      const id = newFileId();
      await store.put(id, await encryptFile(fileKey, bytes, f.type));
      ids.set(f.id, id);
    }
  } catch (err) {
    await store.remove(ids.values()).catch(() => undefined);
    throw err;
  }
  return { fileKey, ids };
}

/** Points a dataset's attachments at restored files. Ones that weren't restored keep only their name. */
export function relinkAttachments<T extends { records: { attachments: { name: string; sizeKb: number; fileId?: string; type?: string }[] }[] }>(
  data: T,
  ids: Map<string, string>,
): T {
  return {
    ...data,
    records: data.records.map((r) => ({
      ...r,
      attachments: r.attachments.map((a) => {
        if (!a.fileId) return a;
        const id = ids.get(a.fileId);
        return id ? { ...a, fileId: id } : { name: a.name, sizeKb: a.sizeKb };
      }),
    })),
  };
}

/** Total size of a backup's files, for the confirmation message. */
export function backupFilesBytes(files: BackupFile[]): number {
  return files.reduce((sum, f) => sum + Math.floor((f.data.length * 3) / 4), 0);
}
