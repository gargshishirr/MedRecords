// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DecryptError,
  IV_BYTES,
  KDF_ITERATIONS,
  SALT_BYTES,
  createVaultKey,
  decryptText,
  encryptText,
  fromBase64,
  openEnvelope,
  parseEnvelope,
  toBase64,
} from './crypto';
import type { Envelope } from './crypto';

const SECRET = 'Riya Kapoor · Penicillin allergy · HbA1c 6.7%';

/** Flips one bit in a base64 field. */
function tamper(b64: string, index = 0): string {
  const bytes = fromBase64(b64);
  bytes[index] = bytes[index]! ^ 0x01;
  return toBase64(bytes);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('encryption at rest', () => {
  it('round-trips text and stores only version, salt, IV and ciphertext', async () => {
    const vault = await createVaultKey('correct horse battery');
    const envelope = await encryptText(vault, SECRET);

    expect(Object.keys(envelope).sort()).toEqual(['ct', 'iv', 'salt', 'v']);
    expect(envelope.v).toBe(1);
    expect(fromBase64(envelope.salt)).toHaveLength(SALT_BYTES);
    expect(fromBase64(envelope.iv)).toHaveLength(IV_BYTES);
    const stored = JSON.stringify(envelope);
    expect(stored).not.toContain('Riya');
    expect(stored).not.toContain('correct horse');

    const { text, vault: reopened } = await openEnvelope('correct horse battery', envelope);
    expect(text).toBe(SECRET);
    expect(await decryptText(reopened.key, await encryptText(reopened, 'again'))).toBe('again');
  });

  it('rejects a wrong passcode', async () => {
    const envelope = await encryptText(await createVaultKey('correct horse battery'), SECRET);
    await expect(openEnvelope('correct horse battery!', envelope)).rejects.toBeInstanceOf(DecryptError);
    await expect(openEnvelope('', envelope)).rejects.toBeInstanceOf(DecryptError);
  });

  it('rejects tampered ciphertext, IV or salt', async () => {
    const envelope = await encryptText(await createVaultKey('correct horse battery'), SECRET);
    const variants: Envelope[] = [
      { ...envelope, ct: tamper(envelope.ct) },
      { ...envelope, ct: tamper(envelope.ct, fromBase64(envelope.ct).length - 1) },
      { ...envelope, iv: tamper(envelope.iv) },
      { ...envelope, salt: tamper(envelope.salt) },
    ];
    for (const variant of variants) {
      await expect(openEnvelope('correct horse battery', variant)).rejects.toBeInstanceOf(DecryptError);
    }
  });

  it('uses a fresh random IV for every save', async () => {
    const vault = await createVaultKey('correct horse battery');
    const envelopes = await Promise.all(Array.from({ length: 40 }, () => encryptText(vault, SECRET)));
    expect(new Set(envelopes.map((e) => e.iv)).size).toBe(envelopes.length);
    expect(new Set(envelopes.map((e) => e.ct)).size).toBe(envelopes.length);
    // Same key, so the salt stays the same.
    expect(new Set(envelopes.map((e) => e.salt)).size).toBe(1);
  });

  it('derives a non-extractable AES-GCM key with PBKDF2-SHA-256 and 600,000 iterations', async () => {
    const derive = vi.spyOn(crypto.subtle, 'deriveKey');
    const { key, salt } = await createVaultKey('correct horse battery');

    expect(KDF_ITERATIONS).toBe(600_000);
    expect(derive).toHaveBeenCalledTimes(1);
    const [params, , derived, extractable, usages] = derive.mock.calls[0]!;
    expect(params).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000 });
    expect((params as Pbkdf2Params).salt).toBe(salt);
    expect(derived).toEqual({ name: 'AES-GCM', length: 256 });
    expect(extractable).toBe(false);
    expect(usages).toEqual(['encrypt', 'decrypt']);

    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('uses a new random salt for every new key', async () => {
    const [a, b] = await Promise.all([createVaultKey('same passcode'), createVaultKey('same passcode')]);
    expect(toBase64(a.salt)).not.toBe(toBase64(b.salt));
  });
});

describe('parseEnvelope', () => {
  it('keeps only the four known fields', async () => {
    const envelope = await encryptText(await createVaultKey('correct horse battery'), SECRET);
    expect(parseEnvelope({ ...envelope, note: 'hi', passcode: 'x' })).toEqual(envelope);
  });

  it('rejects envelopes with the wrong shape', async () => {
    const envelope = await encryptText(await createVaultKey('correct horse battery'), SECRET);
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope([envelope])).toBeNull();
    expect(parseEnvelope({ ...envelope, v: 2 })).toBeNull();
    expect(parseEnvelope({ ...envelope, salt: toBase64(new Uint8Array(8)) })).toBeNull();
    expect(parseEnvelope({ ...envelope, iv: toBase64(new Uint8Array(16)) })).toBeNull();
    expect(parseEnvelope({ ...envelope, ct: 'not base64!' })).toBeNull();
    expect(parseEnvelope({ ...envelope, ct: toBase64(new Uint8Array(4)) })).toBeNull();
  });
});

describe('base64', () => {
  it('handles large inputs', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(200_000).subarray(0, 65_536));
    const big = new Uint8Array(300_000);
    big.set(bytes);
    expect(fromBase64(toBase64(big))).toEqual(big);
  });
});
