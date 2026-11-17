/**
 * Encryption at rest, built only on WebCrypto.
 *
 * - Key: PBKDF2-SHA-256 with 600,000 iterations and a random 16-byte salt,
 *   derived into a non-extractable AES-GCM 256-bit CryptoKey.
 * - Every save uses a fresh random 12-byte IV.
 * - What gets stored is an envelope with only a version, the salt, the IV and
 *   the ciphertext (all base64). The passcode and the key are never stored.
 */

export const ENVELOPE_VERSION = 1;
export const KDF_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
/** AES-GCM appends a 16-byte authentication tag to the ciphertext. */
const TAG_BYTES = 16;

export interface Envelope {
  v: typeof ENVELOPE_VERSION;
  salt: string;
  iv: string;
  ct: string;
}

/** A derived key plus the salt it came from (needed to write new envelopes). */
export interface VaultKey {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
}

/** Thrown when decryption fails: a wrong passcode or tampered data (AES-GCM can't tell them apart). */
export class DecryptError extends Error {
  constructor() {
    super('Wrong passcode, or the data has been changed.');
    this.name = 'DecryptError';
  }
}

export function cryptoAvailable(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.subtle?.deriveKey === 'function';
}

const encoder = new TextEncoder();

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(passcode: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passcode.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: KDF_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Creates a new key with a fresh random salt. */
export async function createVaultKey(passcode: string): Promise<VaultKey> {
  const salt = randomBytes(SALT_BYTES);
  return { key: await deriveKey(passcode, salt), salt };
}

export async function encryptText(vault: VaultKey, plaintext: string): Promise<Envelope> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vault.key, encoder.encode(plaintext));
  return {
    v: ENVELOPE_VERSION,
    salt: toBase64(vault.salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptText(key: CryptoKey, envelope: Envelope): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ct));
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new DecryptError();
  }
}

/** Derives the key from the envelope's salt and decrypts. Returns the key so later saves can reuse it. */
export async function openEnvelope(passcode: string, envelope: Envelope): Promise<{ text: string; vault: VaultKey }> {
  const salt = fromBase64(envelope.salt);
  const key = await deriveKey(passcode, salt);
  const text = await decryptText(key, envelope);
  return { text, vault: { key, salt } };
}

/** True when the envelope was written with this key's salt. */
export function sameSalt(vault: VaultKey, envelope: Envelope): boolean {
  return toBase64(vault.salt) === envelope.salt;
}

/* ------------------------------------------------------------------ */
/* Envelope parsing                                                    */
/* ------------------------------------------------------------------ */

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodedLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length / 4) * 3 - padding;
}

function isBase64(value: unknown, minBytes: number, maxBytes = Infinity): value is string {
  if (typeof value !== 'string' || value.length === 0 || !BASE64_RE.test(value)) return false;
  const n = decodedLength(value);
  return n >= minBytes && n <= maxBytes;
}

/** Strictly reads an envelope, keeping only the four known fields. */
export function parseEnvelope(value: unknown): Envelope | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.v !== ENVELOPE_VERSION) return null;
  if (!isBase64(v.salt, SALT_BYTES, SALT_BYTES)) return null;
  if (!isBase64(v.iv, IV_BYTES, IV_BYTES)) return null;
  if (!isBase64(v.ct, TAG_BYTES)) return null;
  return { v: ENVELOPE_VERSION, salt: v.salt, iv: v.iv, ct: v.ct };
}

/* ------------------------------------------------------------------ */
/* Base64                                                              */
/* ------------------------------------------------------------------ */

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
