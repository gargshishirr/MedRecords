// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, createBackup, decryptBackup, readBackup } from './backup';
import { fromBase64, toBase64 } from './crypto';
import { createSeedData } from './seed';

const now = new Date(2026, 10, 14, 16, 0);

describe('backups', () => {
  it('round-trips a plain JSON backup', async () => {
    const data = createSeedData(now);
    const text = await createBackup(data);
    const read = readBackup(text, now);
    expect(read.kind).toBe('plain');
    expect(read.kind === 'plain' && read.data).toEqual(JSON.parse(JSON.stringify(data)));
  });

  it('encrypts a backup with a passcode and opens it again', async () => {
    const data = createSeedData(now);
    const text = await createBackup(data, 'family backup 2026');
    expect(text).not.toContain('Riya');
    expect(text).not.toContain('Metformin');
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['ct', 'format', 'iv', 'salt', 'v']);

    const read = readBackup(text, now);
    expect(read.kind).toBe('encrypted');
    if (read.kind !== 'encrypted') return;
    expect(await decryptBackup(read.envelope, 'wrong passcode', now)).toEqual({
      ok: false,
      error: 'Wrong backup passcode, or the file has been changed.',
    });
    const opened = await decryptBackup(read.envelope, 'family backup 2026', now);
    expect(opened.ok && opened.data).toEqual(JSON.parse(JSON.stringify(data)));
  });

  it('detects a tampered encrypted backup', async () => {
    const file = JSON.parse(await createBackup(createSeedData(now), 'family backup 2026'));
    const bytes = fromBase64(file.ct);
    bytes[10] = bytes[10]! ^ 0xff;
    const read = readBackup(JSON.stringify({ ...file, ct: toBase64(bytes) }), now);
    expect(read.kind === 'encrypted' && (await decryptBackup(read.envelope, 'family backup 2026', now)).ok).toBe(false);
  });

  it('reports damaged or unknown files clearly', () => {
    expect(readBackup(JSON.stringify({ format: BACKUP_FORMAT, v: 1, salt: 'x' }), now)).toEqual({
      kind: 'error',
      error: 'This encrypted backup is damaged.',
    });
    expect(readBackup('{"hello":"world"}', now)).toEqual({ kind: 'error', error: "This file isn't a MedRecords backup." });
  });
});
